import { DEG, MOVEMENT } from '../config.js';
import { clamp, wrapAngle } from '../sim/math.js';

/**
 * Di chuyển ngẫu nhiên liên tục + phản xạ tường có lệch ngẫu nhiên + chống lặp quỹ đạo.
 * Chỉ thay đổi vận tốc/hướng; không bao giờ đặt lại vị trí cá (ngoài việc đẩy khỏi phần
 * xuyên tường trong cùng bước va chạm).
 */
export class MovementSystem {
  constructor(sim) {
    this.sim = sim;
    this.contact = { nx: 0, ny: 0, px: 0, py: 0 };
  }

  /** Lái hướng & điều chỉnh tốc độ (trước khi tích phân vị trí). */
  steer(dt) {
    const sim = this.sim;
    const t = sim.time;
    const randomness = sim.settings.randomness;
    for (const f of sim.alive) {
      // 1) bơi uốn lượn: mỗi chu kỳ chọn một tốc độ rẽ mới, tốc độ rẽ đổi dần → đường cong liên tục
      f.turnTimer -= dt;
      if (f.turnTimer <= 0) {
        f.turnTimer = f.rng.range(MOVEMENT.turnIntervalMin, MOVEMENT.turnIntervalMax);
        const cur = Math.atan2(f.vy, f.vx);
        f.turnRateTarget = f.rng.range(-1, 1) * MOVEMENT.wanderTurnRate * randomness;
        // tùy chọn: thỉnh thoảng hơi lệch về mục tiêu gần (mặc định tắt)
        const bias = sim.ai.chaseBias(f, cur);
        if (bias !== null) f.targetHeading = cur + bias;
      }
      f.turnRate += (f.turnRateTarget - f.turnRate) * Math.min(1, MOVEMENT.wanderEase * dt);
      f.targetHeading += f.turnRate * dt;
      // nhịp quẫy đuôi: tăng tốc khi quẫy, lướt chậm dần giữa hai nhịp
      f.strokePhase += dt * MOVEMENT.strokeRate * f.strokeMul * Math.PI * 2;

      // 2) xoay vận tốc dần về hướng mục tiêu (không giật cục)
      let cur = Math.atan2(f.vy, f.vx);
      let speed = Math.hypot(f.vx, f.vy);
      const stunned = f.stunUntil > t;
      const slowed = f.slowUntil > t;
      const agility = f.agility * (stunned ? 0.3 : 1);
      const diff = wrapAngle(f.targetHeading - cur);
      const maxTurn = agility * dt;
      cur += clamp(diff, -maxTurn, maxTurn);

      // 3) tốc độ hội tụ về tốc độ hành trình của loài (có buff/debuff)
      let desired = f.cruiseSpeed * f.levelMul.speed * f.speedBuff * f.ultSpeed;
      if (stunned) desired *= 0.3;
      else if (slowed) desired *= 0.6;
      const k = Math.min(1, MOVEMENT.accel * dt);
      speed += (desired - speed) * k;
      // nhịp quẫy: gia tốc dạng cos → tốc độ dao động ±strokeSpeed quanh tốc độ hành trình
      if (!stunned) speed += desired * MOVEMENT.strokeSpeed * Math.cos(f.strokePhase) * MOVEMENT.strokeRate * f.strokeMul * Math.PI * 2 * dt;
      const minSp = f.minSpeed * (stunned ? 0.5 : 1);
      const hardMax = f.cruiseSpeed * MOVEMENT.hardMaxSpeedFactor * Math.max(1, f.speedBuff * f.ultSpeed);
      speed = clamp(speed, minSp, hardMax);
      f.vx = Math.cos(cur) * speed;
      f.vy = Math.sin(cur) * speed;
      f.heading = cur;
    }
  }

  /** Va chạm tường: phản xạ vật lý + lệch ngẫu nhiên ±wallDeflect, chống lặp. */
  walls() {
    const sim = this.sim;
    const arena = sim.arena;
    const c = this.contact;
    for (const f of sim.alive) {
      const hit = arena.contain(f, c);
      if (!hit) continue;
      const vn = f.vx * c.nx + f.vy * c.ny;
      if (vn <= 0) continue; // đã hướng vào trong — không xử lý lại cùng va chạm
      if (f.lastWallStep === sim.stepIndex) continue;
      f.lastWallStep = sim.stepIndex;

      const speed = Math.hypot(f.vx, f.vy);
      // phản xạ vật lý: v' = v - 2(v·n)n
      let rx = f.vx - 2 * vn * c.nx;
      let ry = f.vy - 2 * vn * c.ny;

      // chống lặp: đếm số lần chạm gần cùng vùng tường trong thời gian gần đây
      const loops = this.recordWallHit(f, c.px, c.py);
      const devMax = Math.min(85, sim.settings.wallDeflect * (1 + 0.45 * loops)) * DEG;
      let dev = f.rng.range(-devMax, devMax);
      if (loops >= 2 && Math.abs(dev) < devMax * 0.4) dev = Math.sign(dev || 1) * devMax * 0.6;
      const ang = Math.atan2(ry, rx) + dev;
      rx = Math.cos(ang);
      ry = Math.sin(ang);

      // bảo đảm hướng vào trong đủ dứt khoát để không rung/miết theo tường
      let dot = rx * c.nx + ry * c.ny;
      if (dot > -MOVEMENT.minInwardDot) {
        const push = dot + MOVEMENT.minInwardDot;
        rx -= c.nx * push;
        ry -= c.ny * push;
        const l = Math.hypot(rx, ry) || 1;
        rx /= l;
        ry /= l;
        dot = rx * c.nx + ry * c.ny;
      }

      const sp = clamp(speed, f.minSpeed, f.cruiseSpeed * MOVEMENT.hardMaxSpeedFactor);
      f.vx = rx * sp;
      f.vy = ry * sp;
      f.heading = Math.atan2(ry, rx);
      f.targetHeading = f.heading;
      f.turnRate = 0; // bỏ đà rẽ cũ để không cong ngược lại vào tường
      // giữ hướng mới một lúc trước lần đổi hướng kế tiếp
      f.turnTimer = Math.max(f.turnTimer, 0.35);
      f.lastWallHitTime = sim.time;
      sim.stats.wallHits++;
      sim.emit('wall', { id: f.id, x: c.px, y: c.py, loops });
    }
  }

  recordWallHit(f, px, py) {
    const t = this.sim.time;
    const hits = f.wallHits;
    let near = 0;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (t - h.t > MOVEMENT.wallMemoryTime) continue;
      if (Math.hypot(h.x - px, h.y - py) < MOVEMENT.loopZoneRadius * this.sim.k) near++;
    }
    hits.push({ t, x: px, y: py });
    if (hits.length > MOVEMENT.wallMemory) hits.shift();
    if (near >= 2) this.sim.stats.antiLoopCorrections++;
    return near;
  }
}
