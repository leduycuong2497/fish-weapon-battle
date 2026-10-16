// Công cụ cân bằng: chạy nhiều trận headless, thống kê tỉ lệ thắng & thời lượng.
// Dùng: node tests/balance.mjs [sốTrận] [cáMỗiLoài]
import { DEFAULT_SETTINGS, SPECIES } from '../src/config.js';
import { Simulation } from '../src/sim/Simulation.js';

const N = Number(process.argv[2] || 60);
const PER = Number(process.argv[3] || 1);

function run(counts, seed, extra = {}) {
  const s = structuredClone(DEFAULT_SETTINGS);
  s.counts = counts;
  Object.assign(s, extra);
  const sim = new Simulation(s, seed);
  while (!sim.over) sim.step();
  return sim;
}

const wins = {};
const dmg = {};
let totalTime = 0;
let timeouts = 0;
for (let i = 0; i < N; i++) {
  const counts = Object.fromEntries(SPECIES.map((sp) => [sp.id, PER]));
  const sim = run(counts, `bal-${i}`);
  totalTime += sim.time;
  if (sim.result.reason.startsWith('Hết giờ')) timeouts++;
  const w = sim.result.winnerSpecies || 'draw';
  wins[w] = (wins[w] || 0) + 1;
  for (const f of sim.fish) dmg[f.speciesId] = (dmg[f.speciesId] || 0) + f.damageDealt;
}
console.log(`FFA ${SPECIES.length * PER} cá × ${N} trận: thời lượng TB ${(totalTime / N).toFixed(1)}s, hết giờ ${timeouts}`);
for (const sp of SPECIES) {
  console.log(`  ${sp.name.padEnd(12)} thắng ${String(wins[sp.id] || 0).padStart(3)}  sát thương TB ${(dmg[sp.id] / N / PER).toFixed(0)}`);
}
if (wins.draw) console.log(`  Hòa: ${wins.draw}`);

// Ma trận 1v1
console.log('\n1v1 (tỉ lệ thắng của hàng trước cột, 20 trận mỗi cặp):');
const ids = SPECIES.map((s) => s.id);
const row = {};
for (const a of ids) {
  let line = a.slice(0, 8).padEnd(9);
  let tot = 0;
  for (const b of ids) {
    if (a === b) {
      line += '   - ';
      continue;
    }
    let w = 0;
    for (let k = 0; k < 20; k++) {
      const counts = Object.fromEntries(ids.map((id) => [id, 0]));
      counts[a] = 1;
      counts[b] = 1;
      const sim = run(counts, `duel-${a}-${b}-${k}`);
      if (sim.result.winnerSpecies === a) w++;
      else if (a === b) w += 0;
    }
    tot += w;
    line += String(Math.round((w / 20) * 100)).padStart(4) + ' ';
  }
  row[a] = tot / (20 * (ids.length - 1));
  console.log(line + `  | ${(row[a] * 100).toFixed(0)}%`);
}
