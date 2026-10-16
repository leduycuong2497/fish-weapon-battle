import { MOVEMENT } from '../config.js';
import { wrapAngle } from '../sim/math.js';

/**
 * AI tối giản: KHÔNG truy đuổi liên tục. Chỉ quyết định khi nào dùng kỹ năng và
 * (tùy chọn, mặc định tắt) thỉnh thoảng hơi lệch hướng về mục tiêu gần khi đổi hướng.
 */
export class AISystem {
  constructor(sim) {
    this.sim = sim;
    this.near = [];
  }

  isEnemy(a, b) {
    return this.sim.settings.mode !== 'teams' || a.team !== b.team;
  }

  nearestEnemy(f, radius) {
    const near = this.sim.physics.hash.query(f.x, f.y, radius, this.near);
    let best = null;
    let bestD = radius * radius;
    for (const o of near) {
      if (o === f || !o.alive || o.pendingDeath || !this.isEnemy(f, o)) continue;
      const d2 = (o.x - f.x) ** 2 + (o.y - f.y) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        best = o;
      }
    }
    return best;
  }

  /** Lệch hướng về mục tiêu (radian) hoặc null. Gọi khi cá đến lượt đổi hướng. */
  chaseBias(f, currentAngle) {
    const p = this.sim.settings.chase / 100;
    if (p <= 0 || !f.rng.chance(p)) return null;
    const target = this.nearestEnemy(f, MOVEMENT.chaseRadius * f.k);
    if (!target) return null;
    const want = Math.atan2(target.y - f.y, target.x - f.x);
    const diff = wrapAngle(want - currentAngle);
    // chỉ điều chỉnh nhẹ, tối đa ±40°
    return Math.max(-0.7, Math.min(0.7, diff * 0.5));
  }

  update() {
    const sim = this.sim;
    const t = sim.time;
    for (const f of sim.alive) {
      // hết hiệu lực kỹ năng
      if (f.skillActiveUntil >= 0 && t >= f.skillActiveUntil) this.endSkill(f);
      if (!f.skillUnlocked || f.stunUntil > t) continue;
      const sk = f.species.skill;
      if (sk.passive || t < f.skillReadyAt || f.skillActiveUntil > t) continue;
      if (this.shouldUse(f, sk)) this.useSkill(f, sk);
    }
  }

  shouldUse(f, sk) {
    switch (sk.id) {
      case 'inflate':
      case 'frenzy':
      case 'lunge':
        return !!this.nearestEnemy(f, sk.triggerDist * f.k + f.radius);
      case 'discharge':
        return !!this.nearestEnemy(f, sk.radius * f.k);
      case 'harden':
        return f.hp / f.maxHp < sk.hpThreshold && !!this.nearestEnemy(f, 120 * f.k);
      case 'dash':
      case 'whirl':
        // dùng ngẫu nhiên theo RNG riêng của cá để chuyển động khó đoán
        return f.rng.chance(0.02);
      default:
        return false;
    }
  }

  useSkill(f, sk) {
    const sim = this.sim;
    const t = sim.time;
    f.skillReadyAt = t + sk.cooldown;
    if (sk.duration) f.skillActiveUntil = t + sk.duration;
    switch (sk.id) {
      case 'dash':
        f.speedBuff = sk.speedMul;
        break;
      case 'inflate':
        f.rangeBuff = sk.rangeMul;
        f.damageBuff = sk.damageMul;
        break;
      case 'frenzy':
        f.rotBuff = sk.rotMul;
        f.cooldownBuff = sk.cooldownMul;
        break;
      case 'lunge':
        f.rangeBuff = sk.rangeMul;
        break;
      case 'harden':
        f.damageTakenMul = sk.damageTakenMul;
        break;
      case 'whirl': {
        f.speedBuff = sk.speedMul;
        f.rotBuff = sk.rotMul;
        const cur = Math.atan2(f.vy, f.vx);
        f.targetHeading = cur + f.rng.sign() * f.rng.range(1.4, 2.4);
        f.weaponDir = -f.weaponDir;
        break;
      }
      case 'discharge': {
        const rad = sk.radius * f.k;
        const near = sim.physics.hash.query(f.x, f.y, rad + sim.maxRadius, this.near).slice();
        let n = 0;
        for (const o of near) {
          if (o === f || !o.alive || o.pendingDeath || !this.isEnemy(f, o)) continue;
          const d = Math.hypot(o.x - f.x, o.y - f.y);
          if (d > rad + o.radius) continue;
          o.stunUntil = Math.max(o.stunUntil, t + sk.stun);
          o.slowUntil = Math.max(o.slowUntil, t + sk.slow);
          const px = o.x + ((f.x - o.x) / (d || 1)) * o.radius;
          const py = o.y + ((f.y - o.y) / (d || 1)) * o.radius;
          sim.combat.applyDamage(f, o, sk.damage * f.levelMul.damage, 'electric', px, py);
          n++;
        }
        sim.emit('discharge', { id: f.id, x: f.x, y: f.y, radius: rad, targets: n });
        break;
      }
      default:
        break;
    }
    sim.stats.skillsUsed++;
    sim.emit('skill', { id: f.id, skill: sk.id, x: f.x, y: f.y });
  }

  endSkill(f) {
    f.skillActiveUntil = -1;
    f.speedBuff = 1;
    f.rangeBuff = 1;
    f.damageBuff = 1;
    f.rotBuff = 1;
    f.cooldownBuff = 1;
    f.damageTakenMul = 1;
  }
}
