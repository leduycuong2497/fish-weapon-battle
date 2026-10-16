// Sân khấu 3D phong cách hoạt hình (toon) bằng Three.js: cá có viền + mắt to biểu cảm, vũ khí 3D
// xoay theo collider thật, tường đấu trường + cờ phướn. Camera trực giao nghiêng TILT so với
// phương thẳng đứng, nên phép chiếu là tuyến tính: điểm (x, y) trên sàn, độ cao h →
// màn hình (x, y·cosTILT − h·sinTILT). Lớp 2D (sàn, bóng, hiệu ứng, thanh máu) dùng cùng phép chiếu.
//
// Hệ tọa độ Three: sàn là mặt phẳng XZ (x = x mô phỏng, z = y mô phỏng), trục y hướng lên.
// Mô hình cá (đơn vị R = 1): mũi +x, lưng +y, hai bên ±z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { effectiveRange, HOOK_CURL } from '../entities/Weapon.js';
import { FISH_SIZES } from '../fish-sizes.js';
import { SPECIES } from '../appsettings.js';
import { FACE_WEAPON, facingAngle } from './Facing.js';
import { Crowd3D } from './Crowd3D.js';
import { Jumbotron, JUMBO_W, JUMBO_H } from './Jumbotron.js';

export const TILT = (48 * Math.PI) / 180;
export const WALL_H = 46;
export const FISH_LIFT = 1.05; // độ cao tâm cá so với sàn, tính theo bán kính

const TAU = Math.PI * 2;

// ---------- vật liệu ----------
function toon(opts) {
  // vật liệu PBR nhẹ: da cá hơi bóng, ánh kim theo từng loài (giống ảnh concept)
  return new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.04, ...opts });
}

const EYE_WHITE = toon({ color: 0xffffff });
const PUPIL = new THREE.MeshBasicMaterial({ color: 0x0a0a0e });
const SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const TOOTH = toon({ color: 0xfbf6ea });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x141824, side: THREE.BackSide });
const FIN_MATS = new Map();
const SPHERE_HI = new THREE.SphereGeometry(1, 16, 12);
const SPHERE_LO = new THREE.SphereGeometry(1, 8, 6);
const MAT_CACHE = new Map();
const SPIKES_N = 8;
let LOD = 0;
// kiểu nhân vật 3D: 'cartoon' (giống video) | 'real' (tả thực theo concept) | 'model3d' (file .glb tự thêm, thiếu thì dùng hoạt hình)
let STYLE = 'cartoon';
export function setCharStyle(s) {
  STYLE = s === 'real' || s === 'model3d' ? s : 'cartoon';
}
let SPHERE = SPHERE_HI;

function col(hex) {
  return new THREE.Color(hex);
}

function solid(hex) {
  let m = MAT_CACHE.get(hex);
  if (!m) {
    m = toon({ color: hex });
    MAT_CACHE.set(hex, m);
  }
  return m;
}

// ---------- texture vảy (đơn sắc, nhân với màu theo đỉnh) ----------
// Tâm mỗi ô lặp là điểm trắng tuyệt đối → các khối không phải thân lấy UV tại đó (màu không đổi).
const TEX_CACHE = new Map();
function scaleTexture(kind) {
  if (TEX_CACHE.has(kind)) return TEX_CACHE.get(kind);
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, N, N);
  if (kind === 'scales' || kind === 'bigscales') {
    // 2 cột × 4 hàng vảy xếp so le, viền tối, giữa sáng — liền mạch khi lặp
    const rows = 4;
    const cw = N / 2;
    const rh = N / rows;
    for (let r = -1; r <= rows; r++) {
      for (let k = -1; k <= 2; k++) {
        const cx = k * cw + (r % 2 ? cw / 2 : 0) + cw / 2;
        const cy = r * rh + rh / 2;
        const g = x.createRadialGradient(cx + cw * 0.12, cy, 1, cx, cy, cw * 0.62);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.55, '#f2f2f2');
        g.addColorStop(0.85, kind === 'bigscales' ? '#c9c9c9' : '#bdbdbd');
        g.addColorStop(1, kind === 'bigscales' ? '#8e8e8e' : '#7a7a7a');
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(cx, cy, cw * 0.62, rh * 0.82, 0, 0, Math.PI * 2);
        x.fill();
      }
    }
  } else if (kind === 'speckle') {
    // da trơn có đốm nhỏ (cá nóc, cá mập)
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const r = 1 + rnd() * 2.6;
      x.fillStyle = `rgba(90,70,40,${0.25 + rnd() * 0.35})`;
      x.beginPath();
      x.arc(rnd() * N, rnd() * N, r, 0, Math.PI * 2);
      x.fill();
    }
  }
  // ô trắng ở tâm (điểm UV cho các khối khác)
  x.fillStyle = '#fff';
  x.fillRect(N / 2 - 3, N / 2 - 3, 6, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEX_CACHE.set(kind, t);
  return t;
}

function halfPerim(a, b) {
  return (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))) / 2;
}

/**
 * Thân cá dạng thoi, màu theo độ cao (lưng → sườn → bụng) bằng vertex color.
 * top/bot(x): hệ số độ cao lưng/bụng theo vị trí dọc thân (x ∈ [-1, 1]) — tạo lưng gù, bụng sâu…
 */
function bodyGeometry({ len = 1.2, h = 0.6, w = 0.45, nose = 0.5, tail = 0.8, back, mid, belly, pattern = null, top = null, bot = null, seg = 1 }) {
  const g = new THREE.SphereGeometry(1, Math.round((LOD ? 20 : 48) * seg), Math.round((LOD ? 12 : 28) * seg));
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cBack = col(back);
  const cMid = col(mid);
  const cBelly = col(belly);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = x > 0 ? 1 - nose * x * x * 0.6 : 1 - tail * Math.pow(-x, 1.6) * 0.82;
    const X = x * len;
    const Y = y * h * f * (y > 0 ? (top ? top(x) : 1) : bot ? bot(x) : 1);
    const Z = z * w * f;
    p.setXYZ(i, X, Y, Z);
    const t = (y + 1) / 2;
    if (t > 0.5) c.copy(cMid).lerp(cBack, Math.min(1, (t - 0.5) / 0.4));
    else c.copy(cBelly).lerp(cMid, Math.max(0, Math.min(1, (t - 0.18) / 0.3)));
    if (pattern) pattern(c, X, Y, Z, t, x);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.userData.dims = { len, h, w };
  return g;
}

/** Vây dày nhẹ trong mặt phẳng XY từ danh sách điểm [x, y] (điểm lẻ là điểm điều khiển cong). */
function finMesh(points, color, { depth = 0.04, curve = true } = {}) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  if (curve && points.length >= 3) {
    for (let i = 1; i < points.length - 1; i += 2) {
      const cp = points[i];
      const pt = points[Math.min(i + 1, points.length - 1)];
      s.quadraticCurveTo(cp[0], cp[1], pt[0], pt[1]);
    }
  } else for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: LOD ? 3 : 10 });
  g.translate(0, 0, -depth / 2);
  let m = FIN_MATS.get(color);
  if (!m) {
    m = toon({ color, side: THREE.DoubleSide, roughness: 0.45 });
    FIN_MATS.set(color, m);
  }
  return new THREE.Mesh(g, m);
}

/** Các tia vây (gân mảnh tối màu) tỏa từ gốc vây — bỏ ở LOD. */
function finRays(group, origin, tips, color, r = 0.012) {
  if (LOD) return;
  const m = solid(color);
  for (const [tx, ty] of tips) {
    const a = new THREE.Vector3(origin[0], origin[1], 0);
    const b = new THREE.Vector3(tx, ty, 0);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r * 0.5, r, len, 4);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(mesh);
  }
}

/** Mắt cá thật: hốc tối, mống mắt màu, con ngươi đen, điểm sáng; tùy chọn gờ mày (cá nóc, piranha). */
function realEye(group, x, y, zAt, r, iris, { brow = null, browTilt = 0.4, look = 0.15, up = 0.25 } = {}) {
  for (const s of [1, -1]) {
    const e = new THREE.Group();
    e.position.set(x, y, s * zAt);
    e.rotation.x = -s * up;
    blob(e, solid(0x16181c), 0, 0, 0, r * 1.12, r * 1.12, r * 0.55);
    blob(e, solid(iris), r * 0.04, 0, s * r * 0.22, r * 0.92, r * 0.92, r * 0.45);
    blob(e, PUPIL, r * look, 0, s * r * 0.42, r * 0.46, r * 0.5, r * 0.3);
    blob(e, SHINE, r * 0.38, r * 0.34, s * r * 0.6, r * 0.17, r * 0.17, r * 0.1);
    if (brow !== null) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.32, r * 1.5, 3, 8), solid(brow));
      b.rotation.z = Math.PI / 2 - browTilt;
      b.position.set(r * 0.05, r * 1.05, s * r * 0.05);
      e.add(b);
    }
    group.add(e);
  }
}

function bodyMat() {
  return toon({ vertexColors: true });
}

function blob(group, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(SPHERE, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  group.add(m);
  return m;
}

function cone(group, mat, r, len, from, dir, seg = 5) {
  const g = new THREE.ConeGeometry(r, len, seg);
  const m = new THREE.Mesh(g, mat);
  const d = new THREE.Vector3(...dir).normalize();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  m.position.set(from[0] + d.x * len * 0.5, from[1] + d.y * len * 0.5, from[2] + d.z * len * 0.5);
  group.add(m);
  return m;
}

function tube(group, mat, pts, r, seg = 16, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, LOD ? Math.ceil(seg / 2) : seg, r, LOD ? 5 : radial), mat);
  group.add(m);
  return m;
}

/** Hai hàng răng nhọn dọc theo cung hàm (mỗi hàm một nửa elip quanh trục x). */
function jawTeeth(group, { x, y, rx, rz, n, size, down }) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.PI * (i + 0.5)) / n;
    const px = x + Math.cos(a) * rx;
    const pz = Math.sin(a) * rz;
    const s = size * (0.75 + 0.35 * Math.cos(a));
    cone(group, TOOTH, s * 0.32, s, [px, y, pz], [0.12, down ? -1 : 1, 0], 4);
  }
}

// ---------- mô hình từng loài (theo bảng concept: tả thực, ánh kim, chi tiết vảy/vây) ----------
const MODELS = {
  // 1. Cá kiếm: lưng xanh than, sườn bạc ánh tím, mỏ kiếm rất dài, vây lưng lưỡi liềm cao, đuôi trăng khuyết
  swordfish() {
    const root = new THREE.Group();
    const FIN = 0x13234a;
    const tailG = new THREE.Group();
    tailG.position.x = -1.08;
    tailG.add(finMesh([[0, 0.08], [-0.25, 0.4], [-0.72, 1.15], [-0.5, 0.42], [-0.4, 0], [-0.5, -0.42], [-0.72, -1.15], [-0.25, -0.4], [0, -0.08]], FIN));
    root.add(tailG);
    // gờ cuống đuôi
    blob(root, solid(0x1a2d5c), -1.0, 0, 0, 0.16, 0.07, 0.16);
    root.add(finMesh([[0.42, 0.36], [0.3, 1.35], [0.02, 1.32], [-0.05, 0.72], [-0.38, 0.38]], FIN));
    root.add(finMesh([[-0.7, 0.2], [-0.78, 0.38], [-0.86, 0.17]], FIN));
    root.add(finMesh([[-0.3, -0.32], [-0.45, -0.7], [-0.62, -0.62], [-0.6, -0.4], [-0.66, -0.22]], FIN));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.18, h: 0.47, w: 0.38, nose: 0.55, tail: 0.95, back: 0x0d1a3d, mid: 0x4673b8, belly: 0xe9eef6,
        top: (x) => 1 + 0.12 * Math.max(0, 1 - Math.abs(x - 0.2) * 2),
        pattern: (c, X, Y, Z, t) => {
          // các vạch dọc mờ ánh tím trên sườn
          if (t > 0.35 && t < 0.8 && Math.sin(X * 11) > 0.7) c.lerp(col(0x9aa6e8), 0.25);
          if (t > 0.48 && t < 0.55) c.lerp(col(0xbfd4ff), 0.35); // đường bên ánh bạc
        },
      }),
      bodyMat(),
    );
    root.add(body);
    // mỏ kiếm dẹt, rất dài
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.075, 1.5, 8), solid(0x1b2a4e));
    bill.rotation.z = -Math.PI / 2;
    bill.scale.set(1, 1, 0.55);
    bill.position.set(1.05 + 0.75, -0.02, 0);
    root.add(bill);
    blob(root, solid(0x1b2a4e), 1.0, -0.06, 0, 0.22, 0.08, 0.1); // hàm dưới
    for (const s of [1, -1]) {
      const pec = finMesh([[0.48, -0.12], [0.2, -0.45], [-0.38, -0.68], [0.05, -0.36], [0.44, -0.24]], FIN);
      pec.position.z = s * 0.3;
      pec.rotation.y = s * 0.5;
      root.add(pec);
    }
    realEye(root, 0.78, 0.07, 0.24, 0.1, 0x2d3a5c, { up: 0.15 });
    return { root, body, tail: tailG, look: { roughness: 0.28, metalness: 0.45 } };
  },

  // 2. Cá nóc: thân cầu màu cát, bụng kem, lốm đốm nâu, gai dài khắp người, mày cau có, miệng mếu
  pufferfish() {
    const root = new THREE.Group();
    const tailG = new THREE.Group();
    tailG.position.x = -0.9;
    tailG.add(finMesh([[0, 0.14], [-0.3, 0.48], [-0.52, 0.34], [-0.58, 0], [-0.52, -0.34], [-0.3, -0.48], [0, -0.14]], 0xd9b35c));
    finRays(tailG, [0, 0], [[-0.5, 0.36], [-0.56, 0.18], [-0.58, 0], [-0.56, -0.18], [-0.5, -0.36]], 0xa8843c, 0.01);
    root.add(tailG);
    root.add(finMesh([[-0.45, 0.78], [-0.72, 1.0], [-0.82, 0.62]], 0xd9b35c));
    const body = new THREE.Mesh(
      bodyGeometry({ len: 0.98, h: 0.9, w: 0.92, nose: 0.12, tail: 0.25, back: 0x9c7a44, mid: 0xcdb07a, belly: 0xf3ead0 }),
      bodyMat(),
    );
    root.add(body);
    // gai dài màu ngà, gốc sẫm — phân bố đều (xoắn Fibonacci) trừ vùng mặt
    const n = LOD ? 30 : 90;
    const spike = solid(0xefe2c0);
    const base = solid(0x8a6a3a);
    for (let i = 0; i < n; i++) {
      const yy = 1 - (2 * (i + 0.5)) / n;
      const rr = Math.sqrt(1 - yy * yy);
      const a = i * 2.39996;
      const v = new THREE.Vector3(Math.cos(a) * rr * 0.98, yy * 0.9, Math.sin(a) * rr * 0.92);
      if (v.x > 0.55 && Math.abs(v.y) < 0.5) continue; // chừa mặt
      const d = v.clone().normalize();
      const L = 0.26 + ((i * 37) % 10) / 60;
      cone(root, spike, 0.045, L, [v.x * 0.97, v.y * 0.97, v.z * 0.97], [d.x, d.y, d.z], LOD ? 3 : 5);
      if (!LOD) blob(root, base, v.x, v.y, v.z, 0.05, 0.05, 0.05);
    }
    // mặt: má phúng, miệng mếu nhỏ
    const lip = solid(0xb38e5e);
    tube(root, lip, [[0.97, -0.24, -0.16], [1.0, -0.17, -0.06], [1.0, -0.15, 0.06], [0.97, -0.24, 0.16]], 0.035, 12);
    for (const s of [1, -1]) {
      const pec = finMesh([[0.25, 0.08], [0.05, 0.28], [-0.05, -0.12], [0.1, -0.3], [0.25, -0.16]], 0xd9b35c);
      pec.position.set(0.05, -0.05, s * 0.86);
      pec.rotation.y = s * 0.7;
      root.add(pec);
    }
    realEye(root, 0.66, 0.26, 0.5, 0.17, 0xb07a2c, { brow: 0x7a5a30, browTilt: -0.45, up: 0.05, look: 0.2 });
    return { root, body, tail: tailG, tex: { kind: 'speckle', size: 0.3 }, look: { roughness: 0.55 } };
  },

  // 3. Cá Piranha: lưng xám đen ánh vảy, họng/bụng cam đỏ, vây đỏ rực, hàm dưới chìa, răng nhọn, mắt đỏ
  piranha() {
    const root = new THREE.Group();
    const RED = 0xd3241c;
    const tailG = new THREE.Group();
    tailG.position.x = -0.86;
    tailG.add(finMesh([[0, 0.14], [-0.3, 0.5], [-0.62, 0.8], [-0.5, 0.25], [-0.4, 0], [-0.5, -0.25], [-0.62, -0.8], [-0.3, -0.5], [0, -0.14]], RED));
    root.add(tailG);
    root.add(finMesh([[0.15, 0.78], [-0.05, 1.28], [-0.4, 1.16], [-0.35, 0.95], [-0.5, 0.62]], RED));
    root.add(finMesh([[-0.68, 0.42], [-0.82, 0.58], [-0.86, 0.36]], 0x3a3e46)); // vây mỡ
    root.add(finMesh([[-0.15, -0.68], [-0.35, -1.02], [-0.62, -0.95], [-0.62, -0.7], [-0.72, -0.42]], RED));
    root.add(finMesh([[0.2, -0.78], [0.08, -1.0], [-0.08, -0.95], [-0.02, -0.82], [0.05, -0.72]], RED));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.02, h: 0.8, w: 0.55, nose: 0.2, tail: 0.66, back: 0x22272f, mid: 0x5b6068, belly: 0xc2531f,
        top: (x) => 1 + 0.12 * Math.max(0, 1 - Math.abs(x - 0.15) * 1.6),
        bot: (x) => 1 + 0.08 * Math.max(0, x),
        pattern: (c, X, Y, Z, t) => {
          if (t < 0.48 && X > -0.3) c.lerp(col(0xd8461c), Math.min(1, (0.48 - t) * 3) * 0.8); // họng cam đỏ
          if (t > 0.6) c.lerp(col(0x9aa0aa), 0.08 * (1 + Math.sin(X * 40 + Y * 30))); // ánh lấp lánh
        },
      }),
      bodyMat(),
    );
    root.add(body);
    // miệng há to: khoang đỏ sẫm, lợi hồng, hàm dưới chìa ra
    blob(root, solid(0x5a0c14), 0.8, -0.26, 0, 0.26, 0.24, 0.44);
    blob(root, solid(0xe07a86), 0.86, -0.38, 0, 0.18, 0.06, 0.36);
    blob(root, solid(0x30353d), 0.86, -0.5, 0, 0.24, 0.1, 0.42); // hàm dưới
    jawTeeth(root, { x: 0.82, y: -0.1, rx: 0.18, rz: 0.38, n: LOD ? 6 : 11, size: 0.15, down: true });
    jawTeeth(root, { x: 0.9, y: -0.44, rx: 0.2, rz: 0.4, n: LOD ? 6 : 11, size: 0.17, down: false });
    for (const s of [1, -1]) {
      const pec = finMesh([[0.32, -0.28], [0.05, -0.38], [-0.2, -0.55], [0.08, -0.5], [0.3, -0.42]], RED);
      pec.position.z = s * 0.46;
      pec.rotation.y = s * 0.5;
      root.add(pec);
    }
    // nắp mang
    for (const s of [1, -1]) tube(root, solid(0x1c2026), [[0.28, 0.4, s * 0.48], [0.18, 0.05, s * 0.54], [0.26, -0.32, s * 0.48]], 0.018, 10);
    realEye(root, 0.55, 0.3, 0.45, 0.16, 0xe0281a, { brow: 0x1c2026, browTilt: 0.55, up: 0.15 });
    return { root, body, tail: tailG, tex: { kind: 'scales', size: 0.055 }, look: { roughness: 0.38, metalness: 0.25 } };
  },

  // 4. Cá đuối điện: đĩa thân thoi màu đá đen, viền bạc, mạch sét xanh phát sáng, đuôi roi
  stingray() {
    const root = new THREE.Group();
    const flat = new THREE.Group();
    flat.rotation.x = -Math.PI / 2;
    root.add(flat);
    const g = new THREE.SphereGeometry(1, LOD ? 24 : 56, LOD ? 12 : 28);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      const z = p.getZ(i);
      const ay = Math.abs(y);
      const r0 = Math.hypot(x, y); // gần 1 ở mép đĩa
      // cánh nhọn vuốt ra sau (kiểu cá đuối ó)
      const wing = 1 + 0.5 * Math.pow(ay, 3);
      x = x * (x > 0 ? 0.92 : 0.8) - 0.38 * ay * ay;
      y *= 1.3 * wing;
      const Z = z * (z > 0 ? 0.28 : 0.12) * (1 - 0.5 * ay * ay);
      p.setXYZ(i, x, y, Z);
      const rim = Math.max(0, (r0 - 0.93) / 0.07);
      if (z > 0) {
        c.set(0x3a4658).lerp(col(0x1b2230), Math.min(1, Math.hypot(x, y * 0.6) * 0.8));
        c.lerp(col(0xc8d6e6), Math.min(1, rim) * 0.75); // viền bạc
      } else c.set(0xe6ecf4);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const body = new THREE.Mesh(g, bodyMat());
    flat.add(body);
    // mạch sét phát sáng trên lưng (đường gấp khúc phân nhánh)
    const bolt = new THREE.MeshBasicMaterial({ color: 0x5fd2ff });
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const surf = (x, y) => 0.28 * Math.sqrt(Math.max(0, 1 - (x * x) / 0.85 - (y * y) / 1.6)) + 0.015;
    const branches = LOD ? 6 : 14;
    for (let b = 0; b < branches; b++) {
      const side = b % 2 ? 1 : -1;
      const pts = [];
      let x = 0.1 - rnd() * 0.4;
      let y = side * rnd() * 0.15;
      for (let k = 0; k < 6; k++) {
        pts.push([x, y, surf(x, y)]);
        x -= 0.04 + rnd() * 0.12;
        y += side * (0.1 + rnd() * 0.14);
        if (Math.abs(y) > 1.25) break;
      }
      if (pts.length > 2) tube(flat, bolt, pts, LOD ? 0.024 : 0.02, 14, 4);
    }
    // mắt nhỏ ở mép trước + khe thở
    for (const s of [1, -1]) {
      const e = new THREE.Group();
      e.position.set(0.62, s * 0.2, 0.17);
      blob(e, solid(0x0d1016), 0, 0, 0, 0.08, 0.08, 0.06);
      blob(e, solid(0x2a6fa8), 0.02, 0, 0.03, 0.05, 0.05, 0.04);
      blob(e, SHINE, 0.03, 0.02, 0.06, 0.018, 0.018, 0.01);
      flat.add(e);
    }
    // đuôi roi thon dài, có vạch sáng
    const tailG = new THREE.Group();
    tailG.position.set(-0.75, 0, 0);
    const tailMat = solid(0x2a3344);
    tube(tailG, tailMat, [[0, 0, 0.02], [-0.5, 0, 0.0], [-1.0, 0, 0.0], [-1.45, 0, 0.0]], 0.04, 16, 6);
    cone(tailG, tailMat, 0.035, 0.35, [-1.45, 0, 0], [-1, 0, 0], 5);
    tube(tailG, bolt, [[-0.1, 0, 0.05], [-0.7, 0, 0.035], [-1.3, 0, 0.02]], 0.009, 10, 4);
    root.add(tailG);
    return { root, body, tail: tailG, topDown: true, look: { roughness: 0.42, metalness: 0.12 } };
  },

  // 5. Cá mập búa: lưng xanh xám, bụng trắng, đầu hình búa với mắt ở hai đầu, miệng há răng nhọn
  shark() {
    const root = new THREE.Group();
    const FIN = 0x34507a;
    const tailG = new THREE.Group();
    tailG.position.x = -1.12;
    tailG.add(finMesh([[0, 0.12], [-0.35, 0.5], [-0.85, 1.12], [-0.62, 0.38], [-0.5, 0.02], [-0.58, -0.25], [-0.62, -0.6], [-0.28, -0.3], [0, -0.1]], FIN));
    root.add(tailG);
    root.add(finMesh([[0.18, 0.48], [-0.02, 1.15], [-0.35, 1.48], [-0.36, 0.95], [-0.62, 0.45]], FIN));
    root.add(finMesh([[-0.8, 0.22], [-0.9, 0.42], [-0.96, 0.18]], FIN));
    root.add(finMesh([[-0.6, -0.25], [-0.72, -0.48], [-0.85, -0.2]], FIN));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.25, h: 0.55, w: 0.5, nose: 0.75, tail: 0.92, back: 0x2f4a72, mid: 0x7f97b4, belly: 0xf2f5f8,
        pattern: (c, X, Y, Z, t) => {
          if (t > 0.42 && t < 0.5) c.lerp(col(0xa9bbd0), 0.3);
        },
      }),
      bodyMat(),
    );
    root.add(body);
    // đầu búa: tấm dẹt rộng, cong nhẹ về sau
    const head = new THREE.Group();
    head.position.set(1.05, 0.12, 0);
    blob(head, solid(0x3b5780), 0, 0, 0, 0.36, 0.11, 0.98);
    blob(head, solid(0xdde4ec), -0.02, -0.05, 0, 0.33, 0.06, 0.92);
    for (const s of [1, -1]) {
      blob(head, solid(0x3b5780), -0.08, 0.0, s * 0.92, 0.17, 0.12, 0.12);
      const e = new THREE.Group();
      e.position.set(-0.06, 0.02, s * 1.02);
      blob(e, solid(0x0b0d12), 0, 0, 0, 0.085, 0.085, 0.07);
      blob(e, solid(0x6a5030), 0.02, 0, s * 0.03, 0.06, 0.06, 0.05);
      blob(e, PUPIL, 0.03, 0, s * 0.05, 0.035, 0.04, 0.03);
      blob(e, SHINE, 0.04, 0.03, s * 0.065, 0.016, 0.016, 0.01);
      head.add(e);
    }
    root.add(head);
    // miệng há: khoang đỏ sẫm, 2 hàng răng tam giác
    blob(root, solid(0x5a1222), 0.86, -0.25, 0, 0.24, 0.13, 0.32);
    jawTeeth(root, { x: 0.8, y: -0.15, rx: 0.16, rz: 0.29, n: LOD ? 6 : 12, size: 0.1, down: true });
    jawTeeth(root, { x: 0.82, y: -0.36, rx: 0.15, rz: 0.27, n: LOD ? 6 : 11, size: 0.09, down: false });
    blob(root, solid(0xe8edf2), 0.82, -0.4, 0, 0.22, 0.06, 0.3);
    const gill = solid(0x253a5a);
    for (let i = 0; i < 5; i++) for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.26, 0.03), gill);
      m.position.set(0.56 - i * 0.075, -0.02, s * 0.45);
      m.rotation.z = 0.15;
      root.add(m);
    }
    for (const s of [1, -1]) {
      const pec = finMesh([[0.38, -0.3], [0.12, -0.72], [-0.28, -1.02], [0.05, -0.55], [0.06, -0.36]], FIN);
      pec.position.z = s * 0.33;
      pec.rotation.y = s * 0.5;
      root.add(pec);
    }
    return { root, body, tail: tailG, look: { roughness: 0.4, metalness: 0.12 } };
  },

  // 6. Cá rô phi: thân dày, vảy ô liu viền sẫm, vây gai dài, vây hồng đỏ, môi dày, mắt cam
  tilapia() {
    const root = new THREE.Group();
    const tailG = new THREE.Group();
    tailG.position.x = -0.94;
    tailG.add(finMesh([[0, 0.24], [-0.55, 0.62], [-0.68, 0], [-0.55, -0.62], [0, -0.24]], 0x8a5236));
    finRays(tailG, [0, 0], [[-0.5, 0.5], [-0.6, 0.28], [-0.64, 0], [-0.6, -0.28], [-0.5, -0.5]], 0x5b3424);
    root.add(tailG);
    const dorsal = finMesh([[0.5, 0.55], [0.2, 0.86], [-0.4, 0.86], [-0.9, 0.86], [-1.08, 0.38], [-0.95, 0.36], [-0.85, 0.34]], 0x3a3a26);
    root.add(dorsal);
    finRays(root, [-0.1, 0.4], [[0.38, 0.8], [0.15, 0.9], [-0.1, 0.92], [-0.35, 0.92], [-0.6, 0.92], [-0.85, 0.9]], 0x8d8660, 0.012);
    root.add(finMesh([[-0.35, -0.55], [-0.6, -0.92], [-1.0, -0.6], [-0.9, -0.45], [-0.8, -0.35]], 0xb04a30));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.02, h: 0.72, w: 0.44, nose: 0.3, tail: 0.72, back: 0x3a4430, mid: 0x8d8a62, belly: 0xd9d0b0,
        top: (x) => 1 + 0.1 * Math.max(0, 1 - Math.abs(x - 0.1) * 1.5),
        pattern: (c, X, Y, Z, t) => {
          if (Math.sin(X * 9 - 1) > 0.75 && t > 0.4) c.multiplyScalar(0.85); // vằn mờ
          if (t < 0.3) c.lerp(col(0x3e8f6e), 0.25); // ánh xanh ngọc ở bụng
        },
      }),
      bodyMat(),
    );
    root.add(body);
    for (const s of [1, -1]) {
      const pec = finMesh([[0.45, -0.1], [0.08, -0.2], [-0.15, -0.45], [0.15, -0.4], [0.45, -0.26]], 0xa85a3a);
      pec.position.z = s * 0.3;
      pec.rotation.y = s * 0.45;
      root.add(pec);
      const pel = finMesh([[0.25, -0.55], [0.15, -0.95], [0.0, -0.9], [0.05, -0.72], [0.1, -0.6]], 0xb04a30);
      pel.position.z = s * 0.12;
      root.add(pel);
    }
    // môi dày, nắp mang
    blob(root, solid(0x8f7c62), 1.0, -0.08, 0, 0.1, 0.07, 0.15);
    blob(root, solid(0x7a6a52), 0.97, -0.17, 0, 0.09, 0.05, 0.13);
    for (const s of [1, -1]) tube(root, solid(0x2e3424), [[0.42, 0.38, s * 0.36], [0.34, 0.05, s * 0.42], [0.4, -0.3, s * 0.37]], 0.015, 10);
    realEye(root, 0.74, 0.16, 0.27, 0.11, 0xd98a2a, { up: 0.1 });
    return { root, body, tail: tailG, tex: { kind: 'scales', size: 0.07 }, look: { roughness: 0.42, metalness: 0.15 } };
  },

  // 7. Cá rồng: thân dài đỏ cam ánh kim, vảy to viền vàng, vây lưng & hậu môn dồn về đuôi, miệng hếch có râu
  arowana() {
    const root = new THREE.Group();
    const RED = 0xd8301e;
    const tailG = new THREE.Group();
    tailG.position.x = -1.1;
    tailG.add(finMesh([[0, 0.16], [-0.5, 0.62], [-0.82, 0.25], [-0.9, 0], [-0.82, -0.25], [-0.5, -0.62], [0, -0.16]], RED));
    finRays(tailG, [0, 0], [[-0.7, 0.42], [-0.84, 0.18], [-0.88, 0], [-0.84, -0.18], [-0.7, -0.42]], 0x8c1a10);
    root.add(tailG);
    root.add(finMesh([[-0.38, 0.4], [-0.9, 0.78], [-1.22, 0.3], [-1.12, 0.24], [-1.02, 0.18]], RED));
    root.add(finMesh([[-0.2, -0.4], [-0.85, -0.88], [-1.22, -0.3], [-1.12, -0.24], [-1.02, -0.18]], RED));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.32, h: 0.46, w: 0.34, nose: 0.42, tail: 0.75, back: 0x7a1608, mid: 0xe2472a, belly: 0xf3c69a,
        pattern: (c, X, Y, Z, t) => {
          if (t > 0.55) c.lerp(col(0xff9a50), 0.12 * (1 + Math.sin(X * 25)));
        },
      }),
      bodyMat(),
    );
    root.add(body);
    // miệng hếch + đôi râu cằm
    tube(root, solid(0x7a1608), [[1.2, 0.02, 0.0], [1.08, -0.12, 0.12], [0.88, -0.2, 0.16]], 0.022, 8);
    tube(root, solid(0x7a1608), [[1.2, 0.02, 0.0], [1.08, -0.12, -0.12], [0.88, -0.2, -0.16]], 0.022, 8);
    const barb = solid(0xf0b040);
    for (const s of [0.06, -0.06]) tube(root, barb, [[1.18, 0.0, s], [1.38, -0.04, s * 1.6], [1.52, -0.16, s * 2.4]], 0.022, 8, 5);
    for (const s of [1, -1]) {
      const pec = finMesh([[0.6, -0.2], [0.2, -0.55], [-0.2, -0.72], [0.25, -0.42], [0.55, -0.34]], RED);
      pec.position.z = s * 0.27;
      pec.rotation.y = s * 0.45;
      root.add(pec);
    }
    realEye(root, 0.92, 0.17, 0.2, 0.1, 0xe8b040, { up: 0.3 });
    return { root, body, tail: tailG, tex: { kind: 'bigscales', size: 0.1 }, look: { roughness: 0.25, metalness: 0.5 } };
  },

  // 8. Cá ngựa: giáp đốt vàng kim xen mảng xanh than, vương miện gai, mõm dài, đuôi cuộn, vây lưng quạt
  seahorse() {
    const root = new THREE.Group();
    const GOLD = solid(0xd8a440);
    const DARK = solid(0x24304e);
    const RIDGE = solid(0xf0c460);
    const trunk = blob(root, GOLD, 0.05, 0, 0, 0.4, 0.6, 0.36);
    // mảng giáp xanh than hai bên sườn + lưng
    for (const s of [1, -1]) blob(root, DARK, -0.06, 0.05, s * 0.12, 0.3, 0.5, 0.26);
    blob(root, GOLD, 0.2, -0.05, 0, 0.3, 0.5, 0.3);
    for (let i = 0; i < 7; i++) {
      const y = -0.5 + i * 0.16;
      const r = Math.sqrt(Math.max(0.05, 1 - (y / 0.62) ** 2));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, LOD ? 12 : 24), RIDGE);
      ring.scale.set(0.42 * r, 0.38 * r, 0.38 * r);
      ring.position.set(0.05, y, 0);
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
      if (!LOD) for (const s of [1, -1]) cone(root, RIDGE, 0.035, 0.12, [-0.3 * r, y, s * 0.2 * r], [-1, 0.2, s * 0.6], 4);
    }
    blob(root, solid(0xb8382a), -0.12, -0.25, 0.25, 0.14, 0.12, 0.08); // mảng đỏ trên sườn
    blob(root, solid(0xb8382a), -0.12, -0.25, -0.25, 0.14, 0.12, 0.08);
    // cổ + đầu
    blob(root, GOLD, 0.1, 0.55, 0, 0.26, 0.26, 0.24);
    for (const s of [1, -1]) blob(root, DARK, 0.06, 0.58, s * 0.1, 0.18, 0.2, 0.18);
    blob(root, GOLD, 0.22, 0.74, 0, 0.3, 0.25, 0.25);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.62, 10), GOLD);
    snout.rotation.z = Math.PI / 2 + 0.25;
    snout.position.set(0.72, 0.62, 0);
    root.add(snout);
    blob(root, GOLD, 0.99, 0.55, 0, 0.06, 0.05, 0.06);
    // vương miện gai
    for (let i = 0; i < 5; i++) cone(root, RIDGE, 0.045, 0.24 + (i % 2) * 0.08, [0.1 + i * 0.07, 0.9, 0], [0.15 - i * 0.05, 1, 0], 5);
    // gai dọc sống lưng
    for (let i = 0; i < (LOD ? 4 : 9); i++) {
      const y = 0.45 - i * 0.12;
      cone(root, RIDGE, 0.03, 0.14, [-0.36 + Math.abs(y) * 0.1, y, 0], [-1, 0.25, 0], 4);
    }
    // đuôi cuộn có đốt
    const tailPts = [[0.05, -0.55, 0], [-0.08, -0.85, 0], [-0.35, -1.0, 0], [-0.6, -0.86, 0], [-0.62, -0.62, 0], [-0.45, -0.52, 0], [-0.32, -0.64, 0]];
    tube(root, GOLD, tailPts, 0.12, 30, 8);
    if (!LOD) {
      const curve = new THREE.CatmullRomCurve3(tailPts.map((p) => new THREE.Vector3(...p)));
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        const pt = curve.getPoint(t);
        const tg = curve.getTangent(t);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12 * (1 - t * 0.45), 0.03, 4, 12), i % 2 ? DARK : RIDGE);
        ring.position.copy(pt);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg);
        root.add(ring);
      }
    }
    // vây lưng hình quạt xanh viền cam
    const fan = finMesh([[-0.32, 0.2], [-0.78, 0.25], [-0.8, -0.05], [-0.7, -0.3], [-0.34, -0.22]], 0x2f4a8a);
    root.add(fan);
    finRays(root, [-0.34, -0.02], [[-0.76, 0.2], [-0.8, 0.05], [-0.78, -0.12], [-0.7, -0.26]], 0xf0a040, 0.012);
    realEye(root, 0.3, 0.8, 0.2, 0.09, 0xe07a2a, { up: 0.1 });
    return { root, body: trunk, tail: null, upright: true, look: { roughness: 0.3, metalness: 0.55 } };
  },
};

// ---------- phong cách HOẠT HÌNH (giống video tham khảo): thân tròn mềm, mắt to có mí chớp ----------
const BROW = toon({ color: 0x2a1a1e });
const TOON_EYE = toon({ color: 0xffffff, roughness: 0.25 });
let EYES = []; // mắt đăng ký trong lúc dựng mô hình (để gắn mí mắt riêng cho từng con)

/**
 * Mắt hoạt hình to đặt cao trên đầu (camera nhìn từ trên vẫn thấy rõ): tròng trắng lớn,
 * con ngươi đen, 2 điểm sáng; lid = màu mí mắt; rest = độ khép mí khi bình thường (0 mở to … 1 nhắm).
 */
function eyes(group, x, y, r, zAt, { angry = false, browTilt = 0.45, lid = 0x777777, rest = 0, look = 0.32, tilt = 0.35 } = {}) {
  const R = r * 1.2;
  for (const s of [1, -1]) {
    const e = new THREE.Group();
    e.position.set(x, y + r * 0.32, s * zAt * 0.94);
    e.rotation.x = -s * tilt; // nghiêng mắt hướng lên trên
    const white = new THREE.Mesh(SPHERE, TOON_EYE);
    white.scale.set(R, R * 1.15, R * 0.68);
    const pupil = new THREE.Mesh(SPHERE, PUPIL);
    pupil.scale.set(R * 0.5, R * 0.6, R * 0.4);
    pupil.position.set(R * look, R * 0.02, s * R * 0.4);
    const shine = new THREE.Mesh(SPHERE, SHINE);
    shine.scale.setScalar(R * 0.2);
    shine.position.set(R * (look + 0.12), R * 0.26, s * R * 0.68);
    const shine2 = new THREE.Mesh(SPHERE, SHINE);
    shine2.scale.setScalar(R * 0.08);
    shine2.position.set(R * (look - 0.1), -R * 0.22, s * R * 0.7);
    e.add(white, pupil, shine, shine2);
    if (angry) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(R * 1.75, R * 0.36, R * 0.42), BROW);
      brow.position.set(R * 0.05, R * 1.02, s * R * 0.18);
      brow.rotation.z = -browTilt;
      e.add(brow);
    }
    group.add(e);
    EYES.push({ obj: e, R, lid, rest, side: s });
  }
}

/** Đường miệng tối ở hai bên mõm. */
function mouthLine(group, x, y, zAt, len = 0.22) {
  const m = solid(0x2a1420);
  for (const s of [1, -1]) {
    const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, len, 3, 6), m);
    g.rotation.z = Math.PI / 2 + 0.35;
    g.position.set(x, y, s * zAt);
    group.add(g);
  }
}

const MODELS_TOON = {
  // cá kiếm xanh dương mũm mĩm, vây buồm xanh đậm, đuôi trăng khuyết, mí mắt khép hờ (vẻ lì lợm)
  swordfish() {
    const root = new THREE.Group();
    const FIN = 0x1c3f8f;
    const tailG = new THREE.Group();
    tailG.position.x = -1.02;
    tailG.add(finMesh([[0, 0.1], [-0.35, 0.45], [-0.78, 0.95], [-0.5, 0.35], [-0.42, 0], [-0.5, -0.35], [-0.78, -0.95], [-0.35, -0.45], [0, -0.1]], FIN, { depth: 0.08 }));
    root.add(tailG);
    root.add(finMesh([[0.3, 0.42], [0.1, 1.25], [-0.35, 1.2], [-0.35, 0.75], [-0.72, 0.34]], FIN, { depth: 0.07 }));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.12, h: 0.56, w: 0.5, nose: 0.42, tail: 0.95, back: 0x1f56b8, mid: 0x4a92e0, belly: 0xe6f1fc,
        top: (x) => 1 + 0.12 * Math.max(0, 1 - Math.abs(x - 0.3) * 1.8),
        pattern: (c, X, Y, Z, t) => {
          if (t > 0.5 && t < 0.85 && Math.sin(X * 9) > 0.75) c.lerp(col(0x16418f), 0.35); // vạch sọc tối trên lưng
        },
      }),
      bodyMat(),
    );
    root.add(body);
    // mỏ dài thon (chuôi kiếm gắn ở đầu mỏ)
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.72, 10), solid(0x2a5fb8));
    bill.rotation.z = -Math.PI / 2;
    bill.position.set(1.38, -0.04, 0);
    root.add(bill);
    for (const s of [1, -1]) {
      const pec = finMesh([[0.4, -0.12], [0.08, -0.42], [-0.32, -0.6], [0.05, -0.32], [0.38, -0.26]], FIN, { depth: 0.06 });
      pec.position.z = s * 0.4;
      pec.rotation.y = s * 0.45;
      root.add(pec);
    }
    mouthLine(root, 0.9, -0.16, 0.24);
    eyes(root, 0.66, 0.18, 0.19, 0.32, { lid: 0x2a63c4, rest: 0.42, look: 0.36 });
    return { root, body, tail: tailG, look: { roughness: 0.42 } };
  },

  // cá nóc vàng tròn xoe, đốm cam nâu, gai nhỏ, mắt lồi tròn xoe, miệng chu "ô" hồng
  pufferfish() {
    const root = new THREE.Group();
    const FIN = 0xf2b51c;
    const tailG = new THREE.Group();
    tailG.position.x = -0.9;
    tailG.add(finMesh([[0, 0.15], [-0.32, 0.5], [-0.52, 0.34], [-0.6, 0], [-0.52, -0.34], [-0.32, -0.5], [0, -0.15]], FIN, { depth: 0.08 }));
    root.add(tailG);
    root.add(finMesh([[-0.4, 0.8], [-0.66, 1.08], [-0.8, 0.66]], FIN));
    const body = new THREE.Mesh(bodyGeometry({ len: 1.0, h: 0.9, w: 0.92, nose: 0.1, tail: 0.25, back: 0xf0b21a, mid: 0xffd23f, belly: 0xfff3c4 }), bodyMat());
    root.add(body);
    const spotMat = solid(0xc77a1a);
    for (const [x, y] of [[-0.45, 0.55], [-0.1, 0.78], [0.25, 0.62], [-0.72, 0.18], [-0.32, 0.32], [0.08, 0.38], [-0.55, -0.15], [0.35, 0.2]]) {
      for (const s of [1, -1]) {
        const zz = Math.sqrt(Math.max(0.02, 1 - x * x - (y / 0.9) ** 2)) * 0.92;
        blob(root, spotMat, x, y, s * zz, 0.075, 0.075, 0.03);
      }
    }
    // gai nhỏ màu kem
    const nub = new THREE.ConeGeometry(0.045, 0.16, 4);
    const nubMat = solid(0xfff0c8);
    for (let i = 0; i < (LOD ? 0 : 40); i++) {
      const yy = 0.88 - (i / 40) * 1.7;
      const rr = Math.sqrt(Math.max(0, 1 - (yy / 0.92) ** 2));
      const a = i * 2.39996;
      const v = new THREE.Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr * 0.92);
      if (v.x > 0.6 && Math.abs(v.y) < 0.45) continue;
      const m = new THREE.Mesh(nub, nubMat);
      m.position.copy(v);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
      root.add(m);
    }
    // miệng chu "ô"
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.055, 10, 18), solid(0xf48aa0));
    mouth.position.set(0.99, -0.1, 0);
    mouth.rotation.y = Math.PI / 2;
    root.add(mouth);
    blob(root, solid(0x6b1a2a), 1.0, -0.1, 0, 0.03, 0.07, 0.07);
    for (const s of [1, -1]) {
      const pec = finMesh([[0.3, 0.05], [0.05, 0.22], [0, -0.15], [0.12, -0.32], [0.3, -0.18]], FIN);
      pec.position.z = s * 0.86;
      pec.rotation.y = s * 0.6;
      root.add(pec);
    }
    eyes(root, 0.52, 0.34, 0.29, 0.58, { lid: 0xf0b21a, rest: 0, look: 0.3 });
    return { root, body, tail: tailG, look: { roughness: 0.45 } };
  },

  // piranha đỏ tròn, vây xanh tím, hàm răng trắng nhô ra, mày cau
  piranha() {
    const root = new THREE.Group();
    const FIN = 0x4f4fb0;
    const tailG = new THREE.Group();
    tailG.position.x = -0.9;
    tailG.add(finMesh([[0, 0.15], [-0.4, 0.55], [-0.7, 0.68], [-0.5, 0], [-0.7, -0.68], [-0.4, -0.55], [0, -0.15]], FIN, { depth: 0.08 }));
    root.add(tailG);
    root.add(finMesh([[0.15, 0.82], [-0.2, 1.32], [-0.62, 0.7]], FIN, { depth: 0.07 }));
    root.add(finMesh([[-0.1, -0.78], [-0.4, -1.12], [-0.62, -0.62]], FIN, { depth: 0.07 }));
    const body = new THREE.Mesh(bodyGeometry({ len: 0.98, h: 0.95, w: 0.86, nose: 0.12, tail: 0.6, back: 0xc4161f, mid: 0xec3b3b, belly: 0xff8f7a }), bodyMat());
    root.add(body);
    // vảy đốm tối trên lưng
    const dot = solid(0x9c0f18);
    for (let i = 0; i < (LOD ? 0 : 14); i++) {
      const a = i * 2.4;
      const x = -0.55 + ((i * 37) % 100) / 100;
      const y = 0.3 + ((i * 53) % 50) / 100;
      const zz = Math.sqrt(Math.max(0.02, 1 - (x / 0.98) ** 2 - (y / 0.95) ** 2)) * 0.86;
      blob(root, dot, x, y, Math.sign(Math.sin(a)) * zz, 0.05, 0.05, 0.02);
    }
    // miệng nhe răng: hàm dưới chìa, răng to trắng
    blob(root, solid(0x3a0610), 0.76, -0.28, 0, 0.28, 0.24, 0.55);
    blob(root, solid(0xd84860), 0.8, -0.42, 0, 0.18, 0.08, 0.34);
    const cone = new THREE.ConeGeometry(0.07, 0.2, 4);
    for (let i = 0; i < 6; i++) {
      const zz = -0.4 + i * 0.16;
      const up = new THREE.Mesh(cone, TOOTH);
      up.position.set(0.98 - zz * zz * 0.9, -0.1, zz);
      up.rotation.z = Math.PI;
      root.add(up);
      const dn = new THREE.Mesh(cone, TOOTH);
      dn.position.set(0.96 - zz * zz * 0.9, -0.46, zz);
      root.add(dn);
    }
    for (const s of [1, -1]) {
      const pec = finMesh([[0.3, -0.1], [0.0, -0.25], [-0.15, -0.45], [0.1, -0.4], [0.3, -0.28]], FIN);
      pec.position.z = s * 0.58;
      pec.rotation.y = s * 0.5;
      root.add(pec);
    }
    eyes(root, 0.48, 0.42, 0.22, 0.58, { angry: true, browTilt: 0.6, lid: 0xc4161f, rest: 0.2, look: 0.36 });
    return { root, body, tail: tailG, look: { roughness: 0.45 } };
  },

  // cá đuối tím-xanh có chấm trắng, đuôi roi dài, mắt to khép hờ trên lưng
  stingray() {
    const root = new THREE.Group();
    const flat = new THREE.Group();
    flat.rotation.x = -Math.PI / 2;
    root.add(flat);
    const g = new THREE.SphereGeometry(1, LOD ? 24 : 48, LOD ? 12 : 24);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      const z = p.getZ(i);
      const ay = Math.abs(y);
      const wing = 1 + 0.3 * Math.pow(ay, 3);
      x = x * (x > 0 ? 0.95 : 0.85) - 0.18 * ay * ay;
      y *= 1.18 * wing;
      const Z = z * (z > 0 ? 0.32 : 0.14);
      p.setXYZ(i, x, y, Z);
      if (z > 0) c.set(0x6f6ee0).lerp(col(0x3d3aa8), Math.min(1, Math.hypot(x, y) * 0.75));
      else c.set(0xe8e6ff);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const body = new THREE.Mesh(g, bodyMat());
    flat.add(body);
    // chấm trắng
    const spotMat = solid(0xf3f1ff);
    for (let i = 0; i < (LOD ? 12 : 34); i++) {
      const a = i * 2.39996;
      const d = 0.18 + ((i * 41) % 75) / 100;
      const x = Math.cos(a) * d * 0.85;
      const y = Math.sin(a) * d * 1.15;
      const zz = 0.32 * Math.sqrt(Math.max(0, 1 - (x * x) / 0.85 - (y * y) / 1.5)) + 0.012;
      if (x > 0.3 && Math.abs(y) < 0.45) continue; // chừa chỗ mắt
      blob(flat, spotMat, x, y, zz, 0.045, 0.045, 0.015);
    }
    // đuôi roi dài mảnh
    const tailG = new THREE.Group();
    tailG.position.set(-0.78, 0.04, 0);
    tube(tailG, solid(0x3d3aa8), [[0, 0, 0], [-0.5, 0.02, 0], [-1.0, 0.03, 0], [-1.5, 0.03, 0]], 0.045, 16, 6);
    cone(tailG, solid(0x3d3aa8), 0.035, 0.3, [-1.5, 0.03, 0], [-1, 0, 0], 5);
    root.add(tailG);
    eyes(root, 0.48, 0.18, 0.16, 0.24, { lid: 0x5d5bd0, rest: 0.38, look: 0.3, tilt: 0.9 });
    return { root, body, tail: tailG, topDown: true, look: { roughness: 0.4 } };
  },

  shark() {
    const root = new THREE.Group();
    const FIN = 0x3d5a7a;
    const tailG = new THREE.Group();
    tailG.position.x = -1.1;
    tailG.add(finMesh([[0, 0.12], [-0.4, 0.5], [-0.9, 1.05], [-0.65, 0.35], [-0.52, 0.02], [-0.6, -0.25], [-0.68, -0.55], [-0.3, -0.3], [0, -0.1]], FIN, { depth: 0.08 }));
    root.add(tailG);
    root.add(finMesh([[0.1, 0.5], [-0.15, 1.0], [-0.45, 1.42], [-0.45, 0.9], [-0.65, 0.46]], FIN, { depth: 0.07 }));
    const body = new THREE.Mesh(bodyGeometry({ len: 1.25, h: 0.6, w: 0.56, nose: 0.6, tail: 0.92, back: 0x4a6f96, mid: 0x8fb2d4, belly: 0xf6fafc }), bodyMat());
    root.add(body);
    // đầu búa tròn mềm, mắt ở hai đầu búa
    blob(root, solid(0x557ba3), 1.0, 0.1, 0, 0.3, 0.14, 0.88);
    blob(root, solid(0xeaf2f9), 0.99, 0.0, 0, 0.27, 0.08, 0.82);
    blob(root, solid(0x5a1020), 0.8, -0.24, 0, 0.26, 0.1, 0.32);
    const cone2 = new THREE.ConeGeometry(0.045, 0.12, 4);
    for (let i = 0; i < 6; i++) {
      const zz = -0.27 + i * 0.108;
      const m = new THREE.Mesh(cone2, TOOTH);
      m.position.set(0.94 - Math.abs(zz) * 0.3, -0.17, zz);
      m.rotation.z = Math.PI;
      root.add(m);
    }
    for (const s of [1, -1]) {
      const pec = finMesh([[0.35, -0.3], [0.1, -0.7], [-0.2, -0.98], [0.05, -0.55], [0.05, -0.38]], FIN);
      pec.position.z = s * 0.36;
      pec.rotation.y = s * 0.5;
      root.add(pec);
    }
    eyes(root, 0.92, 0.04, 0.16, 0.86, { angry: true, lid: 0x557ba3, rest: 0.15, look: 0.3 });
    return { root, body, tail: tailG, look: { roughness: 0.42 } };
  },

  tilapia() {
    const root = new THREE.Group();
    const tailG = new THREE.Group();
    tailG.position.x = -0.95;
    tailG.add(finMesh([[0, 0.22], [-0.6, 0.6], [-0.67, 0], [-0.6, -0.6], [0, -0.22]], 0xef6c4a, { depth: 0.08 }));
    root.add(tailG);
    root.add(finMesh([[0.55, 0.6], [0.2, 1.0], [-0.4, 0.98], [-0.95, 0.92], [-1.15, 0.4], [-1.0, 0.38], [-0.9, 0.35]], 0x2e7d4f, { depth: 0.07 }));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.05, h: 0.74, w: 0.5, nose: 0.3, tail: 0.75, back: 0x2e8a52, mid: 0x6cc782, belly: 0xf0f9ea,
        pattern: (c, X, Y, Z, t) => {
          if (t > 0.4 && Math.sin(X * 10) > 0.65) c.multiplyScalar(0.82);
        },
      }),
      bodyMat(),
    );
    root.add(body);
    for (const s of [1, -1]) {
      const pec = finMesh([[0.45, -0.12], [0.05, -0.2], [-0.15, -0.45], [0.15, -0.4], [0.45, -0.28]], 0xef6c4a);
      pec.position.z = s * 0.34;
      pec.rotation.y = s * 0.45;
      root.add(pec);
    }
    blob(root, solid(0xd84a4a), 1.0, -0.06, 0, 0.09, 0.07, 0.17);
    mouthLine(root, 0.96, -0.12, 0.22, 0.16);
    eyes(root, 0.68, 0.2, 0.2, 0.34, { lid: 0x2e8a52, rest: 0.1 });
    return { root, body, tail: tailG, look: { roughness: 0.45 } };
  },

  arowana() {
    const root = new THREE.Group();
    const RED = 0xff6d3a;
    const tailG = new THREE.Group();
    tailG.position.x = -1.1;
    tailG.add(finMesh([[0, 0.15], [-0.5, 0.55], [-0.75, 0.2], [-0.85, 0], [-0.75, -0.2], [-0.5, -0.55], [0, -0.15]], RED, { depth: 0.08 }));
    root.add(tailG);
    root.add(finMesh([[-0.4, 0.42], [-0.95, 0.75], [-1.25, 0.3], [-1.15, 0.24], [-1.05, 0.18]], RED));
    root.add(finMesh([[-0.25, -0.42], [-0.9, -0.85], [-1.25, -0.3], [-1.15, -0.24], [-1.05, -0.18]], RED));
    const body = new THREE.Mesh(
      bodyGeometry({
        len: 1.3, h: 0.52, w: 0.44, nose: 0.4, tail: 0.75, back: 0xd8401f, mid: 0xff8a3d, belly: 0xffe9c4,
        pattern: (c, X, Y) => {
          const u = X / 0.22 + (Math.floor(Y / 0.2) % 2 ? 0.5 : 0);
          const v = Y / 0.2;
          if (u - Math.floor(u) < 0.12 || v - Math.floor(v) < 0.1) c.lerp(col(0xffd36b), 0.45);
        },
      }),
      bodyMat(),
    );
    root.add(body);
    const barb = solid(0xffb74d);
    for (const s of [0.07, -0.07]) tube(root, barb, [[1.12, 0.02, s], [1.38, -0.05, s * 1.6], [1.55, -0.2, s * 2.2]], 0.03, 8, 5);
    for (const s of [1, -1]) {
      const pec = finMesh([[0.6, -0.2], [0.2, -0.55], [-0.15, -0.72], [0.25, -0.42], [0.55, -0.34]], RED);
      pec.position.z = s * 0.3;
      pec.rotation.y = s * 0.45;
      root.add(pec);
    }
    mouthLine(root, 1.18, -0.06, 0.12, 0.18);
    eyes(root, 0.9, 0.2, 0.17, 0.26, { angry: true, browTilt: 0.3, lid: 0xd8401f, rest: 0.25 });
    return { root, body, tail: tailG, look: { roughness: 0.35, metalness: 0.2 } };
  },

  seahorse() {
    const root = new THREE.Group();
    const mat = solid(0xffa040);
    const dark = solid(0xe0661c);
    const trunk = blob(root, mat, 0.05, 0, 0, 0.42, 0.62, 0.38);
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 5, LOD ? 12 : 22), dark);
      const y = -0.45 + i * 0.17;
      const r = Math.sqrt(Math.max(0.05, 1 - (y / 0.62) ** 2));
      ring.scale.set(0.42 * r, 0.38 * r, 0.38 * r);
      ring.position.set(0.05, y, 0);
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
    }
    blob(root, mat, 0.18, 0.7, 0, 0.32, 0.28, 0.27);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 10), mat);
    snout.rotation.z = Math.PI / 2 + 0.08;
    snout.position.set(0.7, 0.66, 0);
    root.add(snout);
    for (let i = 0; i < 4; i++) cone(root, dark, 0.07, 0.24, [0.02 + i * 0.08, 0.92 + (i % 2) * 0.05, 0], [0, 1, 0], 5);
    tube(root, mat, [[0.05, -0.55, 0], [-0.15, -0.9, 0], [-0.5, -0.92, 0], [-0.62, -0.68, 0], [-0.45, -0.52, 0], [-0.32, -0.64, 0]], 0.12, 26, 8);
    root.add(finMesh([[-0.32, 0.15], [-0.75, 0.05], [-0.36, -0.25]], 0xffd180));
    eyes(root, 0.28, 0.78, 0.16, 0.22, { lid: 0xffa040, rest: 0.15 });
    return { root, body: trunk, tail: null, upright: true, look: { roughness: 0.45 } };
  },
};

// ---------- biên dịch mô hình: gộp khối đặc thành 1 mesh màu theo đỉnh ----------
function bake(mesh, relTo, withColor = false, uv = null) {
  mesh.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4().copy(relTo.matrixWorld).invert().multiply(mesh.matrixWorld);
  let g = mesh.geometry.clone().applyMatrix4(m);
  if (g.index) g = g.toNonIndexed();
  const keepUv = uv === 'keep';
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color' && !(keepUv && name === 'uv')) g.deleteAttribute(name);
  if (Array.isArray(uv)) {
    // mọi khối không phải thân lấy UV tại ô trắng của texture → giữ nguyên màu
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      arr[i * 2] = uv[0];
      arr[i * 2 + 1] = uv[1];
    }
    g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  }
  g.clearGroups();
  if (withColor && !g.attributes.color) {
    const c = mesh.material.color || new THREE.Color(1, 1, 1);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

const isFin = (mat) => mat.side === THREE.DoubleSide;

function mergeByMaterial(list) {
  const byMat = new Map();
  for (const { geo, mat } of list) {
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geo);
  }
  return [...byMat].map(([mat, geos]) => ({ mat, geo: geos.length === 1 ? geos[0] : mergeGeometries(geos, false) }));
}

const TEMPLATES = new Map();
let TAIL_SOLID = null;
/** Vật liệu cho khối đặc nằm trong nhóm đuôi (màu theo đỉnh). */
function solidTailMat() {
  if (!TAIL_SOLID) TAIL_SOLID = toon({ vertexColors: true, roughness: 0.4 });
  return TAIL_SOLID;
}

function template(speciesId, lod) {
  const key = `${STYLE}:${speciesId}:${lod}`;
  if (TEMPLATES.has(key)) return TEMPLATES.get(key);
  LOD = lod;
  SPHERE = lod ? SPHERE_LO : SPHERE_HI;
  EYES = [];
  const set = STYLE === 'real' ? MODELS : MODELS_TOON;
  const model = (set[speciesId] || set.tilapia)();
  const root = model.root;
  root.updateMatrixWorld(true);
  // vị trí từng con mắt (so với gốc mô hình) để gắn mí mắt chớp riêng cho mỗi con cá
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const eyeList = lod ? [] : EYES.map((e) => ({ m: inv.clone().multiply(e.obj.matrixWorld), R: e.R, lid: e.lid, rest: e.rest, side: e.side }));
  EYES = [];
  const inTail = (o) => {
    for (let p = o; p; p = p.parent) if (p === model.tail) return true;
    return false;
  };
  // texture vảy/đốm trên thân: lặp theo chu vi & chiều cao thân để vảy có kích thước thật
  let map = null;
  let uvc = null;
  if (model.tex) {
    const dims = model.body.geometry.userData.dims || { len: 1, h: 0.6, w: 0.5 };
    const ru = Math.max(1, Math.round((2 * halfPerim(dims.len, dims.w)) / (2 * model.tex.size)));
    const rv = Math.max(1, Math.round(halfPerim(dims.h, dims.w) / (4 * model.tex.size * 0.6)));
    map = scaleTexture(model.tex.kind).clone();
    map.repeat.set(ru, rv);
    map.needsUpdate = true;
    uvc = [0.5 / ru, 0.5 / rv];
  }
  const solids = [bake(model.body, root, true, map ? 'keep' : null)];
  const stat = [];
  const tail = [];
  root.traverse((o) => {
    if (!o.isMesh || o === model.body) return;
    if (model.tail && inTail(o) && isFin(o.material)) tail.push({ geo: bake(o, model.tail), mat: o.material });
    else if (model.tail && inTail(o)) tail.push({ geo: bake(o, model.tail, true), mat: solidTailMat() });
    else if (isFin(o.material)) stat.push({ geo: bake(o, root), mat: o.material });
    else solids.push(bake(o, root, true, uvc));
  });
  const solid = solids;
  const bodyGeo = mergeGeometries(solid, false);
  bodyGeo.computeBoundingSphere();
  const t = {
    bodyGeo,
    bodyCenter: bodyGeo.boundingSphere.center.clone(),
    stat: mergeByMaterial(stat),
    tail: mergeByMaterial(tail),
    tailPos: model.tail ? model.tail.position.clone() : null,
    topDown: !!model.topDown,
    upright: !!model.upright,
    map,
    look: model.look || {},
    eyes: eyeList,
  };
  TEMPLATES.set(key, t);
  return t;
}

// ---------- mô hình 3D tự thêm (file .glb, ví dụ tạo bằng Meshy) ----------
// Mỗi loài một thư mục:  public/models/<loài>/model.glb · weapon.glb · config.json
// Biểu cảm dùng chung:  public/models/bieu-cam/ (chớp mắt, bị đánh, hết máu, choáng) + config.json
const CUSTOM = new Map();
const CUSTOM_DEFAULT = { rotY: Math.PI / 2, rotX: 0, rotZ: 0, scale: 1, y: 0, length: 2.4, eyes: null, lidColor: 0x777777, topDown: false };

// biểu cảm dùng chung cho mọi loài (ảnh dán lên vị trí mắt)
const EXPR = {
  size: 1,
  blink: { tex: null, min: 2, max: 5, dur: 0.16, tint: true },
  hurt: { tex: null, dur: 0.4, tint: true },
  dead: { tex: null, hold: 0.45, tint: false },
  stun: { tex: null, tint: false },
};

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    return r.ok && !(r.headers.get('content-type') || '').includes('html');
  } catch {
    return false;
  }
}

async function readJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json();
  } catch (err) {
    console.warn(`[Fish3D] ${url} sai định dạng JSON:`, err);
  }
  return {};
}

function parseColor(c, fallback) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c.trim())) return parseInt(c.trim().replace('#', ''), 16);
  return fallback;
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Nạp biểu cảm dùng chung (public/models/bieu-cam). Thiếu ảnh nào thì bỏ qua biểu cảm đó. */
async function loadExpressions() {
  const c = await readJson('models/bieu-cam/config.json');
  EXPR.size = num(c.kichThuoc, 1);
  const tl = new THREE.TextureLoader();
  const load = async (key, file) => {
    if (!file || !(await exists(`models/bieu-cam/${file}`))) return null;
    const t = await tl.loadAsync(`models/bieu-cam/${file}`);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const cm = c.chopMat || {};
  EXPR.blink = { tex: await load('blink', cm.anh ?? 'nham-mat.png'), min: num(cm.cachNhauTu, 2), max: num(cm.cachNhauDen, 5), dur: num(cm.thoiGian, 0.16), tint: cm.toMauDa !== false };
  const bd = c.biDanh || {};
  EXPR.hurt = { tex: await load('hurt', bd.anh ?? 'bi-danh.png'), dur: num(bd.thoiGian, 0.4), tint: bd.toMauDa !== false };
  const hm = c.hetMau || {};
  EXPR.dead = { tex: await load('dead', hm.anh ?? 'het-mau.png'), hold: num(hm.dungLai, 0.45), tint: hm.toMauDa === true };
  const ch = c.biChoang || {};
  EXPR.stun = { tex: await load('stun', ch.anh ?? 'choang.png'), tint: ch.toMauDa === true };
  EXPR_MATS.clear();
}

/** Đọc config.json của một loài (khóa tiếng Việt) → cấu hình mô hình & vũ khí. */
function speciesConfig(id, c) {
  const m = c.moHinh || {};
  const w = c.vuKhi || {};
  const e = c.mat || {};
  const r = num(e.banKinh, 0.1);
  const model = {
    ...CUSTOM_DEFAULT,
    file: m.file || 'model.glb',
    rotX: num(m.xoayX, 0),
    rotY: num(m.xoayY, Math.PI / 2),
    rotZ: num(m.xoayZ, 0),
    y: num(m.nangLen, 0),
    length: num(m.dai, 2.4),
    scale: num(m.toNho, 1),
    topDown: m.nhinTuTren ?? id === 'stingray',
    eyes: Array.isArray(e.viTri) ? e.viTri.map((p) => [num(p[0], 0), num(p[1], 0), num(p[2], 0), num(p[3], r)]) : null,
    lidColor: parseColor(e.mauMi, 0x777777),
  };
  const weapon = {
    ...WEAPON_DEFAULT,
    file: w.file || 'weapon.glb',
    flip: !!w.dao,
    rotX: num(w.xoayX, 0),
    rotY: num(w.xoayY, 0),
    rotZ: num(w.xoayZ, 0),
    length: num(w.dai, 1),
    thick: num(w.day, 1),
    offset: num(w.dayRa, 0),
    spin: num(w.tuXoay, 0),
    // "phai" / "trai": đặt bản vũ khí nằm phẳng (mặt rộng quay lên camera) và mũi cong chĩa sang phải/trái;
    // "xoay": mũi cong luôn chĩa theo chiều xoay của vũ khí (lật lại mỗi khi vũ khí đổi chiều)
    curve: ['phai', 'trai', 'xoay'].includes(w.huongMui) ? w.huongMui : null,
  };
  return { model, weapon };
}

/** Nạp mô hình, vũ khí từng loài + biểu cảm dùng chung. Thiếu file nào thì dùng phần dựng sẵn. */
export async function loadCustomModels(ids, onProgress = null) {
  const loader = new GLTFLoader();
  const jobs = ids.map(async (id) => {
    const dir = `models/${id}`;
    const { model, weapon } = speciesConfig(id, await readJson(`${dir}/config.json`));
    // chấp nhận nhiều cách đặt tên: model.glb hoặc <loài>.glb; weapon.glb, <loài>_weapon.glb hoặc vu-khi.glb
    const pick = async (names) => {
      for (const n of [...new Set(names)]) if (await exists(`${dir}/${n}`)) return n;
      return null;
    };
    const mFile = await pick([model.file, 'model.glb', `${id}.glb`]);
    const wFile = await pick([weapon.file, 'weapon.glb', `${id}_weapon.glb`, `${id}-weapon.glb`, 'vu-khi.glb']);
    if (mFile) {
      try {
        onProgress?.({ id, file: mFile, phase: 'start' });
        const gltf = await loader.loadAsync(`${dir}/${mFile}`);
        CUSTOM.set(id, prepareCustom(gltf.scene, model));
        console.info(`[Fish3D] đã nạp mô hình: ${dir}/${mFile}`);
        onProgress?.({ id, file: mFile, phase: 'done' });
      } catch (err) {
        console.warn(`[Fish3D] không nạp được ${dir}/${mFile}:`, err);
        onProgress?.({ id, file: mFile, phase: 'error' });
      }
    }
    if (wFile) {
      try {
        const gltf = await loader.loadAsync(`${dir}/${wFile}`);
        const type = SPECIES.find((sp) => sp.id === id)?.weapon;
        CUSTOM_W.set(id, prepareWeapon(gltf.scene, weapon, type, id));
        console.info(`[Fish3D] đã nạp vũ khí: ${dir}/${wFile}`);
      } catch (err) {
        console.warn(`[Fish3D] không nạp được ${dir}/${wFile}:`, err);
      }
    }
  });
  await Promise.all([...jobs, loadExpressions().catch((err) => console.warn('[Fish3D] lỗi nạp biểu cảm:', err))]);
  TEMPLATES.clear();
  return [...CUSTOM.keys()];
}

// vật liệu ảnh biểu cảm, theo (trạng thái, màu da)
const EXPR_MATS = new Map();
function exprMat(state, tint) {
  const e = EXPR[state];
  if (!e || !e.tex) return null;
  // tô theo màu da nhưng sáng hơn một chút để nét vẽ (mi mắt, nếp nhăn) vẫn nổi trên da tối màu
  const color = e.tint ? col(tint).lerp(col(0xffffff), 0.35).getHex() : 0xffffff;
  const key = `${state}:${color}`;
  let m = EXPR_MATS.get(key);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: e.tex, color, transparent: true, depthWrite: false });
    EXPR_MATS.set(key, m);
  }
  return m;
}

/** Ảnh biểu cảm (sprite luôn quay về camera) gắn tại một con mắt. */
function faceSprite(holder, size, offset) {
  const sp = new THREE.Sprite();
  sp.visible = false;
  sp.position.copy(offset);
  sp.scale.setScalar(size * EXPR.size);
  sp.renderOrder = 5;
  holder.add(sp);
  return sp;
}

// vũ khí tự thêm: chuẩn hóa thành một "thanh" nằm dọc trục +x từ 0 (chuôi, sát thân cá) đến 1 (mũi)
const CUSTOM_W = new Map();
/** Hệ số phóng to hình vũ khí của một loài (src/appsettings.js → FISH_SIZES.weaponScale / weaponPerSpecies). */
function weaponVisualScale(speciesId) {
  return (FISH_SIZES.weaponScale ?? 1) * (FISH_SIZES.weaponPerSpecies?.[speciesId] ?? 1);
}

const WEAPON_DEFAULT = { flip: false, rotX: 0, rotY: 0, rotZ: 0, thick: 1, length: 1, offset: 0, spin: 0, curve: null };

/** Lệch ngang (trục z) của phần mũi (25% ngoài cùng dọc trục x) so với giữa vũ khí, trong hệ tọa độ của `root`. */
function tipSideZ(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const box = new THREE.Box3().setFromObject(root);
  const cut = box.max.x - (box.max.x - box.min.x) * 0.25;
  const mid = (box.min.z + box.max.z) / 2;
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let sum = 0;
  let n = 0;
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry.attributes.position;
    if (!pos) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.x < cut) continue;
      sum += v.z - mid;
      n++;
    }
  });
  return n ? sum / n : 0;
}

// Loại vũ khí có mũi là ĐẦU NHẸ (lưỡi kiếm mảnh, chóp gai, mũi trượng điện); các loại khác (chùy, dao to bản, giáo,
// móc) có đầu nặng là phần đánh → đầu nặng phải hướng ra ngoài.
const LIGHT_TIP = new Set(['sword', 'spikes', 'electric']);

/** Độ "nặng" (tổng diện tích mặt cắt) của nửa âm và nửa dương dọc trục x trong hệ tọa độ của `root`. */
function weaponBulk(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const box = new THREE.Box3().setFromObject(root);
  const N = 16;
  const lo = box.min.x;
  const len = Math.max(box.max.x - lo, 1e-6);
  const sl = Array.from({ length: N }, () => ({ y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity }));
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry.attributes.position;
    if (!pos) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const s = sl[Math.min(N - 1, Math.max(0, Math.floor(((v.x - lo) / len) * N)))];
      if (v.y < s.y0) s.y0 = v.y;
      if (v.y > s.y1) s.y1 = v.y;
      if (v.z < s.z0) s.z0 = v.z;
      if (v.z > s.z1) s.z1 = v.z;
    }
  });
  const area = sl.map((s) => (s.y1 > s.y0 ? (s.y1 - s.y0) * (s.z1 - s.z0) : 0));
  const half = (a, b) => area.slice(a, b).reduce((x, y) => x + y, 0);
  return { neg: half(0, N / 2), pos: half(N / 2, N) };
}

function prepareWeapon(scene, cfg, type = null, id = '') {
  const inner = new THREE.Group();
  inner.add(scene);
  scene.rotation.set(cfg.rotX, cfg.rotY, cfg.rotZ);
  inner.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(inner);
  let size = box.getSize(new THREE.Vector3());
  // tự xoay trục dài nhất về trục x
  const outer = new THREE.Group();
  outer.add(inner);
  if (size.z >= size.x && size.z >= size.y) outer.rotation.y = Math.PI / 2;
  else if (size.y >= size.x && size.y >= size.z) outer.rotation.z = -Math.PI / 2;
  // tự nhận đầu mũi: kiếm/gai → đầu nhẹ ra ngoài, loại khác → đầu nặng ra ngoài (+x = hướng ra ngoài thân cá)
  const probe = new THREE.Group();
  probe.add(outer);
  const { neg, pos } = weaponBulk(probe);
  probe.remove(outer);
  const ratio = Math.max(neg, pos) / Math.max(1e-9, Math.min(neg, pos));
  let reverse = false;
  if (ratio > 1.15) {
    const heavyOut = pos > neg;
    reverse = LIGHT_TIP.has(type) ? heavyOut : !heavyOut;
  }
  if (reverse) {
    outer.rotation.y += Math.PI;
    console.info(`[Fish3D] vũ khí ${id}: tự đảo để mũi hướng ra ngoài`);
  }
  if (cfg.flip) outer.rotation.y += Math.PI; // "dao": true trong config.json → đảo thêm nếu tự nhận sai
  // "huongMui": lăn quanh trục dọc để bản rộng nằm ngang (thấy rõ từ camera nhìn xuống), mũi cong sang phải/trái
  const roller = new THREE.Group();
  roller.add(outer);
  if (cfg.curve) {
    const probe2 = new THREE.Group();
    probe2.add(roller);
    let sz = new THREE.Box3().setFromObject(probe2).getSize(new THREE.Vector3());
    if (sz.y > sz.z) roller.rotation.x = Math.PI / 2;
    // bên phải hướng chĩa ra (+x, nhìn từ trên xuống) là +z
    const side = tipSideZ(probe2);
    // "xoay" dựng như "phai" (+z = phía vũ khí quay tới khi weaponDir > 0); Weapon3D lật lại khi đổi chiều
    const right = cfg.curve !== 'trai';
    if ((right && side < 0) || (!right && side > 0)) roller.rotation.x += Math.PI;
    probe2.remove(roller);
  }
  const top = new THREE.Group();
  top.add(roller);
  top.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(top);
  size = box.getSize(new THREE.Vector3());
  const k = 1 / Math.max(size.x, 1e-6);
  const holder = new THREE.Group();
  top.position.set(-box.min.x * k, -(box.min.y + size.y / 2) * k, -(box.min.z + size.z / 2) * k);
  top.scale.setScalar(k);
  holder.add(top);
  return { holder, cfg };
}

export function hasCustomModel(id) {
  return CUSTOM.has(id);
}

/** Xoay mũi cá về +x, căn giữa, co giãn cho chiều dài thân = cfg.length (đơn vị bán kính R). */
function prepareCustom(scene, cfg) {
  const inner = new THREE.Group();
  inner.add(scene);
  scene.rotation.set(cfg.rotX, cfg.rotY, cfg.rotZ);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // kích thước đồng đều cho mọi file (src/fish-sizes.js); tắt equal thì dùng length riêng trong models/config.json
  const length = FISH_SIZES.equal ? FISH_SIZES.modelLength : cfg.length;
  const k = (length / Math.max(size.x, size.z, 1e-6)) * (FISH_SIZES.equal ? 1 : cfg.scale);
  const holder = new THREE.Group();
  inner.position.set(-center.x * k, -center.y * k + cfg.y, -center.z * k);
  inner.scale.setScalar(k);
  holder.add(inner);
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return { holder, cfg };
}

/** Một bản sao mô hình .glb cho mỗi con cá (vật liệu riêng để nháy trắng khi trúng đòn). */
function instantiateCustom(c) {
  const root = c.holder.clone(true);
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) if (m.emissive) mats.push(m);
  });
  // gom vật liệu thành một "vật liệu ảo" để renderer đổi màu phát sáng như mô hình thường
  const mat = {
    emissive: { setHex: (h) => mats.forEach((m) => m.emissive.setHex(h)) },
    set emissiveIntensity(v) {
      mats.forEach((m) => (m.emissiveIntensity = v));
    },
    dispose: () => mats.forEach((m) => m.dispose()),
  };
  // mắt khai báo trong config.json của loài ("mat.viTri") → nơi dán ảnh biểu cảm dùng chung
  const lids = [];
  for (const [x, y, z, r] of c.cfg.eyes || []) {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    root.add(holder);
    const side = Math.sign(z) || 1;
    const sprite = faceSprite(holder, r * 3.2, new THREE.Vector3(r * 0.2, r * 0.7, side * r * 0.6));
    lids.push({ mesh: null, sprite, R: r, rest: 0, tint: c.cfg.lidColor });
  }
  const bend = setupSwimBend(root, !!c.cfg.topDown);
  return { root, body: null, tail: null, mat, topDown: !!c.cfg.topDown, upright: false, lids, custom: true, bend };
}

// Uốn thân khi bơi cho mô hình .glb (không có xương): đẩy đỉnh lưới sang ngang theo sóng chạy từ đầu
// ra đuôi (cá đuối: gợn sóng lên xuống ở hai cánh). Tính trong hệ tọa độ con cá: mũi +x, hai bên ±z.
const SWIM_BEND_DECL = /* glsl */ `
uniform mat4 uToFish;
uniform mat4 uFromFish;
uniform float uSwimPhase;
uniform float uSwimAmp;
uniform float uSwimHead;
uniform float uSwimLen;
uniform float uSwimWide;
uniform float uSwimFlat;
`;
const SWIM_BEND_CODE = /* glsl */ `
{
  vec4 fp = uToFish * vec4(transformed, 1.0);
  float u = clamp((uSwimHead - fp.x) / uSwimLen, 0.0, 1.0); // 0 = mũi, 1 = chóp đuôi
  if (uSwimFlat > 0.5) {
    float side = clamp(abs(fp.z) / uSwimWide, 0.0, 1.0);
    fp.y += uSwimAmp * uSwimLen * 0.1 * side * side * sin(uSwimPhase - u * 4.0);
  } else {
    float w = smoothstep(0.2, 1.0, u); // nửa đầu gần như đứng yên, đuôi uốn mạnh nhất
    fp.z += uSwimAmp * uSwimLen * 0.13 * w * w * sin(uSwimPhase - u * 3.5);
  }
  transformed = (uFromFish * fp).xyz;
}
`;

function setupSwimBend(root, topDown) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const uniforms = {
    uSwimPhase: { value: 0 },
    uSwimAmp: { value: 0 },
    uSwimHead: { value: box.max.x },
    uSwimLen: { value: Math.max(box.max.x - box.min.x, 1e-3) },
    uSwimWide: { value: Math.max((box.max.z - box.min.z) / 2, 1e-3) },
    uSwimFlat: { value: topDown ? 1 : 0 },
  };
  const rootInv = root.matrixWorld.clone().invert();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const toFish = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    const fromFish = toFish.clone().invert();
    for (const m of [].concat(o.material)) {
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, { uToFish: { value: toFish }, uFromFish: { value: fromFish } });
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
${SWIM_BEND_DECL}`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
${SWIM_BEND_CODE}`);
      };
    }
  });
  return uniforms;
}

function instantiate(speciesId, lod) {
  if (STYLE === 'model3d' && CUSTOM.has(speciesId)) return instantiateCustom(CUSTOM.get(speciesId));
  const t = template(speciesId, lod);
  const root = new THREE.Group();
  const mat = toon({ vertexColors: true, ...t.look, map: t.map });
  const body = new THREE.Mesh(t.bodyGeo, mat);
  root.add(body);
  // viền mảnh (inverted hull) — bỏ ở trận đông cá để giữ khung hình mượt
  if (!lod) {
    const outline = new THREE.Mesh(t.bodyGeo, OUTLINE);
    outline.scale.setScalar(1.03);
    outline.position.copy(t.bodyCenter).multiplyScalar(-0.03);
    root.add(outline);
  }
  for (const p of t.stat) root.add(new THREE.Mesh(p.geo, p.mat));
  let tail = null;
  if (t.tailPos) {
    tail = new THREE.Group();
    tail.position.copy(t.tailPos);
    for (const p of t.tail) tail.add(new THREE.Mesh(p.geo, p.mat));
    root.add(tail);
  }
  // mí mắt: khối cùng màu da, kéo xuống che mắt khi chớp
  const lids = [];
  for (const e of t.eyes) {
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(e.m);
    const lid = new THREE.Mesh(SPHERE_HI, solid(e.lid));
    holder.add(lid);
    root.add(holder);
    const sprite = faceSprite(holder, e.R * 3.1, new THREE.Vector3(e.R * 0.2, e.R * 0.15, e.side * e.R * 1.0));
    const L = { mesh: lid, sprite, R: e.R, rest: e.rest, tint: e.lid };
    setLid(L, e.rest);
    lids.push(L);
  }
  return { root, body, tail, mat, topDown: t.topDown, upright: t.upright, lids };
}

/** Độ khép mí: 0 = mở to, 1 = nhắm hẳn (mí phủ từ mép trên xuống). */
function setLid(L, s) {
  if (!L.mesh) return;
  const k = Math.max(0.03, Math.min(1, s));
  const R = L.R;
  L.mesh.scale.set(R * 1.1, R * 1.22 * k, R * 0.98);
  L.mesh.position.set(0, R * 1.18 - R * 1.22 * k, 0);
}

/**
 * Biểu cảm theo trạng thái (ưu tiên): hết máu → choáng → bị đánh → chớp mắt → bình thường.
 * Mô hình dựng sẵn chớp mắt bằng mí 3D; mô hình tự thêm chớp bằng ảnh "nham-mat".
 */
function updateFace(lids, v, f, t, dt) {
  if (!lids || !lids.length) return;
  if (v.nextBlink === undefined) v.nextBlink = t + 0.5 + Math.random() * EXPR.blink.max;
  if (t > v.nextBlink + EXPR.blink.dur) v.nextBlink = t + EXPR.blink.min + Math.random() * Math.max(0, EXPR.blink.max - EXPR.blink.min);
  if (v.hurt > 0) v.hurt -= dt;
  const b = t - v.nextBlink;
  const blinkK = b >= 0 && b <= EXPR.blink.dur ? Math.sin((b / EXPR.blink.dur) * Math.PI) : 0;
  let state = null;
  if (v.dead) state = 'dead';
  else if (f && f.stunUntil > t) state = 'stun';
  else if (v.hurt > 0) state = 'hurt';
  else if (blinkK > 0.35) state = 'blink';
  for (const L of lids) {
    let lid = L.rest;
    let use = state && EXPR[state].tex ? state : null;
    if (use === 'blink' && L.mesh) use = null; // mí 3D tự chớp
    if (!use) {
      if (state === 'stun' || state === 'dead') lid = 0.85;
      else if (state === 'blink' || blinkK > 0) lid = Math.max(L.rest, blinkK);
      else if (f && f.ultUntil > t) lid = 0;
    } else lid = 0;
    setLid(L, lid);
    if (L.sprite) {
      const m = use ? exprMat(use, L.tint) : null;
      L.sprite.visible = !!m;
      if (m) L.sprite.material = m;
    }
  }
}

// ---------- vũ khí 3D ----------
// Phần "dọc" xây theo trục +x trong [0, 1] (kéo giãn theo chiều dài collider), tiết diện theo
// đơn vị R. Phần "đều" (mũi giáo, đầu chùy, lưỡi hái, hàm, quả cầu điện) co giãn đồng đều.

function colored(geo, hex) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  g.clearGroups();
  const c = col(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function along(geo, x0, x1) {
  // hình trụ/nón mặc định theo trục y → xoay về trục x, đặt từ x0 đến x1
  geo.rotateZ(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, 0);
  return geo;
}

function flatShape(points, thick) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2); // hình nằm trong mặt phẳng XZ, dày theo y
  return g;
}

const STEEL = 0xe6eef7;
const GOLD = 0xffc107;
const DARK_GOLD = 0xc68400;

// vật liệu phát sáng dùng chung (không cần ánh sáng, cộng màu)
function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opacity >= 1 });
}
const GLOW = {
  cyan: glowMat(0x7df9ff),
  cyanSoft: glowMat(0x29b6f6, 0.45),
  red: glowMat(0xff3d57),
  orange: glowMat(0xffab40),
  green: glowMat(0x76ff03),
  gold: glowMat(0xffe57f),
  violet: glowMat(0xe040fb),
};
const ORB_MAT = glowMat(0xc8ffff);
const GLOW_MAT = glowMat(0x29b6f6, 0.45);

// đốm sáng mềm (sprite) ở chóp vũ khí
const GLOW_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function glowSprite(color) {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
}

/** Gộp nhiều hình học có màu theo đỉnh thành một. */
function merge(...geos) {
  return mergeGeometries(geos.flat(), false);
}

/** Hình dẹt trong mặt phẳng XZ, đường viền cong mượt qua các điểm (spline khép kín). */
function smoothShape(points, thick, segments = 48) {
  const curve = new THREE.CatmullRomCurve3(points.map(([px, pz]) => new THREE.Vector3(px, pz, 0)), true, 'centripetal');
  const pts = curve.getPoints(segments).map((v) => new THREE.Vector2(v.x, v.y));
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.35, bevelSize: thick * 0.3, bevelSegments: 2 });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2);
  return g;
}

function ring(r, tube, x, color) {
  return colored(new THREE.TorusGeometry(r, tube, 6, 16).rotateY(Math.PI / 2).translate(x, 0, 0), color);
}

/**
 * Mỗi vũ khí gồm:
 *  hilt  — chuôi/đốc (kích thước cố định, đơn vị R), bắt đầu ngay ngoài thân cá;
 *  blade — phần kéo dài theo tầm đánh: hình học trong [0, 1] theo trục x, tiết diện đơn vị R;
 *  tip   — mũi/đầu (kích thước cố định) đặt tại cuối tầm đánh;
 *  glow* — các lớp phát sáng tương ứng (vật liệu riêng).
 * arms: các góc lệch (ví dụ dao đôi = [0, π]).
 */
const W_PARTS = {
  sword: () => ({
    arms: [0],
    hiltLen: 0.62,
    hilt: merge(
      colored(new THREE.SphereGeometry(0.12, 12, 8).translate(0.06, 0, 0), GOLD),
      colored(along(new THREE.CylinderGeometry(0.065, 0.075, 0.34, 10), 0.1, 0.44), 0x4e2a12),
      ring(0.08, 0.018, 0.2, DARK_GOLD),
      ring(0.08, 0.018, 0.32, DARK_GOLD),
      colored(smoothShape([[0.44, -0.55], [0.52, -0.18], [0.62, -0.08], [0.62, 0.08], [0.52, 0.18], [0.44, 0.55], [0.5, 0.08], [0.5, -0.08]], 0.09, 40), GOLD),
    ),
    hiltGlow: new THREE.SphereGeometry(0.085, 12, 8).translate(0.56, 0.09, 0),
    hiltGlowMat: GLOW.cyan,
    blade: colored(smoothShape([[0, -0.19], [0.5, -0.17], [0.86, -0.13], [1, 0], [0.86, 0.13], [0.5, 0.17], [0, 0.19]], 0.06, 30), STEEL),
    bladeGlow: new THREE.BoxGeometry(0.78, 0.02, 0.06).translate(0.43, 0.05, 0),
    bladeGlowMat: GLOW.cyan,
    tipGlow: 0x7df9ff,
  }),

  spear: () => ({
    arms: [0],
    hiltLen: 0.42,
    hilt: merge(
      colored(along(new THREE.CylinderGeometry(0.11, 0.09, 0.2, 10), 0, 0.2), DARK_GOLD),
      colored(new THREE.ConeGeometry(0.06, 0.32, 6).rotateZ(0.9).translate(0.18, 0.16, 0.08), GOLD),
      colored(new THREE.ConeGeometry(0.06, 0.32, 6).rotateZ(0.9).translate(0.18, 0.16, -0.08), GOLD),
      colored(new THREE.SphereGeometry(0.1, 10, 8).translate(0.3, 0, 0), 0xe53935),
      ...[-0.12, 0, 0.12].map((z) => colored(new THREE.ConeGeometry(0.05, 0.38, 5).rotateZ(-Math.PI / 2 - 0.5).translate(0.22, -0.16, z), 0xd50000)),
    ),
    blade: merge(
      colored(along(new THREE.CylinderGeometry(0.06, 0.06, 1, 10), 0, 1), 0xa31515),
      ...[0.15, 0.45, 0.75].map((x) => ring(0.07, 0.02, x, GOLD)),
    ),
    tipLen: 0.95,
    tip: merge(
      colored(smoothShape([[-0.95, 0], [-0.7, -0.24], [-0.3, -0.16], [0, 0], [-0.3, 0.16], [-0.7, 0.24]], 0.08, 32), GOLD),
      colored(smoothShape([[-0.85, -0.05], [-0.95, -0.42], [-0.7, -0.2]], 0.05, 16), DARK_GOLD),
      colored(smoothShape([[-0.85, 0.05], [-0.95, 0.42], [-0.7, 0.2]], 0.05, 16), DARK_GOLD),
    ),
    tipGlowGeo: new THREE.BoxGeometry(0.7, 0.02, 0.04).translate(-0.4, 0.05, 0),
    tipGlowMat: GLOW.orange,
    tipGlow: 0xffab40,
  }),

  blades: () => ({
    arms: [0, Math.PI],
    hiltLen: 0.22,
    hilt: merge(
      colored(along(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 8), 0, 0.2), 0x3e2723),
      colored(new THREE.SphereGeometry(0.08, 10, 8).translate(0.02, 0, 0), 0xb71c1c),
    ),
    // lưỡi liềm răng cưa (xương trắng)
    blade: colored(
      smoothShape([[0, -0.1], [0.35, -0.24], [0.7, -0.36], [1.0, -0.2], [0.82, -0.18], [0.75, -0.08], [0.62, -0.1], [0.55, 0], [0.4, -0.02], [0.3, 0.08], [0.12, 0.06], [0, 0.12]], 0.07, 60),
      0xfff3e0,
    ),
    bladeGlow: smoothShape([[0.05, -0.13], [0.4, -0.27], [0.72, -0.39], [1.0, -0.22], [0.7, -0.32], [0.38, -0.21]], 0.03, 30).translate(0, 0.03, 0),
    bladeGlowMat: GLOW.red,
    tipGlow: 0xff3d57,
  }),

  spikes: () => {
    const parts = [];
    const glows = [];
    const base = 0.92;
    const tip = 1.62;
    for (let k = 0; k < 8; k++) {
      const len = tip - base;
      const g = new THREE.ConeGeometry(0.15, len, 7).toNonIndexed();
      g.deleteAttribute('uv');
      const p = g.attributes.position;
      const cc = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + len / 2) / len;
        c.set(0xfff4d6).lerp(col(0x64dd17), Math.max(0, (t - 0.55) / 0.45));
        cc.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      g.rotateZ(-Math.PI / 2).translate((base + tip) / 2, 0, 0).rotateY((k / 8) * TAU);
      parts.push(g);
      glows.push(new THREE.SphereGeometry(0.05, 8, 6).translate(tip - 0.02, 0, 0).rotateY((k / 8) * TAU));
      parts.push(ring(0.13, 0.025, base + 0.12, 0x8d6e63).rotateY((k / 8) * TAU));
    }
    return { uni: merge(parts), uniBase: tip, uniGlow: merge(glows), uniGlowMat: GLOW.green };
  },

  electric: () => ({
    arms: [0],
    hiltLen: 0,
    blade: merge(
      colored(along(new THREE.CylinderGeometry(0.035, 0.1, 1, 10), 0, 1), 0x4527a0),
      ...[0.3, 0.45, 0.6, 0.75].map((x) => colored(new THREE.ConeGeometry(0.035, 0.14, 4).translate(x, 0.09, 0), 0xe0f7fa)),
    ),
    bladeGlow: merge([0.2, 0.4, 0.6, 0.8].map((x) => new THREE.TorusGeometry(0.1 - x * 0.06, 0.016, 6, 16).rotateY(Math.PI / 2).translate(x, 0, 0))),
    bladeGlowMat: GLOW.cyan,
    orb: true,
    tipGlow: 0x7df9ff,
  }),

  jaws: () => {
    // hai nửa hàm thép (trên/dưới theo trục z) có răng, khép mở liên tục
    const half = (sign) => {
      const parts = [colored(new THREE.TorusGeometry(1, 0.2, 8, 20, Math.PI).rotateX(sign > 0 ? Math.PI / 2 : -Math.PI / 2), 0x90a4ae)];
      for (let i = 0; i < 7; i++) {
        const a = ((i + 0.5) / 7) * Math.PI;
        const g = new THREE.ConeGeometry(0.12, 0.42, 4).rotateZ(Math.PI / 2).translate(-0.74, 0.03, 0).rotateY(sign > 0 ? -a : a);
        parts.push(colored(g, 0xffffff));
      }
      for (let i = 0; i < 4; i++) {
        const a = ((i + 0.5) / 4) * Math.PI;
        parts.push(colored(new THREE.SphereGeometry(0.07, 8, 6).translate(1.0, 0.16, 0).rotateY(sign > 0 ? -a : a), GOLD));
      }
      return merge(parts);
    };
    return { jawTop: half(1), jawBottom: half(-1), maw: colored(new THREE.CircleGeometry(0.78, 24).rotateX(-Math.PI / 2).translate(0, -0.06, 0), 0x4a0a12) };
  },

  mace: () => {
    const head = [colored(new THREE.IcosahedronGeometry(0.75, 1), 0x455a64)];
    const dirs = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
    const seen = new Set();
    for (let i = 0; i < dirs.count; i++) {
      const v = new THREE.Vector3(dirs.getX(i), dirs.getY(i), dirs.getZ(i)).normalize();
      const key = v.toArray().map((n) => n.toFixed(2)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const g = new THREE.ConeGeometry(0.17, 0.55, 6).translate(0, 0.95, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
      head.push(colored(g, 0xeceff1));
    }
    return {
      arms: [0],
      hiltLen: 0.28,
      hilt: merge(
        colored(new THREE.SphereGeometry(0.1, 10, 8).translate(0.05, 0, 0), DARK_GOLD),
        colored(along(new THREE.CylinderGeometry(0.075, 0.075, 0.22, 8), 0.06, 0.28), 0x3e2723),
      ),
      blade: merge(colored(along(new THREE.CylinderGeometry(0.06, 0.07, 1, 8), 0, 1), 0x6d4c41), ring(0.08, 0.02, 0.5, 0x37474f)),
      head: merge(head),
      headGlow: new THREE.TorusGeometry(0.86, 0.05, 6, 32).rotateX(Math.PI / 2),
      headGlowMat: GLOW.green,
    };
  },

  hook: () => ({
    arms: [0],
    hiltLen: 0.16,
    hilt: colored(new THREE.SphereGeometry(0.1, 10, 8).translate(0.06, 0, 0), GOLD),
    blade: merge(colored(along(new THREE.CylinderGeometry(0.055, 0.06, 1, 8), 0, 1), 0xcd7f32), ring(0.075, 0.018, 0.3, GOLD), ring(0.075, 0.018, 0.65, GOLD)),
    // lưỡi hái lớn cong về phía +z (đúng hướng collider móc)
    scythe: colored(smoothShape([[-0.1, -0.06], [0.25, 0.05], [0.42, 0.45], [0.25, 1.05], [-0.05, 1.32], [0.1, 0.95], [0.18, 0.5], [0.05, 0.15]], 0.07, 60), 0xb3e5fc),
    scytheGlow: smoothShape([[0.27, 0.08], [0.45, 0.46], [0.27, 1.07], [-0.03, 1.34], [0.33, 0.9], [0.38, 0.45]], 0.03, 40).translate(0, 0.03, 0),
    scytheGlowMat: GLOW.cyan,
    tipGlow: 0x7df9ff,
  }),
};

// Vũ khí phong cách video: kiếm thép chuôi vàng nơ, rìu chim đôi bạc, kiếm pha lê băng phát sáng
const W_PARTS_TOON = {
  sword: () => ({
    arms: [0],
    startAt: 1.62, // chuôi kiếm gắn ở đầu mỏ cá kiếm
    hiltLen: 0.3,
    hilt: merge(
      colored(along(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), 0.0, 0.18), 0x8d5a2b),
      // chắn tay hình nơ vàng
      colored(smoothShape([[0.16, -0.42], [0.24, -0.38], [0.22, -0.08], [0.3, 0], [0.22, 0.08], [0.24, 0.38], [0.16, 0.42], [0.2, 0]], 0.1, 40), GOLD),
      colored(new THREE.SphereGeometry(0.08, 10, 8).translate(0.22, 0, 0), DARK_GOLD),
    ),
    blade: colored(smoothShape([[0, -0.16], [0.82, -0.14], [1, 0], [0.82, 0.14], [0, 0.16]], 0.05, 30), 0xdfe9f2),
    bladeGlow: new THREE.BoxGeometry(0.8, 0.012, 0.035).translate(0.42, 0.04, 0),
    bladeGlowMat: glowMat(0xffffff),
  }),
  blades: () => ({
    arms: [0, Math.PI],
    hiltLen: 0,
    blade: colored(along(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), 0, 1), 0x6d4c41),
    // đầu rìu chim hai lưỡi cong (vuông góc cán), bằng thép bạc
    tip: merge(
      colored(smoothShape([[-0.05, 0], [0.05, 0.25], [-0.08, 0.62], [-0.32, 0.9], [-0.18, 0.55], [-0.2, 0.2]], 0.08, 40), 0xcfd8dc),
      colored(smoothShape([[-0.05, 0], [0.05, -0.25], [-0.08, -0.62], [-0.32, -0.9], [-0.18, -0.55], [-0.2, -0.2]], 0.08, 40), 0xcfd8dc),
      colored(new THREE.BoxGeometry(0.18, 0.16, 0.22).translate(-0.06, 0, 0), 0x78909c),
    ),
    tipScale: 0.75,
  }),
  spikes: () => {
    // gai kem nhọn mảnh như trong video (không có vòng/đầu xanh)
    const parts = [];
    const base = 0.9;
    const tip = 1.5;
    for (let k = 0; k < 8; k++) {
      const g = new THREE.ConeGeometry(0.09, tip - base, 6).toNonIndexed();
      g.deleteAttribute('uv');
      const n = g.attributes.position.count;
      const cc = new Float32Array(n * 3);
      const c = col(0xfff0c8);
      for (let i = 0; i < n; i++) cc.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      g.rotateZ(-Math.PI / 2).translate((base + tip) / 2, 0, 0).rotateY((k / 8) * TAU);
      parts.push(g);
    }
    return { uni: merge(parts), uniBase: tip };
  },
  electric: () => ({
    arms: [0],
    hiltLen: 0.34,
    hilt: merge(
      colored(along(new THREE.CylinderGeometry(0.065, 0.075, 0.24, 10), 0, 0.24), 0x4a3a9a),
      colored(smoothShape([[0.22, -0.3], [0.32, -0.26], [0.3, 0], [0.32, 0.26], [0.22, 0.3], [0.27, 0]], 0.09, 30), 0x9fa8da),
    ),
    // lưỡi kiếm pha lê băng (răng cưa băng giá), phát sáng xanh lơ
    blade: colored(smoothShape([[0, -0.15], [0.2, -0.2], [0.35, -0.13], [0.5, -0.21], [0.66, -0.12], [0.8, -0.18], [1, 0], [0.8, 0.18], [0.66, 0.12], [0.5, 0.21], [0.35, 0.13], [0.2, 0.2], [0, 0.15]], 0.07, 60), 0xb3f5ff),
    bladeGlow: smoothShape([[0, -0.2], [0.5, -0.27], [1.04, 0], [0.5, 0.27], [0, 0.2]], 0.02, 30).translate(0, -0.02, 0),
    bladeGlowMat: glowMat(0x4dd0ff, 0.5),
    tipGlow: 0x7df9ff,
  }),
};

const W_CACHE = new Map();
function weaponParts(type, style = 'real') {
  const key = `${style}:${type}`;
  if (!W_CACHE.has(key)) {
    const set = style !== 'real' && W_PARTS_TOON[type] ? W_PARTS_TOON : W_PARTS;
    W_CACHE.set(key, (set[type] || W_PARTS.sword)());
  }
  return W_CACHE.get(key);
}

class Weapon3D {
  /** lod = true: trận đông cá — bỏ các lớp phát sáng để giữ khung hình mượt. */
  constructor(scene, fish, lod = false) {
    this.fish = fish;
    this.type = fish.weapon;
    this.group = new THREE.Group();
    this.mat = toon({ vertexColors: true, roughness: 0.35, metalness: 0.35 });
    const cw = STYLE === 'model3d' ? CUSTOM_W.get(fish.speciesId || fish.species?.id) : null;
    if (cw) {
      // vũ khí từ file .glb: mỗi "nhánh" là một bản sao (dao đôi = 2, gai cá nóc = 8)
      this.custom = cw;
      const n = this.type === 'spikes' ? SPIKES_N : this.type === 'blades' ? 2 : 1;
      this.customArms = [];
      this.arms = [];
      for (let i = 0; i < n; i++) {
        const arm = new THREE.Group();
        arm.rotation.y = (i / n) * TAU;
        const obj = cw.holder.clone(true);
        arm.add(obj);
        this.group.add(arm);
        this.customArms.push(obj);
      }
      scene.add(this.group);
      return;
    }
    const p = weaponParts(this.type, STYLE);
    this.p = p;
    this.customBody = STYLE === 'model3d' && CUSTOM.has(fish.speciesId || fish.species?.id);
    const mesh = (geo, mat, parent) => {
      if (lod && mat && mat !== this.mat && mat.transparent) return null;
      const m = new THREE.Mesh(geo, mat || this.mat);
      parent.add(m);
      return m;
    };
    this.arms = [];
    for (const angle of p.arms || []) {
      const arm = new THREE.Group();
      arm.rotation.y = angle;
      const a = { group: arm };
      if (p.hilt) a.hilt = mesh(p.hilt, null, arm);
      if (p.hiltGlow) a.hiltGlow = mesh(p.hiltGlow, p.hiltGlowMat, arm);
      a.blade = mesh(p.blade, null, arm);
      if (p.bladeGlow) a.bladeGlow = mesh(p.bladeGlow, p.bladeGlowMat, arm);
      if (p.tip) a.tip = mesh(p.tip, null, arm);
      if (p.tipGlowGeo) a.tipGlowMesh = mesh(p.tipGlowGeo, p.tipGlowMat, arm);
      if (p.head) a.head = mesh(p.head, null, arm);
      if (p.headGlow) a.headGlow = mesh(p.headGlow, p.headGlowMat, arm);
      if (p.scythe) a.scythe = mesh(p.scythe, null, arm);
      if (p.scytheGlow) a.scytheGlow = mesh(p.scytheGlow, p.scytheGlowMat, arm);
      if (p.orb) {
        const blade = new THREE.OctahedronGeometry(1, 0);
        blade.scale(1.6, 0.18, 0.55);
        a.orb = mesh(blade, ORB_MAT, arm);
        const halo = new THREE.Mesh(blade, GLOW_MAT);
        halo.scale.setScalar(1.35);
        a.orb.add(halo);
      }
      if (p.tipGlow && !lod) {
        a.spark = glowSprite(p.tipGlow);
        arm.add(a.spark);
      }
      this.group.add(arm);
      this.arms.push(a);
    }
    if (p.uni) {
      this.uni = mesh(p.uni, null, this.group);
      if (p.uniGlow) this.uniGlow = mesh(p.uniGlow, p.uniGlowMat, this.group);
    }
    if (p.jawTop) {
      this.jaw = new THREE.Group();
      this.jawTop = mesh(p.jawTop, null, this.jaw);
      this.jawBottom = mesh(p.jawBottom, null, this.jaw);
      this.maw = mesh(p.maw, null, this.jaw);
      this.group.add(this.jaw);
    }
    scene.add(this.group);
  }

  update(t) {
    const f = this.fish;
    const g = this.group;
    if (!f.alive) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const R = f.radius;
    // ws: chỉ phóng to HÌNH vũ khí (FISH_SIZES.weaponScale), tầm đánh thật vẫn là effectiveRange
    const ws = weaponVisualScale(f.speciesId);
    const L = effectiveRange(f) * ws;
    const Rw = R * ws;
    const k = (f.k || 1) * ws;
    g.position.set(f.x, R * FISH_LIFT * 0.95, f.y);
    g.rotation.set(0, -f.weaponAngle, 0);
    if (this.custom) {
      // đặt từ mép thân tới cuối collider; to nhỏ đồng đều theo chiều dài (giữ đúng tỉ lệ mô hình)
      const c = this.custom.cfg;
      let d0 = R * 1.0;
      let d1 = R + L;
      if (this.type === 'spikes') {
        d0 = R * 0.85;
        d1 = R + L * 0.55 + 4 * k + L * 0.15;
      }
      const len = Math.max(0.01, (d1 - d0) * c.length);
      // mũi dao "chém tới" theo chiều xoay: lật nhanh 180° quanh trục dọc khi vũ khí đổi chiều
      if (c.curve === 'xoay') {
        const want = f.weaponDir < 0 ? Math.PI : 0;
        const step = Math.min(1, Math.max(0, t - (this.lastT ?? t)) / 0.15);
        this.roll = this.roll === undefined ? want : this.roll + (want - this.roll) * step;
        this.lastT = t;
      }
      for (const o of this.customArms) {
        o.position.set(d0 + c.offset * R, 0, 0);
        o.scale.set(len, len * c.thick, len * c.thick);
        o.rotation.x = (this.roll || 0) + (c.spin ? t * c.spin : 0);
      }
      return;
    }
    const p = this.p;
    // vũ khí bắt đầu ngay ngoài thân cá (không "xuyên" qua thân), kết thúc ở cuối collider
    // mô hình .glb tự thêm có mỏ/đầu riêng → vũ khí bắt đầu ngay sát thân
    const start = R * (this.customBody ? 1.1 : p.startAt || 1.04);
    let end = R + L;
    if (this.type === 'hook') end = R + L - 4 * k;
    if (this.type === 'mace') end = R + L - 10 * k;
    const pulse = 0.85 + 0.15 * Math.sin(t * 9 + f.id);
    for (const a of this.arms) {
      const hl = (p.hiltLen || 0) * Rw;
      for (const m of [a.hilt, a.hiltGlow]) {
        if (!m) continue;
        m.position.set(start, 0, 0);
        m.scale.setScalar(Rw);
      }
      const bs = start + hl;
      const be = this.type === 'spear' ? end - p.tipLen * Rw * 0.9 : end;
      const len = Math.max(0.01, be - bs);
      for (const m of [a.blade, a.bladeGlow]) {
        if (!m) continue;
        m.position.set(bs, 0, 0);
        m.scale.set(len, Rw, Rw);
      }
      for (const m of [a.tip, a.tipGlowMesh]) {
        if (!m) continue;
        m.position.set(end, 0, 0);
        m.scale.setScalar(Rw * (p.tipScale || 0.9));
      }
      if (a.head) {
        a.head.position.set(end, 0, 0);
        a.head.rotation.set(t * 2, t * 3, 0);
        a.head.scale.setScalar(12 * k);
        if (a.headGlow) {
          a.headGlow.position.set(end, 0, 0);
          a.headGlow.rotation.set(Math.sin(t * 3) * 0.5, t * 4, 0);
          a.headGlow.scale.setScalar(12 * k * pulse);
        }
      }
      if (a.scythe) {
        for (const m of [a.scythe, a.scytheGlow]) {
          if (!m) continue;
          m.position.set(end, 0, 0);
          m.scale.setScalar(Rw * 0.75);
        }
      }
      if (a.orb) {
        a.orb.position.set(end + Rw * 0.1, 0, 0);
        a.orb.scale.setScalar(Rw * (0.28 + 0.03 * Math.sin(t * 20)));
      }
      if (a.spark) {
        a.spark.position.set(this.type === 'hook' ? end + Rw * 0.1 : end, 0.05 * Rw, this.type === 'hook' ? Rw * 0.75 : 0);
        a.spark.scale.setScalar(Rw * 1.1 * pulse);
      }
    }
    if (this.uni) {
      const tip = R + L * 0.55 + 4 * k + L * 0.15;
      const s = tip / p.uniBase;
      this.uni.scale.setScalar(s);
      if (this.uniGlow) this.uniGlow.scale.setScalar(s);
    }
    if (this.jaw) {
      const d = R + L * 0.45;
      const r = L * 0.7;
      this.jaw.position.set(d, 0, 0);
      this.jaw.rotation.set(0, t * 1.5, 0);
      this.jaw.scale.setScalar(r * 0.95);
      // đớp: hai nửa hàm khép lại rồi mở ra
      const open = 0.35 + 0.65 * Math.abs(Math.sin(t * 5 + f.id));
      this.jawTop.scale.set(1, 1, open);
      this.jawBottom.scale.set(1, 1, open);
    }
    const glow = f.skillActiveUntil > t || f.ultUntil > t;
    this.mat.emissive.setHex(glow ? 0x7a4a00 : 0x000000);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.mat.dispose();
    for (const a of this.arms) if (a.spark) a.spark.material.dispose();
  }
}

// ---------- tường đấu trường + cờ phướn ----------
function bannerTexture(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 64, 110);
  x.beginPath();
  x.moveTo(0, 110);
  x.lineTo(32, 128);
  x.lineTo(64, 110);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.18)';
  x.fillRect(4, 0, 6, 110);
  x.fillStyle = '#ffd54f';
  x.fillRect(0, 0, 64, 8);
  // vương miện
  x.beginPath();
  x.moveTo(16, 66);
  x.lineTo(16, 44);
  x.lineTo(24, 54);
  x.lineTo(32, 40);
  x.lineTo(40, 54);
  x.lineTo(48, 44);
  x.lineTo(48, 66);
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Màu 3 bậc khán đài: Đấu trường La Mã giữ màu đá cũ; chủ đề khác lấy theo màu tường, tối dần lên trên. */
function standMaterials(theme, w3) {
  if (theme.banners) return [toon({ color: 0xeee2c8 }), toon({ color: 0xe2d3b4 }), toon({ color: 0xd6c4a0 })];
  const base = new THREE.Color(w3.wall);
  return [0, 1, 2].map((i) => toon({ color: base.clone().multiplyScalar(0.92 - i * 0.07) }));
}

/** crowdOn: dựng khán đài + khán giả cho MỌI chủ đề & hình dạng sân (tùy chọn "Khán giả" trên bảng điều khiển). */
function buildWalls(arena, theme, crowdOn = true) {
  const group = new THREE.Group();
  const w3 = theme.wall3d || { wall: theme.rim.band, top: theme.rim.line };
  const wallMat = toon({ color: w3.wall });
  const topMat = toon({ color: w3.top });
  const thick = 26;
  if (arena.shape === 'circle' || arena.shape === 'oval') {
    // bầu dục: dựng vòng tròn rồi kéo giãn theo trục z (trục dọc của sân)
    const oval = arena.shape === 'oval';
    const R = (oval ? arena.outerHalfWidth : arena.baseR) + 6;
    const ez = oval ? arena.outerHalfHeight / arena.outerHalfWidth : 1;
    const ring = new THREE.Group();
    ring.scale.z = ez;
    group.add(ring);
    const seg = 96;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, WALL_H, seg, 1, true), wallMat);
    wall.material.side = THREE.DoubleSide;
    wall.position.y = WALL_H / 2;
    ring.add(wall);
    const cap = new THREE.Mesh(new THREE.RingGeometry(R, R + thick, seg), topMat);
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = WALL_H;
    ring.add(cap);
    // gờ đá trên đỉnh tường
    const blocks = Math.round((TAU * R) / 34);
    const blockGeo = new THREE.BoxGeometry(18, 10, thick * 0.9);
    for (let i = 0; i < blocks; i += 2) {
      const a = (i / blocks) * TAU;
      const b = new THREE.Mesh(blockGeo, topMat);
      b.position.set(Math.cos(a) * (R + thick / 2), WALL_H + 5, Math.sin(a) * (R + thick / 2));
      b.rotation.y = -a + Math.PI / 2;
      ring.add(b);
    }
    // màn hình lớn sau khán đài phía xa (chỉ hiện trong kiểu giới thiệu "điện ảnh")
    group.userData.jumbo = new Jumbotron(-(R + thick + 90) * ez - 10, WALL_H + 50);
    group.add(group.userData.jumbo.group, group.userData.jumbo.stand);
    if (theme.banners || crowdOn) {
      // khán đài bậc thang phía sau tường
      const standMat = standMaterials(theme, w3);
      const rows = [];
      for (let i = 0; i < 3; i++) {
        const r0 = R + thick + i * 30;
        const h = WALL_H + 10 + i * 16;
        rows.push({ d: r0 + 15 - R, y: h });
        const step = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 30, r0 + 30, h, seg, 1, true), standMat[i]);
        step.material.side = THREE.DoubleSide;
        step.position.y = h / 2;
        ring.add(step);
        const top = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 30, seg), standMat[i]);
        top.rotation.x = -Math.PI / 2;
        top.position.y = h;
        ring.add(top);
      }
      // khán giả cá con ngồi trên các bậc (src/render/Crowd3D.js)
      if (crowdOn) {
        group.userData.crowd = new Crowd3D({ ellipse: true, hx: R, hz: R * ez, rows });
        group.add(group.userData.crowd.group);
      }
    }
    if (theme.banners) {
      // cờ phướn treo trên khán đài phía xa
      const colors = ['#1e5bb8', '#c62828'];
      const rb = R + thick + 34;
      for (let i = 0; i < 6; i++) {
        // phía xa (z < 0), quay mặt về camera như cờ treo trên khán đài
        const a = Math.PI * 1.12 + (i / 5) * Math.PI * 0.76;
        const mat = new THREE.MeshBasicMaterial({ map: bannerTexture(colors[i % 2]), transparent: true, side: THREE.DoubleSide });
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(40, 80), mat);
        pl.position.set(Math.cos(a) * rb, WALL_H + 22, Math.sin(a) * rb * ez);
        group.add(pl);
      }
      // đèn tròn trên đỉnh tường
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
      const postMat = toon({ color: 0x6d5236 });
      for (const a of [Math.PI * 1.18, Math.PI * 1.82, Math.PI * 0.25, Math.PI * 0.75]) {
        const x = Math.cos(a) * (R + thick / 2);
        const z = Math.sin(a) * (R + thick / 2) * ez;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 22, 8), postMat);
        post.position.set(x, WALL_H + 11, z);
        group.add(post);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), lampMat);
        lamp.position.set(x, WALL_H + 26, z);
        group.add(lamp);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), haloMat);
        halo.position.copy(lamp.position);
        group.add(halo);
      }
    }
  } else {
    const hw = arena.outerHalfWidth + 6;
    const hh = arena.outerHalfHeight + 6;
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
      m.position.set(x, WALL_H / 2, z);
      group.add(m);
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 8, d + 4), topMat);
      t.position.set(x, WALL_H + 4, z);
      group.add(t);
    };
    mk(hw * 2 + thick * 2, thick, 0, -hh - thick / 2);
    mk(hw * 2 + thick * 2, thick, 0, hh + thick / 2);
    mk(thick, hh * 2, -hw - thick / 2, 0);
    mk(thick, hh * 2, hw + thick / 2, 0);
    group.userData.jumbo = new Jumbotron(-(hh + thick + 90) - 10, WALL_H + 50);
    group.add(group.userData.jumbo.group, group.userData.jumbo.stand);
    if (crowdOn) {
      // khán đài bậc thang bốn phía + khán giả
      const standMat = standMaterials(theme, w3);
      const rows = [];
      for (let i = 0; i < 3; i++) {
        const d0 = thick + i * 30;
        const h = WALL_H + 10 + i * 16;
        rows.push({ d: d0 + 15, y: h });
        const band = (w, d, x, z) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standMat[i]);
          m.position.set(x, h / 2, z);
          group.add(m);
        };
        const X = hw + d0 + 30;
        const Z = hh + d0 + 30;
        band(X * 2, 30, 0, -Z + 15);
        band(X * 2, 30, 0, Z - 15);
        band(30, Z * 2 - 60, -X + 15, 0);
        band(30, Z * 2 - 60, X - 15, 0);
      }
      group.userData.crowd = new Crowd3D({ ellipse: false, hx: hw, hz: hh, rows });
      group.add(group.userData.crowd.group);
    }
    if (theme.banners) {
      const colors = ['#1e5bb8', '#c62828'];
      const n = Math.max(3, Math.round(hw / 70));
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshBasicMaterial({ map: bannerTexture(colors[i % 2]), transparent: true, side: THREE.DoubleSide });
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(30, 60), mat);
        pl.position.set(-hw + ((i + 0.5) / n) * hw * 2, WALL_H - 18, -hh + 1.5);
        group.add(pl);
      }
    }
  }
  return group;
}

// ---------- bộ render ----------
// ---------- nhân vật đơn lẻ (thư viện nhân vật / ảnh giới thiệu) ----------
/**
 * Dựng một nhân vật hoàn chỉnh (cá + vũ khí) ở chất lượng cao nhất, đơn vị R = 1,
 * tâm thân ở độ cao FISH_LIFT. Trả về { group, tick(t) } để có thể cho vẫy đuôi.
 */
export function createCharacter(species, weaponAngle = -0.55, style = 'cartoon') {
  setCharStyle(style);
  // kiểu video: vũ khí cầm phía trước mặt
  if (style !== 'real' && FACE_WEAPON[species.weapon] !== undefined) weaponAngle = -FACE_WEAPON[species.weapon];
  const group = new THREE.Group();
  const model = instantiate(species.id, 0);
  const holder = new THREE.Group();
  holder.position.y = FISH_LIFT;
  holder.add(model.root);
  group.add(holder);
  // cá giả lập theo tỉ lệ R = 1 để vũ khí 3D có đúng hình học như trong trận
  const k = 1 / 22;
  const fake = {
    id: 0, x: 0, y: 0, radius: 1, k, alive: true, weapon: species.weapon, species,
    range: species.range * k, rangeBuff: 1, ultRange: 1, weaponAngle, skillActiveUntil: -1,
  };
  const weapon = new Weapon3D(group, fake);
  weapon.update(0);
  return {
    group,
    model,
    tick(t) {
      if (model.lids) for (const L of model.lids) setLid(L, L.rest);
      if (model.tail) model.tail.rotation.y = Math.sin(t * 6) * 0.45;
      if (!model.topDown) model.root.rotation.y = Math.sin(t * 6) * 0.06;
      weapon.update(t);
    },
  };
}

export class Fish3DRenderer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 6000);
    const D = 2500;
    this.camera.position.set(0, D * Math.cos(TILT), D * Math.sin(TILT));
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a66, 1.35));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
    key.position.set(-0.5, 1, 0.65);
    this.scene.add(key);
    this.fish = [];
    this.weapons = [];
    this.dying = [];
    this.walls = null;
  }

  /** Khung nhìn theo đơn vị thế giới trên mặt phẳng màn hình: trái/phải/trên/dưới so với tâm đấu trường. */
  setView(left, right, top, bottom, pxW, pxH) {
    this.renderer.setSize(Math.max(2, Math.round(pxW)), Math.max(2, Math.round(pxH)), false);
    this.camera.left = left;
    this.camera.right = right;
    this.camera.top = top;
    this.camera.bottom = bottom;
    this.camera.updateProjectionMatrix();
  }

  /** Sàn 3D dùng chung hình sàn 2D của chủ đề — chỉ hiện khi camera rời góc nhìn trận (màn giới thiệu điện ảnh). */
  setFloorCanvas(canvas, res) {
    if (this.floor3d) {
      this.scene.remove(this.floor3d);
      this.floor3d.geometry.dispose();
      this.floor3d.material.map.dispose();
      this.floor3d.material.dispose();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.floor3d = new THREE.Mesh(new THREE.PlaneGeometry(canvas.width / res, canvas.height / res), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    this.floor3d.rotation.x = -Math.PI / 2;
    this.floor3d.position.y = -0.4;
    this.floor3d.renderOrder = -1;
    this.floor3d.visible = !!this.cinemaOn;
    this.scene.add(this.floor3d);
  }

  /**
   * Camera điện ảnh: k = 0 → góc nhìn trận thường, k = 1 → nhìn thẳng & phóng to vào màn hình lớn.
   * active = false trả camera về như cũ, ẩn màn hình lớn và sàn 3D.
   */
  setCinema(k, active = true) {
    const cam = this.camera;
    if (!this.basePose) this.basePose = { pos: cam.position.clone(), q: cam.quaternion.clone() };
    const J = this.walls?.userData.jumbo;
    this.cinemaOn = active;
    if (this.floor3d) this.floor3d.visible = active;
    if (J) J.setVisible(active);
    if (!active || !J || k <= 0) {
      cam.position.copy(this.basePose.pos);
      cam.quaternion.copy(this.basePose.q);
      cam.zoom = 1;
      cam.updateProjectionMatrix();
      return;
    }
    const { center, normal } = J.frame();
    const D = this.basePose.pos.length();
    const probe = new THREE.OrthographicCamera(); // camera nhìn theo trục −z khi lookAt
    probe.position.copy(center).addScaledVector(normal, D);
    probe.lookAt(center);
    const tq = probe.quaternion;
    const zoomT = Math.min((cam.right - cam.left) / (JUMBO_W * 1.1), (cam.top - cam.bottom) / (JUMBO_H * 1.16));
    // khung nhìn lệch tâm (phần trên rộng hơn) → dời camera để màn hình nằm giữa khung
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(tq);
    const tp = probe.position.clone().addScaledVector(up, -((cam.top + cam.bottom) / 2) / zoomT);
    cam.position.lerpVectors(this.basePose.pos, tp, k);
    cam.quaternion.slerpQuaternions(this.basePose.q, tq, k);
    cam.zoom = Math.pow(zoomT, k);
    cam.updateProjectionMatrix();
  }

  /** Vẽ nội dung màn hình lớn: draw(ctx, W, H). */
  drawJumbo(draw) {
    this.walls?.userData.jumbo?.draw(draw);
  }

  /** Bật/tắt khán đài + khán giả (dựng lại tường của sân hiện tại). */
  setCrowd(on) {
    if (on === (this.crowdOn !== false)) return;
    this.crowdOn = on;
    if (this.arenaArgs) this.setArena(...this.arenaArgs);
  }

  setArena(arena, theme) {
    this.arenaArgs = [arena, theme];
    if (this.walls) {
      this.scene.remove(this.walls);
      this.walls.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    this.walls = buildWalls(arena, theme, this.crowdOn !== false);
    this.crowd = this.walls.userData.crowd || null;
    this.scene.add(this.walls);
  }

  /** Sự kiện trận → khán giả phản ứng (chỉ hình ảnh). */
  onEvent(e, sim) {
    this.crowd?.onEvent(e, sim);
  }

  /** Đồ ném từ khán đài (cà chua, cờ lê) kể từ lần lấy trước. */
  drainCrowdEvents() {
    return this.crowd ? this.crowd.drainEvents() : [];
  }

  clear() {
    for (const f of this.fish) {
      this.scene.remove(f.outer);
      f.mat.dispose();
    }
    for (const w of this.weapons) w.dispose(this.scene);
    this.fish = [];
    this.weapons = [];
    this.dying = [];
  }

  build(sim, style = 'cartoon') {
    setCharStyle(style);
    this.style = STYLE;
    this.clear();
    this.crowd?.reset();
    const lod = sim.fish.length > 40 ? 1 : 0;
    for (const f of sim.fish) {
      const model = instantiate(f.speciesId, lod);
      const outer = new THREE.Group();
      const inner = new THREE.Group();
      inner.add(model.root);
      outer.add(inner);
      this.scene.add(outer);
      this.fish.push({ id: f.id, outer, inner, model, lids: model.lids, mat: model.mat, heading: Math.atan2(f.vy, f.vx), phase: Math.random() * TAU, swim: Math.random() * TAU, bank: 0, flash: 0, alive: true, appear: 1 });
      this.weapons.push(new Weapon3D(this.scene, f, lod));
    }
  }

  /** Đổi chế độ hướng mặt (không cần dựng lại trận). */
  setFaceMode(mode) {
    if (mode === this.faceMode) return;
    this.faceMode = mode;
    for (const v of this.fish) v.face = {};
  }

  flash(id) {
    const v = this.fish[id];
    if (v) {
      v.flash = 0.08;
      v.hurt = EXPR.hurt.dur; // biểu cảm đau khi bị đánh
    }
  }

  /** Hệ số xuất hiện (0 = ẩn, 1 = bình thường) dùng cho màn ra mắt. */
  setAppear(id, s) {
    const v = this.fish[id];
    if (v) v.appear = s;
  }

  kill(id) {
    const v = this.fish[id];
    if (!v || !v.alive) return;
    v.alive = false;
    v.dead = true;
    this.weapons[id].group.visible = false;
    updateFace(v.lids, v, null, 0, 0); // mắt "X" khi hết máu
    this.dying.push({ v, t: 0, x: v.outer.position.x });
  }

  update(sim, dt) {
    const t = sim.time;
    this.crowd?.update(sim, dt);
    for (const v of this.fish) {
      if (!v.alive) continue;
      const f = sim.fish[v.id];
      const { outer, inner, model } = v;
      const scale = f.radius * (f.skillActiveUntil > t && f.weapon === 'spikes' ? 1.12 : 1);
      outer.position.set(f.x, f.radius * FISH_LIFT, f.y);
      // hướng mặt theo lựa chọn "Hướng mặt cá" (Render/Facing.js) — chỉ là hình ảnh, không đổi mô phỏng
      const fa = facingAngle(this.faceMode || 'auto', f, { sim, dt, st: v.face || (v.face = {}), heading: v.heading, style: this.style });
      let d = fa.angle - v.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = fa.snap ? 0 : Math.max(-1, Math.min(1, d / Math.max(dt, 1e-3) / 4));
      if (fa.snap) v.heading = fa.angle;
      else v.heading += d * Math.min(1, dt * 12);
      outer.rotation.set(0, -v.heading, 0);
      // bơi: đuôi quẫy nhanh & mạnh hơn khi bơi nhanh; pha cộng dồn để đổi tốc độ không bị giật nhịp
      const speed = Math.hypot(f.vx, f.vy);
      const ratio = Math.min(1.8, speed / Math.max(1, f.cruiseSpeed));
      v.swim += dt * (5 + 9 * ratio);
      const sw = v.swim;
      const amp = 0.55 + 0.45 * Math.min(1.4, ratio);
      v.bank += (turn - v.bank) * Math.min(1, dt * 6); // nghiêng người khi rẽ, mượt dần
      if (model.topDown) {
        inner.rotation.set(Math.sin(sw * 0.4) * 0.06 - v.bank * 0.25, 0, 0);
        if (model.bend) {
          model.bend.uSwimPhase.value = sw * 0.6;
          model.bend.uSwimAmp.value = amp;
        }
      } else {
        inner.rotation.set(-v.bank * 0.4, 0, model.upright ? 0 : Math.sin(sw * 0.5 + 1) * 0.04);
        // đầu lắc nhẹ ngược pha với đuôi (thân uốn chữ S)
        model.root.rotation.y = Math.sin(sw - 0.6) * (model.bend ? 0.04 : 0.08) * amp;
        if (model.tail) model.tail.rotation.y = Math.sin(sw) * 0.55 * amp;
        if (model.bend) {
          model.bend.uSwimPhase.value = sw;
          model.bend.uSwimAmp.value = amp;
        }
      }
      updateFace(v.lids, v, f, t, dt);
      const ap = v.appear;
      outer.visible = ap > 0.001 && this.charsVisible !== false;
      outer.scale.setScalar(scale * ap);
      // vừa xuất hiện: cá rơi nhẹ từ trên xuống
      if (ap < 1) outer.position.y += (1 - Math.min(1, ap)) * f.radius * 3;
      outer.position.y += Math.sin(sw * 0.25) * f.radius * 0.06; // nhấp nhô chậm theo nhịp bơi
      if (v.flash > 0) v.flash -= dt;
      if (v.flash > 0) {
        v.mat.emissive.setHex(0xffffff);
        v.mat.emissiveIntensity = 1;
      } else if (f.ultUntil > t) {
        v.mat.emissive.setHex(f.species.color);
        v.mat.emissiveIntensity = 0.45 + 0.3 * Math.sin(t * 14);
      } else v.mat.emissive.setHex(0x000000);
    }
    for (const w of this.weapons) {
      if (!w.fish.alive) continue;
      w.update(t);
      const ap = this.fish[w.fish.id].appear;
      w.group.visible = ap > 0.6 && this.charsVisible !== false;
      w.group.scale.setScalar(Math.min(1, ap));
    }
    // bị hạ: bật lên, xoáy tròn, thu nhỏ rồi biến mất
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const o = d.v.outer;
      // khựng lại vài nhịp với mắt "X" (rung nhẹ) rồi mới bật lên xoáy biến mất
      if (d.t < EXPR.dead.hold) {
        o.position.x = d.x + Math.sin(d.t * 70) * 1.5;
        continue;
      }
      o.position.y += dt * 140;
      o.rotation.y += dt * 16;
      o.rotation.z += dt * 6;
      o.scale.multiplyScalar(d.t < 0.12 ? 1 + dt * 3 : 1 - dt * 5);
      if (d.t > EXPR.dead.hold + 0.45 || o.scale.x < 1) {
        o.visible = false;
        this.dying.splice(i, 1);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.clear();
    this.renderer.dispose();
  }
}
