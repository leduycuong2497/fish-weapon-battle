import { BASE_FISH_RADIUS, MOVEMENT } from '../config.js';
import { RNG } from '../sim/rng.js';
import { speciesSize } from '../fish-sizes.js';

/**
 * Trạng thái một con cá trong mô phỏng (không chứa gì liên quan tới hiển thị).
 */
export function createFish({ id, species, settings, seed, team, x, y, heading, weaponAngle, weaponDir }) {
  const rng = new RNG(seed);
  const k = settings.fishScale || 1; // hệ số kích thước nhân vật
  const cruise = species.speed * settings.speedMul * k;
  const maxHp = Math.round(species.hp * settings.hpMul);
  const fish = {
    id,
    speciesId: species.id,
    species,
    name: `${species.name} #${id + 1}`,
    team,
    rng,
    seed,

    // vật lý
    x,
    y,
    vx: Math.cos(heading) * cruise,
    vy: Math.sin(heading) * cruise,
    heading,
    targetHeading: heading,
    cruiseSpeed: cruise,
    minSpeed: cruise * MOVEMENT.minSpeedFactor,
    maxSpeed: cruise * MOVEMENT.maxSpeedFactor,
    baseRadius: 0,
    radius: BASE_FISH_RADIUS * speciesSize(species) * k,
    k,
    mass: species.mass * settings.massMul,
    agility: species.agility,
    turnTimer: rng.range(MOVEMENT.turnIntervalMin, MOVEMENT.turnIntervalMax),
    turnRate: 0, // tốc độ rẽ hiện tại (rad/giây) — bơi uốn lượn
    turnRateTarget: 0,
    strokePhase: rng.range(0, Math.PI * 2), // pha nhịp quẫy đuôi
    strokeMul: rng.range(0.85, 1.15), // mỗi con quẫy nhanh/chậm khác nhau một chút
    lastWallHitTime: -1,
    lastWallStep: -1,
    wallHits: [],
    lastCollisionTime: -1,
    contactSteps: 0,

    // vũ khí
    weapon: species.weapon,
    weaponAngle,
    weaponDir,
    rotSpeed: species.rotSpeed * settings.rotMul,
    range: species.range * settings.rangeMul * k,
    rangeBuff: 1,
    damage: species.damage * settings.dmgMul,
    hitCooldown: species.hitCooldown,
    lastHitOn: new Map(), // targetId -> time
    weaponReadyAt: 0,
    wShapes: [],
    wShapeCount: 0,
    reach: 0,

    // máu & trạng thái
    maxHp,
    hp: maxHp,
    alive: true,
    pendingDeath: false,
    killedBy: -1,
    deathTime: -1,
    stunUntil: -1,
    slowUntil: -1,
    damageTakenMul: 1,

    // kỹ năng
    skillReadyAt: 0,
    skillActiveUntil: -1,
    skillUnlocked: !!settings.skills,
    speedBuff: 1,
    rotBuff: 1,
    damageBuff: 1,
    cooldownBuff: 1,

    // tiến hóa
    level: 1,
    xp: 0,
    levelMul: { hp: 1, damage: 1, rot: 1, range: 1, size: 1, speed: 1 },

    // thống kê
    hits: 0, // số đòn trúng đối thủ
    hitsTaken: 0,
    damageDealt: 0,
    damageTaken: 0,
    kills: 0,

    // nội năng & tuyệt chiêu
    energy: 0,
    ultUntil: -1,
    ultCount: 0,
    ultRot: 1,
    ultSpeed: 1,
    ultRange: 1,
    ultDmg: 1,
    ultCd: 1,
    ultTaken: 1,
  };
  fish.baseRadius = fish.radius;
  // kỹ năng có thời gian hồi bắt đầu lệch nhau để không đồng loạt kích hoạt
  fish.skillReadyAt = rng.range(0.5, 2.5);
  return fish;
}

export function isStunned(fish, t) {
  return fish.stunUntil > t;
}
