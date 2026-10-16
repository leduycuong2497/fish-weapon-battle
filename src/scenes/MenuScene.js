import Phaser from 'phaser';
import { SPECIES } from '../config.js';
import { ART_R } from '../render/FishArt.js';

/** Màn hình chờ: giới thiệu 8 loài cá. Chuyển sang BattleScene khi có trận đấu. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const controller = this.game.registry.get('controller');
    const { width: W, height: H } = this.scale;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d47a1, 0x0d47a1, 0x00838f, 0x00838f, 1);
    bg.fillRect(0, 0, W, H);

    this.add
      .text(W / 2, H * 0.16, 'FISH WEAPON BATTLE', {
        fontFamily: '"Baloo 2", "Arial Black", sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffeb3b',
        stroke: '#01579b',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.add
      .text(W / 2, H * 0.25, 'Đấu trường cá vũ khí tự động', {
        fontFamily: '"Baloo 2", Arial, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const cols = 4;
    SPECIES.forEach((sp, i) => {
      const cx = W * (0.14 + (i % cols) * 0.24);
      const cy = H * (0.45 + Math.floor(i / cols) * 0.27);
      const img = this.add.image(cx, cy, `fish_${sp.id}`).setScale(0.85);
      this.tweens.add({ targets: img, y: cy - 10, duration: 900 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: img, angle: { from: -6, to: 6 }, duration: 1300 + i * 70, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.add
        .text(cx, cy + ART_R * 0.85 + 30, sp.name, {
          fontFamily: '"Baloo 2", Arial, sans-serif',
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 5,
        })
        .setOrigin(0.5);
    });

    this.add
      .text(W / 2, H * 0.93, 'Nhấn  TẠO TRẬN  hoặc  BẮT ĐẦU  để vào trận', {
        fontFamily: '"Baloo 2", Arial, sans-serif',
        fontSize: '28px',
        color: '#b2ebf2',
      })
      .setOrigin(0.5);

    const go = () => this.scene.start('Battle');
    if (controller.sim) go();
    else controller.on('match', () => this.scene.isActive() && go());
  }
}
