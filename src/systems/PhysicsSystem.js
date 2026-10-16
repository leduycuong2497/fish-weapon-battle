import { MOVEMENT } from '../config.js';

/**
 * Spatial hash cho broad-phase: tránh kiểm tra mọi cặp cá (O(n²)).
 */
export class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.pool = [];
  }

  key(cx, cy) {
    return (cx + 1024) * 4096 + (cy + 1024);
  }

  clear() {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.cells.clear();
  }

  insert(fish) {
    const cx = Math.floor(fish.x / this.cellSize);
    const cy = Math.floor(fish.y / this.cellSize);
    const k = this.key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = this.pool.pop() || [];
      this.cells.set(k, arr);
    }
    arr.push(fish);
  }

  /** Gọi cb cho mọi cá trong các ô giao với hình tròn (x, y, radius). */
  query(x, y, radius, out) {
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const y0 = Math.floor((y - radius) / cs);
    const y1 = Math.floor((y + radius) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }
}

/**
 * Tích phân vị trí và xử lý va chạm thân–thân giữa các cá (bật ra theo khối lượng).
 */
export class PhysicsSystem {
  constructor(sim) {
    this.sim = sim;
    this.hash = new SpatialHash(64);
    this.tmp = [];
  }

  rebuild() {
    const hash = this.hash;
    hash.clear();
    for (const f of this.sim.alive) hash.insert(f);
  }

  integrate(dt) {
    for (const f of this.sim.alive) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
  }

  resolveFishCollisions() {
    const sim = this.sim;
    const e = sim.settings.bounce;
    const near = this.tmp;
    for (const a of sim.alive) {
      this.hash.query(a.x, a.y, a.radius + sim.maxRadius, near);
      let touching = false;
      for (const b of near) {
        if (b.id <= a.id) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        touching = true;
        const d = Math.sqrt(d2) || 0.0001;
        const nx = d2 > 0 ? dx / d : 1;
        const ny = d2 > 0 ? dy / d : 0;
        const overlap = rr - d;
        const im = 1 / a.mass;
        const jm = 1 / b.mass;
        const sum = im + jm;
        // tách vị trí để không chồng lên nhau (theo tỉ lệ khối lượng)
        a.x -= nx * overlap * (im / sum);
        a.y -= ny * overlap * (im / sum);
        b.x += nx * overlap * (jm / sum);
        b.y += ny * overlap * (jm / sum);
        // xung lực bật ra
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vrel < 0) {
          const j = (-(1 + e) * vrel) / sum;
          a.vx -= j * im * nx;
          a.vy -= j * im * ny;
          b.vx += j * jm * nx;
          b.vy += j * jm * ny;
          // lệch hướng ngẫu nhiên nhỏ sau va chạm (không đổi hoàn toàn ngẫu nhiên)
          this.jitter(a);
          this.jitter(b);
          a.lastCollisionTime = sim.time;
          b.lastCollisionTime = sim.time;
          sim.emit('bump', { x: a.x + nx * a.radius, y: a.y + ny * a.radius, strength: -vrel });
        }
      }
      // tránh dính nhau quá lâu: nếu liên tục tiếp xúc, cho phép hướng mới
      if (touching) {
        a.contactSteps++;
        if (a.contactSteps > 45) {
          a.contactSteps = 0;
          a.targetHeading = Math.atan2(a.vy, a.vx) + a.rng.range(-1, 1) * 0.9;
        }
      } else a.contactSteps = 0;
    }
  }

  jitter(f) {
    const ang = Math.atan2(f.vy, f.vx) + f.rng.range(-1, 1) * MOVEMENT.collisionJitter;
    const sp = Math.hypot(f.vx, f.vy);
    f.vx = Math.cos(ang) * sp;
    f.vy = Math.sin(ang) * sp;
    // hướng mục tiêu theo hướng mới để cá không lái ngược lại vào nhau
    f.targetHeading = ang;
  }
}
