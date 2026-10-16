import Phaser from 'phaser';
import { SPECIES } from '../config.js';
import { createFishCanvas } from '../render/FishArt.js';
import { createWeaponTextures } from '../render/WeaponArt.js';
import { createFxTextures } from '../render/Effects.js';
import { preloadArt } from '../render/ArtCharacters.js';

/** Sinh toàn bộ texture bằng code (cá, vũ khí, hiệu ứng) — không cần ảnh bên ngoài. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // hình nhân vật cắt từ ảnh concept (public/art) — thiếu tệp thì game dùng nhân vật 3D
    this.load.on('loaderror', () => {});
    preloadArt(this);
  }

  create() {
    for (const sp of SPECIES) this.textures.addCanvas(`fish_${sp.id}`, createFishCanvas(sp));
    createWeaponTextures(this);
    createFxTextures(this);
    // bong bóng trang trí
    const g = this.add.graphics();
    g.lineStyle(3, 0xffffff, 0.8);
    g.strokeCircle(16, 16, 13);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(11, 11, 4);
    g.generateTexture('bubble', 32, 32);
    g.destroy();
    // hạt môi trường (tuyết, tàn lửa, sinh vật phát quang)
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const x = c.getContext('2d');
    const rg = x.createRadialGradient(12, 12, 0, 12, 12, 12);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, 24, 24);
    this.textures.addCanvas('amb_dot', c);
    this.scene.start('Menu');
  }
}
