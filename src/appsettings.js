/* ============================================================================
 *  APPSETTINGS — TẤT CẢ CẤU HÌNH VỀ CÁ (sửa ở đây, không cần đụng code khác)
 * ============================================================================
 *
 *  HƯỚNG DẪN SỬ DỤNG
 *  -----------------
 *  1. Mở file này bằng VS Code / Notepad++ (giữ mã hóa UTF-8).
 *  2. Sửa con số / chữ cần đổi, KHÔNG xóa dấu phẩy, ngoặc nhọn { }, ngoặc vuông [ ].
 *  3. Lưu file:
 *       - Đang chạy `npm run dev`  → trang game tự tải lại, thấy thay đổi ngay.
 *       - Bản đã build (thư mục dist) → chạy lại `npm run build`.
 *  4. Nếu sửa xong mà màn hình trắng: mở F12 → tab Console xem dòng báo lỗi
 *     (thường do thiếu dấu phẩy hoặc ngoặc). Hoàn tác (Ctrl+Z) rồi sửa lại.
 *  5. Kiểm tra nhanh sau khi sửa:  npm test   (11 bài kiểm tra phải "pass").
 *
 *  QUY ƯỚC ĐƠN VỊ
 *  --------------
 *  - Độ dài / khoảng cách: "đơn vị" của đấu trường (cá chuẩn có bán kính 22 đơn vị
 *    trước khi nhân "Kích thước cá" trong bảng cài đặt, mặc định ×1,5 → 33).
 *  - Thời gian: giây.   Tốc độ: đơn vị/giây.   Góc / tốc độ xoay: radian (/giây).
 *    1 radian ≈ 57,3°; 3,14 radian = nửa vòng; 6,28 radian = một vòng.
 *  - Hệ số "Mul" (×): 1 = giữ nguyên, 1.5 = tăng 50%, 0.5 = giảm một nửa.
 *  - Tỉ lệ (heal, lifesteal…): 0.15 = 15%.
 *  - Màu: dạng 0xRRGGBB (giống mã màu web #RRGGBB, thay # bằng 0x).
 *
 *  LƯU Ý
 *  -----
 *  - KHÔNG đổi các trường "id" (id loài, id kỹ năng, id tuyệt chiêu, weapon) —
 *    code dùng chúng để chọn mô hình, vũ khí và cách hoạt động của chiêu.
 *    Chỉ đổi tên hiển thị (name, desc, trait, weaponName…) và các con số.
 *  - Các tùy chọn trong bảng điều khiển của game (số lượng cá, ×máu, ×sát thương…)
 *    được lưu trong trình duyệt và nhân THÊM lên các chỉ số dưới đây.
 *    Bấm "ĐẶT LẠI CẤU HÌNH" trong game nếu muốn quay về mặc định.
 *  - Mô phỏng tất định: cùng cấu hình + cùng seed → cùng kết quả. Đổi chỉ số
 *    thì trận "phát lại cùng seed" cũ sẽ diễn ra khác — đó là bình thường.
 * ========================================================================== */

/* ----------------------------------------------------------------------------
 *  1. KÍCH THƯỚC CÁ
 * -------------------------------------------------------------------------- */
export const FISH_SIZES = {
  // true = tất cả các loài to bằng nhau (bỏ qua "size" riêng của từng loài ở mục 2)
  // false = mỗi loài dùng "size" riêng
  equal: true,

  // hệ số kích thước chung khi equal = true (1 = chuẩn; 1.2 = to hơn 20%)
  scale: 1.5,

  // true = cá to dần mỗi lần lên cấp (+ "perLevel.size" ở mục 5); false = giữ nguyên cỡ
  growWithLevel: false,

  // chiều dài hiển thị của mọi mô hình 3D tự thêm (public/models/*.glb),
  // tính theo bán kính va chạm (2.4 = thân dài gấp 2,4 lần bán kính)
  modelLength: 2.4,

  // ngoại lệ riêng từng loài (nhân thêm). Ví dụ: { shark: 1.1, pufferfish: 0.95 }
  perSpecies: {},

  // CHỈ HÌNH ẢNH vũ khí 3D (dài + dày), không đổi tầm đánh/sát thương (1 = vừa đúng tầm đánh; 1.5 = to hơn 50%)
  weaponScale: 2,

  // ngoại lệ hình vũ khí từng loài (nhân thêm vào weaponScale). Ví dụ: { swordfish: 1.3, piranha: 1.2 }
  weaponPerSpecies: {},
};

// bán kính chuẩn của một con cá (đơn vị), trước khi nhân các hệ số kích thước
export const BASE_FISH_RADIUS = 22;

/* ----------------------------------------------------------------------------
 *  2. THÔNG SỐ TỪNG LOÀI CÁ
 * ----------------------------------------------------------------------------
 *  Ý nghĩa các trường:
 *    id           mã loài (KHÔNG đổi)
 *    name         tên tiếng Việt hiển thị trong game
 *    nameEn       tên tiếng Anh (hiện ở thẻ nhân vật)
 *    color        màu chủ đạo (thanh máu, hiệu ứng, chữ tên)
 *    accent       màu phụ (viền, chi tiết)
 *    belly        màu bụng (hình 2D)
 *    hp           máu tối đa
 *    damage       sát thương mỗi đòn trúng
 *    speed        tốc độ bơi (đơn vị/giây)
 *    rotSpeed     tốc độ xoay vũ khí quanh thân (radian/giây; 6.28 = 1 vòng/giây)
 *    range        chiều dài vũ khí tính từ mép thân (đơn vị)
 *    mass         khối lượng — nặng hơn thì bị đẩy lùi ít hơn khi va chạm
 *    size         kích thước riêng (chỉ dùng khi FISH_SIZES.equal = false)
 *    agility      tốc độ đổi hướng bơi tối đa (radian/giây)
 *    hitCooldown  thời gian chờ giữa 2 đòn liên tiếp vào CÙNG một mục tiêu (giây)
 *    weapon       loại vũ khí (KHÔNG đổi): sword | spikes | blades | electric | jaws | mace | spear | hook
 *    skill        kỹ năng (mở khóa khi lên cấp — xem EVOLUTION.unlockSkillLevel)
 *    ult          tuyệt chiêu (tự tung khi thanh nội năng màu xanh đầy)
 *    desc         mô tả ngắn
 *    trait        tính cách (hiện ở màn giới thiệu chiến binh)
 *    weaponName   tên vũ khí hiển thị
 *
 *  Thông số KỸ NĂNG (skill) theo từng loại:
 *    cooldown     thời gian hồi chiêu (giây)
 *    duration     thời gian hiệu lực (giây)
 *    speedMul     × tốc độ bơi khi dùng chiêu
 *    rotMul       × tốc độ xoay vũ khí
 *    rangeMul     × tầm vũ khí
 *    damageMul    × sát thương
 *    cooldownMul  × thời gian chờ giữa các đòn (nhỏ hơn = đánh dồn dập hơn)
 *    triggerDist  khoảng cách tới đối thủ gần nhất để tự kích hoạt (đơn vị)
 *    radius       bán kính vùng ảnh hưởng (đơn vị) — chiêu phóng điện
 *    damage       sát thương của chiêu (không phải của vũ khí)
 *    stun         thời gian choáng gây ra (giây)
 *    slow         thời gian làm chậm (giây)
 *    damageTakenMul × sát thương phải nhận (0.5 = chỉ nhận một nửa)
 *    hpThreshold  tự bật khi máu dưới tỉ lệ này (0.6 = dưới 60%)
 *    passive      true = nội tại, luôn có hiệu lực
 *    lifesteal    tỉ lệ hút máu theo sát thương gây ra (0.25 = 25%)
 *
 *  Thông số TUYỆT CHIÊU (ult):
 *    name / desc  tên và mô tả hiện ở màn "TUYỆT CHIÊU"
 *    duration     thời gian hiệu lực (giây)
 *    radius       bán kính sóng xung kích, tính theo BỘI SỐ bán kính thân cá (4.5 = gấp 4,5 lần)
 *    damage       sát thương sóng xung kích lên địch trong bán kính
 *    knock        lực đẩy lùi địch
 *    stun         choáng địch (giây)
 *    heal         hồi máu ngay theo tỉ lệ máu tối đa (0.15 = 15%)
 *    rotMul / speedMul / rangeMul / damageMul / cooldownMul   như kỹ năng
 *    takenMul     × sát thương phải nhận trong lúc hiệu lực
 * -------------------------------------------------------------------------- */
export const SPECIES = [
  {
    // ===== CÁ KIẾM — tầm xa, đâm mạnh =====
    id: 'swordfish', name: 'Cá Kiếm', nameEn: 'Swordfish',
    color: 0x1e88e5, accent: 0x0d47a1, belly: 0xbbdefb,
    hp: 100, damage: 20, speed: 170, rotSpeed: 4.5, range: 55, mass: 1.0, size: 1.0,
    agility: 3.0, hitCooldown: 0.36,
    weapon: 'sword',
    // Lao tới: tăng tốc độ bơi trong thời gian ngắn
    skill: { id: 'dash', name: 'Lao tới', cooldown: 5, duration: 0.6, speedMul: 1.9 },
    ult: { id: 'bladeStorm', name: 'Kiếm Vũ Bão', desc: 'Chém xoáy diện rộng · Đẩy lùi mọi kẻ địch · Kiếm xoay & lao nhanh', duration: 2.5, radius: 4.5, damage: 26, knock: 280, rotMul: 2.2, speedMul: 1.6 },
    desc: 'Kiếm dài, tầm xa, đâm mạnh.',
    trait: 'Kiêu hãnh, nhanh như chớp, thích đâm xuyên đối thủ',
    weaponName: 'Kiếm dài',
  },
  {
    // ===== CÁ NÓC — gai quanh thân, phồng gai khi địch lại gần =====
    id: 'pufferfish', name: 'Cá Nóc', nameEn: 'Pufferfish',
    color: 0xfdd835, accent: 0xf57f17, belly: 0xfff9c4,
    hp: 120, damage: 12, speed: 125, rotSpeed: 3.2, range: 14, mass: 1.1, size: 1.05,
    agility: 2.6, hitCooldown: 0.45,
    weapon: 'spikes',
    // Phồng gai: gai dài hơn & đau hơn khi có địch trong triggerDist
    skill: { id: 'inflate', name: 'Phồng gai', cooldown: 6, duration: 1.6, rangeMul: 1.8, damageMul: 1.5, triggerDist: 95 },
    ult: { id: 'spikeNova', name: 'Bão Gai Độc', desc: 'Nổ gai độc diện rộng · Gai dài gấp đôi · Sát thương ×1,4', duration: 3, radius: 4.5, damage: 18, knock: 240, rangeMul: 2.0, damageMul: 1.4 },
    desc: 'Gai quanh thân, có thể phồng gai.',
    trait: 'Hiền lành… nhưng chạm vào là phồng gai độc!',
    weaponName: 'Gai nhọn quanh thân',
  },
  {
    // ===== PIRANHA — hai dao, đánh nhanh, cận chiến =====
    id: 'piranha', name: 'Cá Piranha', nameEn: 'Piranha',
    color: 0xe53935, accent: 0x8e0000, belly: 0xffcdd2,
    hp: 85, damage: 10, speed: 185, rotSpeed: 6.0, range: 26, mass: 0.8, size: 0.9,
    agility: 3.4, hitCooldown: 0.25,
    weapon: 'blades',
    // Cuồng loạn: dao xoay nhanh hơn, đánh dồn dập hơn
    skill: { id: 'frenzy', name: 'Cuồng loạn', cooldown: 6, duration: 2.0, rotMul: 1.7, cooldownMul: 0.6, triggerDist: 90 },
    ult: { id: 'feedingFrenzy', name: 'Cuồng Phong Răng', desc: 'Hồi 15% máu · Dao xoay cực nhanh · Đánh liên hoàn', duration: 3, heal: 0.15, rotMul: 2.2, cooldownMul: 0.4, damageMul: 1.3 },
    desc: 'Hai dao ngắn, đánh nhanh, cận chiến.',
    trait: 'Nóng nảy, háu ăn, cắn xé liên hồi',
    weaponName: 'Hai lưỡi dao ngắn',
  },
  {
    // ===== CÁ ĐUỐI — vũ khí điện, phóng sét làm choáng =====
    id: 'stingray', name: 'Cá Đuối', nameEn: 'Stingray',
    color: 0x7e57c2, accent: 0x4527a0, belly: 0xd1c4e9,
    hp: 95, damage: 15, speed: 160, rotSpeed: 4.0, range: 40, mass: 0.9, size: 1.0,
    agility: 2.8, hitCooldown: 0.4,
    weapon: 'electric',
    // Phóng điện: sét tím đánh mọi địch trong radius, gây choáng + làm chậm
    skill: { id: 'discharge', name: 'Phóng điện', cooldown: 5, radius: 115, damage: 7, stun: 0.6, slow: 1.5 },
    ult: { id: 'thunderStorm', name: 'Lôi Điện Vạn Quân', desc: 'Sét đánh diện rộng · Choáng toàn bộ 1,5 giây · Hồi 10% máu', duration: 1.2, radius: 6, damage: 26, stun: 1.5, knock: 160, heal: 0.1 },
    desc: 'Đuôi điện; phóng điện làm choáng xung quanh.',
    trait: 'Bí ẩn, điềm tĩnh, nắm giữ sức mạnh sấm sét',
    weaponName: 'Vũ khí điện',
  },
  {
    // ===== CÁ MẬP BÚA — máu trâu, hút máu khi cắn =====
    id: 'shark', name: 'Cá Mập Búa', nameEn: 'Hammerhead Shark',
    color: 0x78909c, accent: 0x37474f, belly: 0xeceff1,
    hp: 145, damage: 22, speed: 120, rotSpeed: 3.0, range: 24, mass: 1.5, size: 1.2,
    agility: 2.2, hitCooldown: 0.55,
    weapon: 'jaws',
    // Khát máu (nội tại): hồi máu theo lifesteal × sát thương gây ra
    skill: { id: 'bloodlust', name: 'Khát máu', passive: true, lifesteal: 0.25 },
    ult: { id: 'bloodRage', name: 'Cuồng Nộ Huyết Ngư', desc: 'Hồi 10% máu · Sát thương ×1,25 · Tốc độ ×1,3', duration: 2.5, heal: 0.1, damageMul: 1.25, speedMul: 1.3 },
    desc: 'Hàm răng lớn, máu trâu, hút máu khi cắn.',
    trait: 'Bá chủ đại dương, lì đòn và khát máu',
    weaponName: 'Hàm răng lớn',
  },
  {
    // ===== CÁ RÔ PHI — chùy, chỉ số cân bằng, phòng thủ tốt =====
    id: 'tilapia', name: 'Cá Rô Phi', nameEn: 'Tilapia',
    color: 0x607d8b, accent: 0x2e7d32, belly: 0xcfd8dc,
    hp: 115, damage: 18, speed: 145, rotSpeed: 4.0, range: 42, mass: 1.1, size: 1.0,
    agility: 2.8, hitCooldown: 0.35,
    weapon: 'mace',
    // Vảy cứng: tự bật khi máu dưới hpThreshold, giảm sát thương nhận
    skill: { id: 'harden', name: 'Vảy cứng', cooldown: 7, duration: 2.0, damageTakenMul: 0.5, hpThreshold: 0.6 },
    ult: { id: 'ironScale', name: 'Thiết Giáp Rô Phi', desc: 'Giảm 50% sát thương nhận · Sóng chấn động đẩy lùi', duration: 3, takenMul: 0.5, radius: 3.5, damage: 15, knock: 260 },
    desc: 'Chùy ngắn, chỉ số cân bằng.',
    trait: 'Chăm chỉ, bền bỉ, phòng thủ vững như đá',
    weaponName: 'Chùy ngắn',
  },
  {
    // ===== CÁ RỒNG — giáo rất dài, sát thương cao, xoay chậm =====
    id: 'arowana', name: 'Cá Rồng', nameEn: 'Arowana',
    color: 0xffb300, accent: 0xb8860b, belly: 0xfff3c4,
    hp: 95, damage: 28, speed: 135, rotSpeed: 2.8, range: 68, mass: 1.0, size: 1.05,
    agility: 2.5, hitCooldown: 0.5,
    weapon: 'spear',
    // Phóng giáo: giáo dài thêm khi địch ở trong triggerDist
    skill: { id: 'lunge', name: 'Phóng giáo', cooldown: 6, duration: 1.2, rangeMul: 1.4, triggerDist: 140 },
    ult: { id: 'dragonLance', name: 'Long Thương Phá Thiên', desc: 'Giáo dài gấp đôi · Sát thương ×1,4 · Đâm xuyên trận', duration: 2.5, rangeMul: 2.0, damageMul: 1.4 },
    desc: 'Giáo rất dài, sát thương cao, xoay chậm.',
    trait: 'Quý tộc kiêu sa, ra đòn hiểm từ xa',
    weaponName: 'Giáo dài',
  },
  {
    // ===== CÁ NGỰA — đuôi móc, rất nhanh, đổi hướng gắt =====
    id: 'seahorse', name: 'Cá Ngựa', nameEn: 'Seahorse',
    color: 0xff7043, accent: 0xbf360c, belly: 0xffccbc,
    hp: 90, damage: 16, speed: 200, rotSpeed: 5.5, range: 40, mass: 0.7, size: 0.88,
    agility: 4.5, hitCooldown: 0.22,
    weapon: 'hook',
    // Xoáy lốc: bơi nhanh + vũ khí xoay nhanh + đổi chiều xoay
    skill: { id: 'whirl', name: 'Xoáy lốc', cooldown: 3.5, duration: 0.8, speedMul: 1.5, rotMul: 1.6 },
    ult: { id: 'whirlwind', name: 'Lốc Xoáy Đại Dương', desc: 'Xoay ×2,5 · Lướt nhanh ×1,8 · Sát thương ×1,5 · Hồi 15% máu', duration: 3, rotMul: 2.5, speedMul: 1.8, damageMul: 1.5, heal: 0.15 },
    desc: 'Đuôi móc, rất nhanh, đổi hướng nhanh.',
    trait: 'Lanh lợi, tinh nghịch, xoay như cơn lốc',
    weaponName: 'Đuôi móc',
  },
];

/* ----------------------------------------------------------------------------
 *  3. CÁCH BƠI (di chuyển ngẫu nhiên)
 * -------------------------------------------------------------------------- */
const DEG = Math.PI / 180; // đổi độ → radian: 35 * DEG = 35°
export const MOVEMENT = {
  turnIntervalMin: 0.6, // khoảng thời gian ngắn nhất giữa 2 lần tự đổi độ cong đường bơi (giây)
  turnIntervalMax: 2.5, // khoảng thời gian dài nhất giữa 2 lần tự đổi độ cong đường bơi (giây)
  minSpeedFactor: 0.45, // tốc độ thấp nhất = 45% "speed" của loài
  maxSpeedFactor: 1.35, // tốc độ hành trình cao nhất = 135% "speed"
  hardMaxSpeedFactor: 2.6, // giới hạn tuyệt đối (kể cả khi bị đẩy/lao tới) = 260% "speed"
  accel: 2.2, // độ nhanh trở về tốc độ hành trình sau khi bị đẩy (1/giây)
  minInwardDot: 0.22, // sau khi dội tường, hướng bơi phải chếch vào trong ít nhất ~13°
  wallMemory: 6, // số lần dội tường gần nhất được nhớ (để chống kẹt vòng lặp)
  wallMemoryTime: 20, // nhớ trong bao nhiêu giây
  loopZoneRadius: 70, // nếu dội tường lặp lại trong vùng này → bẻ hướng mạnh để thoát
  chaseRadius: 260, // bán kính tìm đối thủ khi bật tùy chọn "đuổi theo" (đơn vị)
  collisionJitter: 8 * DEG, // nhiễu hướng ngẫu nhiên sau mỗi va chạm (±8°)
  // bơi tự nhiên: mỗi chu kỳ đổi hướng (turnInterval) cá chọn một độ cong mới, chuyển dần sang
  wanderTurnRate: 55 * DEG, // tốc độ rẽ tối đa khi bơi uốn lượn (độ/giây) — lớn = lượn gắt hơn
  wanderEase: 1.6, // độ mượt khi đổi độ cong (1/giây) — nhỏ = cong đều, lâu đổi
  strokeRate: 1.6, // số nhịp quẫy đuôi mỗi giây
  strokeSpeed: 0.18, // tốc độ dao động theo nhịp quẫy (0.18 = nhanh/chậm ±18%; 0 = tắt)
};

/* ----------------------------------------------------------------------------
 *  4. CHIẾN ĐẤU
 * -------------------------------------------------------------------------- */
export const COMBAT = {
  weaponGlobalCooldown: 0.05, // thời gian chờ tối thiểu giữa 2 đòn bất kỳ của một con (giây)
  clashCooldown: 0.25, // thời gian chờ giữa 2 lần vũ khí chạm vũ khí (đỡ đòn) (giây)
  knockbackBase: 90, // lực đẩy lùi cơ bản khi bị trúng đòn
  knockbackPerDamage: 7, // lực đẩy lùi cộng thêm theo mỗi điểm sát thương
  recoil: 40, // lực giật ngược người ra đòn
  stunWeaponStop: true, // true = vũ khí ngừng xoay khi bị choáng
};

/* ----------------------------------------------------------------------------
 *  5. TIẾN HÓA (lên cấp khi hạ gục đối thủ)
 * -------------------------------------------------------------------------- */
export const EVOLUTION = {
  maxLevel: 5, // cấp tối đa
  thresholds: [0, 100, 220, 370, 550], // tổng XP cần để đạt cấp 1, 2, 3, 4, 5
  xpPerKill: 100, // XP nhận khi hạ một con
  xpPerVictimLevel: 40, // XP cộng thêm theo mỗi cấp của con bị hạ
  // tăng thêm mỗi cấp (0.08 = +8%): máu, sát thương, tốc độ xoay, tầm đánh, kích thước, tốc độ bơi
  // (kích thước chỉ tăng khi FISH_SIZES.growWithLevel = true)
  perLevel: { hp: 0.08, damage: 0.1, rot: 0.05, range: 0.05, size: 0.03, speed: 0.02 },
  unlockSkillLevel: 3, // cấp mở khóa kỹ năng (nếu kỹ năng chưa có sẵn)
};

/* ----------------------------------------------------------------------------
 *  6. NỘI NĂNG & TUYỆT CHIÊU (thanh màu xanh dưới thanh máu)
 * -------------------------------------------------------------------------- */
export const ENERGY = {
  max: 100, // nội năng tối đa — đầy thì tự tung tuyệt chiêu
  perHitTaken: 4, // nhận thêm mỗi lần bị trúng đòn
  perHpPct: 90, // nhận thêm theo % máu bị mất (mất 10% máu → +9)
  perHitDealt: 1.5, // nhận thêm mỗi lần đánh trúng đối thủ
};

/* ----------------------------------------------------------------------------
 *  7. GIỚI HẠN SỐ LƯỢNG
 * -------------------------------------------------------------------------- */
export const LIMITS = {
  minFish: 2, // ít nhất bao nhiêu con mới bắt đầu được trận
  maxFish: 100, // nhiều nhất bao nhiêu con trong một trận
};

/* ----------------------------------------------------------------------------
 *  8. MẶC ĐỊNH VỀ CÁ TRONG BẢNG ĐIỀU KHIỂN
 *     (giá trị khi mở game lần đầu hoặc bấm "ĐẶT LẠI CẤU HÌNH")
 * -------------------------------------------------------------------------- */
export const FISH_DEFAULTS = {
  totalFish: 8, // tổng số cá mặc định
  countPerSpecies: 1, // số con mỗi loài mặc định
  hpMul: 1, // × máu cho mọi loài
  dmgMul: 1, // × sát thương
  speedMul: 1, // × tốc độ bơi
  rotMul: 1, // × tốc độ xoay vũ khí
  rangeMul: 1, // × tầm vũ khí
  massMul: 1, // × khối lượng
  fishScale: 1.5, // kích thước nhân vật so với đấu trường (nhân đều bán kính, tầm đánh, tốc độ)
  bounce: 0.9, // độ nảy khi va chạm (0 = không nảy, 1 = nảy hoàn toàn)
  evolution: true, // bật lên cấp khi hạ gục
  healOnKill: false, // hồi đầy máu khi hạ gục đối thủ
  skills: true, // bật kỹ năng
  energy: true, // bật thanh nội năng + tuyệt chiêu
  randomness: 1, // × góc đổi hướng ngẫu nhiên
  wallDeflect: 45, // độ lệch ngẫu nhiên tối đa sau khi dội tường (độ)
  chase: 0, // % khả năng hơi lệch hướng về đối thủ gần nhất khi đổi hướng (0 = tắt)
  charStyle: 'cartoon', // kiểu nhân vật: 'cartoon' (giống video) | 'concept' | 'real' | 'model3d'
  // hướng mặt cá (chỉ là hình ảnh): 'auto' | 'move' (đầu thẳng theo đường bơi) | 'weapon' (quay theo vũ khí)
  // | 'target' (nhìn đối thủ gần nhất) | 'spin' (xoay vòng chậm) | 'spinFast' (xoay vòng nhanh) | 'fixed' (giữ hướng ban đầu)
  faceMode: 'auto',
};

/* ----------------------------------------------------------------------------
 *  9. CÂU NÓI CỦA KHÁN GIẢ (bóng thoại trên khán đài — chỉ hiển thị ở kiểu nhân vật 3D, sân tròn/bầu dục)
 *     {cá} sẽ được thay bằng tên loài liên quan (ví dụ "Cá Kiếm"). Thêm/bớt câu thoải mái.
 * -------------------------------------------------------------------------- */
export const CROWD_TALK = {
  enabled: true, // false = tắt bóng thoại
  maxBubbles: 2, // số bóng thoại cùng lúc (lúc chiến thắng được hiện gấp đôi)
  duration: 2.4, // mỗi bóng thoại hiện bao nhiêu giây
  idleEvery: [3.5, 7], // khoảng giây giữa hai câu nói ngẫu nhiên khi trận bình thường
  bigHitDamage: 22, // đòn từ bao nhiêu sát thương thì khán giả la lên
  fontSize: 22, // cỡ chữ (đơn vị thế giới, càng lớn chữ càng to)
};

export const CROWD_LINES = {
  start: ['Hôm nay ai về bờ đây?', 'Vé VIP mà ngồi hàng cuối 😤', 'Cược hết tiền tiêu vặt vào {cá}!', 'Mẹ ơi con lên sóng nè!', 'Trận này chắc căng cực', 'Ai mang bỏng ngô thì chia đi'],
  cheer: ['{cá} đỉnh nóc kịch trần!', '{cá} ơi, quẩy lên!', 'Không {cá} thì không là gì cả', '{cá} số 1, còn lại số 2', 'Fan cứng {cá} có mặt!', 'Đánh cho tụi nó về hồ!'],
  bigHit: ['ỐI GIỜI ƠI!', 'Cú đó chắc đau lắm 😬', 'Ăn trọn combo luôn kìa', 'Ủa alo? Vừa thấy gì vậy?', 'Đánh thế này là có nghề đó', "Tui nghe tiếng 'bốp' từ đây"],
  ultimate: ['TUYỆT CHIÊU KÌA!!!', 'Ủa có chiêu này hả trời', 'Gồng nãy giờ là để chờ cái này', 'Bật mode tức giận rồi đó!', 'Màn hình tui sắp nổ rồi'],
  death: ['Bay màu rồi 😭', 'Yên nghỉ nha {cá}…', 'Mới vô mà đã về', 'Tiền cược của tui…', 'Thôi xong, về nhà nấu canh chua', '{cá} xuống sàn, khán giả xuống tinh thần'],
  wall: ['Đi đâu đó bạn ơi?', 'Tường không phải đối thủ đâu!', 'Bị lạc đường à?', 'Ủa đánh nhau hay đi dạo?'],
  throw: ['Ăn cà chua nè!', 'Cờ lê từ thiện, khỏi cảm ơn', 'Ai ném vậy? Không phải tui 👀', 'Bảo vệ đâu rồi?!', 'Ném trúng là được quà nha', 'Cà chua hữu cơ đó, nhận đi'],
  final2: ['Tim tui không chịu nổi nữa', 'Ai thắng tui cũng khóc', 'Đừng chớp mắt!', '1 vs 1, căng như dây đàn', 'Nín thở đi mọi người…'],
  victory: ['{cá} VÔ ĐỊCH!!! 🏆', 'Biết ngay mà, tui đoán trúng!', 'Xứng đáng, không cãi', 'Ra nhận cúp đi {cá} ơi', 'Trận này đáng đồng tiền vé', 'Hẹn gặp lại mùa sau!'],
  draw: ['Hòa à? Trả tiền vé đây!', 'Hai đứa ôm nhau về luôn đi', 'Đánh mỏi tay mà không ai thắng'],
  lifebuoy: ['Cứu với!!! Phao nè!', 'Bám vào phao đi {cá}!', 'Ráng lên {cá} ơi!', 'Phao cứu sinh tới đây!'],
  feed: ['Ăn đi cho có sức!', 'Thức ăn miễn phí nè!', 'Ăn no rồi đánh tiếp', 'Cám cá loại 1 đó nha'],
  tomatoHit: ['Ê! Ai ném tui?!', 'Trả đũa nè!', 'Áo mới của tui!!!', 'Chiến luôn!'],
  balloon: ['BÙM! Bóng bay của tui…', 'Ai làm nổ bóng vậy?!', 'Đẹp như pháo hoa!'],
  streaker: ['YOLO!!!', 'Cho tui đánh với!', 'Mẹ ơi con xuống sân!'],
  streakerCrowd: ['Ê ê có người xuống sân!', 'Chạy đi! Chạy đi!', 'Bảo vệ đâu rồi?!'],
  security: ['Bắt được rồi nhé!', 'Về chỗ ngồi đi em', 'Lần sau cấm vào sân!'],
  idle: ['Ai bán trà sữa không?', '{cá} ngu', '{cá} về cày ruộng đi', '{cá} óc chó', 'Cho tui xin wifi', 'Ngồi đây nắng quá trời', 'Tui chỉ đến xem cá đẹp thôi', 'Ê, cá Rô Phi kìa, đẹp trai ghê', 'Hàng ghế trước đứng hoài, ngồi xuống đi!'],
};

/* ----------------------------------------------------------------------------
 *  10. TRÒ NGHỊCH CỦA KHÁN GIẢ (chỉ là hình ảnh — không đổi kết quả trận)
 * -------------------------------------------------------------------------- */
export const CROWD_ANTICS = {
  lifebuoy: true, // ném phao cứu sinh khi một con còn dưới lifebuoyHp máu
  lifebuoyHp: 0.15, // ngưỡng máu (0.15 = 15%)
  feed: true, // rắc thức ăn xuống sân
  feedEvery: [14, 24], // giây giữa hai lần rắc
  tomatoWar: true, // cà chua ném hụt trúng khán giả → ném trả qua lại
  tomatoMissChance: 0.18, // tỉ lệ cà chua ném hụt vào khán đài
  tomatoWarRounds: 3, // số lượt ném trả tối đa
  balloons: true, // bóng bay khổng lồ trôi ngang sân, vũ khí chạm là nổ
  balloonEvery: [16, 28], // giây giữa hai quả bóng
  streaker: true, // fan cuồng nhảy xuống sân, cua bảo vệ lôi ra
  streakerEvery: [40, 70], // giây giữa hai lần (hiếm)
};
