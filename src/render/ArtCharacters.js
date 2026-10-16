// Nhân vật dạng "hình minh họa": dùng chính hình cắt từ ảnh concept của bạn (public/art/...).
// Cá quay mặt theo hướng bơi; vũ khí (cũng cắt từ ảnh) xoay quanh cá theo đúng collider,
// được chiếu theo góc nghiêng camera giống lớp 3D.
import { SPECIES } from '../config.js';
import { facingAngle } from './Facing.js';
import { effectiveRange, HOOK_CURL, SPIKES_PER_PUFFER } from '../entities/Weapon.js';

// bề ngang hiển thị của hình cá, tính theo bán kính thân R
const FISH_W = {
  swordfish: 4.6,
  pufferfish: 2.75,
  piranha: 3.0,
  stingray: 3.4,
  shark: 3.9,
  tilapia: 3.05,
  arowana: 4.1,
  seahorse: 2.5,
};

// độ dày hiển thị của vũ khí (chỉ là hình — collider không đổi)
const THICK = { sword: 1.25, blades: 1.2, electric: 1.3, mace: 1.6, spear: 1.35, hook: 1.15, spikes: 1 };

const WEAPON_KEY = {
  sword: 'art_w_sword',
  blades: 'art_w_blades',
  electric: 'art_w_electric',
  jaws: 'art_w_jaws',
  mace: 'art_w_mace',
  spear: 'art_w_spear',
  hook: 'art_w_hook',
};

/** Nạp hình (gọi trong preload của BootScene). Thiếu tệp thì game tự quay về kiểu 3D. */
export function preloadArt(scene) {
  for (const sp of SPECIES) {
    scene.load.image(`art_fish_${sp.id}`, `art/fish/${sp.id}.png`);
    scene.load.image(`art_fish_${sp.id}_battle`, `art/fish/${sp.id}_battle.png`);
  }
  for (const [type, key] of Object.entries(WEAPON_KEY)) scene.load.image(key, `art/weapons/${type}.png`);
}

export function artAvailable(scene) {
  return SPECIES.every((sp) => scene.textures.exists(`art_fish_${sp.id}_battle`)) && Object.values(WEAPON_KEY).every((k) => scene.textures.exists(k));
}

/** Hình nhân vật một con cá + vũ khí của nó, đặt trong lớp overlay (tọa độ đã chiếu). */
export class ArtFishView {
  constructor(scene, layer, fish) {
    this.scene = scene;
    this.fish = fish;
    this.body = scene.add.image(0, 0, `art_fish_${fish.speciesId}_battle`);
    this.parts = [];
    const w = fish.weapon;
    if (w === 'spikes') {
      for (let i = 0; i < SPIKES_PER_PUFFER; i++) this.parts.push(scene.add.image(0, 0, 'w_spike').setOrigin(0, 0.5));
    } else if (w === 'blades') {
      this.parts.push(scene.add.image(0, 0, WEAPON_KEY.blades).setOrigin(0, 0.5));
      this.parts.push(scene.add.image(0, 0, WEAPON_KEY.blades).setOrigin(0, 0.5).setFlipY(true));
    } else if (w === 'jaws') {
      this.parts.push(scene.add.image(0, 0, WEAPON_KEY.jaws).setOrigin(0.5, 0.5));
    } else {
      this.parts.push(scene.add.image(0, 0, WEAPON_KEY[w]).setOrigin(0, 0.5));
    }
    layer.add([...this.parts, this.body]);
    this.left = fish.vx < 0;
    this.dead = false;
  }

  /** proj(x, y, h) → [sx, sy]; lift = độ cao tâm cá; ap = hệ số xuất hiện (màn ra mắt). */
  update(t, proj, lift, cosT, ap = 1, flash = false, face = null) {
    const f = this.fish;
    if (!f.alive || ap <= 0) {
      if (!this.dead) {
        this.body.setVisible(false);
        for (const p of this.parts) p.setVisible(false);
      }
      return;
    }
    const R = f.radius;
    const [px, py] = proj(f.x, f.y, lift);
    // quay mặt theo hướng bơi (có độ trễ để không lật liên tục khi bơi gần thẳng đứng)
    const sp = Math.hypot(f.vx, f.vy) || 1;
    if (f.vx < -0.15 * sp) this.left = true;
    else if (f.vx > 0.15 * sp) this.left = false;
    const tex = this.body.texture.getSourceImage();
    const bw = R * (FISH_W[f.speciesId] || 3);
    const s = (bw / tex.width) * ap;
    const bob = 0.03 * Math.sin(t * 9 + f.id * 1.7);
    const tilt = Math.max(-0.4, Math.min(0.4, Math.atan2(f.vy * cosT, Math.abs(f.vx)))) * 0.6;
    // hướng mặt khác "theo đường bơi": xoay hẳn hình theo góc (lật dọc khi quay sang trái để không bị lộn ngược)
    const mode = face?.mode || 'auto';
    let rot = this.left ? -tilt : tilt;
    let flipX = this.left;
    let flipY = false;
    if (mode !== 'auto' && mode !== 'move') {
      this.fst = this.fst || {};
      if (this.fmode !== mode) {
        this.fmode = mode;
        this.fst = {};
      }
      const a = facingAngle(mode, f, { sim: face.sim, dt: face.dt, st: this.fst, heading: this.lastA, style: 'concept' }).angle;
      this.lastA = a;
      const sa = Math.atan2(Math.sin(a) * cosT, Math.cos(a));
      rot = sa;
      flipX = false;
      flipY = Math.cos(sa) < 0;
    }
    this.body
      .setVisible(true)
      .setPosition(px, py)
      .setFlipX(flipX)
      .setFlipY(flipY)
      .setRotation(rot)
      .setScale(s * (1 + bob), s * (1 - bob) * (f.skillActiveUntil > t && f.weapon === 'spikes' ? 1.12 : 1));
    if (flash) this.body.setTintFill(0xffffff);
    else if (f.ultUntil > t) this.body.setTint(0xffffff, 0xfff59d, 0xffffff, 0xfff59d);
    else if (this.body.isTinted || this.body.tintFill) this.body.clearTint();

    // vũ khí: chiếu điểm đầu/cuối của collider lên mặt phẳng màn hình
    const L = effectiveRange(f);
    const k = f.k || 1;
    const a = f.weaponAngle;
    const hw = lift * 0.95;
    const show = ap > 0.6;
    const th = THICK[f.weapon] || 1;
    const place = (img, ang, d0, d1) => {
      const [x0, y0] = proj(f.x + Math.cos(ang) * d0, f.y + Math.sin(ang) * d0, hw);
      const [x1, y1] = proj(f.x + Math.cos(ang) * d1, f.y + Math.sin(ang) * d1, hw);
      const tw = img.texture.getSourceImage().width;
      const len3 = d1 - d0;
      img
        .setVisible(show)
        .setPosition(x0, y0)
        .setRotation(Math.atan2(y1 - y0, x1 - x0))
        .setScale(Math.hypot(x1 - x0, y1 - y0) / tw, (len3 / tw) * th);
    };
    const start = R * 1.0;
    switch (f.weapon) {
      case 'spikes': {
        const tip = R + L * 0.55 + 4 * k + L * 0.15;
        this.parts.forEach((img, i) => place(img, a + (i * Math.PI * 2) / this.parts.length, R * 0.85, tip));
        break;
      }
      case 'blades':
        place(this.parts[0], a, start, R + L);
        place(this.parts[1], a + Math.PI, start, R + L);
        break;
      case 'jaws': {
        const d = R + L * 0.45;
        const [jx, jy] = proj(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, hw);
        const img = this.parts[0];
        const tw = img.texture.getSourceImage().width;
        const chomp = 1 - 0.18 * Math.abs(Math.sin(t * 5 + f.id));
        img.setVisible(show).setPosition(jx, jy).setRotation(Math.atan2(Math.sin(a) * cosT, Math.cos(a))).setScale(((L * 1.6) / tw), ((L * 1.6) / tw) * chomp);
        break;
      }
      case 'mace':
        place(this.parts[0], a, start, R + L + 2 * k);
        break;
      case 'hook':
        place(this.parts[0], a + HOOK_CURL * 0.5, start, R + L + 7 * k);
        break;
      case 'electric':
        place(this.parts[0], a, R * 0.8, R + L + R * 0.3);
        break;
      default:
        place(this.parts[0], a, start, R + L + 4 * k);
    }
    const glow = f.skillActiveUntil > t || f.ultUntil > t;
    for (const p of this.parts) {
      if (glow) p.setTint(0xfff59d);
      else if (p.isTinted) p.clearTint();
    }
  }

  /** Bị hạ: xoay tròn, phóng to rồi mờ dần. */
  kill() {
    if (this.dead) return;
    this.dead = true;
    for (const p of this.parts) p.setVisible(false);
    const b = this.body;
    this.scene.tweens.add({ targets: b, alpha: 0, scaleX: b.scaleX * 1.6, scaleY: b.scaleY * 1.6, angle: b.angle + 200, y: b.y - 40, duration: 500, onComplete: () => b.setVisible(false) });
  }

  destroy() {
    this.body.destroy();
    for (const p of this.parts) p.destroy();
  }
}
