// Kiểm thử headless cho lõi mô phỏng: chạy bằng `npm test` (Node ≥ 18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, SPECIES, SIM_DT } from '../src/config.js';
import { Simulation } from '../src/sim/Simulation.js';

function settingsFor(total, overrides = {}) {
  const s = structuredClone(DEFAULT_SETTINGS);
  const ids = SPECIES.map((sp) => sp.id);
  for (const id of ids) s.counts[id] = 0;
  for (let i = 0; i < total; i++) s.counts[ids[i % ids.length]]++;
  s.totalFish = total;
  return Object.assign(s, overrides);
}

/**
 * Chạy trận và kiểm tra bất biến ở từng bước. Trả về số liệu theo dõi.
 */
function runChecked(settings, seed, maxSeconds = 200) {
  const sim = new Simulation(settings, seed);
  const n = sim.fish.length;
  const prev = sim.fish.map((f) => ({ x: f.x, y: f.y }));
  const stillSteps = new Array(n).fill(0);
  const deadHp = new Map();
  const report = { maxJump: 0, outside: 0, minAliveSpeed: Infinity, stuck: 0, deadAttacks: 0, hitsWithoutEvent: 0, steps: 0 };
  const maxSteps = Math.round(maxSeconds / SIM_DT);
  let hitEvents = 0;
  for (let s = 0; s < maxSteps && !sim.over; s++) {
    const hitsBefore = sim.stats.totalHits;
    sim.step();
    report.steps++;
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit') {
        hitEvents++;
        const att = sim.fish[e.a];
        // kẻ tấn công phải còn sống tại thời điểm đánh (hoặc chết cùng bước)
        if (!att.alive && att.deathTime < e.t) report.deadAttacks++;
      }
    }
    if (sim.stats.totalHits - hitsBefore < 0) report.hitsWithoutEvent++;
    for (const f of sim.fish) {
      if (!f.alive) {
        if (!deadHp.has(f.id)) deadHp.set(f.id, f.damageDealt);
        else if (f.damageDealt !== deadHp.get(f.id)) report.deadAttacks++;
        continue;
      }
      const p = prev[f.id];
      const jump = Math.hypot(f.x - p.x, f.y - p.y);
      report.maxJump = Math.max(report.maxJump, jump);
      if (!sim.arena.containsCircle(f.x, f.y, f.radius, 0.05)) report.outside++;
      const sp = Math.hypot(f.vx, f.vy);
      report.minAliveSpeed = Math.min(report.minAliveSpeed, sp);
      if (jump < 0.05) stillSteps[f.id]++;
      else stillSteps[f.id] = 0;
      if (stillSteps[f.id] > 60) report.stuck++;
      p.x = f.x;
      p.y = f.y;
    }
  }
  report.hitEvents = hitEvents;
  return { sim, report };
}

for (const total of [2, 4, 20, 50, 100]) {
  test(`trận ${total} cá: di chuyển hợp lệ, có người thắng hoặc hòa`, () => {
    const { sim, report } = runChecked(settingsFor(total), `test-${total}`);
    const r = sim.result || {};
    console.log(`  ${total} cá → ${r.winnerLabel} (${r.reason}) sau ${sim.time.toFixed(1)}s; hits=${sim.stats.totalHits}, clashes=${sim.stats.clashes}, walls=${sim.stats.wallHits}, antiLoop=${sim.stats.antiLoopCorrections}, maxJump=${report.maxJump.toFixed(2)}`);
    assert.ok(sim.over, `trận ${total} cá phải kết thúc (time=${sim.time.toFixed(1)})`);
    assert.equal(report.outside, 0, 'không cá nào ra ngoài tường');
    assert.equal(report.stuck, 0, 'không cá nào đứng yên > 1 giây');
    assert.ok(report.maxJump < 25, `không dịch chuyển tức thời (maxJump=${report.maxJump.toFixed(2)})`);
    assert.ok(report.minAliveSpeed > 20, `cá còn sống luôn di chuyển (min=${report.minAliveSpeed.toFixed(1)})`);
    assert.equal(report.deadAttacks, 0, 'cá đã bị loại không gây sát thương');
    assert.ok(sim.stats.totalHits > 0 && report.hitEvents === sim.stats.totalHits, 'mỗi đòn trúng có sự kiện');
    assert.ok(sim.stats.wallHits > 0, 'cá có chạm tường và đổi quỹ đạo');
    if (!r.draw) {
      const alive = sim.fish.filter((f) => f.alive);
      assert.ok(alive.length >= 1);
      if (r.reason.startsWith('Cá cuối')) assert.equal(alive.length, 1);
    }
  });
}

test('cùng seed → cùng kết quả (tái tạo trận đấu)', () => {
  const s = settingsFor(20);
  const a = runChecked(s, 'REPLAY-1').sim;
  const b = runChecked(s, 'REPLAY-1').sim;
  assert.equal(a.result.winnerLabel, b.result.winnerLabel);
  assert.equal(a.stepIndex, b.stepIndex);
  assert.equal(a.stateHash(), b.stateHash());
  const c = runChecked(s, 'REPLAY-2').sim;
  assert.notEqual(a.stateHash(), c.stateHash(), 'seed khác → trận khác');
});

test('vũ khí xoay độc lập với hướng di chuyển', () => {
  const sim = new Simulation(settingsFor(4), 'rot');
  const f = sim.fish[0];
  const w0 = f.weaponAngle;
  const h0 = Math.atan2(f.vy, f.vx);
  for (let i = 0; i < 30; i++) sim.step();
  const dw = f.weaponAngle - w0;
  const dh = Math.atan2(f.vy, f.vx) - h0;
  assert.ok(Math.abs(dw) > 0.5, 'vũ khí đã xoay');
  assert.notEqual(dw.toFixed(3), dh.toFixed(3));
});

test('sát thương chỉ khi vũ khí chạm thân, có thời gian hồi', () => {
  const s = settingsFor(2);
  s.counts = Object.fromEntries(SPECIES.map((sp) => [sp.id, 0]));
  s.counts.swordfish = 2;
  s.shrink = false;
  const sim = new Simulation(s, 'dmg');
  const [a, b] = sim.fish;
  // đặt cạnh nhau, thân không chạm, kiếm của a chĩa vào b
  a.x = 0; a.y = 0; b.x = 70; b.y = 0;
  a.vx = a.vy = b.vx = b.vy = 0;
  a.weaponAngle = 0; a.weaponDir = 1; a.rotSpeed = 0;
  b.weaponAngle = Math.PI / 2; b.rotSpeed = 0;
  sim.physics.rebuild();
  sim.combat.updateShapes();
  sim.combat.resolve();
  assert.equal(b.hp, b.maxHp - a.damage, 'trúng kiếm trừ đúng sát thương');
  const hp1 = b.hp;
  sim.combat.resolve(); // cùng thời điểm → đang hồi, không trừ lặp
  assert.equal(b.hp, hp1, 'không trừ máu lặp trong thời gian hồi');
  // thân chạm nhưng vũ khí quay ra xa → không sát thương
  const sim2 = new Simulation(s, 'dmg2');
  const [c, d] = sim2.fish;
  c.x = 0; c.y = 0; d.x = 43; d.y = 0;
  c.weaponAngle = Math.PI; d.weaponAngle = 0;
  sim2.physics.rebuild();
  sim2.combat.updateShapes();
  sim2.combat.resolve();
  assert.equal(c.hp, c.maxHp);
  assert.equal(d.hp, d.maxHp, 'thân chạm thân không gây sát thương');
});

test('chế độ chia đội và tiến hóa', () => {
  const s = settingsFor(16, { mode: 'teams', teams: 2 });
  const { sim } = runChecked(s, 'teams');
  assert.ok(sim.over);
  if (!sim.result.draw && !sim.result.reason.startsWith('Hết giờ')) {
    const teams = new Set(sim.fish.filter((f) => f.alive).map((f) => f.team));
    assert.equal(teams.size, 1);
  }
  const maxLevel = Math.max(...sim.fish.map((f) => f.level));
  assert.ok(maxLevel >= 2, 'có cá lên cấp');
});

test('đấu trường vuông, chữ nhật, tròn, bầu dục', () => {
  for (const shape of ['square', 'rect', 'circle', 'oval']) {
    const { sim, report } = runChecked(settingsFor(20, { arenaShape: shape }), `shape-${shape}`);
    assert.equal(report.outside, 0, shape);
    assert.ok(sim.over, shape);
  }
});

test('nội năng tăng khi trúng đòn và đầy thì tung tuyệt chiêu', () => {
  const s = settingsFor(8);
  const sim = new Simulation(s, 'ULT');
  let ults = 0;
  let energySeen = 0;
  for (let i = 0; i < 60 * 120 && !sim.over; i++) {
    sim.step();
    for (const f of sim.alive) {
      energySeen = Math.max(energySeen, f.energy);
      assert.ok(f.energy >= 0 && f.energy <= 100, 'nội năng trong [0, 100]');
    }
    for (const e of sim.drainEvents()) if (e.type === 'ultimate') ults++;
  }
  assert.ok(energySeen > 0, 'nội năng có tăng');
  assert.ok(ults > 0 && ults === sim.stats.ultimates, `có tuyệt chiêu (${ults})`);
  // tắt nội năng → không có tuyệt chiêu
  const off = new Simulation({ ...s, energy: false }, 'ULT');
  while (!off.over) off.step();
  assert.equal(off.stats.ultimates, 0);
  assert.ok(off.fish.every((f) => f.energy === 0));
});
