import Phaser from 'phaser';
import { SPECIES } from './config.js';
import { GameController } from './GameController.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { Controls } from './ui/Controls.js';
import { Statistics } from './ui/Statistics.js';
import { ResultsPanel } from './ui/ResultsPanel.js';
import { RecordPanel } from './ui/RecordPanel.js';
import { audio } from './systems/AudioSystem.js';
import { loadCustomModels } from './render/Fish3D.js';

const $ = (id) => document.getElementById(id);

const controller = new GameController();
audio.setSfx(controller.settings.sfx);
audio.setCrowd(controller.settings.crowd !== false);
audio.musicOn = controller.settings.music;

const controls = new Controls(controller, {
  panel: $('panel'),
  quickbar: $('quickbar'),
  pill: $('state-pill'),
  toggle: $('panel-toggle'),
  layout: document.querySelector('.layout'),
});
new Statistics(controller, $('live-stats'));
const icons = {};
new ResultsPanel(controller, $('results-modal'), icons);
new RecordPanel(controller, $('record-panel'), { badge: $('rec-badge'), badgeTime: $('rec-time'), wrap: $('game-wrap') });

// thông báo
let toastTimer = null;
controller.on('toast', ({ msg, kind }) => {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${kind === 'error' ? 'error' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
});

// mở khóa âm thanh ở thao tác đầu tiên
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// phím tắt: Space = tạm dừng/tiếp tục, R = chạy lại
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (controller.state === 'running') controller.pause();
    else if (controller.state === 'paused') controller.resume();
    else controller.start();
  } else if (e.key === 'r' || e.key === 'R') controller.runAgain();
});

async function boot() {
  // mô hình 3D tự thêm trong public/models (nếu có)
  // (file lớn có thể tải lâu → không chặn game; tải xong thì dựng lại trận đang chờ để hiện mô hình mới)
  let loading = 0;
  const modelsReady = loadCustomModels(
    SPECIES.map((s) => s.id),
    ({ id, file, phase }) => {
      if (phase === 'start' && loading++ === 0) controller.toast('⏳ Đang tải mô hình 3D tự thêm…');
      if (phase === 'error') controller.toast(`Không tải được models/${id}/${file}`, 'error');
    },
  ).then((ids) => {
    if (!ids.length) return;
    const names = ids.map((id) => SPECIES.find((s) => s.id === id)?.name || id).join(', ');
    const style = controller.settings.charStyle;
    controller.toast(
      style === 'model3d'
        ? `✅ Đã tải mô hình 3D: ${names}`
        : `✅ Đã tải mô hình 3D: ${names} — chọn "Kiểu nhân vật: Mô hình 3D tự thêm" để dùng`,
    );
    // trận chưa bắt đầu / đã xong → dựng lại để thấy mô hình mới ngay
    if (controller.sim && ['idle', 'ready', 'over', 'victory'].includes(controller.state)) controller.emit('match');
  });
  await Promise.race([modelsReady, new Promise((r) => setTimeout(r, 2500))]);
  try {
    await Promise.race([document.fonts.load('700 32px "Baloo 2"'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* font không tải được → dùng font hệ thống */
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1000,
    height: 1000,
    backgroundColor: '#0b3d91',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, preserveDrawingBuffer: true },
    fps: { target: 60 },
    scene: [BootScene, MenuScene, BattleScene],
    banner: false,
  });
  game.registry.set('controller', controller);
  game.events.once('ready', () => {
    // biểu tượng loài cá cho giao diện, lấy từ texture vector đã sinh
    const tryIcons = () => {
      if (!game.textures.exists(`fish_${SPECIES[0].id}`)) {
        setTimeout(tryIcons, 50);
        return;
      }
      for (const sp of SPECIES) icons[sp.id] = game.textures.getBase64(`fish_${sp.id}`);
      controls.setIcons(icons);
    };
    tryIcons();
  });
  window.__fwb = { controller, game }; // hỗ trợ gỡ lỗi / kiểm thử trong trình duyệt
}

boot();
