// Hình học va chạm của vũ khí. Mỗi loại vũ khí có collider riêng, xoay theo góc vũ khí.
// Shape: { k: 'cap', ax, ay, bx, by, r } (capsule) hoặc { k: 'circ', x, y, r }.

const SPIKE_COUNT = 8;
export const HOOK_CURL = 0.22;

function cap(out, i, cx, cy, ang, d0, d1, r) {
  const s = out[i] || (out[i] = { k: 'cap', ax: 0, ay: 0, bx: 0, by: 0, r: 0, x: 0, y: 0 });
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  s.k = 'cap';
  s.ax = cx + c * d0;
  s.ay = cy + sn * d0;
  s.bx = cx + c * d1;
  s.by = cy + sn * d1;
  s.r = r;
  return i + 1;
}

function circ(out, i, cx, cy, ang, d, r) {
  const s = out[i] || (out[i] = { k: 'circ', ax: 0, ay: 0, bx: 0, by: 0, r: 0, x: 0, y: 0 });
  s.k = 'circ';
  s.x = cx + Math.cos(ang) * d;
  s.y = cy + Math.sin(ang) * d;
  s.r = r;
  return i + 1;
}

/** Chiều dài vũ khí hiện tại (đã tính cấp độ, kỹ năng, cấu hình). */
export function effectiveRange(fish) {
  return fish.range * fish.rangeBuff * (fish.ultRange || 1);
}

/** Tầm với tối đa tính từ tâm cá — dùng cho broad-phase. */
export function weaponReach(fish) {
  const L = effectiveRange(fish);
  const k = fish.k || 1;
  switch (fish.weapon) {
    case 'spikes':
      return fish.radius + L * 0.55 + 4 * k + L * 0.15;
    case 'jaws':
      return fish.radius + L * 0.45 + L * 0.7;
    case 'hook':
      return fish.radius + L + 7 * k;
    case 'mace':
      return fish.radius + L + 2 * k;
    default:
      return fish.radius + L + 6 * k;
  }
}

/** Cập nhật fish.wShapes theo trạng thái hiện tại. Trả về số shape. */
export function computeWeaponShapes(fish) {
  const out = fish.wShapes;
  const x = fish.x;
  const y = fish.y;
  const a = fish.weaponAngle;
  const R = fish.radius;
  const L = effectiveRange(fish);
  const k = fish.k || 1; // hệ số kích thước nhân vật
  let n = 0;
  switch (fish.weapon) {
    case 'sword':
      n = cap(out, n, x, y, a, R * 0.7, R + L, 4.5 * k);
      break;
    case 'spear':
      n = cap(out, n, x, y, a, R * 0.6, R + L, 3.5 * k);
      break;
    case 'blades':
      n = cap(out, n, x, y, a, R * 0.75, R + L, 5 * k);
      n = cap(out, n, x, y, a + Math.PI, R * 0.75, R + L, 5 * k);
      break;
    case 'spikes': {
      const d = R + L * 0.55;
      const r = 4 * k + L * 0.15;
      for (let i = 0; i < SPIKE_COUNT; i++) n = circ(out, n, x, y, a + (i * Math.PI * 2) / SPIKE_COUNT, d, r);
      break;
    }
    case 'electric':
      n = cap(out, n, x, y, a, R * 0.7, R + L, 5 * k);
      break;
    case 'jaws':
      n = circ(out, n, x, y, a, R + L * 0.45, L * 0.7);
      break;
    case 'mace':
      n = circ(out, n, x, y, a, R + L - 10 * k, 12 * k);
      break;
    case 'hook':
      n = cap(out, n, x, y, a, R * 0.7, R + L - 4 * k, 3.5 * k);
      n = circ(out, n, x, y, a + HOOK_CURL, R + L, 7 * k);
      break;
    default:
      n = cap(out, n, x, y, a, R, R + L, 4 * k);
  }
  fish.wShapeCount = n;
  return n;
}

export const SPIKES_PER_PUFFER = SPIKE_COUNT;
