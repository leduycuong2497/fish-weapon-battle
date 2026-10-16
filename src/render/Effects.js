// Hiệu ứng hình ảnh dùng object pool, giới hạn theo mức hiệu ứng & số lượng cá.
// Hiệu ứng chỉ để hiển thị — dùng Math.random vì không ảnh hưởng mô phỏng.
import Phaser from 'phaser';

const LEVEL_LIMITS = { low: 60, medium: 180, high: 420 };
const SPRITE_LIMITS = { low: 24, medium: 70, high: 150 };

// ---------- texture hiệu ứng (Canvas 2D) ----------
function mk(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

const FX_TEX = {
  fx_glow: () =>
    mk(64, 64, (x) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    }),
  // vệt chém hình lưỡi liềm (lồi sang phải)
  fx_slash: () =>
    mk(160, 160, (x) => {
      x.translate(80, 80);
      const g = x.createLinearGradient(-20, -70, -20, 70);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(-10, -72);
      x.quadraticCurveTo(110, 0, -10, 72);
      x.quadraticCurveTo(55, 0, -10, -72);
      x.fill();
    }),
  fx_star: () =>
    mk(128, 128, (x) => {
      x.translate(64, 64);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 ? 16 : i % 4 === 0 ? 64 : 42;
        const a = (i / 16) * Math.PI * 2;
        if (i === 0) x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      x.closePath();
      x.fill();
    }),
  fx_ring: () =>
    mk(128, 128, (x) => {
      const g = x.createRadialGradient(64, 64, 40, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }),
  fx_streak: () =>
    mk(160, 24, (x) => {
      const g = x.createLinearGradient(0, 0, 160, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(0, 12);
      x.quadraticCurveTo(120, 0, 160, 12);
      x.quadraticCurveTo(120, 24, 0, 12);
      x.fill();
    }),
  // luồng sáng thẳng đứng: lõi trắng, viền mờ, sáng dần về phía đáy
  fx_beam: () =>
    mk(64, 256, (x) => {
      const h = x.createLinearGradient(0, 0, 64, 0);
      h.addColorStop(0, 'rgba(255,255,255,0)');
      h.addColorStop(0.3, 'rgba(255,255,255,0.55)');
      h.addColorStop(0.5, 'rgba(255,255,255,1)');
      h.addColorStop(0.7, 'rgba(255,255,255,0.55)');
      h.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = h;
      x.fillRect(0, 0, 64, 256);
      x.globalCompositeOperation = 'destination-in';
      const v = x.createLinearGradient(0, 0, 0, 256);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(0.35, 'rgba(0,0,0,0.6)');
      v.addColorStop(1, 'rgba(0,0,0,1)');
      x.fillStyle = v;
      x.fillRect(0, 0, 64, 256);
    }),
  // giọt nước bắn ra (hướng sang phải)
  fx_drop: () =>
    mk(32, 20, (x) => {
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.moveTo(31, 10);
      x.quadraticCurveTo(12, 0, 6, 10);
      x.quadraticCurveTo(12, 20, 31, 10);
      x.fill();
      x.beginPath();
      x.arc(8, 10, 6, 0, Math.PI * 2);
      x.fill();
    }),
};

export function createFxTextures(scene) {
  for (const [key, build] of Object.entries(FX_TEX)) {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, build());
  }
}

const TEX_W = { fx_beam: 64, fx_glow: 64, fx_slash: 160, fx_star: 128, fx_ring: 128, fx_streak: 160, fx_drop: 32 };

export class Effects {
  constructor(scene, container) {
    this.scene = scene;
    this.container = container;
    this.gfx = scene.add.graphics();
    this.layer = scene.add.container(0, 0);
    container.add([this.gfx, this.layer]);
    this.particles = [];
    this.free = [];
    this.rings = [];
    this.bolts = [];
    this.texts = [];
    this.textPool = [];
    this.sprites = [];
    this.spritePool = [];
    this.level = 'high';
    this.limit = LEVEL_LIMITS.high;
    this.spriteLimit = SPRITE_LIMITS.high;
    this.flash = 0;
    // phép chiếu do scene cung cấp (chế độ 3D nghiêng); mặc định là đồng nhất
    this.pos = (f) => [f.x, f.y];
    this.angle = (a) => a;
  }

  configure(level, fishCount) {
    this.level = level;
    let k = 1;
    if (fishCount > 50) k = 0.45;
    else if (fishCount > 20) k = 0.7;
    this.limit = Math.round((LEVEL_LIMITS[level] || 180) * k);
    this.spriteLimit = Math.round((SPRITE_LIMITS[level] || 70) * k);
  }

  get lvl() {
    return this.level === 'high' ? 3 : this.level === 'medium' ? 2 : 1;
  }

  // ---------- hạt vuông nhỏ (Graphics) ----------
  spawn(x, y, vx, vy, life, size, color, drag = 3) {
    if (this.particles.length >= this.limit) return;
    const p = this.free.pop() || {};
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
    p.drag = drag;
    p.gy = 0;
    p.spin = 0;
    p.round = false;
    this.particles.push(p);
    return p;
  }

  /** Nổ "cốm vàng" khi bị hạ (giống video): cục tròn vàng/cam/nâu bung ra rồi rơi. */
  nuggets(x, y, n, scale = 1) {
    const colors = [0xffc400, 0xffb300, 0xff8f00, 0xa0522d, 0xffe082, 0xd2691e];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (140 + Math.random() * 360) * scale;
      const p = this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, 0.9 + Math.random() * 0.7, (3.5 + Math.random() * 5) * scale, colors[i % colors.length], 2.4);
      if (!p) return;
      p.gy = 220;
      p.round = true;
    }
  }

  /** Vạch va chạm trắng kiểu truyện tranh quanh điểm trúng đòn. */
  impactLines(x, y, size = 1) {
    if (this.lvl < 2) return;
    const n = 7;
    const a0 = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const d = 22 * size;
      this.fx('fx_streak', x + Math.cos(a) * d, y + Math.sin(a) * d, { rot: a, size0: 14 * size, size1: 34 * size, life: 0.2, tint: 0xffffff, sy: 0.35, add: false, alpha: 0.95, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 });
    }
  }

  burst(x, y, n, speed, colors, life = 0.45, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), colors[i % colors.length]);
    }
  }

  /** Tia lửa bắn theo một hướng chính (nón ±spread). */
  sparks(x, y, dir, spread, n, speed, colors, life = 0.35, size = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), colors[i % colors.length], 4);
    }
  }

  /** Confetti nhiều màu bung ra rồi rơi xuống (khi bị hạ). */
  confetti(x, y, n) {
    const colors = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff, 0xff9100];
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= this.limit + 80) return;
      const a = Math.random() * Math.PI * 2;
      const sp = 160 + Math.random() * 320;
      const p = this.free.pop() || {};
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 120;
      p.life = p.max = 0.9 + Math.random() * 0.7;
      p.size = 3 + Math.random() * 3.5;
      p.color = colors[i % colors.length];
      p.drag = 2.2;
      p.gy = 260;
      p.spin = Math.random() * 10;
      p.round = false;
      this.particles.push(p);
    }
  }

  ring(x, y, r0, r1, life, color, width = 4) {
    if (this.rings.length > 60) return;
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  bolt(x1, y1, x2, y2, life = 0.18, big = false) {
    if (this.bolts.length > 40) return;
    this.bolts.push({ x1, y1, x2, y2, life, max: life, big, seed: Math.random() * 1000 });
  }

  // ---------- sprite hiệu ứng (vệt chém, tia sáng, sóng xung kích) ----------
  /** size0/size1: chiều rộng (đơn vị thế giới) lúc đầu/cuối. */
  fx(key, x, y, { rot = 0, size0 = 40, size1 = 60, alpha = 1, life = 0.25, tint = 0xffffff, add = true, vx = 0, vy = 0, sy = 1 } = {}) {
    if (this.sprites.length >= this.spriteLimit) return null;
    let img = this.spritePool.pop();
    if (!img) {
      img = this.scene.add.image(0, 0, key);
      this.layer.add(img);
    }
    img.setTexture(key);
    img.setVisible(true);
    img.setPosition(x, y);
    img.setRotation(rot);
    img.setTint(tint);
    img.setAlpha(alpha);
    img.setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    const w = TEX_W[key] || 64;
    const s = { img, life, max: life, s0: size0 / w, s1: size1 / w, a0: alpha, vx, vy, sy };
    img.setScale(s.s0, s.s0 * sy);
    this.sprites.push(s);
    return s;
  }

  /** Vệt chém 2 lớp: viền màu + lõi trắng — nổi rõ trên cả nền sáng lẫn tối. */
  slash(x, y, rot, size, color, life = 0.24) {
    this.fx('fx_slash', x, y, { rot, size0: size * 0.5, size1: size * 1.2, tint: color, add: false, alpha: 0.95, life });
    this.fx('fx_slash', x, y, { rot, size0: size * 0.4, size1: size * 0.95, tint: 0xffffff, add: false, alpha: 1, life: life * 0.8 });
    this.fx('fx_glow', x, y, { size0: size * 0.6, size1: size * 0.15, tint: color, life: life * 0.8 });
  }

  /** Tuyệt chiêu: sóng xung kích nhiều lớp + chớp sao + tia sáng tỏa theo màu loài. */
  ultimate(x, y, color, radius, size) {
    const R = Math.max(radius, size * 3.2);
    this.fx('fx_glow', x, y, { size0: R * 2.6, size1: R * 1.0, life: 1.1, tint: color, alpha: 0.65 });
    this.fx('fx_star', x, y, { rot: Math.random(), size0: size * 2.5, size1: R * 2.8, life: 0.8, tint: 0xffffff });
    this.fx('fx_ring', x, y, { size0: size, size1: R * 2.8, life: 1.1, tint: 0xffffff, alpha: 0.95 });
    this.fx('fx_ring', x, y, { size0: size, size1: R * 2.3, life: 1.4, tint: color });
    this.fx('fx_ring', x, y, { size0: size * 0.5, size1: R * 1.7, life: 1.6, tint: 0xffd54f, alpha: 0.85 });
    this.fx('fx_ring', x, y, { size0: size * 0.3, size1: R * 1.2, life: 1.8, tint: color, alpha: 0.7 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.random() * 0.3;
      this.fx('fx_streak', x + Math.cos(a) * size, y + Math.sin(a) * size, { rot: a, size0: size * 2, size1: R * 1.9, life: 0.75, tint: color, sy: 0.8 });
    }
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 160 + Math.random() * 380;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1.0 + Math.random() * 0.8, 3 + Math.random() * 3.5, [color, 0xffffff, 0xffd54f, 0x80d8ff][i % 4], 1.6);
    }
  }

  /** Hiệu ứng nhân vật xuất hiện ở cuối luồng sáng. */
  appear(x, y, color, size) {
    this.fx('fx_glow', x, y, { size0: size * 5, size1: size * 1.5, life: 0.45, tint: color });
    this.fx('fx_ring', x, y, { size0: size, size1: size * 6, life: 0.5, tint: 0xffffff, alpha: 0.9 });
    this.fx('fx_ring', x, y, { size0: size * 0.6, size1: size * 4, life: 0.4, tint: color });
    this.fx('fx_star', x, y, { rot: Math.random(), size0: size * 1.5, size1: size * 6, life: 0.35, tint: 0xfff8e1 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 300;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - 140, 0.6 + Math.random() * 0.5, 2 + Math.random() * 3, [color, 0xffffff, 0xffd54f][i % 3], 2.5);
    }
  }

  drops(x, y, dir, spread, n, color, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread * 2;
      const sp = speed * (0.5 + Math.random() * 0.6);
      this.fx('fx_drop', x, y, { rot: a, size0: 9 + Math.random() * 5, size1: 4, life: 0.35 + Math.random() * 0.2, tint: color, add: false, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
    }
  }

  // ---------- số sát thương bật nảy ----------
  floatText(x, y, str, color, size = 22) {
    if (this.lvl < 2 || this.texts.length >= 40) return;
    let txt = this.textPool.pop();
    if (!txt) {
      txt = this.scene.add.text(0, 0, '', {
        fontFamily: '"Baloo 2", "Arial Black", sans-serif',
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      });
      txt.setOrigin(0.5);
      this.container.add(txt);
    }
    this.container.bringToTop(txt);
    txt.setFontSize(size);
    txt.setText(str);
    txt.setColor(color);
    txt.setPosition(x + (Math.random() - 0.5) * 10, y);
    txt.setAlpha(1);
    txt.setScale(1.7);
    txt.setVisible(true);
    this.texts.push({ txt, life: 0.85, max: 0.85, vy: -55 });
  }

  // ---------- hiệu ứng trúng đòn theo từng loại vũ khí ----------
  hitFx(e, sim) {
    const L = this.lvl;
    const a = sim.fish[e.a];
    const b = sim.fish[e.b];
    const ap = a ? this.pos(a) : null;
    const ang = a ? this.angle(a.weaponAngle) : 0;
    const out = ap ? Math.atan2(e.y - ap[1], e.x - ap[0]) : 0; // hướng lực đánh
    const tcol = b ? b.species.color : 0xffffff;
    const big = e.dmg >= 20;
    const n = L === 3 ? 1 : L === 2 ? 0.6 : 0.3;

    if (e.kind === 'electric') {
      this.fx('fx_star', e.x, e.y, { rot: Math.random(), size0: 14, size1: 46, life: 0.2, tint: 0x4fc3f7, alpha: 0.8 });
      this.fx('fx_ring', e.x, e.y, { size0: 10, size1: 40, life: 0.25, tint: 0x29b6f6, alpha: 0.6 });
      this.burst(e.x, e.y, Math.round(10 * n), 260, [0x80ffff, 0xffffff, 0x40c4ff], 0.35, 2.5);
      if (a) {
        this.bolt(ap[0], ap[1], e.x, e.y, 0.45, true);
        if (L >= 2) this.bolt(ap[0], ap[1], e.x, e.y, 0.3, false);
      }
      if (b && L >= 2) {
        const [bx, by] = this.pos(b);
        this.fx('fx_ring', bx, by, { size0: b.radius * 2, size1: b.radius * 3.2, life: 0.4, tint: 0xb388ff, alpha: 0.8 });
        for (let i = 0; i < 3; i++) {
          const q = Math.random() * Math.PI * 2;
          this.bolt(bx + Math.cos(q) * b.radius * 0.4, by + Math.sin(q) * b.radius * 0.4, bx + Math.cos(q) * b.radius * 1.4, by + Math.sin(q) * b.radius * 1.4, 0.3);
        }
      }
    } else {
      switch (e.weapon) {
        case 'sword':
          this.slash(e.x, e.y, ang + Math.PI / 2, 75, 0x0091ea);
          this.sparks(e.x, e.y, out, 0.7, Math.round(12 * n), 380, [0xffffff, 0xfff59d, 0x90caf9]);
          break;
        case 'spear':
          this.fx('fx_streak', e.x - Math.cos(out) * 30, e.y - Math.sin(out) * 30, { rot: out, size0: 70, size1: 130, life: 0.22, tint: 0xff8f00, sy: 0.8, add: false, alpha: 0.9 });
          this.fx('fx_streak', e.x - Math.cos(out) * 30, e.y - Math.sin(out) * 30, { rot: out, size0: 60, size1: 110, life: 0.18, tint: 0xffffff, sy: 0.45, add: false });
          this.fx('fx_star', e.x, e.y, { rot: out, size0: 20, size1: 80, life: 0.25, tint: 0xffd54f });
          this.sparks(e.x, e.y, out, 0.45, Math.round(14 * n), 420, [0xffd54f, 0xffffff, 0xff8f00]);
          break;
        case 'blades':
          this.slash(e.x, e.y, ang + Math.PI / 4, 55, 0xff1744, 0.2);
          this.slash(e.x, e.y, ang - Math.PI / 4 + Math.PI, 55, 0xff1744, 0.2);
          this.sparks(e.x, e.y, out, 0.9, Math.round(10 * n), 320, [0xffffff, 0xff8a80]);
          break;
        case 'spikes':
          this.fx('fx_ring', e.x, e.y, { size0: 8, size1: 50, life: 0.3, tint: 0xce93d8 });
          this.fx('fx_glow', e.x, e.y, { size0: 40, size1: 12, life: 0.25, tint: 0xe040fb });
          this.drops(e.x, e.y, out, 1.1, Math.round(7 * n) + 1, 0xb2ff59, 200);
          this.burst(e.x, e.y, Math.round(8 * n), 220, [0xe040fb, 0xb2ff59, 0xffffff], 0.4, 2.5);
          break;
        case 'jaws':
          // cú đớp: hai vệt hàm khép lại
          for (const side of [-1, 1]) {
            const ox = e.x - Math.cos(out) * 8;
            const oy = e.y - Math.sin(out) * 8;
            this.fx('fx_slash', ox, oy, { rot: out + (side * Math.PI) / 2, size0: 90, size1: 34, life: 0.22, tint: 0xd50000, add: false, alpha: 0.9 });
            this.fx('fx_slash', ox, oy, { rot: out + (side * Math.PI) / 2, size0: 76, size1: 28, life: 0.2, tint: 0xffffff, add: false });
          }
          this.fx('fx_star', e.x, e.y, { size0: 20, size1: 70, life: 0.22, tint: 0xff5252 });
          this.drops(e.x, e.y, out, 1.2, Math.round(8 * n) + 1, tcol, 240);
          break;
        case 'mace':
          this.fx('fx_star', e.x, e.y, { rot: Math.random(), size0: 30, size1: 110, life: 0.28, tint: 0xff6d00, add: false, alpha: 0.85 });
          this.fx('fx_star', e.x, e.y, { rot: Math.random(), size0: 20, size1: 70, life: 0.22, tint: 0xffffff, add: false });
          this.fx('fx_ring', e.x, e.y, { size0: 20, size1: 130, life: 0.35, tint: 0xffab40, add: false, alpha: 0.8 });
          this.burst(e.x, e.y, Math.round(14 * n), 300, [0xffcc80, 0xffffff, 0x8d6e63], 0.45, 3.5);
          if (L >= 2) this.scene.shake(90, 0.004);
          break;
        case 'hook':
          this.slash(e.x, e.y, ang + Math.PI * 0.4, 85, 0xff6d00, 0.26);
          this.sparks(e.x, e.y, out, 0.8, Math.round(10 * n), 340, [0xffcc80, 0xffffff]);
          break;
        default:
          this.burst(e.x, e.y, Math.round(10 * n), 260, [0xffffff, 0xffeb3b]);
      }
    }
    if (e.kind !== 'electric') this.impactLines(e.x, e.y, big ? 1.3 : 1);
    if (big && L >= 2 && e.weapon !== 'mace') this.scene.shake(70, 0.0025);
    this.scene.flashFish(e.b);
    const color = e.kind === 'electric' ? '#80ffff' : big ? '#ff9100' : '#ffeb3b';
    this.floatText(e.x, e.y - 14, `-${Math.round(e.dmg)}`, color, big ? 30 : 22);
  }

  /** Phản ứng với sự kiện mô phỏng. */
  onEvent(e, sim) {
    const L = this.lvl;
    switch (e.type) {
      case 'hit':
        this.hitFx(e, sim);
        break;
      case 'clash': {
        this.fx('fx_star', e.x, e.y, { rot: Math.random(), size0: 14, size1: 55, life: 0.18, tint: 0xfff9c4 });
        this.fx('fx_glow', e.x, e.y, { size0: 34, size1: 8, life: 0.15 });
        this.burst(e.x, e.y, L === 3 ? 14 : 6, 380, [0xffffff, 0xfff176, 0xffb300], 0.3, 2.2);
        break;
      }
      case 'death': {
        const f = sim.fish[e.id];
        const col = f ? f.species.color : 0xffffff;
        this.fx('fx_star', e.x, e.y, { rot: Math.random(), size0: 40, size1: 170, life: 0.4, tint: col });
        this.fx('fx_ring', e.x, e.y, { size0: 30, size1: 200, life: 0.5, tint: 0xffffff });
        this.fx('fx_glow', e.x, e.y, { size0: 120, size1: 20, life: 0.4, tint: col });
        this.fx('fx_glow', e.x, e.y, { size0: 160, size1: 60, life: 0.35, tint: 0xffe57f, alpha: 0.95 });
        this.fx('fx_star', e.x, e.y, { rot: Math.random(), size0: 60, size1: 150, life: 0.3, tint: 0xffd740 });
        this.nuggets(e.x, e.y, L === 3 ? 36 : L === 2 ? 20 : 10, f ? Math.max(0.8, f.radius / 30) : 1);
        this.burst(e.x, e.y, L === 3 ? 12 : 6, 360, [col, 0xffffff, f ? f.species.accent : 0xcccccc], 0.9, 4.5);
        this.confetti(e.x, e.y, L === 3 ? 18 : L === 2 ? 10 : 4);
        this.floatText(e.x, e.y - 34, 'K.O!', '#ff5252', 36);
        if (L >= 2) this.scene.shake(160, 0.006);
        break;
      }
      case 'levelup':
        this.fx('fx_ring', e.x, e.y, { size0: 30, size1: 140, life: 0.6, tint: 0xffd600 });
        this.fx('fx_glow', e.x, e.y, { size0: 140, size1: 40, life: 0.6, tint: 0xffd600 });
        this.burst(e.x, e.y, L === 3 ? 16 : 6, 160, [0xffd600, 0xffffff], 0.7, 3.5);
        this.floatText(e.x, e.y - 44, `LV ${e.level}!`, '#ffd600', 28);
        break;
      case 'discharge': {
        this.fx('fx_ring', e.x, e.y, { size0: 30, size1: e.radius * 1.6, life: 0.35, tint: 0x40c4ff, alpha: 0.6 });
        this.fx('fx_glow', e.x, e.y, { size0: e.radius * 0.9, size1: e.radius * 0.3, life: 0.25, tint: 0x4fc3f7, alpha: 0.35 });
        for (let i = 0; i < (e.targets ? 2 : L === 3 ? 7 : 3); i++) {
          const a = Math.random() * Math.PI * 2;
          this.bolt(e.x, e.y, e.x + Math.cos(a) * e.radius, e.y + Math.sin(a) * e.radius, 0.22);
        }
        break;
      }
      case 'skill':
        if (e.skill !== 'discharge' && L >= 2) {
          const f = sim.fish[e.id];
          if (f) {
            const [fx, fy] = this.pos(f);
            this.fx('fx_ring', fx, fy, { size0: f.radius * 2, size1: f.radius * 5, life: 0.35, tint: f.species.color });
            this.fx('fx_glow', fx, fy, { size0: f.radius * 3, size1: f.radius * 1.5, life: 0.3, tint: f.species.color, alpha: 0.3 });
          }
        }
        break;
      case 'wall':
        if (L === 3) this.ring(e.x, e.y, 3, 16, 0.25, 0xffffff, 2);
        break;
      case 'victory':
        this.flash = 0.6;
        break;
      default:
        break;
    }
  }

  update(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        this.free.push(p);
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.vy += p.gy * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
    const sp = this.sprites;
    for (let i = sp.length - 1; i >= 0; i--) {
      const s = sp[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.img.setVisible(false);
        this.spritePool.push(s.img);
        sp[i] = sp[sp.length - 1];
        sp.pop();
        continue;
      }
      const k = 1 - s.life / s.max;
      const e = 1 - (1 - k) * (1 - k); // ease-out
      const sc = s.s0 + (s.s1 - s.s0) * e;
      s.img.setScale(sc, sc * s.sy);
      s.img.setAlpha(s.a0 * (1 - k * k));
      if (s.vx || s.vy) {
        s.img.x += s.vx * dt;
        s.img.y += s.vy * dt;
        s.vx *= 1 - 3 * dt;
        s.vy *= 1 - 3 * dt;
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      const age = t.max - t.life;
      t.txt.setScale(age < 0.12 ? 1.7 - (age / 0.12) * 0.7 : 1);
      if (age > 0.12) t.txt.y += t.vy * dt;
      t.txt.setAlpha(Math.min(1, (t.life / t.max) * 2.5));
      if (t.life <= 0) {
        t.txt.setVisible(false);
        this.textPool.push(t.txt);
        this.texts.splice(i, 1);
      }
    }
    if (this.flash > 0) this.flash -= dt;
  }

  draw() {
    const g = this.gfx;
    g.clear();
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      g.lineStyle(r.width * (1 - k * 0.6), r.color, 1 - k);
      g.strokeCircle(r.x, r.y, r.r0 + (r.r1 - r.r0) * k);
    }
    for (const b of this.bolts) {
      const alpha = Math.min(1, (b.life / b.max) * 1.6);
      const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
      const n = Math.max(4, Math.min(12, Math.round(len / 22)));
      const nx = -(b.y2 - b.y1) / (len || 1);
      const ny = (b.x2 - b.x1) / (len || 1);
      const jit = b.big ? 22 : 14;
      // cùng một đường gấp khúc cho mọi lớp (lớp ngoài tím mờ → lõi trắng)
      const pts = [b.x1, b.y1];
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const o = (Math.random() - 0.5) * jit * Math.sin(k * Math.PI) * 2;
        pts.push(b.x1 + (b.x2 - b.x1) * k + nx * o, b.y1 + (b.y2 - b.y1) * k + ny * o);
      }
      pts.push(b.x2, b.y2);
      const layers = b.big ? [[18, 0x7c4dff, 0.22], [9, 0xb388ff, 0.55], [3.5, 0xffffff, 1]] : [[10, 0x7c4dff, 0.25], [5, 0xb388ff, 0.6], [2.2, 0xffffff, 1]];
      for (const [w, c, al] of layers) {
        g.lineStyle(w, c, alpha * al);
        g.beginPath();
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.strokePath();
      }
      if (b.big) {
        for (const [x, y] of [[b.x1, b.y1], [b.x2, b.y2]]) {
          g.fillStyle(0xb388ff, 0.35 * alpha);
          g.fillCircle(x, y, 16);
          g.fillStyle(0xffffff, 0.9 * alpha);
          g.fillCircle(x, y, 6);
        }
      }
    }
    for (const p of this.particles) {
      const sz = p.size * (0.5 + 0.5 * (p.life / p.max));
      g.fillStyle(p.color, Math.min(1, (p.life / p.max) * 1.4));
      if (p.round) g.fillCircle(p.x, p.y, sz);
      else if (p.spin) {
        // mảnh confetti lật: chiều cao dao động theo thời gian
        const h = sz * Math.abs(Math.cos(p.life * p.spin));
        g.fillRect(p.x - sz, p.y - h, sz * 2, h * 2 + 0.5);
      } else g.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
    }
  }

  clear() {
    for (const p of this.particles) this.free.push(p);
    this.particles.length = 0;
    this.rings.length = 0;
    this.bolts.length = 0;
    for (const s of this.sprites) {
      s.img.setVisible(false);
      this.spritePool.push(s.img);
    }
    this.sprites.length = 0;
    for (const t of this.texts) {
      t.txt.setVisible(false);
      this.textPool.push(t.txt);
    }
    this.texts.length = 0;
    this.gfx.clear();
  }
}
