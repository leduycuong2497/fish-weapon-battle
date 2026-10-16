// Trò nghịch của khán giả: phao cứu sinh, rắc thức ăn, chiến tranh cà chua trên khán đài,
// bóng bay khổng lồ, fan cuồng nhảy xuống sân + cua bảo vệ. Chỉ là hình ảnh/âm thanh —
// chỉ ĐỌC trạng thái mô phỏng (vị trí, máu, vũ khí) nên kết quả trận theo seed không đổi.
// Bật/tắt & tần suất: src/appsettings.js → CROWD_ANTICS; câu nói: CROWD_LINES.
import * as THREE from 'three';
import { CROWD_ANTICS as A } from '../appsettings.js';
import { effectiveRange } from '../entities/Weapon.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const PELLETS = 90;
const GLITTER = 70;
const GLITTER_COLORS = [0xffd740, 0xffffff, 0xff80ab, 0x80d8ff, 0xb9f6ca];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const RED = new THREE.Color(0xff1744);

/** Phao cứu sinh sọc đỏ trắng, nằm ngang. */
function buoyMesh() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.TorusGeometry(10, 3.6, 8, 5, TAU / 8), i % 2 ? white : red);
    seg.rotation.z = (i / 8) * TAU;
    g.add(seg);
  }
  const ring = new THREE.Group();
  ring.add(g);
  g.rotation.x = -Math.PI / 2;
  return ring;
}

/** Bóng bay: quả bóng bóng loáng + nút buộc + dây, kèm bóng đổ trên sàn. */
function balloonMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xff5252, roughness: 0.15, metalness: 0.05, emissive: 0x000000 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(24, 18, 14).scale(1, 1.18, 1), mat);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5, 8), mat);
  knot.position.y = -29;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 34, 4), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
  string.position.y = -48;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  shine.position.set(-8, 10, 16);
  g.add(ball, knot, string, shine);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(20, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  return { g, mat, shadow };
}

/** Cua bảo vệ (mũi +x): thân đỏ, mắt lồi trên cuống, hai càng to, sáu chân. */
function crabMesh() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xd84315, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0xbf360c, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(1.1, 0.55, 1.4), shell);
  g.add(body);
  for (const z of [-0.4, 0.4]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 5), dark);
    stalk.position.set(0.6, 0.6, z);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(0.65, 0.88, z);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    pupil.position.set(0.8, 0.9, z);
    g.add(stalk, eye, pupil);
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8).scale(1.3, 0.7, 0.8), shell);
    claw.position.set(1.35, 0.15, z * 2.1);
    const pinch = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), dark);
    pinch.rotation.z = -Math.PI / 2;
    pinch.position.set(1.85, 0.25, z * 2.1);
    g.add(claw, pinch);
  }
  g.userData.legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 1.1, 4), dark);
      leg.position.set(-0.5 + i * 0.45, -0.25, side * 1.45);
      leg.rotation.x = side * 0.9;
      g.add(leg);
      g.userData.legs.push(leg);
    }
  }
  return g;
}

export class CrowdAntics {
  /** crowd: Crowd3D (dùng chung ghế ngồi, bóng thoại, hàng đợi sự kiện âm thanh). */
  constructor(crowd) {
    this.c = crowd;
    const group = crowd.group;
    // phao cứu sinh
    this.buoys = [];
    for (let i = 0; i < 4; i++) {
      const obj = buoyMesh();
      obj.visible = false;
      group.add(obj);
      this.buoys.push({ obj, on: false });
    }
    // hạt thức ăn
    this.pellets = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 6, 4), new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 }), PELLETS);
    this.pellets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pellets.frustumCulled = false;
    group.add(this.pellets);
    this.pel = Array.from({ length: PELLETS }, () => ({ on: false }));
    // bóng bay + kim tuyến
    this.balloons = [];
    for (let i = 0; i < 2; i++) {
      const b = balloonMesh();
      b.g.visible = false;
      b.shadow.visible = false;
      group.add(b.g, b.shadow);
      this.balloons.push({ ...b, on: false });
    }
    this.glitter = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), GLITTER);
    this.glitter.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glitter.frustumCulled = false;
    group.add(this.glitter);
    this.gl = Array.from({ length: GLITTER }, (_, i) => {
      this.glitter.setColorAt(i, _c.setHex(GLITTER_COLORS[i % GLITTER_COLORS.length]));
      return { on: false };
    });
    // fan cuồng + cua bảo vệ
    const fg = crowd.fanGeo;
    this.fanMat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
    this.fan = new THREE.Group();
    this.fan.add(new THREE.Mesh(fg.body, this.fanMat), new THREE.Mesh(fg.eyes, new THREE.MeshBasicMaterial({ color: 0xffffff })), new THREE.Mesh(fg.pupils, new THREE.MeshBasicMaterial({ color: 0x1a1a1a })));
    this.fan.visible = false;
    this.crab = crabMesh();
    this.crab.visible = false;
    group.add(this.fan, this.crab);
    this.reset();
  }

  reset() {
    for (const b of this.buoys) {
      b.on = false;
      b.obj.visible = false;
    }
    for (const p of this.pel) p.on = false;
    for (const b of this.balloons) {
      b.on = false;
      b.g.visible = false;
      b.shadow.visible = false;
    }
    for (const g of this.gl) g.on = false;
    this.flushInstances();
    this.helped = new Set(); // cá đã được ném phao
    this.feedT = rand(6, 12);
    this.balloonT = rand(8, 14);
    this.streakT = rand(...A.streakerEvery) * 0.6;
    this.streak = null;
    this.fan.visible = false;
    this.crab.visible = false;
    this.retaliate = [];
    if (this.redSeats) for (const s of this.redSeats) this.restoreColor(s);
    this.redSeats = new Set();
  }

  flushInstances() {
    _s.setScalar(0);
    _m.compose(_p.set(0, -999, 0), _q.identity(), _s);
    for (let i = 0; i < PELLETS; i++) this.pellets.setMatrixAt(i, _m);
    for (let i = 0; i < GLITTER; i++) this.glitter.setMatrixAt(i, _m);
    this.pellets.instanceMatrix.needsUpdate = true;
    this.glitter.instanceMatrix.needsUpdate = true;
  }

  // ---------- tiện ích ----------
  sfx(name) {
    this.c.events.push({ type: 'sfx', name });
  }

  seatTop(s, out = new THREE.Vector3()) {
    const c = this.c;
    return out.set(s.x, (s.curY ?? s.y) + c.fanSize, s.z);
  }

  farSeat(speciesId = null) {
    const seats = this.c.seats.filter((s) => Math.sin(s.a) < -0.25 && !s.away);
    const fans = speciesId ? seats.filter((s) => s.fan === speciesId) : [];
    return pick(fans.length ? fans : seats);
  }

  /** Kéo điểm (x, z) vào trong sân, chừa lề `margin` (mọi hình dạng sân). */
  inside(v, margin = 40) {
    return this.c.insideArena(v, margin);
  }

  /** Bay vòng cung từ a tới b, k = 0..1. */
  arc(out, a, b, k, h) {
    out.lerpVectors(a, b, k);
    out.y += 4 * h * k * (1 - k);
    return out;
  }

  // ---------- 1. phao cứu sinh ----------
  checkLowHp(sim) {
    if (!A.lifebuoy) return;
    for (const f of sim.alive) {
      if (this.helped.has(f.id) || f.hp / f.maxHp >= A.lifebuoyHp) continue;
      const b = this.buoys.find((x) => !x.on);
      if (!b) return;
      this.helped.add(f.id);
      const seat = this.farSeat(f.speciesId);
      if (!seat) return;
      b.on = true;
      b.phase = 'fly';
      b.t = 0;
      b.dur = 1.1;
      b.life = 10;
      b.from = this.seatTop(seat);
      b.to = this.inside(new THREE.Vector3(f.x + f.vx * 0.9, 3, f.y + f.vy * 0.9), 50);
      b.obj.visible = true;
      b.obj.scale.setScalar(1);
      seat.throwAt = this.c.clock;
      this.c.say('lifebuoy', { species: f.species, seat, force: true });
      this.sfx('whoosh');
    }
  }

  updateBuoys(sim, dt) {
    for (const b of this.buoys) {
      if (!b.on) continue;
      const o = b.obj;
      b.t += dt;
      if (b.phase === 'fly') {
        const k = Math.min(1, b.t / b.dur);
        this.arc(o.position, b.from, b.to, k, 110);
        o.rotation.set(k * 6, k * 9, 0);
        if (k >= 1) {
          b.phase = 'float';
          o.rotation.set(0, 0, 0);
          b.vel = new THREE.Vector3();
          b.vy = 0;
          this.sfx('plop');
        }
        continue;
      }
      b.life -= dt;
      // bị cá đâm vào → nảy văng ra
      if (b.phase === 'float') {
        for (const f of sim.alive) {
          const dx = o.position.x - f.x;
          const dz = o.position.z - f.y;
          const d = Math.hypot(dx, dz);
          if (d < f.radius + 14) {
            const n = d || 1;
            b.vel.set((dx / n) * rand(170, 240), 0, (dz / n) * rand(170, 240));
            b.vy = rand(110, 160);
            b.phase = 'bounce';
            this.sfx('boing');
            break;
          }
        }
        o.position.y = 3 + Math.sin(this.c.clock * 3 + b.t) * 1.2;
        o.rotation.z = Math.sin(this.c.clock * 2) * 0.12;
      } else {
        b.vy -= 480 * dt;
        o.position.addScaledVector(b.vel, dt);
        o.position.y += b.vy * dt;
        o.rotation.y += dt * 6;
        if (o.position.y < 3) {
          o.position.y = 3;
          b.vy = Math.abs(b.vy) * 0.4;
          b.vel.multiplyScalar(0.7);
          if (b.vy < 25) b.phase = 'float';
        }
        // dội vào tường sân
        const before = o.position.clone();
        this.inside(o.position, 30);
        if (before.distanceToSquared(o.position) > 0.01) b.vel.multiplyScalar(-0.6);
      }
      if (b.life < 0.6) o.scale.setScalar(Math.max(0.01, b.life / 0.6));
      if (b.life <= 0) {
        b.on = false;
        o.visible = false;
      }
    }
  }

  // ---------- 2. rắc thức ăn ----------
  sprinkle() {
    const seat = this.farSeat(this.c.speciesList.length ? pick(this.c.speciesList).id : null);
    if (!seat) return;
    const from = this.seatTop(seat);
    const E = this.c.ext;
    const center = this.inside(new THREE.Vector3(rand(-0.5, 0.5) * E.x, 1.6, rand(-0.5, 0.5) * E.z), 70);
    let n = 0;
    for (const p of this.pel) {
      if (p.on) continue;
      p.on = true;
      p.phase = 'fly';
      p.t = -n * 0.03; // rắc lần lượt
      p.dur = rand(0.8, 1.15);
      p.from = from.clone();
      p.to = this.inside(new THREE.Vector3(center.x + rand(-45, 45), 1.6, center.z + rand(-45, 45)), 40);
      p.life = 14;
      p.s = rand(0.8, 1.2);
      if (++n >= 16) break;
    }
    seat.throwAt = this.c.clock;
    if (Math.random() < 0.6 && this.c.cool('feed', 10)) this.c.say('feed', { seat });
    this.sfx('sprinkle');
  }

  updatePellets(sim, dt) {
    let any = false;
    for (let i = 0; i < PELLETS; i++) {
      const p = this.pel[i];
      let scale = 0;
      if (p.on) {
        p.t += dt;
        scale = p.s;
        if (p.phase === 'fly') {
          const k = Math.max(0, Math.min(1, p.t / p.dur));
          this.arc(_p, p.from, p.to, k, 80);
          if (p.t < 0) scale = 0;
          if (k >= 1) p.phase = 'floor';
        } else if (p.phase === 'floor') {
          p.life -= dt;
          _p.set(p.to.x, 1.6 + Math.sin(this.c.clock * 4 + i) * 0.6, p.to.z);
          for (const f of sim.alive) {
            if (Math.hypot(p.to.x - f.x, p.to.z - f.y) < f.radius * 1.25) {
              p.phase = 'eat';
              p.t = 0;
              p.fish = f;
              p.start = _p.clone();
              break;
            }
          }
          if (p.life < 1) scale *= Math.max(0, p.life);
          if (p.life <= 0) p.on = false;
        } else {
          // bị hút vào miệng cá
          const f = p.fish;
          const h = Math.atan2(f.vy, f.vx);
          const mouth = new THREE.Vector3(f.x + Math.cos(h) * f.radius, f.radius * 1.05, f.y + Math.sin(h) * f.radius);
          const k = Math.min(1, p.t / 0.16);
          _p.lerpVectors(p.start, mouth, k);
          scale *= 1 - k * 0.8;
          if (k >= 1) {
            p.on = false;
            this.sfx('nom');
          }
        }
        any = true;
      }
      _m.compose(p.on ? _p : _p.set(0, -999, 0), _q.identity(), _s.setScalar(p.on ? scale : 0));
      this.pellets.setMatrixAt(i, _m);
    }
    if (any || this.pelWasOn) this.pellets.instanceMatrix.needsUpdate = true;
    this.pelWasOn = any;
  }

  // ---------- 3. chiến tranh cà chua trên khán đài ----------
  /** Chọn khán giả ngồi hàng dưới gần đó để "ném hụt" trúng. */
  missTarget(from) {
    if (!A.tomatoWar || Math.random() >= A.tomatoMissChance) return null;
    const near = this.c.seats.filter((s) => s !== from && !s.away && Math.abs(Math.atan2(Math.sin(s.a - from.a), Math.cos(s.a - from.a))) < 0.18);
    const lower = near.filter((s) => s.row < from.row);
    return pick(lower.length ? lower : near) || null;
  }

  /** Cà chua trúng một khán giả: đỏ mặt, la lên, rồi ném trả. */
  onSeatHit(from, to, round) {
    to.redUntil = this.c.clock + 2.6;
    this.redSeats.add(to);
    if (this.c.cool('tomatoHit', 1.2)) this.c.say('tomatoHit', { seat: to });
    if (round < A.tomatoWarRounds) this.retaliate.push({ at: this.c.clock + rand(0.5, 0.9), from: to, to: from, round: round + 1 });
  }

  restoreColor(s) {
    if (s.color) this.c.body.setColorAt(this.c.seats.indexOf(s), s.color);
    if (this.c.body.instanceColor) this.c.body.instanceColor.needsUpdate = true;
  }

  updateTomatoWar() {
    const t = this.c.clock;
    for (let i = this.retaliate.length - 1; i >= 0; i--) {
      const r = this.retaliate[i];
      if (t < r.at) continue;
      this.retaliate.splice(i, 1);
      if (!r.from.away && !r.to.away) this.c.throwAtSeat(r.from, r.to, r.round);
    }
    if (!this.redSeats.size) return;
    for (const s of this.redSeats) {
      const left = s.redUntil - t;
      const idx = this.c.seats.indexOf(s);
      if (left <= 0) {
        this.redSeats.delete(s);
        this.restoreColor(s);
        continue;
      }
      _c.copy(s.color || RED).lerp(RED, Math.min(1, left / 0.8) * 0.85);
      this.c.body.setColorAt(idx, _c);
    }
    if (this.c.body.instanceColor) this.c.body.instanceColor.needsUpdate = true;
  }

  // ---------- 4. bóng bay khổng lồ ----------
  launchBalloon() {
    const b = this.balloons.find((x) => !x.on);
    if (!b) return;
    const E = this.c.ext;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const sp = this.c.speciesList.length ? pick(this.c.speciesList) : null;
    b.mat.color.setHex(sp ? sp.color : 0xff5252);
    b.on = true;
    b.pos = new THREE.Vector3(-dir * E.x * 1.15, 46, rand(-0.45, 0.45) * E.z);
    b.vel = new THREE.Vector3(dir * rand(38, 58), 0, rand(-12, 12));
    b.ph = Math.random() * TAU;
    b.g.visible = true;
    b.shadow.visible = true;
  }

  /** Vũ khí của cá có chạm vào bóng (trên mặt sàn x–z) không. */
  weaponTouches(f, x, z, r) {
    const L = effectiveRange(f);
    const R = f.radius;
    if (f.weapon === 'spikes' || f.weapon === 'jaws' || f.weapon === 'electric') return Math.hypot(x - f.x, z - f.y) < R + L * 0.9 + r * 0.5;
    const arms = f.weapon === 'blades' ? [f.weaponAngle, f.weaponAngle + Math.PI] : [f.weaponAngle];
    for (const a of arms) {
      const ax = f.x + Math.cos(a) * R;
      const az = f.y + Math.sin(a) * R;
      const bx = f.x + Math.cos(a) * (R + L);
      const bz = f.y + Math.sin(a) * (R + L);
      const vx = bx - ax;
      const vz = bz - az;
      const k = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
      if (Math.hypot(x - (ax + vx * k), z - (az + vz * k)) < r * 0.7 + 4) return true;
    }
    return false;
  }

  updateBalloons(sim, dt) {
    const R = this.c.ext.x;
    for (const b of this.balloons) {
      if (!b.on) continue;
      b.ph += dt;
      b.pos.addScaledVector(b.vel, dt);
      b.g.position.set(b.pos.x + Math.sin(b.ph * 0.9) * 10, b.pos.y + Math.sin(b.ph * 1.6) * 5, b.pos.z);
      b.g.rotation.z = Math.sin(b.ph * 1.1) * 0.15;
      b.shadow.position.set(b.g.position.x, 0.5, b.g.position.z);
      const popped = sim.alive.some((f) => this.weaponTouches(f, b.g.position.x, b.g.position.z, 24));
      if (popped) {
        this.pop(b);
        continue;
      }
      if (Math.abs(b.pos.x) > R * 1.25) {
        b.on = false;
        b.g.visible = false;
        b.shadow.visible = false;
      }
    }
  }

  pop(b) {
    b.on = false;
    b.g.visible = false;
    b.shadow.visible = false;
    let n = 0;
    for (const g of this.gl) {
      if (g.on) continue;
      g.on = true;
      g.pos = b.g.position.clone();
      const a = Math.random() * TAU;
      const sp = rand(60, 180);
      g.vel = new THREE.Vector3(Math.cos(a) * sp, rand(40, 160), Math.sin(a) * sp);
      g.rot = new THREE.Vector3(Math.random() * TAU, Math.random() * TAU, 0);
      g.life = rand(1.2, 1.8);
      if (++n >= 45) break;
    }
    this.sfx('pop');
    this.c.hype = Math.min(1, this.c.hype + 0.2);
    if (this.c.cool('balloon', 5)) this.c.say('balloon');
  }

  updateGlitter(dt) {
    let any = false;
    for (let i = 0; i < GLITTER; i++) {
      const g = this.gl[i];
      if (g.on) {
        g.life -= dt;
        g.vel.y -= 260 * dt;
        g.vel.multiplyScalar(1 - dt * 1.5);
        g.pos.addScaledVector(g.vel, dt);
        g.rot.x += dt * 9;
        g.rot.y += dt * 7;
        if (g.pos.y < 0.5) {
          g.pos.y = 0.5;
          g.vel.set(0, 0, 0);
        }
        if (g.life <= 0) g.on = false;
        any = true;
      }
      _q.setFromEuler(_e.set(g.rot?.x || 0, g.rot?.y || 0, 0));
      _m.compose(g.on ? g.pos : _p.set(0, -999, 0), _q, _s.setScalar(g.on ? Math.min(1, g.life * 2) : 0));
      this.glitter.setMatrixAt(i, _m);
    }
    if (any || this.glWasOn) this.glitter.instanceMatrix.needsUpdate = true;
    this.glWasOn = any;
  }

  // ---------- 5. fan cuồng nhảy xuống sân ----------
  startStreak() {
    const seat = this.farSeat();
    if (!seat) return;
    seat.away = true;
    this.fanMat.color.copy(seat.color || _c.setHex(0xffb74d));
    const from = this.seatTop(seat);
    const land = this.inside(new THREE.Vector3(seat.x * 0.6, 0, seat.z * 0.6), 60);
    this.streak = { seat, phase: 'jump', t: 0, from, land, pos: from.clone(), vel: new THREE.Vector3(), turnT: 0 };
    this.fan.visible = true;
    this.fan.scale.setScalar(this.c.fanSize * 1.25);
    this.c.say('streakerCrowd', { force: true });
    this.c.say('streaker', { anchor: this.fan, force: true });
    this.c.hype = Math.min(1, this.c.hype + 0.4);
    this.sfx('crowdCheer');
  }

  updateStreak(dt) {
    const s = this.streak;
    if (!s) return;
    s.t += dt;
    const fan = this.fan;
    const crab = this.crab;
    const size = this.c.fanSize * 1.25;
    const face = (obj, vx, vz, off = 0) => (obj.rotation.y = -Math.atan2(vz, vx) + off);
    switch (s.phase) {
      case 'jump': {
        const k = Math.min(1, s.t / 1.1);
        const to = s.land.clone().setY(size);
        this.arc(s.pos, s.from, to, k, 90);
        fan.rotation.set(0, s.seat.face, k * TAU); // lộn nhào qua tường
        if (k >= 1) {
          s.phase = 'run';
          s.t = 0;
          s.pos.y = size;
          fan.rotation.set(0, 0, 0);
        }
        break;
      }
      case 'run': {
        s.turnT -= dt;
        if (s.turnT <= 0) {
          s.turnT = rand(0.4, 0.9);
          const a = Math.random() * TAU;
          s.vel.set(Math.cos(a) * 170, 0, Math.sin(a) * 170);
        }
        s.pos.addScaledVector(s.vel, dt);
        const before = s.pos.clone();
        this.inside(s.pos, 50);
        if (before.distanceToSquared(s.pos) > 0.01) s.vel.multiplyScalar(-1);
        s.pos.y = size + Math.abs(Math.sin(s.t * 14)) * 7;
        face(fan, s.vel.x, s.vel.z);
        fan.rotation.z = Math.sin(s.t * 20) * 0.25;
        if (s.t > 4) {
          // cua bảo vệ xuất hiện từ mép sân gần nhất
          s.phase = 'chase';
          s.t = 0;
          // điểm trên mép sân theo hướng từ tâm ra chỗ fan đang đứng
          s.gate = this.inside(new THREE.Vector3(s.pos.x * 50, 0, s.pos.z * 50), 25);
          s.crab = s.gate.clone();
          crab.visible = true;
          crab.scale.setScalar(13);
          this.sfx('whistle');
        }
        break;
      }
      case 'chase': {
        // fan vẫn chạy loạn, cua đuổi theo (đi ngang kiểu cua)
        s.pos.addScaledVector(s.vel, dt * 0.8);
        this.inside(s.pos, 50);
        s.pos.y = size + Math.abs(Math.sin(s.t * 16)) * 7;
        face(fan, s.vel.x, s.vel.z);
        const d = new THREE.Vector3(s.pos.x - s.crab.x, 0, s.pos.z - s.crab.z);
        const dist = d.length();
        s.crab.addScaledVector(d.normalize(), Math.min(dist, 240 * dt));
        face(crab, d.x, d.z);
        if (dist < 24 || s.t > 4) {
          s.phase = 'drag';
          s.t = 0;
          this.c.say('security', { anchor: crab, force: true });
          this.sfx('boing');
        }
        break;
      }
      case 'drag': {
        // cua kẹp fan lôi về mép sân
        const d = new THREE.Vector3(s.gate.x - s.crab.x, 0, s.gate.z - s.crab.z);
        const dist = d.length();
        s.crab.addScaledVector(d.normalize(), Math.min(dist, 150 * dt));
        face(crab, -d.x, -d.z); // đi lùi, mặt hướng vào sân
        const back = new THREE.Vector3(-d.x, 0, -d.z).normalize();
        s.pos.set(s.crab.x + back.x * 26, size * 1.4, s.crab.z + back.z * 26);
        fan.rotation.set(Math.sin(s.t * 18) * 0.5, crab.rotation.y + Math.PI, 0.4); // giãy giụa
        if (dist < 4) {
          s.phase = 'out';
          s.t = 0;
          s.outFrom = s.pos.clone();
          s.crabFrom = s.crab.clone();
        }
        break;
      }
      case 'out': {
        // cả hai nhảy qua tường biến mất, fan về chỗ cũ
        const k = Math.min(1, s.t / 0.9);
        const seatTop = this.seatTop(s.seat);
        this.arc(s.pos, s.outFrom, seatTop, k, 70);
        this.arc(s.crab, s.crabFrom, s.crabFrom.clone().multiplyScalar(1.15).setY(60), k, 50);
        crab.scale.setScalar(13 * (1 - k * 0.9));
        if (k >= 1) {
          s.seat.away = false;
          s.seat.throwAt = this.c.clock;
          this.streak = null;
          fan.visible = false;
          crab.visible = false;
          return;
        }
        break;
      }
    }
    fan.position.copy(s.pos);
    if (crab.visible) {
      crab.position.set(s.crab.x, s.phase === 'out' ? s.crab.y : 8 + Math.abs(Math.sin(s.t * 18)) * 2, s.crab.z);
      crab.userData.legs.forEach((l, i) => (l.rotation.z = Math.sin(s.t * 24 + i) * 0.5));
    }
  }

  // ---------- vòng lặp ----------
  update(sim, dt) {
    const running = !sim.over && sim.time > 1 && sim.alive && sim.alive.length > 0;
    if (running) {
      this.checkLowHp(sim);
      if (A.feed && (this.feedT -= dt) <= 0) {
        this.feedT = rand(...A.feedEvery);
        this.sprinkle();
      }
      if (A.balloons && (this.balloonT -= dt) <= 0) {
        this.balloonT = rand(...A.balloonEvery);
        this.launchBalloon();
      }
      if (A.streaker && !this.streak && (this.streakT -= dt) <= 0) {
        this.streakT = rand(...A.streakerEvery);
        this.startStreak();
      }
    }
    this.updateBuoys(sim, dt);
    this.updatePellets(sim, dt);
    this.updateTomatoWar();
    this.updateBalloons(sim, dt);
    this.updateGlitter(dt);
    this.updateStreak(dt);
  }
}
