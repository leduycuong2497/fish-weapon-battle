// Hướng mặt (đầu) của cá khi hiển thị — chỉ ảnh hưởng hình ảnh, không đổi mô phỏng/kết quả trận.

// cá cầm vũ khí phía trước mặt → độ lệch giữa hướng mặt và góc vũ khí (dao đôi nằm hai bên thân)
export const FACE_WEAPON = { sword: 0, electric: 0, spear: 0, jaws: 0, mace: 0, blades: Math.PI / 2 };

// các lựa chọn trong bảng điều khiển (mục "Hướng mặt cá")
export const FACE_MODES = [
  { id: 'auto', name: 'Tự động (bơi tự nhiên, đầu theo đường bơi)' },
  { id: 'move', name: 'Đầu hướng thẳng theo đường bơi' },
  { id: 'weapon', name: 'Quay theo vũ khí (xoay cùng vũ khí)' },
  { id: 'target', name: 'Luôn nhìn về đối thủ gần nhất' },
  { id: 'spin', name: 'Xoay vòng chậm tại chỗ' },
  { id: 'spinFast', name: 'Xoay vòng nhanh (con quay)' },
  { id: 'fixed', name: 'Giữ nguyên hướng ban đầu' },
];

const SPIN_SPEED = { spin: 2.5, spinFast: 9 }; // rad/giây

/** Góc mặt theo vũ khí (dùng cho 'weapon' và 'auto' ở kiểu hoạt hình). */
function weaponFacing(f) {
  return f.weaponAngle + (FACE_WEAPON[f.weapon] ?? 0);
}

function nearestEnemy(f, sim) {
  let best = null;
  let bd = Infinity;
  const teams = sim.settings.mode === 'teams';
  for (const o of sim.fish) {
    if (o === f || !o.alive || (teams && o.team === f.team)) continue;
    const d = (o.x - f.x) ** 2 + (o.y - f.y) ** 2;
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/**
 * Góc mặt mong muốn của một con cá.
 * st: trạng thái riêng mỗi con (lưu góc xoay vòng / góc ban đầu); heading: góc mặt hiện tại.
 * Trả về { angle, snap } — snap = true: đặt thẳng góc (không làm mượt), dùng cho xoay vòng.
 */
export function facingAngle(mode, f, { sim, dt, st, heading, style = 'cartoon' }) {
  const move = Math.atan2(f.vy, f.vx);
  switch (mode) {
    case 'move':
      return { angle: move };
    case 'weapon':
      return { angle: weaponFacing(f) };
    case 'target': {
      const o = sim ? nearestEnemy(f, sim) : null;
      return { angle: o ? Math.atan2(o.y - f.y, o.x - f.x) : move };
    }
    case 'spin':
    case 'spinFast': {
      if (st.spin === undefined) st.spin = heading ?? move;
      st.spin += SPIN_SPEED[mode] * (f.id % 2 ? -1 : 1) * dt; // con chẵn xoay thuận, con lẻ xoay ngược
      return { angle: st.spin, snap: true };
    }
    case 'fixed':
      if (st.fixed === undefined) st.fixed = heading ?? move;
      return { angle: st.fixed };
    default:
      // tự động: đầu hướng theo đường bơi như cá thật (muốn quay theo vũ khí như video → chọn 'weapon')
      return { angle: move };
  }
}
