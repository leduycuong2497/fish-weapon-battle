// Chân dung 3D từng loài (nền trong suốt) dùng cho màn "cut-in" tuyệt chiêu.
// Render một lần bằng chính mô hình trong game (createCharacter), lưu thành texture Phaser.
import * as THREE from 'three';
import { SPECIES } from '../config.js';
import { createCharacter } from './Fish3D.js';

const SIZE = 512;

// góc chụp đẹp cho từng loài: xoay thân, góc vũ khí, khoảng cách camera
const SHOT = {
  swordfish: { yaw: -0.35, weapon: -0.5, dist: 6.2, tx: 0.5 },
  pufferfish: { yaw: -0.5, weapon: 0.35, dist: 5.0, tx: 0 },
  piranha: { yaw: -0.45, weapon: -1.1, dist: 5.0, tx: 0 },
  stingray: { yaw: -0.35, weapon: 3.9, dist: 5.4, tx: -0.3, elev: 0.75 },
  shark: { yaw: -0.4, weapon: -1.5, dist: 5.6, tx: 0.2 },
  tilapia: { yaw: -0.45, weapon: -1.0, dist: 5.4, tx: 0.3 },
  arowana: { yaw: -0.35, weapon: -0.9, dist: 6.4, tx: 0.5 },
  seahorse: { yaw: -0.6, weapon: 1.83, dist: 5.8, tx: -0.4 },
};

export function createPortraits(scene, style = 'cartoon') {
  if (scene.textures.exists(`portrait_${style}_${SPECIES[0].id}`)) return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const s3 = new THREE.Scene();
  s3.add(new THREE.HemisphereLight(0xffffff, 0x6b5a4a, 1.3));
  const key = new THREE.DirectionalLight(0xfff1dc, 3.0);
  key.position.set(-3, 6, 5);
  s3.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 2.8);
  rim.position.set(2, 3, -6);
  s3.add(rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  for (const sp of SPECIES) {
    const shot = SHOT[sp.id];
    const ch = createCharacter(sp, shot.weapon, style);
    ch.tick(0.4);
    ch.group.rotation.y = shot.yaw;
    s3.add(ch.group);
    rim.color.setHex(sp.color).lerp(new THREE.Color(0xffffff), 0.3);
    const elev = shot.elev ?? 0.32;
    camera.position.set(shot.tx, 1.05 + shot.dist * Math.sin(elev), shot.dist * Math.cos(elev));
    camera.lookAt(shot.tx, 1.05, 0);
    renderer.render(s3, camera);
    s3.remove(ch.group);
    // chép sang canvas 2D để Phaser dùng làm texture
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0);
    scene.textures.addCanvas(`portrait_${style}_${sp.id}`, c);
  }
  renderer.dispose();
  renderer.forceContextLoss();
}
