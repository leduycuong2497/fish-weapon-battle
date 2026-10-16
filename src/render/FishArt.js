// Vẽ nhân vật cá theo phong cách tả thực bằng Canvas 2D → texture Phaser.
// Nhìn nghiêng, đầu hướng sang phải; khi bơi sang trái sprite được lật ngang.
// Tâm (0,0) là tâm collider thân (bán kính R). Dáng cá thật thuôn dài nên đuôi/mõm
// vượt ra ngoài vòng tròn một chút — phần thân chính vẫn nằm trong collider.
// (Phong cách chibi cũ vẫn giữ trong FishArtChibi.js.)

export const ART_R = 64;
export const TEX_W = 280;
export const TEX_H = 232;

// Bảng màu tả thực (tách khỏi màu nhận diện trong config, vốn dùng cho UI/hiệu ứng).
const REAL = {
  swordfish: { back: '#1f2f57', mid: '#4f6d9a', belly: '#e3e8ef', fin: '#2a3550' },
  pufferfish: { back: '#8a7440', mid: '#cdb873', belly: '#f6f2e4', fin: '#c8a85a', spot: '#4a3a1c' },
  piranha: { back: '#5d6870', mid: '#a9b4bb', belly: '#e0462a', fin: '#3c4348' },
  stingray: { back: '#7a5a34', mid: '#a7834f', belly: '#e9dcc3', spot: '#2aa9ff' },
  shark: { back: '#55626d', mid: '#8a99a5', belly: '#f3f5f6', fin: '#4b5761' },
  tilapia: { back: '#4d5b4a', mid: '#8f9c88', belly: '#dfe3d6', fin: '#a2533f' },
  arowana: { back: '#9a6a12', mid: '#e3ad35', belly: '#ffe8a8', fin: '#c98a1a' },
  seahorse: { back: '#a3501c', mid: '#e5853d', belly: '#f6c890', fin: '#f0b27a' },
};

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Thân dạng thoi (fusiform) — đường cong bezier từ mõm → lưng → cuống đuôi → bụng. */
function bodyPath({ nx, ny = 0, hx, H, B, tx, th }) {
  const p = new Path2D();
  p.moveTo(nx, ny);
  p.bezierCurveTo(nx, ny - H * 0.6, hx + (nx - hx) * 0.45, -H, hx, -H);
  p.bezierCurveTo(hx - (hx - tx) * 0.45, -H, tx + (hx - tx) * 0.25, -th * 1.25, tx, -th);
  p.lineTo(tx, th);
  p.bezierCurveTo(tx + (hx - tx) * 0.25, th * 1.25, hx - (hx - tx) * 0.45, B, hx, B);
  p.bezierCurveTo(hx + (nx - hx) * 0.45, B, nx, ny + B * 0.5, nx, ny);
  p.closePath();
  return p;
}

/** Tô thân với đổ bóng ngược (lưng tối, bụng sáng) + vảy + đường bên + viền mảnh. */
function shadeBody(ctx, path, pal, top, bottom, { scales = 0.13, scaleAlpha = 0.18, lateral = null, spots = null } = {}) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, pal.back);
  g.addColorStop(0.42, pal.mid);
  g.addColorStop(0.7, pal.belly);
  g.addColorStop(1, pal.belly);
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  if (scales > 0) {
    const s = 64 * scales;
    ctx.strokeStyle = `rgba(20,20,30,${scaleAlpha})`;
    ctx.lineWidth = 1.1;
    for (let row = 0, y = top; y < bottom + s; y += s * 0.55, row++) {
      for (let x = -200 + (row % 2 ? s * 0.5 : 0); x < 200; x += s) {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.55, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }
  }
  if (spots) spots();
  // bóng sáng dọc lưng & bóng tối dưới bụng → khối 3D
  const hl = ctx.createLinearGradient(0, top, 0, bottom);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.3, 'rgba(255,255,255,0.18)');
  hl.addColorStop(0.45, 'rgba(255,255,255,0)');
  hl.addColorStop(0.85, 'rgba(0,0,0,0)');
  hl.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = hl;
  ctx.fillRect(-300, top - 10, 600, bottom - top + 20);
  ctx.restore();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(15,15,25,0.55)';
  ctx.stroke(path);
  if (lateral) lateral();
}

/** Vây bán trong suốt có tia vây. */
function fin(ctx, color, path, rays = [], alpha = 0.85) {
  const p2 = new Path2D();
  path(p2);
  p2.closePath();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill(p2);
  ctx.globalAlpha = 1;
  if (rays.length) {
    ctx.save();
    ctx.clip(p2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of rays) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(15,15,25,0.45)';
  ctx.stroke(p2);
  ctx.restore();
}

/** Tia vây tỏa từ gốc (ox,oy) tới cung a0..a1 bán kính r. */
function fan(ox, oy, a0, a1, r, n = 7) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([ox, oy, ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
  }
  return out;
}

/** Mắt tả thực: tròng màu, con ngươi đen, điểm phản quang nhỏ. */
function eye(ctx, x, y, r, iris = '#c9a227') {
  ctx.beginPath();
  ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, iris);
  g.addColorStop(1, '#3b2a10');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.08, y + r * 0.05, r * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = '#050508';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
}

/** Nắp mang. */
function gill(ctx, x, top, bottom, bend) {
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.quadraticCurveTo(x - bend, (top + bottom) / 2, x, bottom);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(20,20,30,0.4)';
  ctx.stroke();
}

function lateralLine(ctx, x0, x1, y0, y1) {
  return () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 4, x1, y1);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
  };
}

function teeth(ctx, R, x0, y0, n, step, dy, size, down = true) {
  ctx.fillStyle = '#f6f4ee';
  for (let i = 0; i < n; i++) {
    const x = R * (x0 + i * step);
    const y = R * (y0 - i * dy);
    ctx.beginPath();
    ctx.moveTo(x - R * size * 0.5, y);
    ctx.lineTo(x + R * size * 0.5, y);
    ctx.lineTo(x, y + (down ? 1 : -1) * R * size * 1.2);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------------- từng loài ----------------

const ART = {
  swordfish(ctx, R) {
    const p = REAL.swordfish;
    // đuôi lưỡi liềm
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 1.15, -R * 0.08);
      c.quadraticCurveTo(-R * 1.45, -R * 0.45, -R * 1.85, -R * 1.0);
      c.quadraticCurveTo(-R * 1.6, -R * 0.3, -R * 1.5, 0);
      c.quadraticCurveTo(-R * 1.6, R * 0.3, -R * 1.85, R * 1.0);
      c.quadraticCurveTo(-R * 1.45, R * 0.45, -R * 1.15, R * 0.08);
    }, fan(-R * 1.2, 0, Math.PI * 0.72, Math.PI * 1.28, R * 0.8, 8), 0.95);
    // vây lưng cao hình lưỡi liềm sát đầu
    fin(ctx, p.fin, (c) => {
      c.moveTo(R * 0.05, -R * 0.45);
      c.quadraticCurveTo(-R * 0.05, -R * 1.25, -R * 0.35, -R * 1.35);
      c.quadraticCurveTo(-R * 0.3, -R * 0.85, -R * 0.55, -R * 0.4);
    }, fan(-R * 0.2, -R * 0.45, -Math.PI * 0.62, -Math.PI * 0.42, R * 0.9, 6), 0.95);
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.55, R * 0.38);
      c.quadraticCurveTo(-R * 0.75, R * 0.75, -R * 0.85, R * 0.72);
      c.quadraticCurveTo(-R * 0.8, R * 0.5, -R * 0.82, R * 0.3);
    });
    shadeBody(ctx, bodyPath({ nx: R * 1.2, ny: -R * 0.02, hx: R * 0.15, H: R * 0.5, B: R * 0.46, tx: -R * 1.15, th: R * 0.09 }), p, -R * 0.5, R * 0.46, { scales: 0, lateral: lateralLine(ctx, R * 0.6, -R * 1.1, -R * 0.06, -R * 0.02) });
    gill(ctx, R * 0.6, -R * 0.32, R * 0.32, R * 0.12);
    // vây ngực dài
    fin(ctx, p.fin, (c) => {
      c.moveTo(R * 0.5, R * 0.15);
      c.quadraticCurveTo(R * 0.1, R * 0.45, -R * 0.35, R * 0.62);
      c.quadraticCurveTo(R * 0.1, R * 0.3, R * 0.45, R * 0.28);
    }, [], 0.9);
    eye(ctx, R * 0.85, -R * 0.1, R * 0.13, '#8fb3d9');
  },

  pufferfish(ctx, R) {
    const p = REAL.pufferfish;
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.9, -R * 0.15);
      c.quadraticCurveTo(-R * 1.25, -R * 0.45, -R * 1.42, -R * 0.3);
      c.quadraticCurveTo(-R * 1.5, 0, -R * 1.42, R * 0.3);
      c.quadraticCurveTo(-R * 1.25, R * 0.45, -R * 0.9, R * 0.15);
    }, fan(-R * 0.9, 0, Math.PI * 0.82, Math.PI * 1.18, R * 0.55, 7));
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.45, -R * 0.85);
      c.quadraticCurveTo(-R * 0.75, -R * 1.15, -R * 0.85, -R * 0.75);
    }, fan(-R * 0.5, -R * 0.8, -Math.PI * 0.85, -Math.PI * 0.6, R * 0.4, 4));
    // thân phồng gần tròn
    const ball = new Path2D();
    ball.ellipse(0, 0, R * 1.02, R * 0.95, 0, 0, Math.PI * 2);
    shadeBody(ctx, ball, p, -R * 0.95, R * 0.95, {
      scales: 0,
      spots: () => {
        ctx.fillStyle = rgba(p.spot, 0.55);
        const pts = [[-0.5, -0.5, 0.11], [-0.15, -0.7, 0.09], [0.2, -0.62, 0.08], [-0.7, -0.15, 0.1], [-0.3, -0.25, 0.12], [0.1, -0.3, 0.07], [0.45, -0.4, 0.06], [-0.55, 0.15, 0.07]];
        for (const [x, y, r] of pts) {
          ctx.beginPath();
          ctx.arc(R * x, R * y, R * r, 0, Math.PI * 2);
          ctx.fill();
        }
        // gai nhỏ li ti trên da
        ctx.fillStyle = 'rgba(60,45,20,0.35)';
        for (let i = 0; i < 70; i++) {
          const a = (i * 2.3999) % (Math.PI * 2);
          const d = R * (0.2 + ((i * 37) % 70) / 90);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
    // miệng mỏ nhỏ
    ctx.beginPath();
    ctx.ellipse(R * 1.0, R * 0.12, R * 0.08, R * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d9c9a0';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(40,30,10,0.6)';
    ctx.stroke();
    fin(ctx, p.fin, (c) => {
      c.moveTo(R * 0.35, R * 0.05);
      c.quadraticCurveTo(R * 0.1, -R * 0.12, R * 0.05, R * 0.18);
      c.quadraticCurveTo(R * 0.15, R * 0.35, R * 0.35, R * 0.2);
    }, fan(R * 0.35, R * 0.12, Math.PI * 0.85, Math.PI * 1.15, R * 0.3, 5));
    eye(ctx, R * 0.55, -R * 0.28, R * 0.15, '#3fae8f');
  },

  piranha(ctx, R) {
    const p = REAL.piranha;
    fin(ctx, '#2a2f33', (c) => {
      c.moveTo(-R * 0.95, -R * 0.15);
      c.quadraticCurveTo(-R * 1.35, -R * 0.55, -R * 1.6, -R * 0.65);
      c.quadraticCurveTo(-R * 1.45, 0, -R * 1.6, R * 0.65);
      c.quadraticCurveTo(-R * 1.35, R * 0.55, -R * 0.95, R * 0.15);
    }, fan(-R * 1.0, 0, Math.PI * 0.78, Math.PI * 1.22, R * 0.7, 8));
    // vây lưng + vây mỡ
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.1, -R * 0.82);
      c.quadraticCurveTo(-R * 0.35, -R * 1.2, -R * 0.62, -R * 0.68);
    }, fan(-R * 0.15, -R * 0.8, -Math.PI * 0.85, -Math.PI * 0.6, R * 0.4, 5));
    ctx.beginPath();
    ctx.ellipse(-R * 0.82, -R * 0.42, R * 0.1, R * 0.05, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = p.fin;
    ctx.fill();
    fin(ctx, '#b33a22', (c) => {
      c.moveTo(-R * 0.3, R * 0.75);
      c.quadraticCurveTo(-R * 0.6, R * 1.05, -R * 0.85, R * 0.55);
    }, fan(-R * 0.35, R * 0.72, Math.PI * 0.6, Math.PI * 0.85, R * 0.35, 5));
    // thân sâu dạng đĩa
    shadeBody(ctx, bodyPath({ nx: R * 1.05, ny: R * 0.2, hx: -R * 0.05, H: R * 0.88, B: R * 0.85, tx: -R * 0.98, th: R * 0.16 }), p, -R * 0.88, R * 0.85, {
      scales: 0.09,
      scaleAlpha: 0.12,
      spots: () => {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < 26; i++) {
          ctx.beginPath();
          ctx.arc(-R * 0.7 + (((i * 53) % 130) / 100) * R, -R * 0.6 + (((i * 29) % 80) / 100) * R, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
    gill(ctx, R * 0.5, -R * 0.45, R * 0.5, R * 0.15);
    // hàm dưới nhô + răng tam giác
    ctx.beginPath();
    ctx.moveTo(R * 0.55, R * 0.3);
    ctx.quadraticCurveTo(R * 0.9, R * 0.5, R * 1.12, R * 0.22);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(30,15,15,0.8)';
    ctx.stroke();
    teeth(ctx, R, 0.72, 0.36, 4, 0.1, 0.03, 0.08, false);
    fin(ctx, '#c4452a', (c) => {
      c.moveTo(R * 0.4, R * 0.15);
      c.quadraticCurveTo(R * 0.05, R * 0.25, -R * 0.1, R * 0.45);
      c.quadraticCurveTo(R * 0.15, R * 0.4, R * 0.4, R * 0.3);
    });
    eye(ctx, R * 0.68, -R * 0.12, R * 0.13, '#d33b1f');
  },

  stingray(ctx, R) {
    // cá đuối nhìn từ trên xuống: đĩa thân dẹt (cá đuối chấm xanh)
    const p = REAL.stingray;
    const disc = new Path2D();
    disc.moveTo(R * 1.05, 0);
    disc.bezierCurveTo(R * 1.0, -R * 0.75, R * 0.2, -R * 1.18, -R * 0.4, -R * 1.0);
    disc.bezierCurveTo(-R * 0.95, -R * 0.82, -R * 1.05, -R * 0.3, -R * 0.95, 0);
    disc.bezierCurveTo(-R * 1.05, R * 0.3, -R * 0.95, R * 0.82, -R * 0.4, R * 1.0);
    disc.bezierCurveTo(R * 0.2, R * 1.18, R * 1.0, R * 0.75, R * 1.05, 0);
    disc.closePath();
    const g = ctx.createRadialGradient(R * 0.1, 0, R * 0.1, 0, 0, R * 1.15);
    g.addColorStop(0, p.mid);
    g.addColorStop(0.7, p.back);
    g.addColorStop(1, '#4e3a20');
    ctx.fillStyle = g;
    ctx.fill(disc);
    ctx.save();
    ctx.clip(disc);
    for (let i = 0; i < 34; i++) {
      const a = i * 2.3999;
      const d = R * (0.15 + ((i * 41) % 80) / 100);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d * 1.05;
      ctx.beginPath();
      ctx.arc(x, y, 3.2 + (i % 3), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15,60,110,0.6)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 2.2 + (i % 3), 0, Math.PI * 2);
      ctx.fillStyle = p.spot;
      ctx.fill();
    }
    // gờ giữa thân
    const ridge = ctx.createLinearGradient(0, -R * 0.4, 0, R * 0.4);
    ridge.addColorStop(0, 'rgba(0,0,0,0)');
    ridge.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    ridge.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ridge;
    ctx.beginPath();
    ctx.ellipse(-R * 0.05, 0, R * 0.8, R * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(30,20,10,0.6)';
    ctx.stroke(disc);
    // mắt lồi trên lưng + lỗ thở
    for (const s of [-1, 1]) {
      eye(ctx, R * 0.45, s * R * 0.24, R * 0.1, '#c8a13a');
      ctx.beginPath();
      ctx.ellipse(R * 0.3, s * R * 0.3, R * 0.06, R * 0.035, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,20,10,0.6)';
      ctx.fill();
    }
  },

  shark(ctx, R) {
    const p = REAL.shark;
    // đuôi lệch (thùy trên dài hơn)
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 1.1, -R * 0.12);
      c.quadraticCurveTo(-R * 1.5, -R * 0.5, -R * 2.0, -R * 1.05);
      c.quadraticCurveTo(-R * 1.75, -R * 0.35, -R * 1.62, -R * 0.02);
      c.quadraticCurveTo(-R * 1.7, R * 0.25, -R * 1.78, R * 0.55);
      c.quadraticCurveTo(-R * 1.4, R * 0.3, -R * 1.1, R * 0.1);
    }, [], 1);
    // vây lưng tam giác cao
    fin(ctx, p.fin, (c) => {
      c.moveTo(R * 0.05, -R * 0.52);
      c.quadraticCurveTo(-R * 0.15, -R * 1.0, -R * 0.45, -R * 1.42);
      c.quadraticCurveTo(-R * 0.45, -R * 0.9, -R * 0.65, -R * 0.48);
    }, [], 1);
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.8, -R * 0.28);
      c.lineTo(-R * 0.95, -R * 0.52);
      c.lineTo(-R * 0.98, -R * 0.26);
    }, [], 1);
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.55, R * 0.36);
      c.lineTo(-R * 0.75, R * 0.6);
      c.lineTo(-R * 0.8, R * 0.3);
    }, [], 1);
    shadeBody(ctx, bodyPath({ nx: R * 1.32, ny: -R * 0.05, hx: 0, H: R * 0.58, B: R * 0.5, tx: -R * 1.12, th: R * 0.12 }), p, -R * 0.58, R * 0.5, { scales: 0 });
    // khe mang
    for (let i = 0; i < 5; i++) {
      const x = R * (0.62 - i * 0.09);
      ctx.beginPath();
      ctx.moveTo(x, -R * 0.2);
      ctx.quadraticCurveTo(x - R * 0.05, R * 0.02, x, R * 0.2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(30,35,40,0.5)';
      ctx.stroke();
    }
    // miệng dưới mõm
    ctx.beginPath();
    ctx.moveTo(R * 0.72, R * 0.28);
    ctx.quadraticCurveTo(R * 0.95, R * 0.36, R * 1.1, R * 0.2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(40,20,25,0.75)';
    ctx.stroke();
    teeth(ctx, R, 0.78, 0.31, 5, 0.065, 0.02, 0.05, true);
    // vây ngực lớn
    fin(ctx, p.fin, (c) => {
      c.moveTo(R * 0.35, R * 0.3);
      c.quadraticCurveTo(R * 0.1, R * 0.7, -R * 0.2, R * 0.98);
      c.quadraticCurveTo(R * 0.05, R * 0.55, R * 0.05, R * 0.38);
    }, [], 1);
    eye(ctx, R * 0.9, -R * 0.16, R * 0.08, '#2a2a2a');
  },

  tilapia(ctx, R) {
    const p = REAL.tilapia;
    // đuôi tròn có sọc đen đặc trưng của rô phi
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.95, -R * 0.22);
      c.quadraticCurveTo(-R * 1.55, -R * 0.6, -R * 1.62, 0);
      c.quadraticCurveTo(-R * 1.55, R * 0.6, -R * 0.95, R * 0.22);
    }, [
      [-R * 1.15, -R * 0.45, -R * 1.15, R * 0.45],
      [-R * 1.3, -R * 0.5, -R * 1.3, R * 0.5],
      [-R * 1.45, -R * 0.42, -R * 1.45, R * 0.42],
    ]);
    // vây lưng dài có gai
    fin(ctx, '#6a7462', (c) => {
      c.moveTo(R * 0.55, -R * 0.62);
      c.quadraticCurveTo(R * 0.2, -R * 1.05, -R * 0.4, -R * 1.02);
      c.quadraticCurveTo(-R * 0.95, -R * 0.95, -R * 1.2, -R * 0.4);
      c.lineTo(-R * 0.9, -R * 0.35);
    }, fan(-R * 0.2, -R * 0.5, -Math.PI * 0.95, -Math.PI * 0.2, R * 0.6, 12));
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.2, R * 0.6);
      c.quadraticCurveTo(-R * 0.8, R * 0.95, -R * 1.15, R * 0.4);
      c.lineTo(-R * 0.85, R * 0.35);
    }, fan(-R * 0.5, R * 0.5, Math.PI * 0.2, Math.PI * 0.8, R * 0.5, 7));
    shadeBody(ctx, bodyPath({ nx: R * 1.1, ny: R * 0.08, hx: -R * 0.05, H: R * 0.72, B: R * 0.65, tx: -R * 0.95, th: R * 0.24 }), p, -R * 0.72, R * 0.65, {
      scales: 0.12,
      scaleAlpha: 0.22,
      spots: () => {
        ctx.fillStyle = 'rgba(30,40,30,0.18)';
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.ellipse(R * 0.35 - i * R * 0.25, -R * 0.1, R * 0.06, R * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      lateral: lateralLine(ctx, R * 0.6, -R * 0.9, -R * 0.35, -R * 0.05),
    });
    gill(ctx, R * 0.6, -R * 0.45, R * 0.42, R * 0.18);
    // môi dày
    ctx.beginPath();
    ctx.moveTo(R * 0.92, R * 0.15);
    ctx.quadraticCurveTo(R * 1.08, R * 0.2, R * 1.13, R * 0.08);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(60,50,45,0.75)';
    ctx.stroke();
    fin(ctx, p.fin, (c) => {
      c.moveTo(R * 0.45, R * 0.12);
      c.quadraticCurveTo(R * 0.05, R * 0.2, -R * 0.15, R * 0.45);
      c.quadraticCurveTo(R * 0.15, R * 0.4, R * 0.45, R * 0.28);
    });
    eye(ctx, R * 0.78, -R * 0.15, R * 0.13, '#d8a43c');
  },

  arowana(ctx, R) {
    const p = REAL.arowana;
    // đuôi quạt
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 1.1, -R * 0.15);
      c.quadraticCurveTo(-R * 1.6, -R * 0.55, -R * 1.85, -R * 0.2);
      c.quadraticCurveTo(-R * 1.95, 0, -R * 1.85, R * 0.2);
      c.quadraticCurveTo(-R * 1.6, R * 0.55, -R * 1.1, R * 0.15);
    }, fan(-R * 1.1, 0, Math.PI * 0.85, Math.PI * 1.15, R * 0.8, 9));
    // vây lưng & vây hậu môn lùi về gần đuôi
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.4, -R * 0.42);
      c.quadraticCurveTo(-R * 0.95, -R * 0.75, -R * 1.25, -R * 0.3);
      c.lineTo(-R * 1.05, -R * 0.18);
    }, fan(-R * 0.75, -R * 0.3, -Math.PI * 0.95, -Math.PI * 0.55, R * 0.45, 7));
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.25, R * 0.42);
      c.quadraticCurveTo(-R * 0.9, R * 0.85, -R * 1.25, R * 0.3);
      c.lineTo(-R * 1.05, R * 0.18);
    }, fan(-R * 0.7, R * 0.3, Math.PI * 0.55, Math.PI * 0.95, R * 0.5, 7));
    // thân dài, lưng thẳng, miệng hếch
    shadeBody(ctx, bodyPath({ nx: R * 1.3, ny: -R * 0.22, hx: R * 0.05, H: R * 0.5, B: R * 0.5, tx: -R * 1.1, th: R * 0.16 }), p, -R * 0.5, R * 0.5, {
      scales: 0,
      spots: () => {
        // vảy lớn ánh kim xếp lưới — đặc trưng cá rồng
        const s = R * 0.24;
        for (let row = -2; row <= 2; row++) {
          for (let col = -5; col <= 4; col++) {
            const x = col * s * 0.85 + (row % 2 ? s * 0.42 : 0);
            const y = row * s * 0.75;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.55, -Math.PI / 2, Math.PI / 2);
            ctx.closePath();
            const g = ctx.createLinearGradient(x - s * 0.3, y - s * 0.5, x + s * 0.5, y + s * 0.5);
            g.addColorStop(0, 'rgba(255,240,180,0.55)');
            g.addColorStop(1, 'rgba(150,95,10,0.25)');
            ctx.fillStyle = g;
            ctx.fill();
            ctx.lineWidth = 1.3;
            ctx.strokeStyle = 'rgba(110,70,5,0.55)';
            ctx.stroke();
          }
        }
      },
    });
    gill(ctx, R * 0.75, -R * 0.38, R * 0.32, R * 0.15);
    // râu cằm
    ctx.beginPath();
    ctx.moveTo(R * 1.18, -R * 0.12);
    ctx.quadraticCurveTo(R * 1.45, -R * 0.05, R * 1.55, R * 0.1);
    ctx.moveTo(R * 1.12, -R * 0.08);
    ctx.quadraticCurveTo(R * 1.35, R * 0.05, R * 1.4, R * 0.2);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#a77514';
    ctx.stroke();
    // miệng hếch lên
    ctx.beginPath();
    ctx.moveTo(R * 0.85, -R * 0.12);
    ctx.lineTo(R * 1.3, -R * 0.24);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(80,50,5,0.7)';
    ctx.stroke();
    fin(ctx, p.fin, (c) => {
      c.moveTo(R * 0.6, R * 0.22);
      c.quadraticCurveTo(R * 0.2, R * 0.55, -R * 0.15, R * 0.72);
      c.quadraticCurveTo(R * 0.25, R * 0.42, R * 0.55, R * 0.34);
    }, fan(R * 0.58, R * 0.28, Math.PI * 0.75, Math.PI * 0.85, R * 0.8, 4));
    eye(ctx, R * 1.0, -R * 0.2, R * 0.12, '#e0c34a');
  },

  seahorse(ctx, R) {
    // cá ngựa đứng thẳng: đầu có mõm ống hướng phải, thân đốt, đuôi cuộn
    const p = REAL.seahorse;
    fin(ctx, p.fin, (c) => {
      c.moveTo(-R * 0.32, -R * 0.05);
      c.quadraticCurveTo(-R * 0.75, R * 0.05, -R * 0.35, R * 0.35);
    }, fan(-R * 0.33, R * 0.12, Math.PI * 0.7, Math.PI * 1.3, R * 0.35, 6));
    const trunk = new Path2D();
    trunk.moveTo(R * 0.15, -R * 0.55);
    trunk.bezierCurveTo(R * 0.6, -R * 0.35, R * 0.55, R * 0.35, R * 0.15, R * 0.62);
    trunk.bezierCurveTo(-R * 0.05, R * 0.75, -R * 0.3, R * 0.85, -R * 0.35, R * 0.95);
    trunk.bezierCurveTo(-R * 0.75, R * 1.0, -R * 0.75, R * 0.55, -R * 0.45, R * 0.6);
    trunk.bezierCurveTo(-R * 0.3, R * 0.62, -R * 0.3, R * 0.78, -R * 0.42, R * 0.78);
    trunk.bezierCurveTo(-R * 0.55, R * 0.78, -R * 0.55, R * 0.62, -R * 0.35, R * 0.45);
    trunk.bezierCurveTo(-R * 0.3, R * 0.1, -R * 0.4, -R * 0.35, -R * 0.15, -R * 0.62);
    trunk.closePath();
    const g = ctx.createLinearGradient(-R * 0.5, 0, R * 0.6, 0);
    g.addColorStop(0, p.back);
    g.addColorStop(0.55, p.mid);
    g.addColorStop(1, p.belly);
    ctx.fillStyle = g;
    ctx.fill(trunk);
    ctx.save();
    ctx.clip(trunk);
    // các vòng đốt thân
    ctx.strokeStyle = 'rgba(90,35,10,0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 11; i++) {
      const y = -R * 0.5 + i * R * 0.13;
      ctx.beginPath();
      ctx.moveTo(-R * 0.6, y - R * 0.04);
      ctx.quadraticCurveTo(0, y + R * 0.06, R * 0.65, y - R * 0.02);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc(-R * 0.25 + (((i * 37) % 70) / 100) * R, -R * 0.45 + (((i * 53) % 110) / 100) * R, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(70,25,5,0.6)';
    ctx.stroke(trunk);
    // đầu + mõm ống
    ctx.beginPath();
    ctx.moveTo(-R * 0.18, -R * 0.55);
    ctx.bezierCurveTo(-R * 0.2, -R * 0.95, R * 0.25, -R * 1.02, R * 0.4, -R * 0.78);
    ctx.lineTo(R * 1.12, -R * 0.74);
    ctx.quadraticCurveTo(R * 1.2, -R * 0.65, R * 1.12, -R * 0.58);
    ctx.lineTo(R * 0.42, -R * 0.55);
    ctx.quadraticCurveTo(R * 0.3, -R * 0.38, R * 0.15, -R * 0.42);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, -R * 1.0, 0, -R * 0.45);
    hg.addColorStop(0, p.back);
    hg.addColorStop(1, p.mid);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(70,25,5,0.6)';
    ctx.stroke();
    // mào (coronet)
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, -R * 0.88);
    ctx.lineTo(-R * 0.05, -R * 1.08);
    ctx.lineTo(R * 0.05, -R * 0.92);
    ctx.lineTo(R * 0.12, -R * 1.06);
    ctx.lineTo(R * 0.2, -R * 0.9);
    ctx.closePath();
    ctx.fillStyle = p.back;
    ctx.fill();
    // gai nhỏ dọc lưng
    for (let i = 0; i < 6; i++) {
      const y = -R * 0.4 + i * R * 0.17;
      const x = -R * 0.3 + Math.sin(i * 0.6) * R * 0.04;
      ctx.beginPath();
      ctx.moveTo(x, y - R * 0.04);
      ctx.lineTo(x - R * 0.09, y);
      ctx.lineTo(x, y + R * 0.04);
      ctx.fill();
    }
    eye(ctx, R * 0.22, -R * 0.72, R * 0.09, '#e3b04b');
  },
};

/** Vẽ một loài cá lên context Canvas 2D, tâm thân tại (cx, cy). */
export function drawFishBody(ctx, sp, cx, cy, R = ART_R) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  (ART[sp.id] || ART.tilapia)(ctx, R);
  ctx.restore();
}

/** Tạo canvas texture cho một loài. */
export function createFishCanvas(sp) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  drawFishBody(canvas.getContext('2d'), sp, TEX_W / 2, TEX_H / 2);
  return canvas;
}
