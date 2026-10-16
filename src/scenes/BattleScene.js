import Phaser from 'phaser';
import { TEAM_COLORS, TEAM_NAMES, SPECIES } from '../config.js';
import { ART_R } from '../render/FishArt.js';
import { WeaponView, drawWeaponFx, drawColliders } from '../render/WeaponArt.js';
import { ArtFishView, artAvailable } from '../render/ArtCharacters.js';
import { resolveTheme, buildArenaCanvas } from '../render/ArenaThemes.js';
import { Fish3DRenderer, TILT, WALL_H, FISH_LIFT } from '../render/Fish3D.js';
import { createPortraits } from '../render/Portraits.js';
import { drawJumboFrame } from '../render/JumboContent.js';
import { Effects } from '../render/Effects.js';
import { audio } from '../systems/AudioSystem.js';
import { REEL_WIDTH, REEL_HEIGHT } from '../systems/RecordingSystem.js';

const FONT = '"Baloo 2", "Arial Black", sans-serif';
const RECORD_TOP = 200;
const RECORD_BOTTOM = 190;
const PAD = 36;
const TRAIL_LEN = 9;
const BEAM_LEAD = 0.35; // luồng sáng bắt đầu rơi trước khi cá xuất hiện (giây)
const BEAM_DUR = 0.75;
const CUT_TOTAL = 3.0; // thời lượng màn cut-in tuyệt chiêu (giây thực) — đủ lâu để người xem đọc kịp
const BURST_SLOW = 1.3; // chậm động tác khi hiệu ứng tuyệt chiêu bùng nổ (giây thực)

/** Đường cong "bật ra": phóng to quá đà rồi thu về kích thước thật. */
function popCurve(t) {
  if (t <= 0) return 0;
  if (t < 0.12) return (1.25 * t) / 0.12;
  if (t < 0.26) return 1.25 - (0.25 * (t - 0.12)) / 0.14;
  return 1;
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * Chỉ HIỂN THỊ trạng thái mô phỏng (logic nằm trong src/sim + src/systems).
 *
 * Chế độ 3D: camera nghiêng TILT. Mọi thứ 2D được chiếu cùng một phép chiếu với lớp Three.js:
 *  - lớp "ground" (sàn, bóng đổ, vòng đội, vùng nguy hiểm): co theo trục dọc bởi cos(TILT);
 *  - lớp "overlay" (hiệu ứng, thanh máu, vệt lướt): điểm (x, y, độ cao h) → (x, y·cos − h·sin).
 * Chế độ 2D: TILT = 0 nên mọi phép chiếu là đồng nhất (giữ nguyên giao diện cũ).
 */
/** Thu ảnh vừa khung w×h, giữ nguyên tỉ lệ. */
function fitImg(img, w, h) {
  const src = img.frame;
  const k = Math.min(w / src.width, h / src.height);
  return img.setScale(k);
}

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create() {
    this.controller = this.game.registry.get('controller');
    this.controller.scene = this;
    this.mode = this.controller.layout || 'normal';
    this.use3d = this.controller.settings.render3d !== false;
    this.charStyle = this.controller.settings.charStyle || 'cartoon';
    this.useArt = this.charStyle === 'concept' && artAvailable(this);
    this.setTilt();

    this.bg = this.add.graphics();
    this.bubbles = [];
    this.ground = this.add.container(0, 0);
    this.floorImg = this.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.arenaGfx = this.add.graphics();
    this.underGfx = this.add.graphics();
    this.ground.add([this.floorImg, this.arenaGfx, this.underGfx]);
    this.fish3dImg = this.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.world = this.add.container(0, 0); // nhân vật 2D (khi tắt 3D)
    this.fishLayer = this.add.container(0, 0);
    this.weaponLayer = this.add.container(0, 0);
    this.weaponGfx = this.add.graphics();
    this.world.add([this.fishLayer, this.weaponLayer, this.weaponGfx]);
    this.overlay = this.add.container(0, 0);
    this.trailGfx = this.add.graphics();
    this.overGfx = this.add.graphics();
    this.artLayer = this.add.container(0, 0); // nhân vật hình minh họa (sắp xếp theo chiều sâu)
    this.overlay.add([this.trailGfx, this.artLayer, this.overGfx]);
    this.artViews = [];
    this.effects = new Effects(this, this.overlay);
    this.effects.pos = (f) => this.project(f.x, f.y, this.lift(f));
    this.effects.angle = (a) => Math.atan2(Math.sin(a) * this.cosT, Math.cos(a));
    this.hudGfx = this.add.graphics();

    this.weaponViews = [];
    this.flashLeft = [];
    this.trails = [];
    this.frameDt = 0;
    this.themeKey = null;
    this.r3d = null;
    this.onSettings = (st) => {
      if (this.r3d) this.r3d.setFaceMode(st.faceMode || 'auto');
      if (this.r3d) this.r3d.setCrowd(st.crowd !== false);
      if (this.controller.sim && st.arenaTheme !== this.themeKey) this.buildFloor();
      const style = st.charStyle || 'cartoon';
      if ((st.render3d !== false) !== this.use3d || style !== this.charStyle) {
        this.use3d = st.render3d !== false;
        this.charStyle = style;
        this.useArt = style === 'concept' && artAvailable(this);
        this.setTilt();
        if (this.controller.sim) this.buildMatch();
      }
    };
    this.controller.on('settings', this.onSettings);

    const txt = (size, color = '#ffffff', stroke = 6) =>
      this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#00263e', strokeThickness: stroke });
    this.hudInfo = txt(28);
    this.hudTitle = txt(78, '#ffeb3b', 12).setOrigin(0.5);
    this.hudSub = txt(40, '#ffffff', 8).setOrigin(0.5);
    this.hudBottom = txt(44, '#ffffff', 8).setOrigin(0.5);
    this.hudBoard = txt(32, '#e0f7fa', 6).setOrigin(0.5, 0);
    this.hudSeed = txt(22, '#b3e5fc', 4).setOrigin(1, 1);
    this.bannerBg = this.add.graphics();
    this.banner = txt(72, '#ffeb3b', 12).setOrigin(0.5);
    this.bannerSub = txt(40, '#ffffff', 8).setOrigin(0.5);
    this.bannerIcon = this.add.image(0, 0, 'fish_tilapia').setVisible(false);
    this.introText = txt(120, '#ffeb3b', 16).setOrigin(0.5).setVisible(false);
    this.introText.setShadow(0, 6, '#b35c00', 0, true, true);
    this.beams = [];
    this.beamPool = [];
    this.createCutIn();
    this.createPresentation();

    this.sprites = [];
    this.onMatch = () => this.buildMatch();
    this.controller.on('match', this.onMatch);
    this.buildMatch();
    this.setLayout(this.mode, true);
  }

  /** Kiểu mô hình cho lớp 3D: 'real' | 'model3d' | 'cartoon' (concept dùng hoạt hình làm nền). */
  style3d() {
    return this.charStyle === 'real' || this.charStyle === 'model3d' ? this.charStyle : 'cartoon';
  }

  // ---------- phép chiếu ----------
  setTilt() {
    this.tilt = this.use3d ? TILT : 0;
    this.cosT = Math.cos(this.tilt);
    this.sinT = Math.sin(this.tilt);
  }

  /** Độ cao tâm cá so với sàn (chỉ có nghĩa ở chế độ 3D). */
  lift(f) {
    return this.use3d ? f.radius * FISH_LIFT : 0;
  }

  /** Điểm thế giới (x, y) ở độ cao h → tọa độ trong lớp overlay. */
  project(x, y, h = 0) {
    return [x, y * this.cosT - h * this.sinT];
  }

  // ---------- bố cục ----------
  setLayout(mode, force = false) {
    if (mode === this.mode && !force && this.layoutKey === this.computeLayoutKey(mode)) {
      this.applyView();
      return;
    }
    this.mode = mode;
    const [w, h] = this.targetSize(mode);
    if (this.scale.width !== w || this.scale.height !== h) this.scale.setGameSize(w, h);
    this.layoutKey = this.computeLayoutKey(mode);
    this.applyView();
  }

  computeLayoutKey(mode) {
    const shape = this.controller.sim ? this.controller.sim.arena.shape : 'circle';
    return `${mode}:${shape}:${this.use3d}`;
  }

  targetSize(mode) {
    if (mode === 'record') return [REEL_WIDTH, REEL_HEIGHT];
    const shape = this.controller.sim ? this.controller.sim.arena.shape : 'circle';
    if (shape === 'rect') return this.use3d ? [1400, 860] : [1400, 920];
    if (shape === 'oval') return this.use3d ? [860, 1080] : [800, 1100];
    return this.use3d ? [1000, 900] : [1000, 1000];
  }

  /** Phạm vi cần hiển thị (đơn vị thế giới trên mặt phẳng màn hình). */
  viewExtents() {
    const sim = this.controller.sim;
    const hw = (sim ? sim.arena.outerHalfWidth : 400) + PAD;
    const hh = (sim ? sim.arena.outerHalfHeight : 400) + PAD;
    // 3D: chừa chỗ cho khán đài + cờ phướn phía xa
    const top = this.use3d ? (hh + 40) * this.cosT + (WALL_H + 70) * this.sinT : hh;
    const bottom = hh * this.cosT;
    return { hw, top, bottom };
  }

  applyView() {
    const W = this.scale.width;
    const H = this.scale.height;
    const { hw, top, bottom } = this.viewExtents();
    let areaTop;
    let areaH;
    let availW;
    if (this.mode === 'record') {
      // khung dọc: sân lấp kín bề ngang (như video mẫu), cắt nhẹ hai bên khán đài
      areaTop = RECORD_TOP;
      areaH = H - RECORD_TOP - RECORD_BOTTOM;
      availW = W * 1.2;
    } else {
      areaTop = 48;
      areaH = H - 60;
      availW = W - 20;
    }
    const scale = Math.min(availW / (hw * 2), areaH / (top + bottom));
    const cx = W / 2;
    const cy = areaTop + (areaH - (top + bottom) * scale) / 2 + top * scale;
    this.viewScale = scale;
    this.viewCenter = [cx, cy];
    this.ground.setPosition(cx, cy).setScale(scale, scale * this.cosT);
    this.world.setPosition(cx, cy).setScale(scale);
    this.overlay.setPosition(cx, cy).setScale(scale);
    this.sync3dView();
    this.layoutHUD();
    this.drawBackground();
  }

  layoutHUD() {
    const W = this.scale.width;
    const H = this.scale.height;
    const rec = this.mode === 'record';
    this.hudInfo.setVisible(!rec).setPosition(16, 10).setFontSize(28);
    this.hudTitle.setVisible(rec).setPosition(W / 2, 80);
    this.hudSub.setVisible(rec).setPosition(W / 2, 150);
    this.hudBottom.setVisible(rec).setPosition(W / 2, H - 100);
    this.hudBoard.setVisible(rec).setPosition(W / 2, H - 62);
    this.hudSeed.setVisible(true).setPosition(W - 14, H - 10);
    this.banner.setPosition(W / 2, rec ? H * 0.36 : H * 0.2).setFontSize(rec ? 84 : 64);
    this.bannerSub.setPosition(W / 2, rec ? H * 0.36 + 95 : H * 0.2 + 80);
  }

  drawBackground() {
    const W = this.scale.width;
    const H = this.scale.height;
    const g = this.bg;
    const theme = this.theme || resolveTheme('classic');
    g.clear();
    g.fillGradientStyle(theme.bg[0], theme.bg[0], theme.bg[1], theme.bg[1], 1);
    g.fillRect(0, 0, W, H);
    if (theme.rays) {
      g.fillStyle(0xffffff, 0.05);
      for (let i = 0; i < 6; i++) {
        const x = (i / 6) * W + 40;
        g.fillTriangle(x, 0, x + 120, 0, x - 160, H);
      }
    }
    if (!this.bubbles.length) {
      for (let i = 0; i < 26; i++) {
        const b = this.add.image(0, 0, 'bubble').setAlpha(0.35);
        b.setDepth(-1);
        this.bubbles.push({ img: b, speed: 20 + Math.random() * 50, x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 0.9, ph: Math.random() * 6 });
      }
      this.bg.setDepth(-2);
    }
    const amb = theme.ambient;
    for (const b of this.bubbles) {
      b.img.setTexture(amb.key).setTint(amb.tint).setAlpha(amb.alpha * (0.5 + Math.random() * 0.5));
      b.img.setBlendMode(amb.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    }
  }

  // ---------- trận đấu ----------
  buildMatch() {
    const sim = this.controller.sim;
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    for (const v of this.weaponViews) v.destroy();
    this.weaponViews = [];
    for (const v of this.artViews) v.destroy();
    for (const c of this.artLayer.list.slice()) c.destroy();
    this.artViews = [];
    this.flashLeft = [];
    this.trails = [];
    this.effects.clear();
    this.resetIntro();
    if (this.presObjs) this.hidePresentation();
    if (this.cutObjs) {
      this.cutQueue = [];
      this.cut = null;
      for (const o of this.cutObjs) o.setVisible(false);
      this.cutBand.clear();
      this.spotRing.clear();
    }
    this.bannerShown = false;
    this.banner.setVisible(false);
    this.bannerSub.setVisible(false);
    this.bannerBg.clear();
    this.bannerIcon.setVisible(false);
    if (!sim) return;
    this.effects.configure(sim.settings.effects, sim.fish.length);
    for (const f of sim.fish) {
      const img = this.add.image(f.x, f.y, `fish_${f.speciesId}`);
      img.setScale(f.radius / ART_R);
      this.fishLayer.add(img);
      this.sprites.push(img);
      this.weaponViews.push(new WeaponView(this, this.weaponLayer, f));
      this.trails.push([]);
      if (this.useArt) {
        const box = this.add.container(0, 0);
        this.artLayer.add(box);
        this.artViews.push(new ArtFishView(this, box, f));
      }
    }
    this.world.setVisible(!this.use3d && !this.useArt);
    this.artLayer.setVisible(this.useArt);
    if (this.use3d) {
      if (!this.r3d) this.r3d = new Fish3DRenderer();
      this.r3d.build(sim, this.style3d());
      this.r3d.setFaceMode(this.controller.settings.faceMode || 'auto');
      this.r3d.charsVisible = !this.useArt;
    } else if (this.r3d) {
      this.r3d.clear();
    }
    this.fish3dImg.setVisible(this.use3d);
    this.view3dKey = null;
    this.buildFloor();
    this.setLayout(this.mode, true);
  }

  /** Cập nhật khung nhìn & độ phân giải lớp 3D theo bố cục hiện tại. */
  sync3dView() {
    const sim = this.controller.sim;
    if (!this.use3d || !this.r3d || !sim) return;
    const { hw, top, bottom } = this.viewExtents();
    const s = this.viewScale;
    const crowd = sim.fish.length > 40;
    const k = Math.min(1, 1700 / Math.max(hw * 2 * s, (top + bottom) * s)) * (crowd ? 0.62 : 1);
    const pxW = Math.round(hw * 2 * s * k);
    const pxH = Math.round((top + bottom) * s * k);
    const key = `${hw}:${top}:${bottom}@${pxW}x${pxH}`;
    const [cx, cy] = this.viewCenter;
    this.fish3dImg.setOrigin(0.5, top / (top + bottom)).setPosition(cx, cy);
    if (key === this.view3dKey) {
      this.fish3dImg.setDisplaySize(hw * 2 * s, (top + bottom) * s);
      return;
    }
    this.view3dKey = key;
    this.r3d.setView(-hw, hw, top, -bottom, pxW, pxH);
    this.fish3dImg.setTexture('__DEFAULT');
    if (this.textures.exists('fish3d')) this.textures.remove('fish3d');
    this.fish3dTex = this.textures.addImage('fish3d', this.r3d.canvas);
    this.fish3dImg.setTexture('fish3d').setDisplaySize(hw * 2 * s, (top + bottom) * s);
  }

  /** Vẽ sàn đấu theo chủ đề (một lần mỗi trận hoặc khi đổi chủ đề). */
  buildFloor() {
    const sim = this.controller.sim;
    if (!sim) return;
    this.themeKey = this.controller.settings.arenaTheme;
    this.theme = resolveTheme(this.themeKey);
    const { canvas, res } = buildArenaCanvas(this.theme, sim.arena);
    this.floorImg.setTexture('__DEFAULT');
    if (this.textures.exists('arena_floor')) this.textures.remove('arena_floor');
    this.textures.addCanvas('arena_floor', canvas);
    this.floorImg.setTexture('arena_floor').setVisible(true).setPosition(0, 0).setScale(1 / res);
    if (this.use3d && this.r3d) {
      this.r3d.crowdOn = this.controller.settings.crowd !== false;
      this.r3d.setArena(sim.arena, this.theme);
      this.r3d.setFloorCanvas(canvas, res); // sàn 3D cho camera điện ảnh
    }
    this.drawBackground();
  }

  // ---------- màn ra mắt ----------
  resetIntro() {
    this.introBeam = new Set();
    this.introLand = new Set();
    this.fightShown = false;
    this.appearOf = null;
    for (const b of this.beams) {
      b.img.setVisible(false);
      this.beamPool.push(b.img);
    }
    this.beams = [];
    if (this.introText) this.introText.setVisible(false);
    this.endJumbo();
  }

  /** Điều khiển luồng sáng + từng con xuất hiện + chữ "CHIẾN!" theo thời gian của màn ra mắt. */
  updateIntro(sim, dt) {
    const c = this.controller;
    const el = c.state === 'intro' ? c.introElapsed() : null;
    this.updateBeams(dt);
    if (el === null) {
      this.endJumbo();
      if (this.appearOf) {
        this.appearOf = null;
        if (this.r3d) for (const f of sim.fish) this.r3d.setAppear(f.id, 1);
      }
      return;
    }
    const { stagger, appearEnd, present } = c.intro;
    this.updatePresentation(el, c.intro, sim);
    this.appearOf = this.appearOf || [];
    for (const f of sim.fish) {
      const i = f.id;
      const ta = present + BEAM_LEAD + i * stagger;
      const [px, py] = this.project(f.x, f.y, this.lift(f));
      if (el >= ta - BEAM_LEAD && !this.introBeam.has(i)) {
        this.introBeam.add(i);
        this.spawnBeam(px, py, f);
      }
      if (el >= ta && !this.introLand.has(i)) {
        this.introLand.add(i);
        const [gx, gy] = this.project(f.x, f.y, 0);
        this.effects.appear(gx, gy, f.species.color, f.radius);
        audio.play('appear');
        this.shake(90, 0.004);
      }
      const s = el < ta ? 0 : popCurve(el - ta);
      this.appearOf[i] = s;
      if (this.r3d) this.r3d.setAppear(i, s);
    }
    if (el >= appearEnd && !this.fightShown) {
      this.fightShown = true;
      const W = this.scale.width;
      const H = this.scale.height;
      this.introText.setText('⚔ CHIẾN! ⚔').setPosition(W / 2, H * 0.45).setVisible(true).setAlpha(1).setScale(2.6);
      this.tweens.add({ targets: this.introText, scale: 1, duration: 260, ease: 'Back.out' });
      this.tweens.add({ targets: this.introText, alpha: 0, scale: 1.25, delay: 650, duration: 300, onComplete: () => this.introText.setVisible(false) });
      audio.play('fight');
      this.shake(200, 0.008);
    }
    this.children.bringToTop(this.introText);
  }

  spawnBeam(x, y, f, widthMul = 1) {
    let img = this.beamPool.pop();
    if (!img) {
      img = this.add.image(0, 0, 'fx_beam').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);
      this.overlay.add(img);
    }
    const tint = Phaser.Display.Color.IntegerToColor(f.species.color).lighten(45).color;
    img.setVisible(true).setTint(tint);
    this.overlay.bringToTop(img);
    this.beams.push({ img, x, y, t: 0, w: f.radius * 2.4 * widthMul });
  }

  updateBeams(dt) {
    if (!this.beams.length) return;
    const topY = -this.viewCenter[1] / this.viewScale - 40;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      if (b.t >= BEAM_DUR) {
        b.img.setVisible(false);
        this.beamPool.push(b.img);
        this.beams.splice(i, 1);
        continue;
      }
      // rơi từ đỉnh màn hình xuống đúng vị trí cá, rồi bùng rộng và tắt dần
      const drop = Math.min(1, b.t / BEAM_LEAD);
      const bottom = topY + (b.y - topY) * drop * drop;
      const after = Math.max(0, b.t - BEAM_LEAD) / (BEAM_DUR - BEAM_LEAD);
      b.img.setPosition(b.x, bottom);
      b.img.setDisplaySize(b.w * (1 + after * 0.8), Math.max(1, bottom - topY));
      b.img.setAlpha(after > 0 ? 1 - after : 0.6 + 0.4 * drop);
    }
  }

  /** Tuyệt chiêu: luồng sáng giáng xuống + sóng xung kích + tên chiêu + chậm động tác. */
  onUltimate(e, sim) {
    const f = sim.fish[e.id];
    if (!f) return;
    // màn cut-in trước (trận gần như đứng yên), hiệu ứng bùng nổ phát ngay sau đó
    if (this.cutQueue.length < 3) this.cutQueue.push({ id: f.id, name: e.name, radius: e.radius });
    else this.fireUltBurst(f, e.name, e.radius); // quá nhiều chiêu cùng lúc: bỏ qua cut-in
    this.controller.slowMotion(CUT_TOTAL * 1000 * Math.max(1, this.cutQueue.length + (this.cut ? 1 : 0)), 0.04);
  }

  /** Bùng nổ tuyệt chiêu: luồng sáng + sóng xung kích + tên chiêu, chạy chậm động tác. */
  fireUltBurst(f, name, radius) {
    if (!f.alive && f.deathTime >= 0 && this.controller.sim.time - f.deathTime > 0.5) return;
    const [px, py] = this.project(f.x, f.y, this.lift(f));
    const [gx, gy] = this.project(f.x, f.y, 0);
    if (this.effects.lvl >= 2) this.spawnBeam(px, py, f, 2.8);
    this.effects.ultimate(gx, gy, f.species.color, radius, f.radius);
    this.showUltName(px, py - f.radius * 2.4, name, f.species.color);
    audio.play('ultimate');
    this.shake(420, 0.014);
    // nếu còn tuyệt chiêu xếp hàng thì cut-in kế tiếp sẽ tự đặt lại độ chậm
    this.controller.slowMotion(BURST_SLOW * 1000, 0.3, true);
  }

  // ---------- màn giới thiệu chiến binh (kiểu phim hoạt hình) ----------
  createPresentation() {
    this.presBg = this.add.graphics();
    this.presPortrait = this.add.image(0, 0, 'fish_tilapia').setVisible(false);
    this.presBars = this.add.graphics();
    const T = (size, color, stroke = 8) =>
      this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#140a24', strokeThickness: stroke }).setVisible(false);
    this.presTitle = T(34, '#ffd54f', 7);
    this.presName = T(96, '#ffffff', 14);
    this.presLines = T(30, '#ffffff', 6);
    this.presIndex = T(26, '#ffffff', 5);
    this.vsImgs = [];
    this.vsTexts = [];
    for (let i = 0; i < 8; i++) {
      this.vsImgs.push(this.add.image(0, 0, 'fish_tilapia').setVisible(false));
      this.vsTexts.push(T(28, '#ffffff', 6).setOrigin(0.5, 0));
    }
    this.vsBig = T(120, '#ffeb3b', 16).setOrigin(0.5);
    this.presObjs = [this.presBg, this.presPortrait, this.presBars, this.presTitle, this.presName, this.presLines, this.presIndex, ...this.vsImgs, ...this.vsTexts, this.vsBig];
    this.presCard = -1;
    // mốc để chuẩn hóa thanh chỉ số
    this.presMax = {
      hp: Math.max(...SPECIES.map((sp) => sp.hp)),
      damage: Math.max(...SPECIES.map((sp) => sp.damage)),
      speed: Math.max(...SPECIES.map((sp) => sp.speed)),
    };
  }

  hidePresentation() {
    this.vsFlashed = false;
    for (const o of this.presObjs) o.setVisible(false);
    this.presBg.clear();
    this.presBars.clear();
    this.presCard = -1;
  }

  /** Kết thúc màn giới thiệu điện ảnh: camera về góc nhìn trận, hiện lại sàn 2D. */
  endJumbo() {
    if (!this.jumboOn) return;
    this.jumboOn = false;
    if (this.r3d) this.r3d.setCinema(0, false);
    this.ground.setVisible(true);
  }

  /**
   * Kiểu giới thiệu "điện ảnh": camera bay dần tới màn hình lớn trên khán đài, từng chiến binh được
   * chiếu lên màn hình (fan loài đó nhảy cẫng), rồi camera bay về sân → luồng sáng ra mắt như thường.
   */
  updateJumboIntro(el, intro, sim) {
    if (el >= intro.present) {
      this.endJumbo();
      return;
    }
    const r = this.r3d;
    if (!this.jumboOn) {
      this.jumboOn = true;
      this.jumboCard = -1;
      this.ground.setVisible(false); // sàn 2D không đi theo camera → dùng sàn 3D
      // dọn lớp 2D còn sót của trận trước (cut-in tuyệt chiêu, tên chiêu) để không đè lên màn hình lớn
      this.cut = null;
      this.cutQueue.length = 0;
      for (const o of this.cutObjs) o.setVisible(false);
      this.cutBand.clear();
      this.spotRing.clear();
      for (const t of this.ultTexts || []) {
        this.tweens.killTweensOf(t);
        t.setVisible(false);
      }
      this.jumboList = intro.species.map((id) => {
        const sp = SPECIES.find((x) => x.id === id);
        return { sp, img: this.textures.get(this.portraitKey({ speciesId: id })).getSourceImage() };
      });
      audio.play('appear');
    }
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const n = intro.species.length;
    const cardsEnd = intro.title + intro.card * n;
    let state;
    let k;
    if (el < intro.title) {
      k = ease(el / intro.title);
      state = { phase: 'title', t: el };
    } else if (el < cardsEnd) {
      k = 1;
      const idx = Math.min(n - 1, Math.floor((el - intro.title) / intro.card));
      const e = this.jumboList[idx];
      state = { phase: 'card', t: el - intro.title - idx * intro.card, sp: e.sp, img: e.img, idx, n };
      if (idx !== this.jumboCard) {
        this.jumboCard = idx;
        audio.play('appear');
        audio.play('crowdCheer');
        if (r.crowd) r.crowd.moodOf(e.sp.id).excite = 1; // fan loài đó nhảy cẫng
      }
    } else {
      k = 1 - ease((el - cardsEnd) / intro.flyOut);
      state = { phase: 'ready', t: el - cardsEnd };
    }
    state.list = this.jumboList;
    state.clock = el;
    r.setCinema(k, true);
    r.drawJumbo((ctx, W, H) => drawJumboFrame(ctx, W, H, state));
  }

  updatePresentation(el, intro, sim) {
    if (intro.style === 'jumbotron' && this.use3d && this.r3d) {
      this.updateJumboIntro(el, intro, sim);
      return;
    }
    if (!intro.present || el >= intro.present) {
      if (this.presCard !== -1) this.hidePresentation();
      return;
    }
    const W = this.scale.width;
    const H = this.scale.height;
    if (el < intro.title) {
      this.drawVersus(el, intro, sim, W, H);
      return;
    }
    if (this.presCard === -2) for (const o of [...this.vsImgs, ...this.vsTexts, this.vsBig]) o.setVisible(false);
    const ec = el - intro.title;
    const idx = Math.min(intro.species.length - 1, Math.floor(ec / intro.card));
    const u = ec - idx * intro.card; // thời gian trong thẻ hiện tại
    const sp = SPECIES.find((x) => x.id === intro.species[idx]);
    if (idx !== this.presCard) {
      this.presCard = idx;
      this.presPortrait.setTexture(this.portraitKey({ speciesId: sp.id }));
      audio.play('appear');
    }
    const portrait = H > W * 1.2; // khung dọc (video Reels)
    const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const back = (t) => {
      t = Math.min(1, Math.max(0, t));
      const k = 1.9;
      const v = t - 1;
      return 1 + (k + 1) * v * v * v + k * v * v;
    };
    const outT = Math.max(0, (u - (intro.card - 0.16)) / 0.16);
    const slide = (1 - ease(u / 0.22)) * W - ease(outT) * W;

    // nền: màu loài + tia sáng xoay + khung truyện tranh
    const g = this.presBg;
    g.clear().setVisible(true);
    g.fillStyle(0x0a0618, 0.92);
    g.fillRect(0, 0, W, H);
    const cx = portrait ? W / 2 : W * 0.3;
    const cy = portrait ? H * 0.36 : H * 0.48;
    const R = Math.max(W, H) * 1.2;
    const rot = ec * 0.6;
    for (let i = 0; i < 16; i++) {
      const a0 = rot + (i / 16) * Math.PI * 2;
      const a1 = a0 + Math.PI / 16;
      g.fillStyle(i % 2 ? sp.color : sp.accent, 0.55);
      g.fillTriangle(cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    }
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(cx, cy, Math.min(W, H) * 0.32);
    // dải tiêu đề chéo
    const bandY = portrait ? H * 0.63 : H * 0.18;
    g.fillStyle(0xffd54f, 1);
    g.fillRect(slide * 0.5 - 20, bandY - 4, W + 40, 6);

    // chân dung nảy vào
    const ps = (portrait ? W * 0.95 : H * 0.85) * back(u / 0.3) * (1 + 0.03 * Math.sin(u * 10));
    fitImg(this.presPortrait.setVisible(true).setPosition(cx + slide, cy), ps, ps);

    // chữ
    const tx = portrait ? W * 0.08 : W * 0.56;
    let ty = portrait ? H * 0.66 : H * 0.2;
    const tSlide = (1 - ease((u - 0.06) / 0.25)) * W * 0.7 - ease(outT) * W;
    const big = portrait ? Math.round(W * 0.11) : Math.round(H * 0.085);
    const small = portrait ? Math.round(W * 0.034) : Math.round(H * 0.03);
    this.presTitle.setVisible(true).setScale(1).setAlpha(1).setColor('#ffd54f').setStroke('#140a24', 7).setFontSize(small * 1.1).setOrigin(0, 0).setPosition(tx + tSlide, ty)
      .setText(`CHIẾN BINH ${idx + 1}/${intro.species.length} XUẤT TRẬN`);
    ty += small * 1.6;
    const light = Phaser.Display.Color.IntegerToColor(sp.color).lighten(40).color;
    this.presName.setVisible(true).setFontSize(big).setOrigin(0, 0).setPosition(tx + tSlide, ty).setText(sp.name.toUpperCase()).setColor('#' + light.toString(16).padStart(6, '0'));
    ty += big * 1.15;
    const count = sim.fish.filter((f) => f.speciesId === sp.id).length;
    this.presLines
      .setVisible(true)
      .setFontSize(small)
      .setOrigin(0, 0)
      .setPosition(tx + tSlide, ty)
      .setLineSpacing(small * 0.35)
      .setWordWrapWidth(portrait ? W * 0.84 : W * 0.4)
      .setText(
        `💬 Tính cách: ${sp.trait}\n` +
          `🗡 Vũ khí: ${sp.weaponName}\n` +
          `✨ Kỹ năng: ${sp.skill.name}\n` +
          `⚡ Tuyệt chiêu: ${sp.ult ? sp.ult.name : '—'}` +
          (count > 1 ? `\n👥 Số lượng: ×${count}` : ''),
      );
    ty += this.presLines.height + small * 0.8;

    // thanh chỉ số chạy dần
    const bars = this.presBars;
    bars.clear().setVisible(true);
    const bw = portrait ? W * 0.62 : W * 0.3;
    const bh = Math.max(10, small * 0.55);
    const fill = ease((u - 0.2) / 0.45);
    const stats = [
      ['MÁU', sp.hp / this.presMax.hp, 0xff5c6c],
      ['SÁT THƯƠNG', sp.damage / this.presMax.damage, 0xffb340],
      ['TỐC ĐỘ', sp.speed / this.presMax.speed, 0x5ce1ff],
    ];
    stats.forEach(([label, v, col], i) => {
      const y = ty + i * (bh + small * 0.9);
      const x0 = tx + tSlide + (portrait ? W * 0.22 : W * 0.12);
      bars.fillStyle(0x000000, 0.55);
      bars.fillRoundedRect(x0, y, bw, bh, bh / 2);
      bars.fillStyle(col, 1);
      bars.fillRoundedRect(x0, y, Math.max(bh, bw * v * fill), bh, bh / 2);
      bars.fillStyle(0xffffff, 0.35);
      bars.fillRoundedRect(x0 + 2, y + 2, Math.max(bh - 4, (bw * v * fill) - 4), bh * 0.35, bh * 0.2);
    });
    // nhãn chỉ số (dùng chung dòng chữ phụ để khỏi tạo thêm đối tượng)
    this.presIndex.setVisible(true).setAlpha(1).setFontSize(Math.round(small * 0.8)).setOrigin(0, 0).setPosition(tx + tSlide, ty - small * 0.2)
      .setLineSpacing(bh + small * 0.9 - small * 0.8 * 1.2)
      .setText(stats.map((s2) => s2[0]).join('\n'));
    for (const o of this.presObjs) this.children.bringToTop(o);
  }

  /** Màn mở đầu: "CUỘC ĐỐI ĐẦU NẢY LỬA" — nền lửa + liệt kê toàn bộ chiến binh. */
  drawVersus(el, intro, sim, W, H) {
    if (this.presCard !== -2) {
      this.presCard = -2;
      audio.play('fight');
      for (const o of [this.presPortrait, this.presBars, this.presName, this.presLines, this.presIndex]) o.setVisible(false);
      this.presBars.clear();
    }
    const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const back = (t) => {
      t = Math.min(1, Math.max(0, t));
      const k = 2.2;
      const v = t - 1;
      return 1 + (k + 1) * v * v * v + k * v * v;
    };
    const fadeOut = 1 - ease((el - (intro.title - 0.25)) / 0.25);
    const portrait = H > W * 1.2;
    // nền lửa: tia đỏ cam xoay + quầng sáng + tàn lửa bay lên
    const g = this.presBg;
    g.clear().setVisible(true);
    g.fillStyle(0x12040a, 0.96);
    g.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.5;
    const R = Math.max(W, H) * 1.3;
    for (let i = 0; i < 20; i++) {
      const a0 = el * 0.35 + (i / 20) * Math.PI * 2;
      const a1 = a0 + Math.PI / 20;
      g.fillStyle(i % 2 ? 0xff3d00 : 0xffab00, 0.28);
      g.fillTriangle(cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0xff6d00, 0.07);
      g.fillCircle(cx, H * 1.05, W * (0.3 + i * 0.12) * (1 + 0.04 * Math.sin(el * 6 + i)));
    }
    for (let i = 0; i < 70; i++) {
      const x = ((i * 137.7) % W) + Math.sin(el * 2 + i) * 14;
      const y = H - (((el * (90 + (i % 7) * 40) + i * 53) % (H + 40)));
      g.fillStyle(i % 3 ? 0xffab40 : 0xffeb3b, 0.55 + 0.4 * Math.sin(el * 9 + i));
      g.fillCircle(x, y, 2 + (i % 4));
    }
    // tiêu đề rực lửa
    const titleSize = Math.round(Math.min(W * 0.09, H * 0.065));
    this.presTitle
      .setVisible(true)
      .setOrigin(0.5, 0.5)
      .setFontSize(titleSize)
      .setColor('#ffd54f')
      .setStroke('#7a1600', Math.round(titleSize * 0.18))
      .setPosition(W / 2, H * (portrait ? 0.12 : 0.1))
      .setText('🔥 CUỘC ĐỐI ĐẦU NẢY LỬA 🔥')
      .setScale(back(el / 0.35))
      .setAlpha(fadeOut);
    const nFish = sim.fish.length;
    this.presIndex
      .setVisible(true)
      .setOrigin(0.5, 0.5)
      .setFontSize(Math.round(titleSize * 0.45))
      .setLineSpacing(0)
      .setPosition(W / 2, H * (portrait ? 0.12 : 0.1) + titleSize * 0.95)
      .setText(`${nFish} chiến binh · ${intro.species.length} loài · ai sẽ trụ lại cuối cùng?`)
      .setAlpha(ease((el - 0.25) / 0.3) * fadeOut);
    // lưới chiến binh
    const list = intro.species;
    const n = list.length;
    const cols = portrait ? (n <= 1 ? 1 : 2) : Math.min(4, n);
    const rows = Math.ceil(n / cols);
    const top = H * (portrait ? 0.22 : 0.22);
    const bottom = H * 0.95;
    const cellW = (W * 0.92) / cols;
    const cellH = Math.min((bottom - top) / rows, cellW * 1.15);
    const startY = top + ((bottom - top) - cellH * rows) / 2;
    for (let i = 0; i < 8; i++) {
      const img = this.vsImgs[i];
      const txt = this.vsTexts[i];
      if (i >= n) {
        img.setVisible(false);
        txt.setVisible(false);
        continue;
      }
      const sp = SPECIES.find((x) => x.id === list[i]);
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const col = i % cols;
      const x = W / 2 + (col - (inRow - 1) / 2) * cellW;
      const y = startY + row * cellH + cellH * 0.42;
      const appear = back((el - 0.35 - i * 0.14) / 0.3);
      const size = Math.min(cellW, cellH) * 0.9 * appear;
      if (img.texture.key !== this.portraitKey({ speciesId: sp.id })) img.setTexture(this.portraitKey({ speciesId: sp.id }));
      fitImg(img.setVisible(appear > 0.01).setPosition(x, y).setAlpha(fadeOut), size, size);
      // so le hướng nhìn: cột trái nhìn sang phải, cột phải nhìn sang trái (như đang đối đầu)
      img.setFlipX(col >= cols / 2 && cols > 1);
      const count = sim.fish.filter((f) => f.speciesId === sp.id).length;
      const light = Phaser.Display.Color.IntegerToColor(sp.color).lighten(40).color;
      txt
        .setVisible(appear > 0.5)
        .setFontSize(Math.round(Math.min(cellW * 0.11, titleSize * 0.6)))
        .setColor('#' + light.toString(16).padStart(6, '0'))
        .setPosition(x, y + cellH * 0.36)
        .setText(count > 1 ? `${sp.name} ×${count}` : sp.name)
        .setAlpha(fadeOut);
    }
    // chữ VS lóe sáng ở giữa
    const vsT = (el - 0.35 - n * 0.14) / 0.3;
    this.vsBig
      .setVisible(vsT > 0 && n > 1)
      .setFontSize(Math.round(titleSize * 1.6))
      .setPosition(W / 2, startY + (cellH * rows) / 2)
      .setText('VS')
      .setScale(back(vsT) * (1 + 0.06 * Math.sin(el * 14)))
      .setAlpha(fadeOut);
    if (vsT > 0 && !this.vsFlashed) {
      this.vsFlashed = true;
      this.shake(220, 0.01);
    }
    for (const o of this.presObjs) this.children.bringToTop(o);
  }

  // ---------- màn cut-in tuyệt chiêu ----------
  createCutIn() {
    this.cutQueue = [];
    this.cut = null;
    if (!this.textures.exists('fx_spot')) {
      // đèn spotlight: tâm trong suốt, xung quanh tối dần
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(256, 256, 30, 256, 256, 256);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.16, 'rgba(0,0,0,0)');
      g.addColorStop(0.3, 'rgba(0,0,10,0.55)');
      g.addColorStop(1, 'rgba(0,0,10,0.78)');
      x.fillStyle = g;
      x.fillRect(0, 0, 512, 512);
      this.textures.addCanvas('fx_spot', c);
    }
    this.spot = this.add.image(0, 0, 'fx_spot').setVisible(false);
    this.spotRing = this.add.graphics();
    this.cutBand = this.add.graphics();
    this.cutPortrait = this.add.image(0, 0, 'fish_tilapia').setVisible(false);
    const T = (size, color, stroke = 8) =>
      this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#140a24', strokeThickness: stroke }).setVisible(false);
    this.cutLabel = T(30, '#ffd54f', 6);
    this.cutName = T(72, '#ffffff', 12);
    this.cutDesc = T(28, '#e3f2fd', 6);
    this.cutObjs = [this.spot, this.spotRing, this.cutBand, this.cutPortrait, this.cutLabel, this.cutName, this.cutDesc];
  }

  portraitKey(f) {
    if (this.useArt && this.textures.exists(`art_fish_${f.speciesId}`)) return `art_fish_${f.speciesId}`;
    if (this.use3d) {
      try {
        createPortraits(this, this.style3d());
      } catch {
        /* không tạo được chân dung 3D → dùng hình 2D */
      }
      const key = `portrait_${this.style3d()}_${f.speciesId}`;
      if (this.textures.exists(key)) return key;
    }
    return `fish_${f.speciesId}`;
  }

  updateCutIn(sim) {
    // chờ hiệu ứng bùng nổ của chiêu trước hiển thị xong rồi mới chiếu cut-in kế tiếp
    if (!this.cut && this.cutQueue.length && performance.now() >= (this.nextCutAt || 0)) {
      const q = this.cutQueue.shift();
      const f = sim.fish[q.id];
      if (f) this.startCutIn(f, q.name, q.radius);
    }
    const c = this.cut;
    if (!c) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const el = (performance.now() - c.t0) / 1000;
    if (el >= CUT_TOTAL) {
      for (const o of this.cutObjs) o.setVisible(false);
      this.cutBand.clear();
      this.spotRing.clear();
      this.fireUltBurst(c.f, c.rawName, c.radius);
      this.nextCutAt = performance.now() + 1100;
      this.cut = null;
      return;
    }
    const f = c.f;
    const easeBack = (t) => {
      const k = 1.70158;
      const u = t - 1;
      return 1 + (k + 1) * u * u * u + k * u * u;
    };
    const inP = Math.min(1, el / 0.3);
    const outP = Math.max(0, (el - (CUT_TOTAL - 0.35)) / 0.35);
    const slideIn = (1 - easeBack(inP)) * -W;
    const slideOut = outP * outP * W * 1.2;
    const fade = Math.min(1, el / 0.15) * (1 - outP);

    // spotlight theo con cá
    const [px, py] = this.project(f.x, f.y, this.lift(f));
    const sx = this.viewCenter[0] + px * this.viewScale;
    const sy = this.viewCenter[1] + py * this.viewScale;
    const spotSize = Math.max(W, H) * 2.6;
    this.spot.setVisible(true).setPosition(sx, sy).setDisplaySize(spotSize, spotSize).setAlpha(fade);
    const rr = f.radius * this.viewScale * (2.2 + 0.25 * Math.sin(el * 18));
    this.spotRing.clear();
    this.spotRing.lineStyle(5, 0xffffff, 0.9 * fade);
    this.spotRing.strokeEllipse(sx, sy, rr * 2, rr * 2 * this.cosT);
    this.spotRing.lineStyle(10, f.species.color, 0.6 * fade);
    this.spotRing.strokeEllipse(sx, sy, rr * 2.3, rr * 2.3 * this.cosT);

    // dải băng chéo (đặt ở nửa màn hình không có con cá)
    const cy = sy < H / 2 ? H * 0.7 : H * 0.3;
    const bh = Math.min(H * 0.3, W * 0.46);
    const dx = slideIn + slideOut;
    const skew = bh * 0.35;
    const g = this.cutBand;
    g.clear().setVisible(true);
    this.spotRing.setVisible(true);
    const poly = (y0, y1, color, alpha, extra = 0) => {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(dx - 40 - extra + skew, y0);
      g.lineTo(dx + W + 40 + extra + skew, y0);
      g.lineTo(dx + W + 40 + extra - skew, y1);
      g.lineTo(dx - 40 - extra - skew, y1);
      g.closePath();
      g.fillPath();
    };
    poly(cy - bh / 2 - 10, cy + bh / 2 + 10, f.species.color, 0.95);
    poly(cy - bh / 2, cy + bh / 2, 0x0a0618, 0.88);
    poly(cy - bh / 2, cy - bh / 2 + 6, 0xffd54f, 1);
    poly(cy + bh / 2 - 6, cy + bh / 2, 0xffd54f, 1);
    // vệt tốc độ chạy ngang trong dải băng
    for (let i = 0; i < 16; i++) {
      const yy = cy - bh / 2 + 14 + ((i * 53) % Math.max(1, bh - 28));
      const len = 80 + ((i * 97) % 220);
      const xx = (((i * 211 + el * 2600) % (W + 400)) - 200) + dx;
      g.fillStyle(i % 3 === 0 ? f.species.color : 0xffffff, 0.18 + (i % 4) * 0.06);
      g.fillRect(W - xx, yy, len, 3 + (i % 3));
    }

    // chân dung tràn ra khỏi dải băng, nảy nhẹ
    const ph = bh * 1.75 * (1 + 0.04 * Math.sin(el * 14));
    this.cutPortrait.setVisible(true).setPosition(dx + W * 0.24, cy - bh * 0.08).setAlpha(Math.min(1, fade * 1.4));
    fitImg(this.cutPortrait, ph, ph);

    // chữ trượt vào từ bên phải (trễ hơn một chút)
    const tP = Math.min(1, Math.max(0, (el - 0.12) / 0.3));
    const tdx = (1 - easeBack(tP)) * W * 0.6 + slideOut;
    const tx = W * 0.47 + tdx;
    const nameSize = Math.round(Math.min(bh * 0.3, (W * 0.5) / Math.max(6, c.name.length) * 1.7));
    // chữ hiện lần lượt: nhãn → tên chiêu (lóe sáng) → mô tả hiệu ứng
    const nameIn = Math.min(1, Math.max(0, (el - 0.35) / 0.25));
    const descIn = Math.min(1, Math.max(0, (el - 0.8) / 0.35));
    const flash = el > 0.35 && el < 0.6 ? 1 + 0.25 * Math.sin(((el - 0.35) / 0.25) * Math.PI) : 1;
    this.cutLabel.setVisible(true).setFontSize(Math.round(bh * 0.11)).setOrigin(0, 0.5).setPosition(tx, cy - bh * 0.34).setText(c.label).setAlpha(fade);
    this.cutName.setVisible(true).setFontSize(nameSize).setOrigin(0, 0.5).setPosition(tx, cy - bh * 0.12).setText(c.name).setColor(c.color).setAlpha(fade * nameIn).setScale(flash);
    this.cutDesc.setVisible(true).setFontSize(Math.round(bh * 0.085)).setOrigin(0, 0).setPosition(tx, cy + bh * 0.02).setText(c.desc).setAlpha(fade * descIn);
    this.cutDesc.setWordWrapWidth(W * 0.5).setLineSpacing(bh * 0.02);
    for (const o of this.cutObjs) this.children.bringToTop(o);
  }

  startCutIn(f, name, radius) {
    const light = Phaser.Display.Color.IntegerToColor(f.species.color).lighten(35).color;
    const u = f.species.ult;
    audio.play('appear');
    this.controller.slowMotion(CUT_TOTAL * 1000, 0.04, true);
    this.cut = {
      f,
      t0: performance.now(),
      rawName: name,
      radius,
      name: name.toUpperCase(),
      label: `⚡ TUYỆT CHIÊU · ${f.name}`,
      desc: `${u.desc || ''}\n⏱ Hiệu lực ${String(u.duration).replace('.', ',')} giây`,
      color: '#' + light.toString(16).padStart(6, '0'),
    };
    this.cutPortrait.setTexture(this.portraitKey(f));
    this.cutPortrait.setFlipX(false);
  }

  showUltName(x, y, name, color) {
    if (!this.ultTexts) this.ultTexts = [];
    let txt = this.ultTexts.find((t) => !t.visible);
    if (!txt) {
      txt = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#1a1030', strokeThickness: 6, align: 'center' });
      txt.setOrigin(0.5);
      this.overlay.add(txt);
      this.ultTexts.push(txt);
    }
    const light = Phaser.Display.Color.IntegerToColor(color).lighten(30).color;
    txt.setText('⚡ ' + name + ' ⚡').setColor('#' + light.toString(16).padStart(6, '0')).setPosition(x, y - 26 * this.ultTexts.filter((t) => t.visible && t !== txt).length).setAlpha(1).setScale(1.6).setVisible(true);
    this.overlay.bringToTop(txt);
    this.tweens.killTweensOf(txt);
    this.tweens.add({ targets: txt, scale: 1, duration: 220, ease: 'Back.out' });
    this.tweens.add({ targets: txt, y: txt.y - 40, alpha: 0, delay: 1800, duration: 600, onComplete: () => txt.setVisible(false) });
  }

  /** Nháy trắng khi trúng đòn. */
  flashFish(id) {
    this.flashLeft[id] = 0.07;
    if (this.use3d && this.r3d) this.r3d.flash(id);
  }

  shake(duration, intensity) {
    if (this.effects.lvl >= 2) this.cameras.main.shake(duration, intensity);
  }

  /** Chiếu tọa độ sự kiện lên lớp overlay (độ cao = tâm cá liên quan). */
  projectEvent(e, sim) {
    if (!this.use3d) return e;
    const ref = sim.fish[e.b ?? e.id ?? e.a];
    const h = ref ? this.lift(ref) : 24;
    const [x, y] = this.project(e.x, e.y, h);
    return { ...e, x, y };
  }

  update(_time, delta) {
    const dt = delta / 1000;
    this.frameDt = Math.min(dt, 0.1);
    const events = this.controller.tick(dt);
    const sim = this.controller.sim;
    if (!sim) return;
    for (const e of events) {
      this.effects.onEvent(this.projectEvent(e, sim), sim);
      audio.onEvent(e);
      if (this.use3d && this.r3d) this.r3d.onEvent(e, sim);
      if (e.type === 'ultimate') this.onUltimate(e, sim);
      if (e.type === 'death') {
        this.killSprite(e.id);
        this.weaponViews[e.id]?.update(sim.time);
      }
    }
    if (this.use3d && this.r3d) {
      // khán giả ném cà chua / cờ lê: chỉ âm thanh + nháy trắng, không mất máu
      for (const c of this.r3d.drainCrowdEvents()) {
        if (c.type === 'throw') audio.play('whoosh');
        else if (c.type === 'sfx') audio.play(c.name); // bóng bay nổ, phao nảy, còi bảo vệ…
        else {
          audio.play(c.kind === 'tomato' ? 'splat' : 'bonk');
          if (c.id !== null) this.flashFish(c.id);
        }
      }
    }
    this.effects.update(dt);
    this.updateIntro(sim, this.frameDt);
    this.updateBubbles(dt);
    this.drawArena(sim);
    this.drawFish(sim);
    if (this.use3d && this.r3d && this.fish3dTex) {
      this.r3d.update(sim, this.frameDt);
      this.r3d.render();
      this.fish3dTex.source[0].update();
    }
    this.effects.draw();
    this.drawHUD(sim);
    this.updateCutIn(sim);
  }

  updateBubbles(dt) {
    const W = this.scale.width;
    const H = this.scale.height;
    const show = this.controller.settings.effects !== 'low';
    const dir = this.theme ? this.theme.ambient.dir : 'up';
    for (const b of this.bubbles) {
      b.ph += dt;
      if (dir === 'up') b.y -= (b.speed * dt) / H;
      else if (dir === 'down') {
        b.y += (b.speed * 0.6 * dt) / H;
        b.x += (Math.sin(b.ph * 1.3) * 12 * dt) / W;
      } else {
        b.x += (Math.sin(b.ph * 0.7) * 18 * dt) / W;
        b.y += (Math.cos(b.ph * 0.5) * 14 * dt) / H;
      }
      if (b.y < -0.05) b.y = 1.05;
      if (b.y > 1.05) b.y = -0.05;
      if (b.x < -0.05) b.x = 1.05;
      if (b.x > 1.05) b.x = -0.05;
      const pulse = dir === 'drift' ? 0.6 + 0.4 * Math.sin(b.ph * 3) : 1;
      b.img.setVisible(show).setPosition(b.x * W, b.y * H).setScale(b.s * pulse);
    }
  }

  killSprite(id) {
    if (this.use3d && this.r3d) this.r3d.kill(id);
    this.artViews[id]?.kill();
    if (this.trails[id]) this.trails[id].length = 0;
    const img = this.sprites[id];
    if (!img) return;
    this.tweens.add({
      targets: img,
      alpha: 0,
      scale: img.scale * 1.6,
      angle: img.angle + 180,
      duration: 450,
      onComplete: () => img.setVisible(false),
    });
  }

  drawArena(sim) {
    const g = this.arenaGfx;
    const a = sim.arena;
    const rim = (this.theme || resolveTheme('classic')).rim;
    g.clear();
    const oW = a.outerHalfWidth;
    const oH = a.outerHalfHeight;
    const circle = a.shape === 'circle';
    const oval = a.shape === 'oval';
    if (a.scale < 1) {
      if (oval) {
        const w = oW - a.hw;
        g.lineStyle(w, 0x3a0000, 0.55);
        g.strokeEllipse(0, 0, (a.hw + w / 2) * 2, (a.hh + (oH - a.hh) / 2) * 2);
        g.lineStyle(3, 0xff5252, 0.6 + 0.3 * Math.sin(sim.time * 8));
        g.strokeEllipse(0, 0, oW * 2, oH * 2);
      } else if (circle) {
        const w = oW - a.R;
        g.lineStyle(w, 0x3a0000, 0.55);
        g.strokeCircle(0, 0, a.R + w / 2);
        g.lineStyle(3, 0xff5252, 0.6 + 0.3 * Math.sin(sim.time * 8));
        g.strokeCircle(0, 0, oW);
      } else {
        g.fillStyle(0x3a0000, 0.55);
        g.fillRect(-oW, -oH, oW * 2, oH - a.hh);
        g.fillRect(-oW, a.hh, oW * 2, oH - a.hh);
        g.fillRect(-oW, -a.hh, oW - a.hw, a.hh * 2);
        g.fillRect(a.hw, -a.hh, oW - a.hw, a.hh * 2);
      }
    }
    const stroke = (off, width, color, alpha) => {
      g.lineStyle(width, color, alpha);
      if (oval) g.strokeEllipse(0, 0, (a.hw + off) * 2, (a.hh + off) * 2);
      else if (circle) g.strokeCircle(0, 0, a.R + off);
      else g.strokeRect(-a.hw - off, -a.hh - off, (a.hw + off) * 2, (a.hh + off) * 2);
    };
    if (this.use3d) {
      // tường 3D đã có; chỉ vẽ vạch giới hạn hiện tại khi đấu trường thu hẹp
      if (a.scale < 1) stroke(0, 5, rim.line, 0.9);
      return;
    }
    if (rim.glow) stroke(9, 30, rim.glow, 0.22 + 0.08 * Math.sin(sim.time * 3));
    stroke(9, 18, rim.band, 1);
    stroke(16, 3, 0x000000, 0.35);
    stroke(1.5, 4, rim.line, 1);
    stroke(-3, 4, 0x000000, 0.18);
  }

  drawFish(sim) {
    const t = sim.time;
    this.projFn = this.projFn || ((x, y, h) => this.project(x, y, h));
    const under = this.underGfx;
    const wg = this.weaponGfx;
    const og = this.overGfx;
    const tg = this.trailGfx;
    under.clear();
    wg.clear();
    og.clear();
    tg.clear();
    const fxLevel = this.effects.lvl;
    const teams = sim.settings.mode === 'teams';
    const showCol = this.controller.settings.showColliders;
    const winners = sim.over ? new Set(sim.result.winnerIds) : null;
    for (const f of sim.fish) {
      if (!f.alive) continue;
      const R = f.radius;
      const ap = this.appearOf ? this.appearOf[f.id] ?? 0 : 1;
      if (this.useArt) {
        const fl = this.flashLeft[f.id] > 0;
        if (fl) this.flashLeft[f.id] -= this.frameDt;
        this.artViews[f.id].update(t, this.projFn, this.lift(f), this.cosT, ap, fl, { mode: this.controller.settings.faceMode || 'auto', sim, dt: this.frameDt });
        this.artViews[f.id].body.parentContainer.sy = this.project(f.x, f.y, 0)[1];
      } else if (!this.use3d) this.update2dSprite(f, t, wg, fxLevel, ap);
      if (ap <= 0) continue;

      // trên sàn: bóng đổ, vòng đội, phát sáng kỹ năng/tiến hóa
      if (this.use3d) {
        // bóng đổ lệch về phía dưới-phải (đèn chiếu từ trên-trái như video)
        const sx = f.x + R * 0.45;
        const sy = f.y + R * 0.6;
        under.fillStyle(0x000000, 0.12);
        under.fillEllipse(sx, sy, R * 3.0, R * 2.2);
        under.fillStyle(0x000000, 0.15);
        under.fillEllipse(sx, sy, R * 2.2, R * 1.5);
      } else {
        under.fillStyle(0x000000, 0.18);
        under.fillEllipse(f.x + 5, f.y + 8, R * (f.weapon === 'electric' ? 2.1 : 2.6), R * 1.3);
      }
      if (teams) {
        under.lineStyle(5, TEAM_COLORS[f.team % TEAM_COLORS.length], 0.95);
        under.strokeCircle(f.x, f.y, R + 6);
      }
      if (f.skillActiveUntil > t) {
        under.fillStyle(f.species.color, 0.35);
        under.fillCircle(f.x, f.y, R + 12);
      }
      if (f.ultUntil > t) {
        // hào quang tuyệt chiêu: vòng sáng nhịp đập trên sàn
        const pulse = 0.5 + 0.5 * Math.sin(t * 12);
        under.fillStyle(f.species.color, 0.25 + 0.15 * pulse);
        under.fillCircle(f.x, f.y, R * (1.9 + 0.25 * pulse));
        under.lineStyle(4, 0xffffff, 0.6 + 0.3 * pulse);
        under.strokeCircle(f.x, f.y, R * (2.1 + 0.25 * pulse));
      }
      if (f.level > 1) {
        under.lineStyle(3, 0xffd600, 0.35 + 0.1 * f.level);
        under.strokeCircle(f.x, f.y, R + 4 + f.level);
      }
      if (winners && winners.has(f.id)) {
        under.fillStyle(0xffd600, 0.35 + 0.2 * Math.sin(t * 8));
        under.fillCircle(f.x, f.y, R + 20);
      }

      // vệt lướt khi cá lao nhanh (như khi dùng kỹ năng lao tới / bị đánh bật)
      this.drawTrail(f, tg, fxLevel);

      if (showCol) {
        if (this.use3d) this.drawCollidersProjected(og, f);
        else drawColliders(wg, f);
      }

      // thanh máu phía trên đầu
      const [px, pyTop] = this.project(f.x, f.y, this.use3d ? R * (FISH_LIFT + 1.05) : 0);
      const bw = Math.max(36, R * 2.2);
      const bx = px - bw / 2;
      const by = this.use3d ? pyTop - 14 : f.y - R - 16;
      const ratio = Math.max(0, f.hp / f.maxHp);
      og.fillStyle(0x000000, 0.65);
      og.fillRoundedRect(bx - 2, by - 2, bw + 4, 10, 4);
      og.fillStyle(ratio > 0.6 ? 0x00e676 : ratio > 0.3 ? 0xffea00 : 0xff1744, 1);
      og.fillRoundedRect(bx, by, Math.max(2, bw * ratio), 6, 3);
      for (let l = 1; l < f.level; l++) {
        og.fillStyle(0xffd600, 1);
        og.fillCircle(bx + 4 + (l - 1) * 9, by - 7, 3.5);
      }
      // thanh nội năng (xanh lam) dưới thanh máu
      if (sim.settings.energy !== false) {
        const ey = by + 9;
        og.fillStyle(0x000000, 0.65);
        og.fillRoundedRect(bx - 2, ey - 1, bw + 4, 7, 3);
        if (f.ultUntil > t) {
          // đang tung tuyệt chiêu: thanh sáng rút dần theo thời gian còn lại
          const k = (f.ultUntil - t) / f.species.ult.duration;
          og.fillStyle(0x80d8ff, 0.75 + 0.25 * Math.sin(t * 20));
          og.fillRoundedRect(bx, ey, Math.max(2, bw * k), 5, 2);
        } else {
          const k = f.energy / 100;
          if (k > 0) {
            og.fillStyle(k >= 0.999 ? 0x00e5ff : 0x2979ff, 1);
            og.fillRoundedRect(bx, ey, Math.max(2, bw * k), 5, 2);
          }
          if (k > 0.8) {
            og.lineStyle(2, 0x80d8ff, (k - 0.8) * 4 * (0.5 + 0.5 * Math.sin(t * 16)));
            og.strokeRoundedRect(bx - 3, ey - 2, bw + 6, 9, 3);
          }
        }
      }
      if (f.stunUntil > t) {
        const [sx, sy] = this.project(f.x, f.y, this.use3d ? R * (FISH_LIFT + 0.9) : R * 0.2);
        og.fillStyle(0xfff176, 1);
        for (let k = 0; k < 3; k++) {
          const a = t * 6 + (k * Math.PI * 2) / 3;
          og.fillCircle(sx + Math.cos(a) * R * 0.7, sy + Math.sin(a) * R * 0.3, 3.5);
        }
      }
    }
    if (this.useArt) this.artLayer.list.sort((a, b) => (a.sy || 0) - (b.sy || 0));
  }

  update2dSprite(f, t, wg, fxLevel, ap = 1) {
    const img = this.sprites[f.id];
    img.setVisible(ap > 0);
    if (ap <= 0) {
      for (const p of this.weaponViews[f.id].parts) p.setVisible(false);
      return;
    }
    img.setPosition(f.x, f.y);
    // nhìn nghiêng: lật ngang khi bơi sang trái, nghiêng tối đa ±45° (có độ trễ chống lật liên tục)
    const sp = Math.hypot(f.vx, f.vy) || 1;
    const left = f.vx < -0.15 * sp || (f.vx <= 0.15 * sp && img.flipX);
    img.setFlipX(left);
    const tilt = Math.atan2(f.vy, Math.abs(f.vx));
    img.setRotation(Math.max(-0.8, Math.min(0.8, tilt)) * (left ? -1 : 1));
    const base = (f.radius / ART_R) * (f.skillActiveUntil > t && f.weapon === 'spikes' ? 1.12 : 1);
    const bob = 0.02 * Math.sin(t * 9 + f.id * 1.7);
    img.setScale(base * (1 + bob) * ap, base * (1 - bob) * ap);
    if (this.flashLeft[f.id] > 0) {
      this.flashLeft[f.id] -= this.frameDt;
      img.setTintFill(0xffffff);
    } else if (img.tintFill || img.isTinted) img.clearTint();
    this.weaponViews[f.id].update(t);
    if (ap < 0.6) for (const p of this.weaponViews[f.id].parts) p.setVisible(false);
    else drawWeaponFx(wg, f, t, fxLevel);
  }

  drawTrail(f, g, fxLevel) {
    const tr = this.trails[f.id];
    if (!tr) return;
    const [px, py] = this.project(f.x, f.y, this.lift(f));
    tr.push(px, py);
    if (tr.length > TRAIL_LEN * 2) tr.splice(0, 2);
    if (fxLevel < 2) return;
    const speed = Math.hypot(f.vx, f.vy);
    const fast = speed / (f.cruiseSpeed || 1);
    if (fast < 1.35 || tr.length < 6) return;
    const strength = Math.min(1, (fast - 1.35) / 0.8);
    const n = tr.length / 2;
    const color = Phaser.Display.Color.IntegerToColor(f.species.color).lighten(55).color;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      g.lineStyle(f.radius * 1.4 * k, color, 0.38 * k * strength);
      g.lineBetween(tr[(i - 1) * 2], tr[(i - 1) * 2 + 1], tr[i * 2], tr[i * 2 + 1]);
      g.lineStyle(f.radius * 0.5 * k, 0xffffff, 0.5 * k * strength);
      g.lineBetween(tr[(i - 1) * 2], tr[(i - 1) * 2 + 1], tr[i * 2], tr[i * 2 + 1]);
    }
  }

  /** Collider (debug) chiếu theo góc nghiêng, ở độ cao vũ khí. */
  drawCollidersProjected(g, f) {
    const h = this.lift(f) * 0.95;
    const ell = (x, y, r, color) => {
      const [px, py] = this.project(x, y, h);
      g.lineStyle(1.5, color, 0.9);
      g.strokeEllipse(px, py, r * 2, r * 2 * this.cosT);
    };
    ell(f.x, f.y, f.radius, 0x00e5ff);
    for (let i = 0; i < f.wShapeCount; i++) {
      const s = f.wShapes[i];
      if (s.k === 'circ') ell(s.x, s.y, s.r, 0xff1744);
      else {
        ell(s.ax, s.ay, s.r, 0xff1744);
        ell(s.bx, s.by, s.r, 0xff1744);
        const [ax, ay] = this.project(s.ax, s.ay, h);
        const [bx, by] = this.project(s.bx, s.by, h);
        g.lineBetween(ax, ay, bx, by);
      }
    }
  }

  drawHUD(sim) {
    const s = this.controller.summary();
    const rec = this.mode === 'record';
    const speed = this.controller.settings.simSpeed;
    this.hudSeed.setText(`seed ${sim.seed}`);
    const g = this.hudGfx;
    g.clear();
    if (!rec) {
      const st = this.controller.state;
      const label = st === 'paused' ? '  ⏸ TẠM DỪNG' : st === 'ready' ? '  ▶ Sẵn sàng' : st === 'intro' ? '  ✨ Ra mắt' : '';
      this.hudInfo.setText(`🐟 ${s.alive}/${s.initial}   ⏱ ${fmtTime(s.time)}   ×${speed}${label}`);
    } else {
      this.hudTitle.setText('FISH WEAPON BATTLE');
      this.hudSub.setText(sim.settings.mode === 'teams' ? 'Đội nào sẽ thắng?' : `${s.initial} chiến binh — ai sẽ thắng?`);
      this.hudBottom.setText(`Còn lại ${s.alive}/${s.initial}   ⏱ ${fmtTime(s.time)}`);
      const W = this.scale.width;
      const y = this.scale.height - 165;
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(80, y, W - 160, 18, 9);
      g.fillStyle(0xffeb3b, 1);
      g.fillRoundedRect(80, y, Math.max(18, (W - 160) * (s.alive / s.initial)), 18, 9);
      const top = sim.fish
        .filter((f) => f.kills > 0)
        .sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)
        .slice(0, 2)
        .map((f, i) => `${['🥇', '🥈'][i]} ${f.name}${sim.settings.mode === 'teams' ? ` (${TEAM_NAMES[f.team]})` : ''} ×${f.kills}`);
      this.hudBoard.setText(top.join('    '));
    }

    if (sim.over && !this.bannerShown) {
      this.bannerShown = true;
      const r = sim.result;
      this.banner.setText(r.draw ? '🤝 HÒA!' : '🏆 CHIẾN THẮNG!').setVisible(true).setScale(0.2);
      this.bannerSub.setText(r.draw ? r.reason : `${r.winnerLabel} • ${fmtTime(r.duration)}`).setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 500, ease: 'Back.out' });
      this.tweens.add({ targets: this.bannerSub, alpha: 1, duration: 500, delay: 250 });
      if (!r.draw && r.team === null) {
        const w = sim.fish[r.winnerIds[0]];
        this.bannerIcon.setTexture(`fish_${w.speciesId}`).setVisible(true).setScale(0.1).setAlpha(1);
        const W = this.scale.width;
        this.bannerIcon.setPosition(W / 2, this.bannerSub.y + 110);
        this.tweens.add({ targets: this.bannerIcon, scale: 1.4, duration: 600, ease: 'Back.out' });
      }
    }
    if (this.bannerShown) {
      const bg = this.bannerBg;
      bg.clear();
      const W = this.scale.width;
      const top = this.banner.y - 70;
      const bottom = this.bannerIcon.visible ? this.bannerIcon.y + 80 : this.bannerSub.y + 40;
      bg.fillStyle(0x000000, 0.45);
      bg.fillRoundedRect(W * 0.08, top, W * 0.84, bottom - top, 28);
    }
    this.children.bringToTop(this.bannerBg);
    this.children.bringToTop(this.bannerIcon);
    this.children.bringToTop(this.banner);
    this.children.bringToTop(this.bannerSub);
  }
}
