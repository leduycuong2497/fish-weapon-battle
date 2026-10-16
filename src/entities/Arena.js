import { ARENA_SIZES, autoArenaRadius } from '../config.js';

const SHRINK_DURATION = 45;
const SHRINK_MIN = 0.38;
const OVAL_RATIO = 1.45; // bầu dục dựng đứng: trục dọc / trục ngang

/**
 * Đấu trường tâm (0,0). Hỗ trợ tròn / bầu dục dọc / vuông / chữ nhật, có thể thu hẹp dần.
 */
export class Arena {
  constructor(settings, fishCount) {
    const k = settings.fishScale || 1;
    const base = settings.arenaSize === 'auto' ? autoArenaRadius(fishCount, k) : (ARENA_SIZES[settings.arenaSize] || 330) * k;
    this.shape = settings.arenaShape;
    if (this.shape === 'rect') {
      // giữ diện tích tương đương hình tròn
      const area = Math.PI * base * base;
      this.baseHW = Math.sqrt(area * 1.6) / 2;
      this.baseHH = this.baseHW / 1.6;
    } else if (this.shape === 'oval') {
      // cùng diện tích với hình tròn bán kính base, kéo dài theo chiều dọc (hợp khung 9:16)
      this.baseHW = base / Math.sqrt(OVAL_RATIO);
      this.baseHH = base * Math.sqrt(OVAL_RATIO);
    } else if (this.shape === 'square') {
      this.baseHW = this.baseHH = (Math.sqrt(Math.PI) * base) / 2;
    } else {
      this.baseHW = this.baseHH = base;
    }
    this.baseR = base;
    this.shrinkEnabled = !!settings.shrink;
    this.shrinkStart = settings.shrinkStart;
    this.scale = 1;
    this.applyScale();
  }

  applyScale() {
    this.R = this.baseR * this.scale;
    this.hw = this.baseHW * this.scale;
    this.hh = this.baseHH * this.scale;
  }

  update(t) {
    if (!this.shrinkEnabled || t <= this.shrinkStart) return;
    const k = Math.min(1, (t - this.shrinkStart) / SHRINK_DURATION);
    this.scale = 1 - (1 - SHRINK_MIN) * k;
    this.applyScale();
  }

  get shrinking() {
    return this.shrinkEnabled && this.scale > SHRINK_MIN && this.scale < 1;
  }

  /** Kích thước bao ngoài ban đầu (để camera nhìn thấy toàn bộ). */
  get outerHalfWidth() {
    return this.baseHW;
  }

  get outerHalfHeight() {
    return this.baseHH;
  }

  /**
   * Giữ cá trong đấu trường. Nếu cá chạm/xuyên tường, đẩy về sát mép trong
   * và trả về pháp tuyến hướng ra ngoài tại điểm tiếp xúc; ngược lại trả về null.
   */
  contain(fish, out) {
    const r = fish.radius;
    if (this.shape === 'circle') {
      const d = Math.hypot(fish.x, fish.y);
      const limit = this.R - r;
      if (d <= limit) return null;
      const nx = d > 1e-6 ? fish.x / d : 1;
      const ny = d > 1e-6 ? fish.y / d : 0;
      fish.x = nx * limit;
      fish.y = ny * limit;
      out.nx = nx;
      out.ny = ny;
      out.px = nx * this.R;
      out.py = ny * this.R;
      return out;
    }
    if (this.shape === 'oval') {
      // elip thu nhỏ theo bán kính cá; chiếu xuyên tâm về biên, pháp tuyến = gradient của elip
      const A = this.hw - r;
      const B = this.hh - r;
      const v = (fish.x / A) ** 2 + (fish.y / B) ** 2;
      if (v <= 1) return null;
      const k = 1 / Math.sqrt(v);
      fish.x *= k;
      fish.y *= k;
      let nx = fish.x / (A * A);
      let ny = fish.y / (B * B);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      out.nx = nx;
      out.ny = ny;
      out.px = fish.x + nx * r;
      out.py = fish.y + ny * r;
      return out;
    }
    let nx = 0;
    let ny = 0;
    const L = -this.hw + r;
    const Rr = this.hw - r;
    const T = -this.hh + r;
    const B = this.hh - r;
    if (fish.x < L) {
      fish.x = L;
      nx -= 1;
    } else if (fish.x > Rr) {
      fish.x = Rr;
      nx += 1;
    }
    if (fish.y < T) {
      fish.y = T;
      ny -= 1;
    } else if (fish.y > B) {
      fish.y = B;
      ny += 1;
    }
    if (nx === 0 && ny === 0) return null;
    const len = Math.hypot(nx, ny);
    out.nx = nx / len;
    out.ny = ny / len;
    out.px = fish.x + out.nx * r;
    out.py = fish.y + out.ny * r;
    return out;
  }

  /** Kiểm tra cá nằm hoàn toàn bên trong (cho kiểm thử). */
  containsCircle(x, y, r, eps = 0.01) {
    if (this.shape === 'circle') return Math.hypot(x, y) + r <= this.R + eps;
    if (this.shape === 'oval') return (x / (this.hw - r)) ** 2 + (y / (this.hh - r)) ** 2 <= 1 + eps * 0.02;
    return Math.abs(x) + r <= this.hw + eps && Math.abs(y) + r <= this.hh + eps;
  }

  randomPoint(rng, margin) {
    if (this.shape === 'circle') {
      const rr = Math.max(0, this.R - margin);
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * rr;
      return [Math.cos(a) * d, Math.sin(a) * d];
    }
    if (this.shape === 'oval') {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next());
      return [Math.cos(a) * d * Math.max(0, this.hw - margin), Math.sin(a) * d * Math.max(0, this.hh - margin)];
    }
    return [rng.range(-this.hw + margin, this.hw - margin), rng.range(-this.hh + margin, this.hh - margin)];
  }

  /** Vùng nhận dạng tường (để chống lặp quỹ đạo): khoảng cách giữa hai điểm chạm. */
  wallPointDistance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }
}
