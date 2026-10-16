// Thông số chung của game (mô phỏng, đấu trường, hiển thị). Cấu hình về cá: src/appsettings.js

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
export const DEG = Math.PI / 180;

// Toàn bộ cấu hình về cá nằm trong src/appsettings.js (có chú thích tiếng Việt) — sửa ở đó.
import { BASE_FISH_RADIUS, SPECIES, MOVEMENT, COMBAT, EVOLUTION, ENERGY, LIMITS, FISH_DEFAULTS } from './appsettings.js';

export { BASE_FISH_RADIUS, SPECIES, MOVEMENT, COMBAT, EVOLUTION, ENERGY, LIMITS };

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const TEAM_COLORS = [0xff1744, 0x2979ff, 0x00c853, 0xffab00];
export const TEAM_NAMES = ['Đội Đỏ', 'Đội Xanh', 'Đội Lục', 'Đội Vàng'];

export const SPEED_STEPS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

export const DEFAULT_SETTINGS = {
  seed: '',
  totalFish: FISH_DEFAULTS.totalFish,
  counts: Object.fromEntries(SPECIES.map((s) => [s.id, FISH_DEFAULTS.countPerSpecies])),
  enabled: Object.fromEntries(SPECIES.map((s) => [s.id, true])),
  hpMul: FISH_DEFAULTS.hpMul,
  dmgMul: FISH_DEFAULTS.dmgMul,
  speedMul: FISH_DEFAULTS.speedMul,
  rotMul: FISH_DEFAULTS.rotMul,
  rangeMul: FISH_DEFAULTS.rangeMul,
  massMul: FISH_DEFAULTS.massMul,
  bounce: FISH_DEFAULTS.bounce,
  fishScale: FISH_DEFAULTS.fishScale, // kích thước nhân vật so với đấu trường
  simSpeed: 1,
  arenaShape: 'oval', // oval (bầu dục dọc, hợp video 9:16) | circle | square | rect
  arenaTheme: 'colosseum', // colosseum | reef | sand | ice | lava | temple | abyss | classic | random
  arenaSize: 'auto', // auto | small | medium | large
  effects: 'high', // low | medium | high
  mode: 'ffa', // ffa (sinh tồn tự do) | teams
  teams: 2,
  evolution: FISH_DEFAULTS.evolution,
  healOnKill: FISH_DEFAULTS.healOnKill,
  skills: FISH_DEFAULTS.skills,
  music: false,
  sfx: true,
  randomness: FISH_DEFAULTS.randomness, // hệ số nhân góc đổi hướng ±35°
  wallDeflect: FISH_DEFAULTS.wallDeflect, // độ lệch ngẫu nhiên tối đa sau phản xạ (độ)
  chase: FISH_DEFAULTS.chase, // % khả năng hơi lệch hướng về mục tiêu gần khi đổi hướng (0 = tắt)
  shrink: true, // thu hẹp đấu trường để trận không kéo dài vô hạn
  shrinkStart: 20,
  timeLimit: 180,
  victoryHold: 3,
  showColliders: false,
  energy: FISH_DEFAULTS.energy, // thanh nội năng + tuyệt chiêu khi tích đầy
  presentation: true, // (cũ) bật/tắt màn giới thiệu — nay dùng introStyle
  introStyle: 'cards', // kiểu giới thiệu nhân vật: 'cards' (thẻ giới thiệu) | 'jumbotron' (điện ảnh: màn hình lớn trên khán đài) | 'off'
  intro: true, // màn ra mắt đầu trận: luồng sáng + từng con xuất hiện
  charStyle: FISH_DEFAULTS.charStyle, // 'cartoon' | 'concept' | 'real' | 'model3d'
  faceMode: FISH_DEFAULTS.faceMode, // hướng mặt cá — xem FACE_MODES trong src/render/Facing.js
  render3d: true, // sàn đấu nghiêng 3D + nhân vật 3D; tắt = hình 2D
  crowd: true, // khán đài + khán giả (tiếng đám đông, ném đồ, bóng thoại, trò nghịch) — mọi chủ đề & hình dạng sân, cần chế độ 3D
  recDuration: 30, // 20 | 30 | 45 | 60 | 0 (= đến khi kết thúc, tối đa 90s)
};

export const ARENA_SIZES = { small: 230, medium: 330, large: 470 };

export function autoArenaRadius(count, k = 1) {
  return Math.round(110 + Math.sqrt(count) * 42 * k);
}
