// Khán giả trên khán đài 3D: cá con ngồi kín các bậc, chia khu cổ vũ theo màu từng loài.
// Chỉ là hình ảnh — phản ứng theo sự kiện trận (đòn đánh, tuyệt chiêu, hạ gục, chiến thắng),
// không đọc/ghi gì vào mô phỏng nên kết quả trận theo seed không đổi.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CROWD_TALK, CROWD_LINES } from '../appsettings.js';
import { CrowdAntics } from './CrowdAntics.js';

const TAU = Math.PI * 2;
const FAN_SIZE = 6.5; // cỡ một khán giả (bán kính thân, đơn vị thế giới)
const SEAT_GAP = 19; // khoảng cách giữa hai ghế cạnh nhau
const NEUTRAL = [0xffb74d, 0x81d4fa, 0xce93d8, 0xa5d6a7, 0xfff176, 0xf48fb1, 0x90a4ae];
const CONFETTI = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff];
const WAVE_EVERY = 18; // giây giữa hai lượt "sóng người"
const WAVE_SPEED = 1.7; // rad/giây
const CONFETTI_N = 260;
// ném đồ từ khán đài (chỉ là trò vui: cá trúng chỉ nháy trắng + nhăn mặt, KHÔNG mất máu)
const THROW_EVERY = [2.5, 6]; // giây giữa hai lần ném (ngẫu nhiên trong khoảng); khán giả càng hăng càng ném dày
const WRENCH_CHANCE = 0.35; // tỉ lệ ném cờ lê (còn lại là cà chua)
const THROW_POOL = 6; // số đồ mỗi loại bay cùng lúc tối đa
const SPLAT_LIFE = 4; // vết cà chua trên sàn mờ dần trong bao nhiêu giây
// bóng thoại (câu nói & thông số chỉnh trong src/appsettings.js → CROWD_TALK / CROWD_LINES)
const BUBBLE_POOL = 8;
const BUBBLE_W = 1024; // canvas mỗi bóng thoại (px) — bóng được vẽ giữa đáy canvas
const BUBBLE_H = 256;
const BUBBLE_FONT_PX = 64;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _c = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

/** Hình cá con (mũi +x): thân + đuôi + vây lưng; mắt trắng và con ngươi tách riêng để tô màu khác. */
function fanGeometries() {
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(1.15, 1, 0.85);
  const tail = new THREE.ConeGeometry(0.62, 0.9, 6);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-1.45, 0, 0);
  const fin = new THREE.ConeGeometry(0.28, 0.6, 5);
  fin.translate(-0.15, 1.05, 0);
  const eyes = [];
  const pupils = [];
  for (const z of [0.42, -0.42]) {
    eyes.push(new THREE.SphereGeometry(0.33, 10, 8).translate(0.72, 0.32, z));
    pupils.push(new THREE.SphereGeometry(0.17, 8, 6).translate(0.98, 0.34, z * 1.12));
  }
  return { body: mergeGeometries([body, tail, fin], false), eyes: mergeGeometries(eyes, false), pupils: mergeGeometries(pupils, false) };
}

/** Quả cà chua: thân đỏ + cuống xanh. */
function tomatoMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 10).scale(1, 0.85, 1), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.35 }));
  const stem = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.6 }));
  stem.position.y = 4.8;
  stem.rotation.x = Math.PI;
  g.add(body, stem);
  return g;
}

/** Cờ lê: cán dẹt + đầu chữ C + vòng ở đuôi. */
function wrenchMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.3, metalness: 0.8 });
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(18, 2.6, 1.6), mat);
  const head = new THREE.Mesh(new THREE.TorusGeometry(3.6, 1.4, 6, 12, Math.PI * 1.45), mat);
  head.position.x = 10.5;
  head.rotation.z = Math.PI * 0.27;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 1, 6, 12), mat);
  ring.position.x = -10;
  g.add(handle, head, ring);
  return g;
}

export class Crowd3D {
  /**
   * stand: { ellipse, hx, hz, rows: [{ d, y }] } — sân tròn/bầu dục (ellipse = true) hoặc vuông/chữ nhật,
   * nửa bề ngang/bề dọc của tường (hx, hz); mỗi bậc khán đài cách tường d và cao y (xem buildWalls trong Fish3D.js).
   */
  constructor(stand) {
    this.group = new THREE.Group();
    this.ellipse = !!stand.ellipse;
    this.ext = { x: stand.hx, z: stand.hz };
    this.seats = [];
    const seat = (x, z, face, row, y) =>
      this.seats.push({ x, z, a: Math.atan2(z, x), face, row, y, ph: Math.random() * TAU, sp: 0.75 + Math.random() * 0.6, size: 0.85 + Math.random() * 0.3, fan: null, tint: Math.random() * 0.3 });
    stand.rows.forEach((row, ri) => {
      if (this.ellipse) {
        const rx = stand.hx + row.d;
        const rz = rx * (stand.hz / stand.hx);
        const n = Math.floor((Math.PI * (rx + rz)) / SEAT_GAP);
        for (let i = 0; i < n; i++) {
          if (Math.random() < 0.08) continue; // vài ghế trống cho tự nhiên
          const a = ((i + (Math.random() - 0.5) * 0.35) / n) * TAU;
          seat(Math.cos(a) * rx, Math.sin(a) * rz, -(a + Math.PI), ri, row.y);
        }
      } else {
        // bốn cạnh khán đài vuông/chữ nhật, mặt hướng thẳng vào sân
        const X = stand.hx + row.d;
        const Z = stand.hz + row.d;
        const side = (x0, z0, x1, z1, face) => {
          const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, z1 - z0) / SEAT_GAP));
          for (let i = 0; i < n; i++) {
            if (Math.random() < 0.08) continue;
            const k = (i + 0.5 + (Math.random() - 0.5) * 0.35) / n;
            seat(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, face, ri, row.y);
          }
        };
        side(-X, -Z, X, -Z, -Math.PI / 2); // phía xa
        side(-X, Z, X, Z, Math.PI / 2); // phía gần
        side(-X, -Z + SEAT_GAP, -X, Z - SEAT_GAP, 0); // bên trái
        side(X, -Z + SEAT_GAP, X, Z - SEAT_GAP, Math.PI); // bên phải
      }
    });
    const g = fanGeometries();
    this.fanGeo = g;
    this.fanSize = FAN_SIZE;
    const n = this.seats.length;
    this.body = new THREE.InstancedMesh(g.body, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), n);
    this.eyes = new THREE.InstancedMesh(g.eyes, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.pupils = new THREE.InstancedMesh(g.pupils, new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), n);
    for (const m of [this.body, this.eyes, this.pupils]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.confetti = this.buildConfetti();
    this.group.add(this.confetti.mesh);
    this.buildThrows();
    this.buildBubbles();
    this.antics = new CrowdAntics(this); // phao, thức ăn, chiến tranh cà chua, bóng bay, fan cuồng
    this.reset();
    this.assign([]);
  }

  buildConfetti() {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, 5.5), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI_N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    const bits = [];
    for (let i = 0; i < CONFETTI_N; i++) {
      bits.push({ x: 0, y: 0, z: 0, vy: 0, sway: 0, rx: 0, ry: 0, spin: 0 });
      mesh.setColorAt(i, _c.setHex(CONFETTI[i % CONFETTI.length]));
    }
    return { mesh, bits, active: false };
  }

  buildThrows() {
    this.throws = [];
    for (let i = 0; i < THROW_POOL; i++) {
      for (const kind of ['tomato', 'wrench']) {
        const obj = kind === 'tomato' ? tomatoMesh() : wrenchMesh();
        obj.visible = false;
        this.group.add(obj);
        this.throws.push({ kind, obj, on: false });
      }
    }
    // vết cà chua bẹp trên sàn
    this.splats = [];
    const splatGeo = new THREE.CircleGeometry(1, 14);
    for (let i = 0; i < THROW_POOL; i++) {
      const m = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({ color: 0xc62828, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.group.add(m);
      this.splats.push({ m, life: 0 });
    }
    this.throwT = THROW_EVERY[0];
    this.events = []; // { type: 'throw' | 'impact', kind, id } — BattleScene lấy ra để phát âm thanh & nháy cá
  }

  /** Một khán giả phía xa (thấy rõ trên màn hình) ném đồ vào một con cá còn sống. */
  launch(sim) {
    const kind = Math.random() < WRENCH_CHANCE ? 'wrench' : 'tomato';
    const p = this.throws.find((x) => !x.on && x.kind === kind);
    if (!p) return;
    const far = this.seats.filter((s) => Math.sin(s.a) < -0.2);
    const seat = far[Math.floor(Math.random() * far.length)];
    const target = sim.alive[Math.floor(Math.random() * sim.alive.length)];
    if (!seat || !target) return;
    // thỉnh thoảng cà chua ném hụt, trúng khán giả hàng dưới → chiến tranh cà chua
    const miss = kind === 'tomato' && this.antics.missTarget(seat);
    if (miss) {
      this.throwAtSeat(seat, miss, 1);
      return;
    }
    const dur = 0.9 + Math.random() * 0.4;
    p.toSeat = null;
    p.on = true;
    p.t = 0;
    p.dur = dur;
    p.id = target.id;
    p.from = new THREE.Vector3(seat.x, seat.y + FAN_SIZE * 2.5, seat.z);
    // nhắm vào chỗ con cá sẽ tới (dự đoán theo vận tốc hiện tại)
    p.to = new THREE.Vector3(target.x + target.vx * dur * 0.8, target.radius * 1.1, target.y + target.vy * dur * 0.8);
    p.arc = 90 + Math.random() * 60;
    p.spin = new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 10 - 5, 8 + Math.random() * 8);
    p.bounce = null;
    p.obj.visible = true;
    p.obj.rotation.set(0, 0, 0);
    seat.throwAt = this.clock; // khán giả đó bật dậy khi ném
    this.events.push({ type: 'throw', kind });
    if (Math.random() < 0.5 && this.cool('throw', 4)) this.say('throw', { seat });
  }

  /** Khán giả ném cà chua vào một khán giả khác (chiến tranh cà chua trên khán đài). */
  throwAtSeat(from, to, round) {
    const p = this.throws.find((x) => !x.on && x.kind === 'tomato');
    if (!p) return;
    p.on = true;
    p.t = 0;
    p.dur = 0.55 + Math.random() * 0.2;
    p.id = null;
    p.fromSeat = from;
    p.toSeat = to;
    p.round = round;
    p.from = this.antics.seatTop(from);
    p.to = this.antics.seatTop(to);
    p.arc = 35 + Math.random() * 20;
    p.spin = new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 10 - 5, 8 + Math.random() * 8);
    p.bounce = null;
    p.obj.visible = true;
    from.throwAt = this.clock;
    this.events.push({ type: 'throw', kind: 'tomato' });
  }

  updateThrows(sim, dt) {
    const running = !sim.over && sim.time > 1 && sim.alive && sim.alive.length > 0;
    if (running) {
      this.throwT -= dt * (1 + this.hype * 1.5);
      if (this.throwT <= 0) {
        this.throwT = THROW_EVERY[0] + Math.random() * (THROW_EVERY[1] - THROW_EVERY[0]);
        this.launch(sim);
      }
    }
    for (const p of this.throws) {
      if (!p.on) continue;
      p.t += dt;
      const o = p.obj;
      o.rotation.x += p.spin.x * dt;
      o.rotation.y += p.spin.y * dt;
      o.rotation.z += p.spin.z * dt;
      if (p.bounce) {
        // cờ lê nảy văng ra, rơi xuống sàn nảy vài cái rồi biến mất
        const b = p.bounce;
        b.vy -= 520 * dt;
        o.position.addScaledVector(b.v, dt);
        o.position.y += b.vy * dt;
        if (o.position.y < 2) {
          o.position.y = 2;
          b.vy = Math.abs(b.vy) * 0.35;
          b.v.multiplyScalar(0.6);
        }
        if (p.t > b.until) {
          p.on = false;
          o.visible = false;
        }
        continue;
      }
      if (p.toSeat) this.antics.seatTop(p.toSeat, p.to); // bám theo khán giả đang nhún
      const k = Math.min(1, p.t / p.dur);
      o.position.lerpVectors(p.from, p.to, k);
      o.position.y += 4 * p.arc * k * (1 - k);
      if (k < 1) continue;
      if (p.toSeat) {
        // trúng khán giả: bẹp cà chua, đỏ mặt, ném trả
        p.on = false;
        o.visible = false;
        this.events.push({ type: 'impact', kind: 'tomato', id: null });
        this.antics.onSeatHit(p.fromSeat, p.toSeat, p.round);
        continue;
      }
      // trúng!
      const f = sim.fish[p.id];
      this.events.push({ type: 'impact', kind: p.kind, id: f && f.alive ? p.id : null });
      if (p.kind === 'tomato') {
        p.on = false;
        o.visible = false;
        const sp = this.splats.reduce((a, b) => (a.life <= b.life ? a : b));
        sp.life = SPLAT_LIFE;
        sp.m.visible = true;
        sp.m.position.set(p.to.x, 0.6, p.to.z);
        sp.m.scale.setScalar((f ? f.radius : 20) * (0.9 + Math.random() * 0.4));
        sp.m.rotation.z = Math.random() * TAU;
      } else {
        const away = new THREE.Vector3(p.to.x - p.from.x, 0, p.to.z - p.from.z).normalize();
        const v = away.multiplyScalar(-90 - Math.random() * 60).add(new THREE.Vector3(Math.random() * 80 - 40, 0, Math.random() * 80 - 40));
        p.bounce = { v, vy: 160, until: p.t + 1.6 };
        p.spin.multiplyScalar(1.8);
      }
    }
    for (const sp of this.splats) {
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.m.material.opacity = Math.min(0.85, sp.life / SPLAT_LIFE + 0.15) * Math.min(1, sp.life * 2);
      if (sp.life <= 0) sp.m.visible = false;
    }
  }

  // ---------- bóng thoại ----------
  buildBubbles() {
    this.bubbles = [];
    const canDraw = typeof document !== 'undefined';
    for (let i = 0; i < BUBBLE_POOL; i++) {
      const b = { on: false, life: 0, seat: null, text: '', sprite: null };
      if (canDraw) {
        b.canvas = document.createElement('canvas');
        b.canvas.width = BUBBLE_W;
        b.canvas.height = BUBBLE_H;
        b.ctx = b.canvas.getContext('2d');
        b.tex = new THREE.CanvasTexture(b.canvas);
        b.tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.SpriteMaterial({ map: b.tex, transparent: true, depthTest: false, depthWrite: false });
        b.sprite = new THREE.Sprite(mat);
        b.sprite.center.set(0.5, 0); // mũi nhọn của bóng thoại nằm ngay trên đầu khán giả
        b.sprite.renderOrder = 20;
        b.sprite.visible = false;
        this.group.add(b.sprite);
      }
      this.bubbles.push(b);
    }
    this.cooldowns = {};
  }

  /** Vẽ bóng thoại: nền trắng bo góc, viền màu loài (hoặc xám đậm), mũi nhọn chĩa xuống. */
  drawBubble(b, text, color) {
    if (!b.ctx) return;
    const x = b.ctx;
    const fs = BUBBLE_FONT_PX;
    x.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
    x.font = `800 ${fs}px "Baloo 2", "Arial Black", sans-serif`;
    // xuống dòng khi câu dài (tối đa 2 dòng)
    const maxW = BUBBLE_W - 90;
    const lines = [];
    let cur = '';
    for (const w of text.split(' ')) {
      const next = cur ? `${cur} ${w}` : w;
      if (x.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    lines.push(cur);
    if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(' '));
    const textW = Math.min(maxW, Math.max(...lines.map((l) => x.measureText(l).width)));
    const padX = 30;
    const padY = 14;
    const tail = 30;
    const lh = fs * 1.02;
    const w = textW + padX * 2;
    const h = lines.length * lh + padY * 2;
    const left = (BUBBLE_W - w) / 2;
    const top = BUBBLE_H - tail - h - 6;
    const border = '#' + _c.setHex(color ?? 0x263238).getHexString();
    x.lineJoin = 'round';
    x.beginPath();
    x.roundRect(left, top, w, h, 30);
    x.moveTo(BUBBLE_W / 2 - 22, top + h - 1);
    x.lineTo(BUBBLE_W / 2 - 4, top + h + tail);
    x.lineTo(BUBBLE_W / 2 + 18, top + h - 1);
    x.fillStyle = '#ffffff';
    x.fill();
    x.lineWidth = 9;
    x.strokeStyle = border;
    x.stroke();
    // che đường viền giữa thân bóng và mũi nhọn
    x.fillRect(BUBBLE_W / 2 - 17, top + h - 8, 30, 10);
    x.fillStyle = '#1b1b1b';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    lines.forEach((l, i) => x.fillText(l, BUBBLE_W / 2, top + padY + lh * (i + 0.5) + 2, maxW));
    b.tex.needsUpdate = true;
  }

  /** Cho phép một loại câu nói lặp lại sau ít nhất `sec` giây. */
  cool(key, sec) {
    const t = this.clock || 0;
    if (this.cooldowns[key] !== undefined && t - this.cooldowns[key] < sec) return false;
    this.cooldowns[key] = t;
    return true;
  }

  /**
   * Một khán giả phía xa nói một câu thuộc nhóm `kind` (xem CROWD_LINES).
   * species: loài liên quan (thay vào {cá}, ưu tiên chọn fan của loài này). force: thay bóng cũ nhất nếu đã đủ.
   */
  say(kind, { species = null, seat = null, anchor = null, force = false } = {}) {
    if (!CROWD_TALK.enabled) return;
    const lines = CROWD_LINES[kind];
    if (!lines || !lines.length) return;
    const max = CROWD_TALK.maxBubbles * (this.victory ? 2 : 1);
    const active = this.bubbles.filter((b) => b.on);
    let b = this.bubbles.find((x) => !x.on);
    if (active.length >= max || !b) {
      if (!force || !active.length) return;
      b = active.reduce((a, c) => (a.life <= c.life ? a : c)); // thay bóng sắp tắt nhất
      b.on = false;
    }
    if (!seat && !anchor) {
      // khán đài phía xa, cách các bóng đang hiện để không đè nhau
      const busy = this.bubbles.filter((x) => x.on && x.seat).map((x) => x.seat.a);
      const ok = (s) => Math.sin(s.a) < -0.25 && !s.away && busy.every((a) => Math.abs(Math.atan2(Math.sin(s.a - a), Math.cos(s.a - a))) > 0.4);
      let pool = this.seats.filter((s) => ok(s) && (!species || s.fan === species.id));
      if (!pool.length) pool = this.seats.filter(ok);
      if (!pool.length) return;
      seat = pool[Math.floor(Math.random() * pool.length)];
    }
    const sp = species || (this.speciesList.length ? this.speciesList[Math.floor(Math.random() * this.speciesList.length)] : null);
    const text = lines[Math.floor(Math.random() * lines.length)].replaceAll('{cá}', sp ? sp.name : 'Cá');
    b.on = true;
    b.life = CROWD_TALK.duration;
    b.seat = seat;
    b.anchor = anchor; // nhân vật đang chạy trong sân (fan cuồng, cua bảo vệ)
    b.text = text;
    if (seat) seat.throwAt = this.clock; // người nói bật dậy
    this.drawBubble(b, text, species ? species.color : null);
  }

  updateBubbles(sim, dt) {
    const running = sim.time > 0.3 && !sim.over;
    if (running && !this.saidStart) {
      this.saidStart = true;
      this.say('start');
    }
    if (running) {
      this.talkT -= dt;
      if (this.talkT <= 0) {
        const [a, b] = CROWD_TALK.idleEvery;
        this.talkT = a + Math.random() * (b - a);
        if (Math.random() < 0.5 && this.speciesList.length) this.say('cheer', { species: this.speciesList[Math.floor(Math.random() * this.speciesList.length)] });
        else this.say('idle');
      }
    }
    const size = CROWD_TALK.fontSize * (BUBBLE_H / BUBBLE_FONT_PX);
    for (const b of this.bubbles) {
      if (!b.on) {
        if (b.sprite) b.sprite.visible = false;
        continue;
      }
      b.life -= dt;
      if (b.life <= 0) {
        b.on = false;
        if (b.sprite) b.sprite.visible = false;
        continue;
      }
      if (!b.sprite) continue;
      const age = CROWD_TALK.duration - b.life;
      const pop = age < 0.2 ? 1 + 0.15 * Math.sin((age / 0.2) * Math.PI) - 0.6 * (1 - age / 0.2) : 1; // bật ra
      const s = b.seat;
      b.sprite.visible = true;
      if (b.anchor) b.sprite.position.copy(b.anchor.position).add(_p.set(0, FAN_SIZE * 2.6, 0));
      else b.sprite.position.set(s.x, (s.curY ?? s.y) + FAN_SIZE * 1.6, s.z);
      b.sprite.scale.set(size * (BUBBLE_W / BUBBLE_H) * pop, size * pop, 1);
      b.sprite.material.opacity = Math.min(1, b.life / 0.3);
    }
  }

  /** Sự kiện ném/trúng đồ từ khán đài kể từ lần lấy trước. */
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Kéo điểm (x, z) vào trong sân — tròn/bầu dục hoặc vuông/chữ nhật — chừa lề `margin`. */
  insideArena(v, margin = 40) {
    const hx = this.ext.x - margin;
    if (this.ellipse) {
      const hz = hx * (this.ext.z / this.ext.x);
      const d = Math.hypot(v.x / hx, v.z / hz);
      if (d > 1) {
        v.x /= d;
        v.z /= d;
      }
    } else {
      const hz = this.ext.z - margin;
      v.x = Math.max(-hx, Math.min(hx, v.x));
      v.z = Math.max(-hz, Math.min(hz, v.z));
    }
    return v;
  }

  /** Trận mới: xóa cảm xúc cũ. */
  reset() {
    this.mood = new Map(); // speciesId → { excite, sad }
    this.hype = 0;
    this.victory = null;
    this.waveA = null;
    this.waveT = WAVE_EVERY * 0.4;
    this.confetti.active = false;
    this.confetti.mesh.visible = false;
    for (const p of this.throws) {
      p.on = false;
      p.obj.visible = false;
    }
    for (const sp of this.splats) {
      sp.life = 0;
      sp.m.visible = false;
    }
    this.events = [];
    for (const b of this.bubbles) {
      b.on = false;
      if (b.sprite) b.sprite.visible = false;
    }
    this.cooldowns = {};
    this.saidStart = false;
    this.saidFinal = false;
    this.talkT = 2.5;
    for (const s of this.seats) s.away = false;
    this.antics?.reset();
  }

  /** Chia khán đài thành các khu cổ vũ theo loài có mặt trong trận (+ khán giả trung lập). */
  assign(species) {
    const list = species.slice();
    const off = Math.random() * TAU;
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      let col;
      if (!list.length || Math.random() < 0.22) {
        s.fan = null;
        col = NEUTRAL[Math.floor(Math.random() * NEUTRAL.length)];
      } else {
        const k = Math.floor(((((s.a - off) % TAU) + TAU) % TAU) / TAU * list.length);
        s.fan = list[k].id;
        col = list[k].color;
      }
      _c.setHex(col).lerp(WHITE, s.tint);
      s.color = _c.clone();
      this.body.setColorAt(i, _c);
    }
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.speciesKey = list.map((s) => s.id).join(',');
    this.speciesList = list;
  }

  moodOf(id) {
    let m = this.mood.get(id);
    if (!m) this.mood.set(id, (m = { excite: 0, sad: 0 }));
    return m;
  }

  /** Sự kiện trận → cảm xúc khán giả. */
  onEvent(e, sim) {
    const sp = (id) => (id === null || id === undefined ? null : sim.fish[id]?.speciesId);
    const species = (id) => (id === null || id === undefined ? null : sim.fish[id]?.species || null);
    switch (e.type) {
      case 'hit':
        this.hype = Math.min(1, this.hype + Math.min(0.12, (e.dmg || 0) / 180));
        if ((e.dmg || 0) >= CROWD_TALK.bigHitDamage && Math.random() < 0.7 && this.cool('bigHit', 3)) this.say('bigHit');
        break;
      case 'wall':
        if (Math.random() < 0.06 && this.cool('wall', 6)) this.say('wall');
        break;
      case 'clash':
        this.hype = Math.min(1, this.hype + 0.02);
        break;
      case 'ultimate': {
        const s = sp(e.id);
        if (s) this.moodOf(s).excite = 1;
        this.hype = Math.min(1, this.hype + 0.3);
        if (this.cool('ultimate', 1.5)) this.say('ultimate', { species: species(e.id), force: true });
        break;
      }
      case 'death': {
        const v = sp(e.id);
        const k = sp(e.killer);
        if (v) this.moodOf(v).sad = 1;
        if (k && k !== v) this.moodOf(k).excite = 1;
        this.hype = Math.min(1, this.hype + 0.25);
        if (this.cool('death', 1.2)) this.say('death', { species: species(e.id), force: true });
        break;
      }
      case 'victory':
        this.victory = { species: e.winnerSpecies, t: 0 };
        this.waveA = null;
        this.startConfetti();
        {
          // cả sân cùng nói: câu chúc mừng loài thắng (hoặc câu than trận hòa)
          const win = e.winnerSpecies ? sim.fish.find((f) => f.speciesId === e.winnerSpecies)?.species : null;
          const n = CROWD_TALK.maxBubbles * 2;
          for (let i = 0; i < n; i++) this.say(win ? 'victory' : 'draw', { species: win, force: i === 0 });
        }
        break;
    }
  }

  startConfetti() {
    const c = this.confetti;
    c.active = true;
    c.mesh.visible = true;
    for (const b of c.bits) this.spawnBit(b, true);
  }

  spawnBit(b, initial) {
    b.x = (Math.random() * 2 - 1) * this.ext.x * 1.15;
    b.z = (Math.random() * 2 - 1) * this.ext.z * 1.15;
    b.y = initial ? 120 + Math.random() * 380 : 380 + Math.random() * 60;
    b.vy = 45 + Math.random() * 45;
    b.sway = Math.random() * TAU;
    b.rx = Math.random() * TAU;
    b.ry = Math.random() * TAU;
    b.spin = 3 + Math.random() * 5;
  }

  update(sim, dt) {
    // đồng hồ riêng: khán giả vẫn nhún nhảy cả trong màn giới thiệu / lúc tạm dừng
    this.clock = (this.clock || 0) + dt;
    const t = this.clock;
    if (sim.fish.length) {
      const key = [...new Set(sim.fish.map((f) => f.speciesId))].join(',');
      if (key !== this.speciesKey) this.assign([...new Map(sim.fish.map((f) => [f.speciesId, f.species])).values()]);
    }
    // cảm xúc nguội dần
    this.hype = Math.max(0, this.hype - dt * 0.12);
    for (const m of this.mood.values()) {
      m.excite = Math.max(0, m.excite - dt * 0.45);
      m.sad = Math.max(0, m.sad - dt * 0.25);
    }
    // căng thẳng khi chỉ còn 2 con cuối
    const tense = !this.victory && sim.alive && sim.alive.length === 2 && sim.fish.length > 2;
    // sóng người chạy vòng quanh sân theo chu kỳ
    if (!this.victory) {
      if (this.waveA === null) {
        this.waveT -= dt;
        if (this.waveT <= 0) {
          this.waveA = Math.random() * TAU;
          this.waveEnd = this.waveA + TAU * 1.1;
        }
      } else {
        this.waveA += WAVE_SPEED * dt;
        if (this.waveA > this.waveEnd) {
          this.waveA = null;
          this.waveT = WAVE_EVERY;
        }
      }
    }
    if (this.victory) this.victory.t += dt;

    const S = FAN_SIZE;
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      const m = s.fan ? this.mood.get(s.fan) : null;
      let ex = Math.max(this.hype * 0.55, m ? m.excite : 0, tense ? 0.35 : 0);
      let sad = m ? m.sad : 0;
      if (this.victory) {
        ex = s.fan && s.fan === this.victory.species ? 1 : 0.75;
        sad = 0;
      }
      const freq = s.sp * (2.6 + 7 * ex);
      const hop = Math.abs(Math.sin(t * freq + s.ph)) * (1 + 9 * ex) * (1 - 0.85 * sad);
      let lift = hop - sad * 3;
      if (s.throwAt !== undefined && t - s.throwAt < 0.5) lift += 16 * Math.sin(((t - s.throwAt) / 0.5) * Math.PI); // bật dậy ném
      if (this.waveA !== null) {
        const d = Math.atan2(Math.sin(s.a - this.waveA), Math.cos(s.a - this.waveA));
        lift += 13 * Math.exp(-(d * d) / 0.06);
      }
      const size = S * s.size;
      s.curY = s.y + size + lift;
      _p.set(s.x, s.curY, s.z);
      // mũi hướng vào giữa sân, ngẩng lên khi phấn khích, cúi gằm khi buồn, lắc lư khi cổ vũ
      _e.set(Math.sin(t * freq * 0.5 + s.ph) * 0.35 * ex, s.face, 0.3 + 0.45 * ex - 0.55 * sad);
      _q.setFromEuler(_e);
      _s.setScalar(s.away ? 0 : size); // đang xuống sân (fan cuồng) → ghế trống
      _m.compose(_p, _q, _s);
      this.body.setMatrixAt(i, _m);
      this.eyes.setMatrixAt(i, _m);
      this.pupils.setMatrixAt(i, _m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
    this.pupils.instanceMatrix.needsUpdate = true;

    // pháo giấy khi chiến thắng: rơi lả tả trong ~9 giây rồi tắt dần
    const c = this.confetti;
    if (c.active) {
      const refill = this.victory && this.victory.t < 6;
      let alive = 0;
      for (let i = 0; i < c.bits.length; i++) {
        const b = c.bits[i];
        b.y -= b.vy * dt;
        b.sway += dt * 2.2;
        b.rx += b.spin * dt;
        b.ry += b.spin * 0.7 * dt;
        if (b.y < 0) {
          if (refill) this.spawnBit(b, false);
          else b.y = -999;
        }
        if (b.y > -999) alive++;
        _p.set(b.x + Math.sin(b.sway) * 12, b.y, b.z + Math.cos(b.sway * 0.8) * 8);
        _e.set(b.rx, b.ry, 0);
        _q.setFromEuler(_e);
        _s.setScalar(b.y > -999 ? 1 : 0);
        _m.compose(_p, _q, _s);
        c.mesh.setMatrixAt(i, _m);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
      if (!alive) {
        c.active = false;
        c.mesh.visible = false;
      }
    }
    this.updateThrows(sim, dt);
    if (tense && !this.saidFinal) {
      this.saidFinal = true;
      this.say('final2', { force: true });
    }
    this.antics.update(sim, dt);
    this.updateBubbles(sim, dt);
  }
}
