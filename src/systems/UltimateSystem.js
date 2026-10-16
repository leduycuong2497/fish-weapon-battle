import { ENERGY } from '../config.js';

/**
 * Nội năng & tuyệt chiêu. Nội năng tăng trong CombatSystem.applyDamage (bị trúng đòn tăng nhiều,
 * đánh trúng tăng ít). Khi đầy, cá tự tung tuyệt chiêu riêng của loài: sát thương diện rộng,
 * choáng, hồi máu hoặc cường hóa tạm thời. Hoàn toàn tất định (không dùng ngẫu nhiên).
 */
export class UltimateSystem {
  constructor(sim) {
    this.sim = sim;
    this.near = [];
  }

  get enabled() {
    return this.sim.settings.energy !== false;
  }

  /** Cộng nội năng (gọi khi có đòn trúng). */
  gain(f, amount) {
    if (!this.enabled || !f.alive || f.pendingDeath || f.ultUntil > this.sim.time) return;
    f.energy = Math.min(ENERGY.max, f.energy + amount);
  }

  update() {
    if (!this.enabled) return;
    const sim = this.sim;
    const t = sim.time;
    for (const f of sim.alive) {
      if (f.ultUntil >= 0 && t >= f.ultUntil) this.end(f);
      if (f.energy >= ENERGY.max && f.stunUntil <= t && !f.pendingDeath) this.cast(f);
    }
  }

  isEnemy(a, b) {
    return this.sim.settings.mode !== 'teams' || a.team !== b.team;
  }

  /** Sát thương + choáng + đẩy lùi mọi kẻ địch trong bán kính. Trả về số mục tiêu trúng. */
  aoe(f, radius, damage, { stun = 0, knock = 0 } = {}) {
    const sim = this.sim;
    const near = sim.physics.hash.query(f.x, f.y, radius + sim.maxRadius, this.near).slice();
    let n = 0;
    for (const o of near) {
      if (o === f || !o.alive || o.pendingDeath || !this.isEnemy(f, o)) continue;
      const dx = o.x - f.x;
      const dy = o.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > radius + o.radius) continue;
      if (stun) o.stunUntil = Math.max(o.stunUntil, sim.time + stun);
      sim.combat.applyDamage(f, o, damage * f.levelMul.damage, 'ultimate', o.x - (dx / d) * o.radius, o.y - (dy / d) * o.radius);
      if (knock) {
        o.vx += (dx / d) * knock * o.k / o.mass;
        o.vy += (dy / d) * knock * o.k / o.mass;
        o.targetHeading = Math.atan2(o.vy, o.vx);
      }
      n++;
    }
    return n;
  }

  cast(f) {
    const sim = this.sim;
    const u = f.species.ult;
    if (!u) return;
    f.energy = 0;
    f.ultCount++;
    f.ultUntil = sim.time + u.duration;
    f.ultRot = u.rotMul || 1;
    f.ultSpeed = u.speedMul || 1;
    f.ultRange = u.rangeMul || 1;
    f.ultDmg = u.damageMul || 1;
    f.ultCd = u.cooldownMul || 1;
    f.ultTaken = u.takenMul || 1;
    if (u.heal) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * u.heal);
    f.stunUntil = -1;
    const radius = u.radius ? u.radius * f.radius : 0;
    let targets = 0;
    if (radius) targets = this.aoe(f, radius, u.damage || 0, { stun: u.stun || 0, knock: u.knock || 0 });
    sim.stats.ultimates++;
    sim.emit('ultimate', { id: f.id, ult: u.id, name: u.name, x: f.x, y: f.y, radius, targets });
  }

  end(f) {
    f.ultUntil = -1;
    f.ultRot = f.ultSpeed = f.ultRange = f.ultDmg = f.ultCd = f.ultTaken = 1;
  }
}
