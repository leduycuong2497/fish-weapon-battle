import { COMBAT, ENERGY } from '../config.js';
import { computeWeaponShapes, weaponReach } from '../entities/Weapon.js';
import { closestOnSegment, segmentSegment } from '../sim/math.js';

/**
 * Vũ khí xoay liên tục; sát thương chỉ xảy ra khi collider vũ khí thực sự chạm thân mục tiêu.
 * Hai vũ khí chạm nhau → "đỡ đòn": cả hai đảo chiều xoay, không gây sát thương cho nhau ở bước đó.
 */
export class CombatSystem {
  constructor(sim) {
    this.sim = sim;
    this.near = [];
    this.clashedPairs = new Set();
    this.clashTimes = new Map(); // pairKey -> time
  }

  rotateWeapons(dt) {
    const t = this.sim.time;
    for (const f of this.sim.alive) {
      if (f.stunUntil > t) continue; // choáng: vũ khí ngừng xoay
      f.weaponAngle += f.weaponDir * f.rotSpeed * f.levelMul.rot * f.rotBuff * f.ultRot * dt;
      if (f.weaponAngle > Math.PI * 4 || f.weaponAngle < -Math.PI * 4) f.weaponAngle %= Math.PI * 2;
    }
  }

  updateShapes() {
    let maxReach = 0;
    for (const f of this.sim.alive) {
      computeWeaponShapes(f);
      f.reach = weaponReach(f);
      if (f.reach > maxReach) maxReach = f.reach;
    }
    this.sim.maxReach = maxReach;
  }

  pairKey(a, b) {
    return a.id < b.id ? a.id * 1000 + b.id : b.id * 1000 + a.id;
  }

  isEnemy(a, b) {
    return this.sim.settings.mode !== 'teams' || a.team !== b.team;
  }

  resolve() {
    const sim = this.sim;
    const t = sim.time;
    const near = this.near;
    this.clashedPairs.clear();

    // 1) va chạm vũ khí–vũ khí (đỡ đòn)
    for (const a of sim.alive) {
      sim.physics.hash.query(a.x, a.y, a.reach + sim.maxReach, near);
      for (const b of near) {
        if (b.id <= a.id || !this.isEnemy(a, b)) continue;
        // gai cá nóc là giáp thân, không "đỡ đòn"
        if (a.weapon === 'spikes' || b.weapon === 'spikes') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.reach + b.reach;
        if (dx * dx + dy * dy > rr * rr) continue;
        const key = this.pairKey(a, b);
        const contact = this.weaponsTouch(a, b);
        if (!contact) continue;
        this.clashedPairs.add(key);
        const last = this.clashTimes.get(key);
        if (last !== undefined && t - last < COMBAT.clashCooldown) continue;
        this.clashTimes.set(key, t);
        a.weaponDir = -a.weaponDir;
        b.weaponDir = -b.weaponDir;
        sim.stats.clashes++;
        sim.emit('clash', { x: contact.x, y: contact.y, a: a.id, b: b.id });
      }
    }

    // 2) vũ khí chạm thân mục tiêu
    for (const a of sim.alive) {
      if (t < a.weaponReadyAt) continue;
      sim.physics.hash.query(a.x, a.y, a.reach + sim.maxRadius, near);
      for (const b of near) {
        if (b === a || b.pendingDeath || !b.alive || !this.isEnemy(a, b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.reach + b.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (this.clashedPairs.has(this.pairKey(a, b))) continue; // vừa đỡ đòn
        const last = a.lastHitOn.get(b.id);
        const cd = a.hitCooldown * a.cooldownBuff * a.ultCd;
        if (last !== undefined && t - last < cd) continue;
        const p = this.weaponHitsBody(a, b);
        if (!p) continue;
        a.lastHitOn.set(b.id, t);
        a.weaponReadyAt = t + COMBAT.weaponGlobalCooldown;
        const dmg = a.damage * a.levelMul.damage * a.damageBuff * a.ultDmg;
        this.applyDamage(a, b, dmg, a.weapon === 'electric' ? 'electric' : 'weapon', p.x, p.y);
        if (a.weapon === 'electric') {
          // đuôi điện gây chậm ngắn
          b.slowUntil = Math.max(b.slowUntil, t + 0.6);
        }
        // vũ khí một lưỡi chỉ trúng một mục tiêu mỗi bước; gai/dao đôi có thể trúng nhiều
        if (a.weapon !== 'spikes' && a.weapon !== 'blades') break;
      }
    }
  }

  /** Trả về điểm tiếp xúc nếu bất kỳ shape vũ khí của a chạm shape vũ khí của b. */
  weaponsTouch(a, b) {
    for (let i = 0; i < a.wShapeCount; i++) {
      const s = a.wShapes[i];
      for (let j = 0; j < b.wShapeCount; j++) {
        const q = b.wShapes[j];
        const rr = s.r + q.r;
        if (s.k === 'cap' && q.k === 'cap') {
          const r = segmentSegment(s.ax, s.ay, s.bx, s.by, q.ax, q.ay, q.bx, q.by);
          if (r.dist2 <= rr * rr) return { x: (r.c1x + r.c2x) / 2, y: (r.c1y + r.c2y) / 2 };
        } else if (s.k === 'cap') {
          const [cx, cy] = closestOnSegment(s.ax, s.ay, s.bx, s.by, q.x, q.y);
          if ((cx - q.x) ** 2 + (cy - q.y) ** 2 <= rr * rr) return { x: (cx + q.x) / 2, y: (cy + q.y) / 2 };
        } else if (q.k === 'cap') {
          const [cx, cy] = closestOnSegment(q.ax, q.ay, q.bx, q.by, s.x, s.y);
          if ((cx - s.x) ** 2 + (cy - s.y) ** 2 <= rr * rr) return { x: (cx + s.x) / 2, y: (cy + s.y) / 2 };
        } else if ((s.x - q.x) ** 2 + (s.y - q.y) ** 2 <= rr * rr) {
          return { x: (s.x + q.x) / 2, y: (s.y + q.y) / 2 };
        }
      }
    }
    return null;
  }

  /** Trả về điểm trúng trên thân b nếu vũ khí của a chạm thân b. */
  weaponHitsBody(a, b) {
    for (let i = 0; i < a.wShapeCount; i++) {
      const s = a.wShapes[i];
      let cx;
      let cy;
      if (s.k === 'cap') [cx, cy] = closestOnSegment(s.ax, s.ay, s.bx, s.by, b.x, b.y);
      else {
        cx = s.x;
        cy = s.y;
      }
      const dx = cx - b.x;
      const dy = cy - b.y;
      const rr = s.r + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rr * rr) {
        const d = Math.sqrt(d2) || 1;
        return { x: b.x + (dx / d) * b.radius, y: b.y + (dy / d) * b.radius };
      }
    }
    return null;
  }

  /** Trừ máu thật + giật lùi + thống kê + đánh dấu bị loại (xử lý cuối bước). */
  applyDamage(a, b, rawDamage, kind, px, py) {
    const sim = this.sim;
    if (!b.alive || b.pendingDeath) return 0;
    const dmg = Math.max(0, rawDamage * b.damageTakenMul * b.ultTaken);
    const dealt = Math.min(b.hp, dmg);
    b.hp -= dmg;
    b.hitsTaken++;
    b.damageTaken += dealt;
    a.hits++;
    a.damageDealt += dealt;
    sim.stats.totalHits++;
    sim.stats.totalDamage += dealt;

    // hút máu (cá mập)
    const sk = a.species.skill;
    if (sk.passive && sk.lifesteal && a.skillUnlocked && a.hp > 0) {
      a.hp = Math.min(a.maxHp, a.hp + dealt * sk.lifesteal);
    }

    // giật lùi: đẩy mục tiêu ra xa người đánh theo khối lượng
    let nx = b.x - a.x;
    let ny = b.y - a.y;
    const d = Math.hypot(nx, ny) || 1;
    nx /= d;
    ny /= d;
    const kb = ((COMBAT.knockbackBase + COMBAT.knockbackPerDamage * dmg) * b.k) / b.mass;
    b.vx += nx * kb;
    b.vy += ny * kb;
    b.targetHeading = Math.atan2(b.vy, b.vx);
    const rc = (COMBAT.recoil * a.k) / a.mass;
    a.vx -= nx * rc;
    a.vy -= ny * rc;

    // nội năng: bị trúng đòn tăng nhiều (theo % máu mất — công bằng giữa loài máu trâu và máu giấy), đánh trúng tăng ít
    sim.ultimate.gain(b, ENERGY.perHitTaken + (dealt / b.maxHp) * ENERGY.perHpPct);
    if (kind !== 'ultimate') sim.ultimate.gain(a, ENERGY.perHitDealt);

    sim.emit('hit', { x: px, y: py, a: a.id, b: b.id, dmg: dealt, kind, weapon: a.weapon });

    if (b.hp <= 0) {
      b.hp = 0;
      b.pendingDeath = true;
      b.killedBy = a.id;
    }
    return dealt;
  }
}
