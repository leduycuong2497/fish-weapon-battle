// Thư viện nhân vật: render từng loài cá 3D (cùng mô hình trong game) ở chất lượng cao,
// ghép thành thẻ nhân vật 1080×1350 có tên, chỉ số, vũ khí và tuyệt chiêu.
import * as THREE from 'three';
import { SPECIES } from './config.js';
import { createCharacter, loadCustomModels } from './render/Fish3D.js';

const CARD_W = 1080;
const CARD_H = 1350;
const RENDER = 1080; // ảnh 3D vuông, render ở độ phân giải gấp đôi rồi thu nhỏ để mịn

const WEAPON_NAMES = {
  sword: 'Trường kiếm thép',
  spikes: 'Gai độc toàn thân',
  blades: 'Song dao cong',
  electric: 'Đuôi sét',
  jaws: 'Bẫy hàm thép',
  mace: 'Chùy sao mai',
  spear: 'Long thương',
  hook: 'Lưỡi hái',
};

// góc nhìn đẹp nhất cho từng loài (độ xoay quanh trục đứng, độ cao camera)
const POSE = {
  swordfish: { yaw: -0.45, elev: 0.5, dist: 10.5, weapon: -0.85, tx: 0.7 },
  pufferfish: { yaw: -0.6, elev: 0.45, dist: 8.2, weapon: 0.35, tx: 0 },
  piranha: { yaw: -0.6, elev: 0.45, dist: 8.4, weapon: -1.0, tx: 0 },
  stingray: { yaw: -0.4, elev: 0.62, dist: 9.6, weapon: 3.9, tx: -0.5 },
  shark: { yaw: -0.55, elev: 0.48, dist: 9.4, weapon: -1.5, tx: 0.2 },
  tilapia: { yaw: -0.6, elev: 0.45, dist: 9.2, weapon: -1.0, tx: 0.3 },
  arowana: { yaw: -0.45, elev: 0.5, dist: 12.5, weapon: -1.0, tx: 0.6 },
  seahorse: { yaw: -0.75, elev: 0.45, dist: 10.2, weapon: 1.83, tx: -0.6 },
};

function hex(c) {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function mix(c, t) {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return `rgb(${Math.round(r + (to - r) * k)},${Math.round(g + (to - g) * k)},${Math.round(b + (to - b) * k)})`;
}

class Studio {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(2);
    this.renderer.setSize(RENDER / 2, RENDER / 2, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    // ánh sáng studio: đèn chính ấm, đèn phụ lạnh, đèn viền phía sau theo màu loài
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a4a, 1.2));
    const key = new THREE.DirectionalLight(0xfff1dc, 3.0);
    key.position.set(-3, 6, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfe3ff, 1.0);
    fill.position.set(5, 2, 3);
    this.scene.add(fill);
    this.rim = new THREE.DirectionalLight(0xffffff, 2.6);
    this.rim.position.set(2, 3, -6);
    this.scene.add(this.rim);
    // bệ đá + vòng sáng
    const ped = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.32, 64), new THREE.MeshStandardMaterial({ color: 0xe9dcc3, roughness: 0.75 }));
    stone.position.y = -0.18;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.58, 1.58, 0.06, 64), new THREE.MeshStandardMaterial({ color: 0xf7efde, roughness: 0.6 }));
    top.position.y = 0.02;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.63, 0.03, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    // bóng đổ mềm dưới nhân vật
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const sx = sc.getContext('2d');
    const sg = sx.createRadialGradient(64, 64, 0, 64, 64, 64);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = sg;
    sx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    ped.add(stone, top, ring, shadow);
    this.scene.add(ped);
  }

  render(species, t = 0.3) {
    const pose = POSE[species.id];
    const ch = createCharacter(species, pose.weapon, new URLSearchParams(location.search).get('style') || 'cartoon');
    ch.tick(t);
    ch.group.rotation.y = pose.yaw;
    this.scene.add(ch.group);
    this.rim.color.setHex(species.color).lerp(new THREE.Color(0xffffff), 0.35);
    this.ringMat.color.setHex(species.color);
    const target = new THREE.Vector3(pose.tx, 0.95, 0);
    this.camera.position.set(pose.tx, pose.dist * Math.sin(pose.elev) + 0.95, pose.dist * Math.cos(pose.elev));
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(ch.group);
    return this.renderer.domElement;
  }
}

/** Ghép thẻ nhân vật: nền theo màu loài, tia sáng, ảnh 3D, tên, chỉ số, vũ khí, tuyệt chiêu. */
function composeCard(species, img3d) {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const x = c.getContext('2d');
  const col = species.color;
  const bg = x.createRadialGradient(CARD_W / 2, 560, 60, CARD_W / 2, 600, 900);
  bg.addColorStop(0, mix(col, 0.55));
  bg.addColorStop(0.45, mix(col, -0.1));
  bg.addColorStop(1, mix(col, -0.72));
  x.fillStyle = bg;
  x.fillRect(0, 0, CARD_W, CARD_H);
  // tia sáng tỏa từ sau nhân vật
  x.save();
  x.translate(CARD_W / 2, 560);
  for (let i = 0; i < 18; i++) {
    x.rotate((Math.PI * 2) / 18);
    x.fillStyle = 'rgba(255,255,255,0.06)';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(-60, -900);
    x.lineTo(60, -900);
    x.closePath();
    x.fill();
  }
  x.restore();
  // hạt sáng
  for (let i = 0; i < 70; i++) {
    const px = (i * 397) % CARD_W;
    const py = (i * 211) % 1000;
    x.fillStyle = `rgba(255,255,255,${0.15 + ((i * 7) % 10) / 30})`;
    x.beginPath();
    x.arc(px, py, 1.5 + (i % 4), 0, Math.PI * 2);
    x.fill();
  }
  x.drawImage(img3d, 0, 40, CARD_W, CARD_W);
  // dải thông tin phía dưới
  const panel = x.createLinearGradient(0, 960, 0, CARD_H);
  panel.addColorStop(0, 'rgba(10,8,20,0)');
  panel.addColorStop(0.25, 'rgba(10,8,20,0.78)');
  panel.addColorStop(1, 'rgba(10,8,20,0.92)');
  x.fillStyle = panel;
  x.fillRect(0, 960, CARD_W, CARD_H - 960);
  x.textAlign = 'center';
  x.lineJoin = 'round';
  x.font = '800 104px "Baloo 2", "Arial Black", sans-serif';
  x.lineWidth = 16;
  x.strokeStyle = mix(col, -0.75);
  x.strokeText(species.name.toUpperCase(), CARD_W / 2, 1090);
  const tg = x.createLinearGradient(0, 1010, 0, 1100);
  tg.addColorStop(0, '#fff8d6');
  tg.addColorStop(1, '#ffc93c');
  x.fillStyle = tg;
  x.fillText(species.name.toUpperCase(), CARD_W / 2, 1090);
  x.font = '600 34px "Baloo 2", Arial, sans-serif';
  x.fillStyle = '#e8eefc';
  x.fillText(`${species.nameEn} • ${WEAPON_NAMES[species.weapon]}`, CARD_W / 2, 1140);
  // chỉ số
  const stats = [
    ['❤', 'MÁU', species.hp, '#ff5c6c'],
    ['⚔', 'SÁT THƯƠNG', species.damage, '#ffb340'],
    ['➤', 'TỐC ĐỘ', species.speed, '#5ce1ff'],
  ];
  stats.forEach(([icon, label, val, c2], i) => {
    const cx = CARD_W / 2 + (i - 1) * 300;
    x.fillStyle = 'rgba(255,255,255,0.1)';
    x.beginPath();
    x.roundRect(cx - 130, 1170, 260, 76, 20);
    x.fill();
    x.font = '800 40px "Baloo 2", Arial, sans-serif';
    x.fillStyle = c2;
    x.fillText(`${icon} ${val}`, cx, 1218);
    x.font = '600 20px "Baloo 2", Arial, sans-serif';
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.fillText(label, cx, 1240);
  });
  x.font = '700 36px "Baloo 2", Arial, sans-serif';
  x.fillStyle = '#9fe8ff';
  x.fillText(`⚡ Tuyệt chiêu: ${species.ult ? species.ult.name : '—'}`, CARD_W / 2, 1305);
  // viền thẻ
  x.lineWidth = 14;
  x.strokeStyle = 'rgba(255,215,90,0.9)';
  x.beginPath();
  x.roundRect(7, 7, CARD_W - 14, CARD_H - 14, 40);
  x.stroke();
  return c;
}

async function main() {
  await loadCustomModels(SPECIES.map((s) => s.id));
  await Promise.race([document.fonts.load('800 60px "Baloo 2"'), new Promise((r) => setTimeout(r, 1500))]);
  const studio = new Studio();
  const grid = document.getElementById('grid');
  const cards = [];
  for (const sp of SPECIES) {
    const card = composeCard(sp, studio.render(sp));
    const url = card.toDataURL('image/png');
    cards.push({ id: sp.id, url });
    const fig = document.createElement('figure');
    const img = new Image();
    img.src = url;
    img.alt = sp.name;
    const a = document.createElement('a');
    a.href = url;
    a.download = `ca-${sp.id}.png`;
    a.textContent = `⬇ Tải ảnh ${sp.name}`;
    fig.append(img, a);
    grid.append(fig);
  }
  window.__cards = cards;
  document.getElementById('status').textContent = `Đã dựng ${cards.length} nhân vật.`;
}

main();
