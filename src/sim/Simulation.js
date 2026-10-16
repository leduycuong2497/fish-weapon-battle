import { SIM_DT, SPECIES, SPECIES_BY_ID, TEAM_NAMES, LIMITS } from '../config.js';
import { Arena } from '../entities/Arena.js';
import { createFish } from '../entities/Fish.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { AISystem } from '../systems/AISystem.js';
import { EvolutionSystem } from '../systems/EvolutionSystem.js';
import { UltimateSystem } from '../systems/UltimateSystem.js';
import { createMatchStats } from '../systems/BattleStatistics.js';
import { RNG, hashString } from './rng.js';
import { speciesSize } from '../fish-sizes.js';

/** Danh sách loài theo cấu hình (chỉ loài được bật, số lượng ≥ 0). */
export function buildRoster(settings) {
  const roster = [];
  for (const sp of SPECIES) {
    if (!settings.enabled[sp.id]) continue;
    const n = Math.max(0, Math.floor(settings.counts[sp.id] || 0));
    for (let i = 0; i < n; i++) roster.push(sp.id);
  }
  return roster.slice(0, LIMITS.maxFish);
}

/**
 * Mô phỏng tất định: cùng cấu hình + cùng seed → cùng kết quả.
 * Bước thời gian cố định SIM_DT, không phụ thuộc thời gian thực của khung hình.
 */
export class Simulation {
  constructor(settings, seed) {
    this.settings = { ...settings };
    this.seed = String(seed);
    this.rng = new RNG(hashString(this.seed));
    this.time = 0;
    this.stepIndex = 0;
    this.events = [];
    this.over = false;
    this.result = null;
    this.maxRadius = 30;
    this.maxReach = 100;
    this.k = this.settings.fishScale || 1;

    const roster = buildRoster(this.settings);
    if (roster.length < LIMITS.minFish) {
      throw new Error(`Cần ít nhất ${LIMITS.minFish} cá (hiện có ${roster.length}).`);
    }
    this.rng.shuffle(roster);

    this.arena = new Arena(this.settings, roster.length);
    this.physics = new PhysicsSystem(this);
    this.movement = new MovementSystem(this);
    this.combat = new CombatSystem(this);
    this.ai = new AISystem(this);
    this.evolution = new EvolutionSystem(this);
    this.ultimate = new UltimateSystem(this);
    this.stats = createMatchStats(roster.length);

    this.fish = [];
    this.spawn(roster);
    this.alive = this.fish.slice();
    this.maxRadius = Math.max(...this.fish.map((f) => f.radius)) * 1.2;
    this.physics.rebuild();
    this.combat.updateShapes();
  }

  /**
   * Vị trí xuất phát đối xứng: cá xếp cách đều trên các vòng đồng tâm (vòng ngoài trước),
   * mỗi vòng xoay sao cho 2 con nằm hai bên, 4 con nằm 4 góc... Trả về [] nếu sân quá chật.
   */
  symmetricSlots(n) {
    const a = this.arena;
    const rMax = 22 * 1.2 * this.k;
    const spacing = rMax * 2 + 14 * this.k;
    const ex = Math.max(10, a.hw - rMax - 14 * this.k);
    const ey = Math.max(10, a.hh - rMax - 14 * this.k);
    const slots = [];
    let left = n;
    for (const k of [0.78, 0.52, 0.27]) {
      if (left <= 0) break;
      const circ = 2 * Math.PI * k * Math.sqrt((ex * ex + ey * ey) / 2);
      const cap = Math.max(1, Math.floor(circ / spacing));
      const m = left <= cap ? left : cap;
      const start = -Math.PI / 2 + Math.PI / m;
      for (let j = 0; j < m; j++) {
        const ang = start + (j * Math.PI * 2) / m;
        slots.push([Math.cos(ang) * k * ex, Math.sin(ang) * k * ey]);
      }
      left -= m;
    }
    if (left === 1) slots.push([0, 0]);
    else if (left > 1) return [];
    return slots;
  }

  spawn(roster) {
    const rng = this.rng;
    const teams = this.settings.mode === 'teams' ? Math.max(2, Math.min(4, this.settings.teams)) : 0;
    const placed = [];
    const slots = this.symmetricSlots(roster.length);
    // hướng ban đầu đa dạng: góc vàng + nhiễu
    const baseAngle = rng.range(0, Math.PI * 2);
    roster.forEach((sid, i) => {
      const species = SPECIES_BY_ID[sid];
      const r = 22 * speciesSize(species) * this.k;
      if (slots.length) {
        // xếp đối xứng, hướng đầu vào giữa sân (có lệch ngẫu nhiên để quỹ đạo vẫn đa dạng)
        const [x, y] = slots[i];
        const toCenter = x === 0 && y === 0 ? baseAngle : Math.atan2(-y, -x);
        placed.push({ x, y, r });
        this.fish.push(
          createFish({
            id: i,
            species,
            settings: this.settings,
            seed: rng.nextUint(),
            team: teams ? i % teams : i,
            x,
            y,
            heading: toCenter + rng.range(-0.55, 0.55),
            weaponAngle: rng.range(0, Math.PI * 2),
            weaponDir: rng.sign(),
          }),
        );
        return;
      }
      let pos = null;
      for (let attempt = 0; attempt < 400 && !pos; attempt++) {
        const gap = attempt < 150 ? 40 : attempt < 300 ? 14 : 2;
        const [x, y] = this.arena.randomPoint(rng, r + 10);
        let ok = true;
        for (const p of placed) {
          const need = p.r + r + gap;
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < need * need) {
            ok = false;
            break;
          }
        }
        if (ok) pos = [x, y];
      }
      if (!pos) pos = this.arena.randomPoint(rng, r + 10);
      placed.push({ x: pos[0], y: pos[1], r });
      const heading = baseAngle + i * 2.39996323 + rng.range(-0.35, 0.35);
      const fish = createFish({
        id: i,
        species,
        settings: this.settings,
        seed: rng.nextUint(),
        team: teams ? i % teams : i,
        x: pos[0],
        y: pos[1],
        heading,
        weaponAngle: rng.range(0, Math.PI * 2),
        weaponDir: rng.sign(),
      });
      this.fish.push(fish);
    });
  }

  emit(type, data) {
    data.type = type;
    data.t = this.time;
    this.events.push(data);
  }

  /** Lấy và xóa danh sách sự kiện (cho hiển thị/âm thanh). */
  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  step() {
    const dt = SIM_DT;
    this.time += dt;
    this.stepIndex++;
    this.arena.update(this.over ? this.result.duration : this.time);

    this.physics.rebuild();
    if (!this.over) {
      this.ai.update();
      this.ultimate.update();
    }
    this.movement.steer(dt);
    this.physics.integrate(dt);
    this.physics.rebuild();
    this.physics.resolveFishCollisions();
    this.movement.walls();
    this.combat.rotateWeapons(dt);
    if (this.over) {
      this.postStep();
      return;
    }

    this.physics.rebuild();
    this.combat.updateShapes();
    this.combat.resolve();
    this.resolveDeaths();
    this.postStep();
    this.checkVictory();
  }

  /** Bảo đảm cuối bước: không cá nào nằm ngoài tường (kể cả khi lớn lên do tiến hóa)
   *  và không cá nào gần như đứng yên (sau va chạm đối đầu / giật lùi). */
  postStep() {
    this.movement.walls();
    for (const f of this.alive) {
      const sp = Math.hypot(f.vx, f.vy);
      const floor = f.minSpeed * (f.stunUntil > this.time ? 0.5 : 1);
      if (sp >= floor) continue;
      let ang = sp > 1e-3 ? Math.atan2(f.vy, f.vx) : f.targetHeading;
      if (sp <= 1e-3) ang += f.rng.range(-0.5, 0.5);
      f.vx = Math.cos(ang) * floor;
      f.vy = Math.sin(ang) * floor;
    }
  }

  resolveDeaths() {
    let any = false;
    for (const f of this.alive) {
      if (!f.pendingDeath) continue;
      any = true;
      f.alive = false;
      f.deathTime = this.time;
      this.stats.eliminated++;
      const killer = this.fish[f.killedBy];
      if (killer) {
        killer.kills++;
        this.evolution.onKill(killer, f);
      }
      this.emit('death', { id: f.id, killer: f.killedBy, x: f.x, y: f.y });
    }
    if (any) this.alive = this.fish.filter((f) => f.alive);
  }

  checkVictory() {
    const alive = this.alive;
    const teamsMode = this.settings.mode === 'teams';
    if (alive.length === 0) {
      // Quy tắc hòa: tất cả cá còn lại bị loại trong cùng một bước → HÒA.
      const lastIds = this.fish.filter((f) => f.deathTime === this.time).map((f) => f.id);
      return this.finish({ draw: true, reason: 'Hòa: các cá cuối cùng bị loại cùng lúc', winnerIds: lastIds });
    }
    if (teamsMode) {
      const teams = new Set(alive.map((f) => f.team));
      if (teams.size === 1) {
        const team = alive[0].team;
        return this.finish({ team, winnerIds: alive.map((f) => f.id), reason: 'Đội cuối cùng còn trụ lại' });
      }
    } else if (alive.length === 1) {
      return this.finish({ winnerIds: [alive[0].id], reason: 'Cá cuối cùng còn sống' });
    }
    const limit = this.settings.timeLimit;
    if (limit > 0 && this.time >= limit) {
      // Hết giờ: thắng theo % máu; hòa nếu bằng nhau → sát thương gây ra → id nhỏ hơn
      const ranked = alive.slice().sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp || b.damageDealt - a.damageDealt || a.id - b.id);
      const best = ranked[0];
      if (teamsMode) {
        return this.finish({ team: best.team, winnerIds: alive.filter((f) => f.team === best.team).map((f) => f.id), reason: 'Hết giờ: đội có cá nhiều % máu nhất' });
      }
      return this.finish({ winnerIds: [best.id], reason: 'Hết giờ: cá còn nhiều % máu nhất' });
    }
    return null;
  }

  finish({ draw = false, team = null, winnerIds = [], reason }) {
    this.over = true;
    // ngừng mọi hoạt động chiến đấu
    for (const f of this.alive) {
      f.stunUntil = -1;
      f.skillActiveUntil = -1;
    }
    let winnerLabel;
    let winnerSpecies = null;
    if (draw) winnerLabel = 'HÒA';
    else if (team !== null && this.settings.mode === 'teams') winnerLabel = TEAM_NAMES[team];
    else {
      const w = this.fish[winnerIds[0]];
      winnerLabel = w.name;
      winnerSpecies = w.speciesId;
    }
    this.result = {
      draw,
      team,
      winnerIds,
      winnerLabel,
      winnerSpecies,
      reason,
      duration: this.time,
      seed: this.seed,
      initialCount: this.fish.length,
    };
    this.emit('victory', { ...this.result });
    return this.result;
  }

  /** Băm trạng thái — dùng để kiểm tra tái tạo trận đấu. */
  stateHash() {
    let h = 0;
    for (const f of this.fish) {
      const vals = [f.x, f.y, f.vx, f.vy, f.hp, f.weaponAngle];
      for (const v of vals) {
        h = (Math.imul(h ^ Math.round(v * 1000), 2654435761) + 1) >>> 0;
      }
    }
    return h;
  }
}
