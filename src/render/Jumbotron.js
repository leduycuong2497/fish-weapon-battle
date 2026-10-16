// Màn hình lớn (jumbotron) đứng sau khán đài phía xa — dùng cho kiểu giới thiệu "điện ảnh":
// camera bay tới màn hình, từng chiến binh được chiếu lên đó (nội dung vẽ ở src/render/JumboContent.js).
import * as THREE from 'three';

export const JUMBO_W = 300; // kích thước mặt màn hình (đơn vị thế giới)
export const JUMBO_H = 190;
export const JUMBO_CW = 1024; // canvas vẽ nội dung (px)
export const JUMBO_CH = 648;
const TILT_BACK = 0.14; // ngả nhẹ ra sau để nhìn thẳng về phía camera trên cao

export class Jumbotron {
  /** farZ: vị trí z (âm = phía xa) của mặt trước màn hình; baseY: độ cao mép dưới màn hình. */
  constructor(farZ, baseY) {
    this.group = new THREE.Group(); // khung + màn hình (ngả ra sau)
    this.stand = new THREE.Group(); // chân trụ (đứng thẳng)
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.5, metalness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x5f6b7a, roughness: 0.4, metalness: 0.8 });
    const cy = baseY + JUMBO_H / 2 + 12;
    this.group.position.set(0, cy, farZ - 6);
    this.group.rotation.x = -TILT_BACK;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(JUMBO_W + 22, JUMBO_H + 22, 12), dark);
    this.group.add(frame);
    // mặt màn hình
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let mat;
    if (this.canvas) {
      this.canvas.width = JUMBO_CW;
      this.canvas.height = JUMBO_CH;
      this.ctx = this.canvas.getContext('2d');
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    } else mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(JUMBO_W, JUMBO_H), mat);
    screen.position.z = 6.2;
    this.group.add(screen);
    // dải đèn trên nóc + biển tên dưới chân màn hình
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
    for (let i = 0; i < 9; i++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), lampMat);
      lamp.position.set(-JUMBO_W / 2 + 10 + (i / 8) * (JUMBO_W - 20), JUMBO_H / 2 + 16, 4);
      this.group.add(lamp);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(JUMBO_W * 0.55, 16, 10), new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.35, metalness: 0.3 }));
    sign.position.set(0, -JUMBO_H / 2 - 18, 2);
    this.group.add(sign);
    // chân trụ + thanh giằng
    for (const x of [-JUMBO_W * 0.34, JUMBO_W * 0.34]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, cy, 10), steel);
      leg.position.set(x, cy / 2, farZ - 16);
      this.stand.add(leg);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(JUMBO_W * 0.7, 6, 6), steel);
    brace.position.set(0, baseY * 0.55, farZ - 16);
    this.stand.add(brace);
    this.setVisible(false);
  }

  setVisible(v) {
    this.group.visible = v;
    this.stand.visible = v;
  }

  /** Tâm mặt màn hình (thế giới) và pháp tuyến hướng ra phía sân. */
  frame() {
    this.group.updateMatrixWorld(true);
    const center = new THREE.Vector3(0, 0, 6.2).applyMatrix4(this.group.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()));
    return { center, normal };
  }

  /** Vẽ lại nội dung: draw(ctx, W, H). */
  draw(fn) {
    if (!this.ctx) return;
    fn(this.ctx, JUMBO_CW, JUMBO_CH);
    this.tex.needsUpdate = true;
  }
}
