import { EVOLUTION } from '../config.js';
import { FISH_SIZES } from '../fish-sizes.js';

/**
 * Tiến hóa: hạ gục đối thủ → nhận XP → lên cấp (tối đa 5) → tăng một phần chỉ số.
 * Không hồi đầy máu, trừ khi bật tùy chọn healOnKill.
 */
export class EvolutionSystem {
  constructor(sim) {
    this.sim = sim;
  }

  onKill(killer, victim) {
    const sim = this.sim;
    if (!killer.alive || killer.pendingDeath) return;
    if (sim.settings.healOnKill) killer.hp = killer.maxHp;
    if (!sim.settings.evolution) return;
    killer.xp += EVOLUTION.xpPerKill + EVOLUTION.xpPerVictimLevel * (victim.level - 1);
    while (killer.level < EVOLUTION.maxLevel && killer.xp >= EVOLUTION.thresholds[killer.level]) {
      this.levelUp(killer);
    }
  }

  levelUp(f) {
    const p = EVOLUTION.perLevel;
    f.level++;
    const m = f.levelMul;
    m.hp += p.hp;
    m.damage += p.damage;
    m.rot += p.rot;
    m.speed += p.speed;
    if (FISH_SIZES.growWithLevel) m.size += p.size;
    // tầm vũ khí tăng (nâng cấp vũ khí)
    f.range *= 1 + p.range;
    // máu tối đa tăng, chỉ cộng thêm phần tăng (không hồi đầy)
    const newMax = Math.round(f.species.hp * this.sim.settings.hpMul * m.hp);
    f.hp += newMax - f.maxHp;
    f.maxHp = newMax;
    f.radius = f.baseRadius * m.size;
    let unlocked = false;
    if (!f.skillUnlocked && f.level >= 3) {
      f.skillUnlocked = true;
      unlocked = true;
    }
    this.sim.emit('levelup', { id: f.id, level: f.level, x: f.x, y: f.y, unlocked });
  }
}
