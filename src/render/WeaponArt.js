// Vũ khí đặc trưng của từng loài: texture vẽ chi tiết bằng Canvas 2D (kim loại, vàng, gỗ, điện…)
// rồi đặt thành sprite bám ĐÚNG theo hình học collider trong entities/Weapon.js.
import { effectiveRange, HOOK_CURL, SPIKES_PER_PUFFER } from '../entities/Weapon.js';

// ---------- tiện ích vẽ ----------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function metal(ctx, y0, y1, stops = ['#ffffff', '#c9d2db', '#f4f7fa', '#7d8a97']) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

const GOLD = ['#fff6c2', '#f2c443', '#fbe58a', '#a8740f'];

function outline(ctx, w = 2, c = 'rgba(20,20,30,0.85)') {
  ctx.lineWidth = w;
  ctx.strokeStyle = c;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function gem(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, color);
  g.addColorStop(1, '#0a0a20');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  outline(ctx, 1.5);
}

// ---------- các texture ----------
// Mỗi texture nằm ngang, mũi hướng sang phải. x = 0 ứng với điểm đầu collider (d0),
// x = len ứng với điểm cuối collider (d1); oy là tỉ lệ dọc của trục vũ khí.

function swordTex() {
  // Trường kiếm thép: lưỡi có rãnh máu, chuôi quấn da, đốc kiếm vàng gắn ngọc xanh
  const [c, x] = canvas(280, 56);
  const cy = 28;
  // chuôi
  x.fillStyle = '#3b2416';
  x.fillRect(8, cy - 6, 44, 12);
  x.strokeStyle = '#7a4a26';
  x.lineWidth = 3;
  for (let i = 12; i < 52; i += 7) {
    x.beginPath();
    x.moveTo(i, cy - 6);
    x.lineTo(i + 5, cy + 6);
    x.stroke();
  }
  gem(x, 7, cy, 7, '#f2c443');
  // đốc kiếm
  x.beginPath();
  x.moveTo(52, cy - 22);
  x.quadraticCurveTo(62, cy - 8, 60, cy);
  x.quadraticCurveTo(62, cy + 8, 52, cy + 22);
  x.lineTo(60, cy + 22);
  x.quadraticCurveTo(70, cy, 60, cy - 22);
  x.closePath();
  x.fillStyle = metal(x, cy - 22, cy + 22, GOLD);
  x.fill();
  outline(x, 1.5);
  gem(x, 62, cy, 5, '#2f7bff');
  // lưỡi
  x.beginPath();
  x.moveTo(66, cy - 9);
  x.lineTo(240, cy - 8);
  x.quadraticCurveTo(266, cy - 4, 278, cy);
  x.quadraticCurveTo(266, cy + 4, 240, cy + 8);
  x.lineTo(66, cy + 9);
  x.closePath();
  x.fillStyle = metal(x, cy - 9, cy + 9);
  x.fill();
  outline(x, 1.8);
  // rãnh máu + ánh sáng cạnh
  x.beginPath();
  x.moveTo(72, cy);
  x.lineTo(215, cy);
  x.lineWidth = 3;
  x.strokeStyle = 'rgba(70,85,100,0.55)';
  x.stroke();
  x.beginPath();
  x.moveTo(70, cy - 7);
  x.lineTo(250, cy - 5.5);
  x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.stroke();
  return { c, oy: 0.5, len: 278 };
}

function spearTex() {
  // Long thương cá rồng: cán sơn mài đỏ đai vàng, tua đỏ, mũi giáo vàng chạm rồng
  const [c, x] = canvas(340, 84);
  const cy = 42;
  x.fillStyle = metal(x, cy - 5, cy + 5, ['#c0392b', '#7a1010', '#4a0808']);
  x.fillRect(0, cy - 4.5, 262, 9);
  outline(x, 0);
  for (const bx of [10, 90, 170, 236]) {
    x.fillStyle = metal(x, cy - 6, cy + 6, GOLD);
    x.fillRect(bx, cy - 6, 8, 12);
  }
  // tua đỏ bay về phía sau
  for (let i = 0; i < 9; i++) {
    const s = i / 8 - 0.5;
    x.beginPath();
    x.moveTo(252, cy);
    x.quadraticCurveTo(238, cy + s * 30, 214 - Math.abs(s) * 10, cy + s * 46);
    x.lineWidth = 3;
    x.strokeStyle = i % 2 ? '#e53935' : '#b71c1c';
    x.stroke();
  }
  // đế mũi giáo
  x.beginPath();
  x.moveTo(256, cy - 9);
  x.lineTo(272, cy - 7);
  x.lineTo(272, cy + 7);
  x.lineTo(256, cy + 9);
  x.closePath();
  x.fillStyle = metal(x, cy - 9, cy + 9, GOLD);
  x.fill();
  outline(x, 1.5);
  // mũi giáo hình lá
  x.beginPath();
  x.moveTo(270, cy);
  x.quadraticCurveTo(282, cy - 22, 300, cy - 16);
  x.quadraticCurveTo(322, cy - 8, 338, cy);
  x.quadraticCurveTo(322, cy + 8, 300, cy + 16);
  x.quadraticCurveTo(282, cy + 22, 270, cy);
  x.closePath();
  x.fillStyle = metal(x, cy - 22, cy + 22, GOLD);
  x.fill();
  outline(x, 1.8);
  x.beginPath();
  x.moveTo(276, cy);
  x.lineTo(334, cy);
  x.lineWidth = 2;
  x.strokeStyle = 'rgba(120,70,0,0.7)';
  x.stroke();
  gem(x, 284, cy, 4.5, '#e53935');
  return { c, oy: 0.5, len: 338 };
}

function daggerTex() {
  // Dao găm cong (karambit) cán xương đỏ
  const [c, x] = canvas(124, 52);
  const cy = 26;
  x.beginPath();
  x.moveTo(2, cy - 6);
  x.lineTo(34, cy - 5);
  x.lineTo(34, cy + 5);
  x.lineTo(2, cy + 6);
  x.closePath();
  x.fillStyle = metal(x, cy - 6, cy + 6, ['#ff8a65', '#b71c1c', '#5d0d0d']);
  x.fill();
  outline(x, 1.5);
  gem(x, 6, cy, 4, '#ffd54f');
  x.beginPath();
  x.moveTo(34, cy - 13);
  x.quadraticCurveTo(40, cy, 34, cy + 13);
  x.lineTo(39, cy + 13);
  x.quadraticCurveTo(45, cy, 39, cy - 13);
  x.closePath();
  x.fillStyle = '#263238';
  x.fill();
  // lưỡi cong
  x.beginPath();
  x.moveTo(42, cy - 7);
  x.quadraticCurveTo(90, cy - 12, 122, cy - 20);
  x.quadraticCurveTo(104, cy + 4, 42, cy + 8);
  x.closePath();
  x.fillStyle = metal(x, cy - 16, cy + 8);
  x.fill();
  outline(x, 1.6);
  x.beginPath();
  x.moveTo(46, cy - 5);
  x.quadraticCurveTo(90, cy - 10, 118, cy - 18);
  x.lineWidth = 1.4;
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.stroke();
  return { c, oy: 0.5, len: 112 };
}

function spikeTex() {
  // Gai xương tẩm độc (đầu tím)
  const [c, x] = canvas(66, 40);
  const cy = 20;
  x.beginPath();
  x.moveTo(0, cy - 13);
  x.quadraticCurveTo(36, cy - 6, 64, cy);
  x.quadraticCurveTo(36, cy + 6, 0, cy + 13);
  x.closePath();
  const g = x.createLinearGradient(0, 0, 66, 0);
  g.addColorStop(0, '#d7c49a');
  g.addColorStop(0.55, '#f5ecd2');
  g.addColorStop(0.72, '#ba68c8');
  g.addColorStop(1, '#6a1b9a');
  x.fillStyle = g;
  x.fill();
  outline(x, 1.5, 'rgba(60,30,60,0.85)');
  x.beginPath();
  x.moveTo(6, cy - 8);
  x.quadraticCurveTo(36, cy - 3, 58, cy - 1);
  x.lineWidth = 1.2;
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.stroke();
  return { c, oy: 0.5, len: 64 };
}

function tailTex() {
  // Đuôi gai điện: thân roi thuôn, gai răng cưa, quả cầu plasma ở chóp
  const [c, x] = canvas(214, 52);
  const cy = 26;
  x.beginPath();
  x.moveTo(0, cy - 9);
  x.quadraticCurveTo(110, cy - 6, 182, cy - 2);
  x.lineTo(182, cy + 2);
  x.quadraticCurveTo(110, cy + 6, 0, cy + 9);
  x.closePath();
  x.fillStyle = metal(x, cy - 9, cy + 9, ['#9575cd', '#4527a0', '#1a0f40']);
  x.fill();
  outline(x, 1.5);
  // gai răng cưa
  x.fillStyle = '#e0f7fa';
  for (let i = 0; i < 6; i++) {
    const bx = 112 + i * 11;
    x.beginPath();
    x.moveTo(bx, cy - 4);
    x.lineTo(bx + 9, cy - 4);
    x.lineTo(bx + 2, cy - 13);
    x.closePath();
    x.fill();
    outline(x, 1, 'rgba(30,20,60,0.8)');
  }
  // quả cầu plasma
  const g = x.createRadialGradient(196, cy, 1, 196, cy, 18);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#80ffff');
  g.addColorStop(0.7, 'rgba(0,200,255,0.45)');
  g.addColorStop(1, 'rgba(0,200,255,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(196, cy, 18, 0, Math.PI * 2);
  x.fill();
  return { c, oy: 0.5, len: 196 };
}

function jawTex() {
  // Bẫy hàm thép của cá mập: vòng thép đinh tán + răng cưa bạc + họng đỏ
  const [c, x] = canvas(132, 132);
  const m = 66;
  x.beginPath();
  x.arc(m, m, 58, 0, Math.PI * 2);
  x.fillStyle = metal(x, m - 58, m + 58, ['#cfd8dc', '#607d8b', '#b0bec5', '#263238']);
  x.fill();
  outline(x, 2.5);
  x.beginPath();
  x.arc(m, m, 42, 0, Math.PI * 2);
  const g = x.createRadialGradient(m, m, 4, m, m, 42);
  g.addColorStop(0, '#1a0000');
  g.addColorStop(1, '#8b0000');
  x.fillStyle = g;
  x.fill();
  // răng
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b1 = a - 0.2;
    const b2 = a + 0.2;
    x.beginPath();
    x.moveTo(m + Math.cos(b1) * 44, m + Math.sin(b1) * 44);
    x.lineTo(m + Math.cos(b2) * 44, m + Math.sin(b2) * 44);
    x.lineTo(m + Math.cos(a) * 22, m + Math.sin(a) * 22);
    x.closePath();
    x.fillStyle = metal(x, m - 40, m + 40, ['#ffffff', '#e0e0e0', '#9e9e9e']);
    x.fill();
    outline(x, 1, 'rgba(30,30,30,0.7)');
  }
  // đinh tán
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    gem(x, m + Math.cos(a) * 51, m + Math.sin(a) * 51, 3.2, '#90a4ae');
  }
  return { c, oy: 0.5, len: 132 };
}

function maceHandleTex() {
  const [c, x] = canvas(150, 20);
  const cy = 10;
  x.fillStyle = metal(x, cy - 5, cy + 5, ['#a1887f', '#5d4037', '#3e2723']);
  x.fillRect(0, cy - 4.5, 150, 9);
  x.strokeStyle = '#2b1b14';
  x.lineWidth = 2;
  for (let i = 4; i < 36; i += 6) {
    x.beginPath();
    x.moveTo(i, cy - 5);
    x.lineTo(i + 4, cy + 5);
    x.stroke();
  }
  for (const bx of [60, 128]) {
    x.fillStyle = metal(x, cy - 6, cy + 6);
    x.fillRect(bx, cy - 6, 6, 12);
  }
  return { c, oy: 0.5, len: 150 };
}

function maceHeadTex() {
  // Chùy gai sao mai
  const [c, x] = canvas(100, 100);
  const m = 50;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    x.beginPath();
    x.moveTo(m + Math.cos(a - 0.22) * 26, m + Math.sin(a - 0.22) * 26);
    x.lineTo(m + Math.cos(a) * 48, m + Math.sin(a) * 48);
    x.lineTo(m + Math.cos(a + 0.22) * 26, m + Math.sin(a + 0.22) * 26);
    x.closePath();
    x.fillStyle = metal(x, m - 48, m + 48, ['#eceff1', '#90a4ae', '#455a64']);
    x.fill();
    outline(x, 1.4);
  }
  x.beginPath();
  x.arc(m, m, 30, 0, Math.PI * 2);
  const g = x.createRadialGradient(m - 10, m - 10, 3, m, m, 30);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#90a4ae');
  g.addColorStop(1, '#263238');
  x.fillStyle = g;
  x.fill();
  outline(x, 2);
  return { c, oy: 0.5, len: 100, coreR: 30 };
}

function scytheTex() {
  // Lưỡi hái đuôi móc của cá ngựa: cán đồng + lưỡi cong thép xanh
  const [c, x] = canvas(224, 112);
  const cy = 24;
  x.fillStyle = metal(x, cy - 4, cy + 4, ['#ffcc80', '#bf6a1c', '#6d3a0b']);
  x.fillRect(0, cy - 4, 172, 8);
  outline(x, 0);
  x.fillStyle = metal(x, cy - 7, cy + 7, GOLD);
  x.fillRect(158, cy - 7, 14, 14);
  // lưỡi hái
  x.beginPath();
  x.moveTo(160, cy - 10);
  x.quadraticCurveTo(232, cy + 4, 182, cy + 84);
  x.quadraticCurveTo(204, cy + 26, 160, cy + 12);
  x.closePath();
  x.fillStyle = metal(x, cy - 10, cy + 84, ['#e1f5fe', '#81d4fa', '#eceff1', '#37474f']);
  x.fill();
  outline(x, 1.8);
  x.beginPath();
  x.moveTo(166, cy - 6);
  x.quadraticCurveTo(222, cy + 8, 186, cy + 76);
  x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.stroke();
  return { c, oy: cy / 112, len: 172 };
}

const BUILDERS = {
  w_sword: swordTex,
  w_spear: spearTex,
  w_dagger: daggerTex,
  w_spike: spikeTex,
  w_tail: tailTex,
  w_jaw: jawTex,
  w_mace_handle: maceHandleTex,
  w_mace_head: maceHeadTex,
  w_scythe: scytheTex,
};

export const WEAPON_TEX = {};

export function createWeaponTextures(scene) {
  for (const [key, build] of Object.entries(BUILDERS)) {
    const t = build();
    WEAPON_TEX[key] = t;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, t.c);
  }
}

// ---------- sprite vũ khí bám collider ----------

function placeAlong(img, tex, f, ang, d0, d1) {
  const s = (d1 - d0) / tex.len;
  img.setPosition(f.x + Math.cos(ang) * d0, f.y + Math.sin(ang) * d0);
  img.setRotation(ang);
  img.setScale(s);
}

/** Bộ sprite vũ khí của một con cá. */
export class WeaponView {
  constructor(scene, container, fish) {
    this.fish = fish;
    this.parts = [];
    const add = (key, ox = 0) => {
      const tex = WEAPON_TEX[key];
      const img = scene.add.image(0, 0, key).setOrigin(ox, tex.oy);
      container.add(img);
      this.parts.push(img);
      return img;
    };
    switch (fish.weapon) {
      case 'sword':
        add('w_sword');
        break;
      case 'spear':
        add('w_spear');
        break;
      case 'blades':
        add('w_dagger');
        add('w_dagger');
        break;
      case 'spikes':
        for (let i = 0; i < SPIKES_PER_PUFFER; i++) add('w_spike');
        break;
      case 'electric':
        add('w_tail');
        break;
      case 'jaws':
        add('w_jaw', 0.5);
        break;
      case 'mace':
        add('w_mace_handle');
        add('w_mace_head', 0.5);
        break;
      case 'hook':
        add('w_scythe');
        break;
      default:
        break;
    }
  }

  update(t) {
    const f = this.fish;
    const p = this.parts;
    if (!f.alive) {
      for (const img of p) img.setVisible(false);
      return;
    }
    const a = f.weaponAngle;
    const R = f.radius;
    const L = effectiveRange(f);
    const skill = f.skillActiveUntil > t;
    switch (f.weapon) {
      case 'sword':
        placeAlong(p[0], WEAPON_TEX.w_sword, f, a, R * 1.02, R + L);
        break;
      case 'spear':
        placeAlong(p[0], WEAPON_TEX.w_spear, f, a, R * 1.02, R + L);
        break;
      case 'blades':
        placeAlong(p[0], WEAPON_TEX.w_dagger, f, a, R * 1.02, R + L);
        placeAlong(p[1], WEAPON_TEX.w_dagger, f, a + Math.PI, R * 1.02, R + L);
        break;
      case 'spikes': {
        const tip = R + L * 0.55 + (4 * (f.k || 1)) + L * 0.15;
        for (let k = 0; k < p.length; k++) {
          placeAlong(p[k], WEAPON_TEX.w_spike, f, a + (k * Math.PI * 2) / p.length, R * 0.82, tip);
        }
        break;
      }
      case 'electric':
        placeAlong(p[0], WEAPON_TEX.w_tail, f, a, R * 0.95, R + L);
        break;
      case 'jaws': {
        const d = R + L * 0.45;
        const r = L * 0.7;
        p[0].setPosition(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d);
        p[0].setRotation(a + t * 2);
        p[0].setScale((r * 2.2) / WEAPON_TEX.w_jaw.len);
        break;
      }
      case 'mace': {
        const hd = R + L - 10 * (f.k || 1);
        placeAlong(p[0], WEAPON_TEX.w_mace_handle, f, a, R * 1.02, hd);
        p[0].setScale((hd - R * 1.02) / WEAPON_TEX.w_mace_handle.len, 0.55);
        p[1].setPosition(f.x + Math.cos(a) * hd, f.y + Math.sin(a) * hd);
        p[1].setRotation(a * 1.5);
        p[1].setScale((12 * (f.k || 1)) / WEAPON_TEX.w_mace_head.coreR);
        break;
      }
      case 'hook': {
        placeAlong(p[0], WEAPON_TEX.w_scythe, f, a, R * 1.02, R + L - 4 * (f.k || 1));
        break;
      }
      default:
        break;
    }
    // phát sáng khi kỹ năng kích hoạt
    for (const img of p) {
      img.setVisible(true);
      if (skill) img.setTint(f.weapon === 'spikes' ? 0xffab40 : 0xfff59d);
      else img.clearTint();
    }
  }

  destroy() {
    for (const img of this.parts) img.destroy();
    this.parts.length = 0;
  }
}

/** Lớp phủ động: vệt chém cho vũ khí xoay nhanh, tia điện chạy dọc đuôi cá đuối. */
export function drawWeaponFx(g, f, t, fx) {
  if (!f.alive) return;
  const a = f.weaponAngle;
  const R = f.radius;
  const L = effectiveRange(f);
  if (fx >= 2 && f.weapon !== 'spikes' && f.weapon !== 'jaws') {
    const w = f.rotSpeed * f.levelMul.rot * f.rotBuff;
    if (w > 3.5) {
      const r = R + L * 0.85;
      const sweep = Math.min(1.1, w * 0.13);
      for (let i = 0; i < 3; i++) {
        g.lineStyle(7 - i * 2, 0xffffff, 0.1 + i * 0.07);
        g.beginPath();
        g.arc(f.x, f.y, r, a - f.weaponDir * sweep * (1 - i * 0.3), a, f.weaponDir < 0);
        g.strokePath();
      }
      if (f.weapon === 'blades') {
        g.lineStyle(5, 0xff8a80, 0.18);
        g.beginPath();
        g.arc(f.x, f.y, r, a + Math.PI - f.weaponDir * sweep, a + Math.PI, f.weaponDir < 0);
        g.strokePath();
      }
    }
  }
  if (f.weapon === 'electric') {
    const sx = f.x + Math.cos(a) * R * 0.8;
    const sy = f.y + Math.sin(a) * R * 0.8;
    const ex = f.x + Math.cos(a) * (R + L);
    const ey = f.y + Math.sin(a) * (R + L);
    const px = -Math.sin(a);
    const py = Math.cos(a);
    g.lineStyle(2, 0x80ffff, 0.9);
    g.beginPath();
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const j = i % 2 === 0 ? 0 : (((i * 7 + Math.floor(t * 30)) % 5) - 2) * 2.4;
      const qx = sx + (ex - sx) * k + px * j;
      const qy = sy + (ey - sy) * k + py * j;
      if (i === 0) g.moveTo(qx, qy);
      else g.lineTo(qx, qy);
    }
    g.strokePath();
    g.fillStyle(0x80ffff, 0.25 + 0.2 * Math.sin(t * 20));
    g.fillCircle(ex, ey, 9);
  }
  if (f.weapon === 'spikes' && f.skillActiveUntil > t) {
    g.lineStyle(3, 0xce93d8, 0.35 + 0.2 * Math.sin(t * 15));
    g.strokeCircle(f.x, f.y, R + L * 0.55 + 6);
  }
}

export function drawColliders(g, f) {
  g.lineStyle(1.5, 0x00e5ff, 0.9);
  g.strokeCircle(f.x, f.y, f.radius);
  g.lineStyle(1.5, 0xff1744, 0.9);
  for (let i = 0; i < f.wShapeCount; i++) {
    const s = f.wShapes[i];
    if (s.k === 'circ') g.strokeCircle(s.x, s.y, s.r);
    else {
      const a = Math.atan2(s.by - s.ay, s.bx - s.ax);
      const px = -Math.sin(a) * s.r;
      const py = Math.cos(a) * s.r;
      g.lineBetween(s.ax + px, s.ay + py, s.bx + px, s.by + py);
      g.lineBetween(s.ax - px, s.ay - py, s.bx - px, s.by - py);
      g.strokeCircle(s.ax, s.ay, s.r);
      g.strokeCircle(s.bx, s.by, s.r);
    }
  }
}

export { HOOK_CURL };
