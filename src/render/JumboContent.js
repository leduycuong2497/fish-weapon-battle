// Nội dung chiếu trên màn hình lớn (jumbotron) trong kiểu giới thiệu "điện ảnh".
// s = { phase: 'title' | 'card' | 'ready', t (giây trong pha), sp (loài đang giới thiệu), idx, n,
//       img (chân dung loài đang giới thiệu), list: [{ sp, img }] (mọi loài trong trận) }
const FONT = '"Baloo 2", "Arial Black", sans-serif';
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const backOut = (t) => {
  t = clamp01(t) - 1;
  return 1 + 2.9 * t * t * t + 1.9 * t * t;
};

function fitImage(ctx, img, cx, cy, size, flip = false) {
  if (!img || !img.width) return;
  const k = size / Math.max(img.width, img.height);
  const w = img.width * k;
  const h = img.height * k;
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function rays(ctx, W, H, cx, cy, rot, c1, c2) {
  const R = Math.max(W, H) * 1.3;
  for (let i = 0; i < 18; i++) {
    const a0 = rot + (i / 18) * Math.PI * 2;
    const a1 = a0 + Math.PI / 18;
    ctx.fillStyle = i % 2 ? c1 : c2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    ctx.closePath();
    ctx.fill();
  }
}

function outlined(ctx, text, x, y, size, fill, stroke = '#120a24', align = 'center', maxW) {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y, maxW);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, maxW);
}

/** Lớp "màn hình LED": vạch quét ngang, viền tối, vệt bóng kính, chấm LIVE. */
function screenFx(ctx, W, H, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.6);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // chấm LIVE nhấp nháy
  ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ff1744' : '#7f0b22';
  ctx.beginPath();
  ctx.arc(W - 120, 40, 11, 0, Math.PI * 2);
  ctx.fill();
  outlined(ctx, 'LIVE', W - 64, 41, 30, '#ffffff', '#000000');
}

function drawTitle(ctx, W, H, s) {
  const t = s.t;
  ctx.fillStyle = '#0b1030';
  ctx.fillRect(0, 0, W, H);
  rays(ctx, W, H, W / 2, H * 0.42, t * 0.4, 'rgba(41,121,255,0.35)', 'rgba(0,229,255,0.15)');
  const pop = backOut(t / 0.6);
  outlined(ctx, 'FISH WEAPON', W / 2, H * 0.27, 96 * pop, '#ffd740');
  outlined(ctx, 'BATTLE', W / 2, H * 0.44, 118 * pop, '#40c4ff');
  outlined(ctx, 'TRẬN ĐẤU SẮP BẮT ĐẦU', W / 2, H * 0.6, 40, '#ffffff');
  // hàng chân dung các loài nhún nhảy
  const n = s.list.length;
  const size = Math.min(140, (W - 80) / Math.max(1, n));
  s.list.forEach((e, i) => {
    const x = W / 2 + (i - (n - 1) / 2) * size;
    const y = H * 0.8 - Math.abs(Math.sin(t * 5 + i)) * 14;
    const appear = clamp01((t - 0.5 - i * 0.12) / 0.3);
    if (appear > 0) fitImage(ctx, e.img, x, y, size * 0.95 * backOut(appear));
  });
}

function drawCard(ctx, W, H, s) {
  const { sp, t } = s;
  const c1 = hex(sp.color);
  const c2 = hex(sp.accent ?? sp.color);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, c2);
  bg.addColorStop(1, '#0a0618');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.5;
  rays(ctx, W, H, W * 0.28, H * 0.5, t * 0.7, c1, 'rgba(255,255,255,0.08)');
  ctx.globalAlpha = 1;
  // chân dung bật vào từ trái
  const slide = (1 - easeOut(t / 0.35)) * -W * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(W * 0.28 + slide, H * 0.52, H * 0.36, 0, Math.PI * 2);
  ctx.fill();
  fitImage(ctx, s.img, W * 0.28 + slide, H * 0.52, H * 0.82 * backOut(t / 0.45) * (1 + 0.02 * Math.sin(t * 9)));
  // chữ bên phải trượt vào
  const x = W * 0.53;
  const tx = (1 - easeOut((t - 0.15) / 0.35)) * W * 0.5;
  outlined(ctx, `CHIẾN BINH ${s.idx + 1}/${s.n}`, x + tx, H * 0.17, 34, '#ffd740', '#120a24', 'left');
  outlined(ctx, sp.name.toUpperCase(), x + tx, H * 0.31, 86, '#ffffff', '#120a24', 'left', W - x - 30);
  ctx.fillStyle = '#ffd740';
  ctx.fillRect(x + tx, H * 0.41, (W - x - 40) * easeOut((t - 0.3) / 0.4), 6);
  const lines = [`💬 ${sp.trait || sp.desc || ''}`, `🗡️ Vũ khí: ${sp.weaponName || sp.weapon}`, `✨ Kỹ năng: ${sp.skill?.name || ''}`, `⚡ Tuyệt chiêu: ${sp.ult?.name || ''}`];
  lines.forEach((l, i) => {
    const a = clamp01((t - 0.45 - i * 0.12) / 0.25);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    outlined(ctx, l, x + (1 - a) * 60, H * (0.52 + i * 0.105), 30, '#ffffff', '#120a24', 'left', W - x - 30);
    ctx.globalAlpha = 1;
  });
  // chỉ số: máu & sát thương
  const bar = (label, v, max, y, col) => {
    const k = easeOut((t - 0.9) / 0.6);
    outlined(ctx, label, x, y, 24, '#ffffff', '#120a24', 'left');
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 90, y - 9, W - x - 140, 18);
    ctx.fillStyle = col;
    ctx.fillRect(x + 90, y - 9, (W - x - 140) * Math.min(1, v / max) * k, 18);
  };
  bar('MÁU', sp.hp, 150, H * 0.93 - 30, '#69f0ae');
  bar('ST', sp.damage, 30, H * 0.93, '#ff5252');
  // dải chữ chạy dưới đáy
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H - 6, W, 6);
}

function drawReady(ctx, W, H, s) {
  const t = s.t;
  ctx.fillStyle = '#1a0524';
  ctx.fillRect(0, 0, W, H);
  rays(ctx, W, H, W / 2, H / 2, -t * 0.8, 'rgba(255,23,68,0.35)', 'rgba(255,215,64,0.18)');
  const n = s.list.length;
  s.list.forEach((e, i) => {
    const a = (i / n) * Math.PI * 2 + t * 0.6;
    fitImage(ctx, e.img, W / 2 + Math.cos(a) * W * 0.36, H / 2 + Math.sin(a) * H * 0.34, 120, Math.cos(a) > 0);
  });
  const pulse = 1 + 0.06 * Math.sin(t * 10);
  outlined(ctx, 'SẴN SÀNG?', W / 2, H * 0.4, 92 * pulse, '#ffd740');
  outlined(ctx, '⚔ CHIẾN! ⚔', W / 2, H * 0.6, 110 * backOut((t - 0.5) / 0.4) * pulse, '#ff5252');
}

export function drawJumboFrame(ctx, W, H, s) {
  ctx.save();
  if (s.phase === 'title') drawTitle(ctx, W, H, s);
  else if (s.phase === 'card') drawCard(ctx, W, H, s);
  else drawReady(ctx, W, H, s);
  ctx.restore();
  screenFx(ctx, W, H, s.clock ?? s.t);
}
