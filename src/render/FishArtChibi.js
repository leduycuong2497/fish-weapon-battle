// Vẽ nhân vật cá phong cách chibi/cute bằng Canvas 2D (gradient, bezier) → texture Phaser.
// Nhìn nghiêng, đầu hướng sang phải. Khi bơi sang trái, sprite được lật ngang để mặt luôn đứng thẳng.
// Thân là hình cầu bán kính R (trùng với collider thân); vũ khí vẽ riêng theo collider thật.

export const ART_R = 64; // bán kính thân trong texture (độ phân giải cao để thu nhỏ vẫn sắc nét)
export const TEX_W = 272;
export const TEX_H = 232;

const OUTLINE = '#2b1d3a';

function hex(c) {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** Pha màu: t > 0 làm sáng về trắng, t < 0 làm tối về đen. */
function shade(c, t) {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const m = (v) => Math.round(v + (to - v) * k);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function stroke(ctx, w = 4, color = OUTLINE) {
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Vây/đuôi: điền gradient + viền + vân vây. */
function finShape(ctx, path, base, R, { lines = null, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  path(ctx);
  ctx.closePath();
  const g = ctx.createLinearGradient(-R * 1.6, -R, R, R);
  g.addColorStop(0, shade(base, 0.35));
  g.addColorStop(1, shade(base, -0.15));
  ctx.fillStyle = g;
  ctx.fill();
  stroke(ctx, 3.5);
  if (lines) {
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of lines) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(43,29,58,0.25)';
    ctx.stroke();
  }
  ctx.restore();
}

/** Đuôi dạng trái tim xòe (cute). */
function tail(ctx, R, color, { spread = 1, len = 1, forked = true } = {}) {
  const bx = -R * 0.78;
  const tx = -R * (1.45 * len + 0.1);
  finShape(
    ctx,
    (c) => {
      c.moveTo(bx, -R * 0.18);
      c.bezierCurveTo(-R * 1.1, -R * 0.3, tx - R * 0.15, -R * 0.95 * spread, tx, -R * 0.72 * spread);
      if (forked) c.quadraticCurveTo(tx + R * 0.32, 0, tx, R * 0.72 * spread);
      else c.quadraticCurveTo(tx - R * 0.18, 0, tx, R * 0.72 * spread);
      c.bezierCurveTo(tx - R * 0.15, R * 0.95 * spread, -R * 1.1, R * 0.3, bx, R * 0.18);
    },
    color,
    R,
    {
      lines: [
        [-R * 1.0, 0, tx + R * 0.1, -R * 0.45 * spread],
        [-R * 1.0, 0, tx + R * 0.1, R * 0.45 * spread],
      ],
    },
  );
}

function dorsal(ctx, R, color, { x0 = -0.5, x1 = 0.3, h = 0.55, peak = -0.15 } = {}) {
  finShape(
    ctx,
    (c) => {
      c.moveTo(R * x0, -R * 0.82);
      c.quadraticCurveTo(R * peak, -R * (0.9 + h * 1.5), R * x1, -R * 0.9);
    },
    color,
    R,
  );
}

function pectoral(ctx, R, color) {
  // vây ngực nhỏ ở hông, như cánh tay vẫy
  finShape(
    ctx,
    (c) => {
      c.moveTo(-R * 0.05, R * 0.3);
      c.quadraticCurveTo(-R * 0.55, R * 0.35, -R * 0.62, R * 0.72);
      c.quadraticCurveTo(-R * 0.25, R * 0.72, -R * 0.05, R * 0.3);
    },
    color,
    R,
  );
}

function belowFin(ctx, R, color) {
  finShape(
    ctx,
    (c) => {
      c.moveTo(-R * 0.45, R * 0.82);
      c.quadraticCurveTo(-R * 0.3, R * 1.32, R * 0.05, R * 0.95);
    },
    color,
    R,
  );
}

/** Thân hình cầu: gradient tỏa tròn, bụng sáng, viền đậm, vệt bóng. */
function body(ctx, R, sp, { belly = true } = {}) {
  ctx.save();
  // bóng đổ mềm phía dưới
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
  g.addColorStop(0, shade(sp.color, 0.45));
  g.addColorStop(0.55, hex(sp.color));
  g.addColorStop(1, shade(sp.color, -0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  if (belly) {
    const bg = ctx.createLinearGradient(0, R * 0.1, 0, R);
    bg.addColorStop(0, shade(sp.belly, 0.2));
    bg.addColorStop(1, hex(sp.belly));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(R * 0.15, R * 0.78, R * 0.95, R * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function bodyOutline(ctx, R) {
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  stroke(ctx, 4.5);
}

function gloss(ctx, R) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.38, -R * 0.52, R * 0.32, R * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(-R * 0.68, -R * 0.2, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Mắt to long lanh kiểu chibi. look: hướng con ngươi. */
function eye(ctx, x, y, s, { lid = 0, iris = '#3a2a5c' } = {}) {
  s *= 1.14; // mắt to kiểu chibi
  ctx.save();
  // tròng trắng
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.92, s, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  stroke(ctx, 3.5);
  ctx.clip();
  // con ngươi gradient
  const px = x + s * 0.22;
  const py = y + s * 0.12;
  const g = ctx.createRadialGradient(px, py - s * 0.3, s * 0.05, px, py, s * 0.78);
  g.addColorStop(0, '#7c6bd6');
  g.addColorStop(0.6, iris);
  g.addColorStop(1, '#120b22');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(px, py, s * 0.66, s * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  // mí mắt (biểu cảm)
  if (lid) {
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(x - s * 1.2, y - s * 1.2);
    ctx.lineTo(x + s * 1.2, y - s * 1.2);
    ctx.lineTo(x + s * 1.2, y - s + s * lid * 0.9);
    ctx.lineTo(x - s * 1.2, y - s + s * lid * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // lấp lánh
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px + s * 0.12, py - s * 0.32, s * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px - s * 0.26, py + s * 0.3, s * 0.11, 0, Math.PI * 2);
  ctx.fill();
}

function blush(ctx, x, y, R, color = 'rgba(255,105,150,0.6)') {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,105,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + R * 0.04, R * 0.22, R * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function smile(ctx, x, y, R, w = 0.16) {
  ctx.beginPath();
  ctx.moveTo(x - R * w, y - R * 0.02);
  ctx.quadraticCurveTo(x, y + R * w * 0.9, x + R * w * 0.9, y - R * 0.06);
  stroke(ctx, 3.5);
}

function brows(ctx, x, y, R, angry = 1) {
  ctx.beginPath();
  ctx.moveTo(x - R * 0.2, y - R * 0.06 * angry);
  ctx.quadraticCurveTo(x, y - R * 0.12, x + R * 0.2, y + R * 0.06 * angry);
  stroke(ctx, 5);
}

// ---------------- từng loài ----------------

const ART = {
  swordfish(ctx, R, sp) {
    tail(ctx, R, sp.accent, { spread: 1.15, len: 1.05 });
    dorsal(ctx, R, sp.accent, { x0: -0.65, x1: 0.35, h: 0.75, peak: -0.35 });
    belowFin(ctx, R, sp.accent);
    body(ctx, R, sp);
    // sọc lưng
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(13,71,161,0.35)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(-R * 0.45 + i * R * 0.32, -R * 0.55, R * 0.07, R * 0.3, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    bodyOutline(ctx, R);
    pectoral(ctx, R, sp.accent);
    eye(ctx, R * 0.35, -R * 0.18, R * 0.33, { lid: 0.35 });
    blush(ctx, R * 0.38, R * 0.24, R);
    smile(ctx, R * 0.72, R * 0.2, R, 0.14);
    gloss(ctx, R);
  },

  pufferfish(ctx, R, sp) {
    tail(ctx, R, sp.accent, { spread: 0.75, len: 0.7, forked: false });
    // vây lưng nhỏ xíu
    dorsal(ctx, R, sp.accent, { x0: -0.35, x1: 0.05, h: 0.18, peak: -0.15 });
    body(ctx, R, sp);
    // đốm nâu
    ctx.fillStyle = 'rgba(141,110,99,0.55)';
    for (const [x, y, r] of [[-0.45, -0.35, 0.1], [-0.1, -0.62, 0.08], [-0.62, 0.1, 0.08], [-0.25, -0.15, 0.06], [0.1, -0.45, 0.06], [-0.4, 0.4, 0.07]]) {
      ctx.beginPath();
      ctx.arc(R * x, R * y, R * r, 0, Math.PI * 2);
      ctx.fill();
    }
    bodyOutline(ctx, R);
    pectoral(ctx, R, sp.accent);
    eye(ctx, R * 0.32, -R * 0.2, R * 0.36);
    blush(ctx, R * 0.4, R * 0.25, R, 'rgba(255,90,120,0.55)');
    // miệng chu "o"
    ctx.beginPath();
    ctx.ellipse(R * 0.86, R * 0.16, R * 0.1, R * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ff7aa2';
    ctx.fill();
    stroke(ctx, 3.5);
    gloss(ctx, R);
  },

  piranha(ctx, R, sp) {
    tail(ctx, R, sp.accent, { spread: 1, len: 0.95 });
    dorsal(ctx, R, sp.accent, { x0: -0.55, x1: 0.15, h: 0.4, peak: -0.3 });
    belowFin(ctx, R, 0xff8a65);
    body(ctx, R, sp);
    bodyOutline(ctx, R);
    pectoral(ctx, R, 0xff8a65);
    eye(ctx, R * 0.33, -R * 0.22, R * 0.31, { lid: 0.55, iris: '#5c1a1a' });
    brows(ctx, R * 0.33, -R * 0.6, R, 1.2);
    blush(ctx, R * 0.36, R * 0.18, R);
    // miệng móm với 2 răng nanh cute
    ctx.beginPath();
    ctx.moveTo(R * 0.5, R * 0.36);
    ctx.quadraticCurveTo(R * 0.72, R * 0.5, R * 0.94, R * 0.28);
    stroke(ctx, 4);
    ctx.fillStyle = '#ffffff';
    for (const x of [0.62, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(R * (x - 0.06), R * 0.42 - (x - 0.62) * R * 0.5);
      ctx.lineTo(R * (x + 0.06), R * 0.4 - (x - 0.62) * R * 0.5);
      ctx.lineTo(R * x, R * 0.25 - (x - 0.62) * R * 0.5);
      ctx.closePath();
      ctx.fill();
      stroke(ctx, 2.5);
    }
    gloss(ctx, R);
  },

  stingray(ctx, R, sp) {
    // hai "cánh" dạng tai tròn trên/dưới
    for (const s of [-1, 1]) {
      finShape(
        ctx,
        (c) => {
          c.moveTo(R * 0.4, s * R * 0.6);
          c.bezierCurveTo(R * 0.2, s * R * 1.55, -R * 0.9, s * R * 1.5, -R * 0.75, s * R * 0.45);
        },
        sp.accent,
        R,
      );
    }
    body(ctx, R, sp);
    // vằn điện trên má
    ctx.beginPath();
    ctx.moveTo(-R * 0.6, -R * 0.15);
    ctx.lineTo(-R * 0.35, R * 0.08);
    ctx.lineTo(-R * 0.2, -R * 0.12);
    ctx.lineTo(R * 0.02, R * 0.14);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#80ffff';
    ctx.lineJoin = 'round';
    ctx.stroke();
    bodyOutline(ctx, R);
    eye(ctx, R * 0.36, -R * 0.24, R * 0.32, { iris: '#2a1a6e' });
    blush(ctx, R * 0.42, R * 0.18, R);
    smile(ctx, R * 0.74, R * 0.32, R, 0.13);
    gloss(ctx, R);
  },

  shark(ctx, R, sp) {
    tail(ctx, R, sp.accent, { spread: 1.2, len: 1.05 });
    // vây lưng tam giác cong kinh điển
    finShape(
      ctx,
      (c) => {
        c.moveTo(-R * 0.45, -R * 0.85);
        c.quadraticCurveTo(-R * 0.25, -R * 1.55, R * 0.1, -R * 1.62);
        c.quadraticCurveTo(-R * 0.05, -R * 1.2, R * 0.2, -R * 0.95);
      },
      sp.accent,
      R,
    );
    belowFin(ctx, R, sp.accent);
    body(ctx, R, sp);
    // mang
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(-R * 0.05 - i * R * 0.13, -R * 0.15);
      ctx.quadraticCurveTo(-R * 0.12 - i * R * 0.13, R * 0.05, -R * 0.05 - i * R * 0.13, R * 0.25);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(43,29,58,0.45)';
    ctx.stroke();
    bodyOutline(ctx, R);
    pectoral(ctx, R, sp.accent);
    eye(ctx, R * 0.38, -R * 0.26, R * 0.28, { lid: 0.3, iris: '#1f2933' });
    blush(ctx, R * 0.42, R * 0.1, R);
    // nụ cười toe với răng nhỏ
    ctx.beginPath();
    ctx.moveTo(R * 0.3, R * 0.3);
    ctx.quadraticCurveTo(R * 0.62, R * 0.62, R * 0.96, R * 0.22);
    ctx.quadraticCurveTo(R * 0.62, R * 0.4, R * 0.3, R * 0.3);
    ctx.fillStyle = '#7a1f2b';
    ctx.fill();
    stroke(ctx, 3.5);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const x = R * (0.4 + i * 0.13);
      const y = R * (0.36 - i * 0.03);
      ctx.beginPath();
      ctx.moveTo(x - R * 0.045, y - R * 0.02);
      ctx.lineTo(x + R * 0.045, y - R * 0.03);
      ctx.lineTo(x, y + R * 0.07);
      ctx.closePath();
      ctx.fill();
    }
    gloss(ctx, R);
  },

  tilapia(ctx, R, sp) {
    tail(ctx, R, 0xef6c00, { spread: 0.95, len: 0.9, forked: false });
    dorsal(ctx, R, 0x78909c, { x0: -0.6, x1: 0.3, h: 0.45, peak: -0.2 });
    belowFin(ctx, R, 0x78909c);
    body(ctx, R, sp);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(46,125,50,0.28)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(-R * 0.62 + i * R * 0.3, -R * 0.1, R * 0.07, R * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    bodyOutline(ctx, R);
    pectoral(ctx, R, 0x90a4ae);
    eye(ctx, R * 0.35, -R * 0.2, R * 0.33);
    blush(ctx, R * 0.4, R * 0.22, R);
    smile(ctx, R * 0.74, R * 0.22, R, 0.15);
    gloss(ctx, R);
  },

  arowana(ctx, R, sp) {
    tail(ctx, R, sp.accent, { spread: 0.9, len: 1.1, forked: false });
    // vây lưng & vây hậu môn dài thướt tha
    finShape(
      ctx,
      (c) => {
        c.moveTo(-R * 0.8, -R * 0.55);
        c.quadraticCurveTo(-R * 1.25, -R * 1.25, -R * 0.15, -R * 0.98);
      },
      sp.accent,
      R,
    );
    finShape(
      ctx,
      (c) => {
        c.moveTo(-R * 0.8, R * 0.55);
        c.quadraticCurveTo(-R * 1.25, R * 1.25, -R * 0.15, R * 0.98);
      },
      sp.accent,
      R,
    );
    body(ctx, R, sp);
    // vảy ánh kim
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(184,134,11,0.55)';
    for (let row = -2; row <= 2; row++) {
      for (let col = -3; col <= 0; col++) {
        const x = col * R * 0.26 + (row % 2 ? R * 0.13 : 0);
        const y = row * R * 0.26;
        ctx.beginPath();
        ctx.arc(x, y, R * 0.15, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    bodyOutline(ctx, R);
    // râu cằm
    ctx.beginPath();
    ctx.moveTo(R * 0.82, R * 0.42);
    ctx.quadraticCurveTo(R * 1.15, R * 0.55, R * 1.3, R * 0.85);
    ctx.moveTo(R * 0.72, R * 0.52);
    ctx.quadraticCurveTo(R * 0.98, R * 0.75, R * 1.05, R * 1.02);
    stroke(ctx, 4.5, '#b8860b');
    pectoral(ctx, R, 0xffca28);
    eye(ctx, R * 0.35, -R * 0.22, R * 0.32, { lid: 0.25, iris: '#5a3a00' });
    blush(ctx, R * 0.4, R * 0.2, R);
    smile(ctx, R * 0.76, R * 0.24, R, 0.13);
    // vương miện nhỏ (cá rồng = cá quý tộc)
    ctx.beginPath();
    ctx.moveTo(-R * 0.18, -R * 0.92);
    ctx.lineTo(-R * 0.22, -R * 1.22);
    ctx.lineTo(-R * 0.08, -R * 1.08);
    ctx.lineTo(R * 0.02, -R * 1.3);
    ctx.lineTo(R * 0.12, -R * 1.08);
    ctx.lineTo(R * 0.26, -R * 1.22);
    ctx.lineTo(R * 0.22, -R * 0.9);
    ctx.closePath();
    ctx.fillStyle = '#ffe066';
    ctx.fill();
    stroke(ctx, 3);
    gloss(ctx, R);
  },

  seahorse(ctx, R, sp) {
    // mõm ống
    ctx.beginPath();
    ctx.moveTo(R * 0.7, -R * 0.2);
    ctx.quadraticCurveTo(R * 1.15, -R * 0.24, R * 1.42, -R * 0.12);
    ctx.quadraticCurveTo(R * 1.5, R * 0.02, R * 1.42, R * 0.12);
    ctx.quadraticCurveTo(R * 1.15, R * 0.18, R * 0.7, R * 0.2);
    ctx.closePath();
    ctx.fillStyle = shade(sp.color, -0.05);
    ctx.fill();
    stroke(ctx, 4);
    // bờm gai mềm trên đầu
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 - 0.9 + i * 0.45;
      finShape(
        ctx,
        (c) => {
          c.moveTo(Math.cos(a - 0.18) * R * 0.95, Math.sin(a - 0.18) * R * 0.95);
          c.quadraticCurveTo(Math.cos(a) * R * 1.45, Math.sin(a) * R * 1.45, Math.cos(a + 0.18) * R * 0.95, Math.sin(a + 0.18) * R * 0.95);
        },
        sp.accent,
        R,
      );
    }
    body(ctx, R, sp);
    // vân bụng
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(191,54,12,0.3)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-R * 0.1, R * 1.3, R * (0.55 + i * 0.16), -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
    ctx.restore();
    bodyOutline(ctx, R);
    // vây lưng nhỏ phía sau (dạng quạt)
    finShape(
      ctx,
      (c) => {
        c.moveTo(-R * 0.75, -R * 0.45);
        c.quadraticCurveTo(-R * 1.45, -R * 0.15, -R * 0.85, R * 0.3);
      },
      0xffab91,
      R,
      { lines: [[-R * 0.8, -R * 0.1, -R * 1.2, -R * 0.1]] },
    );
    eye(ctx, R * 0.33, -R * 0.2, R * 0.35);
    blush(ctx, R * 0.42, R * 0.24, R);
    gloss(ctx, R);
  },
};

/** Vẽ một loài cá lên context Canvas 2D, tâm thân tại (cx, cy). */
export function drawFishBody(ctx, sp, cx, cy, R = ART_R) {
  ctx.save();
  ctx.translate(cx, cy);
  (ART[sp.id] || ART.tilapia)(ctx, R, sp);
  ctx.restore();
}

/** Tạo canvas texture cho một loài. */
export function createFishCanvas(sp) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  drawFishBody(ctx, sp, TEX_W / 2, TEX_H / 2);
  return canvas;
}
