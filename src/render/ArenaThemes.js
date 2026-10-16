// Chủ đề sàn đấu: nền sàn + trang trí quanh tường vẽ bằng Canvas 2D (một lần mỗi trận),
// màu tường, nền nước và hạt môi trường. Chỉ ảnh hưởng hiển thị, không ảnh hưởng mô phỏng.

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shapePath(ctx, sh, inset = 0) {
  ctx.beginPath();
  if (sh.shape === 'circle') ctx.arc(0, 0, Math.max(1, sh.R - inset), 0, TAU);
  else ctx.rect(-sh.hw + inset, -sh.hh + inset, (sh.hw - inset) * 2, (sh.hh - inset) * 2);
}

function inside(sh, x, y, margin = 0) {
  if (sh.shape === 'circle') return Math.hypot(x, y) <= sh.R - margin;
  return Math.abs(x) <= sh.hw - margin && Math.abs(y) <= sh.hh - margin;
}

function randIn(sh, margin = 0) {
  for (let i = 0; i < 50; i++) {
    const x = rnd(-sh.hw, sh.hw);
    const y = rnd(-sh.hh, sh.hh);
    if (inside(sh, x, y, margin)) return [x, y];
  }
  return [0, 0];
}

/** Điểm trên biên + pháp tuyến hướng ra ngoài; off > 0 đẩy ra ngoài tường. */
function randEdge(sh, off = 0) {
  if (sh.shape === 'circle') {
    const a = rnd(0, TAU);
    const r = sh.R + off;
    return [Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)];
  }
  const per = 4 * (sh.hw + sh.hh);
  let t = rnd(0, per);
  if (t < 2 * sh.hw) return [-sh.hw + t, -sh.hh - off, 0, -1];
  t -= 2 * sh.hw;
  if (t < 2 * sh.hh) return [sh.hw + off, -sh.hh + t, 1, 0];
  t -= 2 * sh.hh;
  if (t < 2 * sh.hw) return [sh.hw - t, sh.hh + off, 0, 1];
  t -= 2 * sh.hw;
  return [-sh.hw - off, sh.hh - t, -1, 0];
}

function areaK(sh) {
  const a = sh.shape === 'circle' ? Math.PI * sh.R * sh.R : 4 * sh.hw * sh.hh;
  return a / (Math.PI * 400 * 400);
}

function perimK(sh) {
  return (sh.shape === 'circle' ? TAU * sh.R : 4 * (sh.hw + sh.hh)) / (TAU * 400);
}

function radialBase(ctx, sh, c0, c1) {
  const r = Math.max(sh.hw, sh.hh) * 1.15;
  const g = ctx.createRadialGradient(-r * 0.15, -r * 0.2, r * 0.05, 0, 0, r);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(-sh.hw - 60, -sh.hh - 60, sh.hw * 2 + 120, sh.hh * 2 + 120);
}

function blobs(ctx, sh, n, colorFn, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const [x, y] = randIn(sh);
    const r = rnd(rMin, rMax);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colorFn());
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function pebbles(ctx, sh, n, colors, rMin = 2, rMax = 6) {
  for (let i = 0; i < n; i++) {
    const [x, y] = randIn(sh, 4);
    const r = rnd(rMin, rMax);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * rnd(0.6, 0.95), rnd(0, TAU), 0, TAU);
    ctx.fillStyle = pick(colors);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.4, r * 0.25, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }
}

/** Mạng ánh sáng khúc xạ (caustics) dưới nước. */
function caustics(ctx, sh, cell, alpha, color = '255,255,255') {
  const pts = [];
  const nx = Math.ceil((sh.hw * 2) / cell) + 2;
  const ny = Math.ceil((sh.hh * 2) / cell) + 2;
  for (let j = 0; j < ny; j++) {
    pts[j] = [];
    for (let i = 0; i < nx; i++) pts[j][i] = [-sh.hw - cell + i * cell + rnd(-cell, cell) * 0.35, -sh.hh - cell + j * cell + rnd(-cell, cell) * 0.35];
  }
  for (const [w, al] of [[4, alpha], [1.5, alpha * 1.6]]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = `rgba(${color},${al})`;
    ctx.beginPath();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const [x, y] = pts[j][i];
        for (const [di, dj] of [[1, 0], [0, 1]]) {
          const q = pts[j + dj]?.[i + di];
          if (!q) continue;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo((x + q[0]) / 2 + rnd(-cell, cell) * 0.25, (y + q[1]) / 2 + rnd(-cell, cell) * 0.25, q[0], q[1]);
        }
      }
    }
    ctx.stroke();
  }
}

function crack(ctx, x, y, len, ang, branch = 2) {
  const pts = [[x, y]];
  let a = ang;
  let cx = x;
  let cy = y;
  const steps = Math.max(3, Math.round(len / 14));
  for (let i = 0; i < steps; i++) {
    a += rnd(-0.5, 0.5);
    cx += Math.cos(a) * (len / steps);
    cy += Math.sin(a) * (len / steps);
    pts.push([cx, cy]);
    if (branch > 0 && Math.random() < 0.18) crack(ctx, cx, cy, len * 0.45, a + rnd(-1.2, 1.2), branch - 1);
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [px, py] of pts) ctx.lineTo(px, py);
}

function coral(ctx, x, y, size, color, ang) {
  const branch = (bx, by, a, len, w, depth) => {
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + Math.cos(a + 0.3) * len * 0.5, by + Math.sin(a + 0.3) * len * 0.5, ex, ey);
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (depth > 0) {
      branch(ex, ey, a - rnd(0.3, 0.7), len * 0.72, w * 0.72, depth - 1);
      branch(ex, ey, a + rnd(0.3, 0.7), len * 0.72, w * 0.72, depth - 1);
    } else {
      ctx.beginPath();
      ctx.arc(ex, ey, w * 0.8, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
    }
  };
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) branch(x, y, ang + rnd(-0.6, 0.6), size, size * 0.22, 3);
}

function anemone(ctx, x, y, r, c1, c2) {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.4) * r * 0.7, y + Math.sin(a + 0.4) * r * 0.7, x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = c1;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.3, 0, TAU);
  ctx.fillStyle = c2;
  ctx.fill();
}

function rock(ctx, x, y, r, c0, c1, glow) {
  ctx.beginPath();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * rnd(0.7, 1.1);
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = glow ? 3 : 1.5;
  ctx.strokeStyle = glow || 'rgba(0,0,0,0.35)';
  ctx.stroke();
}

function starfish(ctx, x, y, r, color) {
  ctx.beginPath();
  const rot = rnd(0, TAU);
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.42 : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(80,20,0,0.5)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x + rnd(-r, r) * 0.4, y + rnd(-r, r) * 0.4, 1.2, 0, TAU);
    ctx.fill();
  }
}

function shell(ctx, x, y, r) {
  const a = rnd(0, TAU);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.5);
  ctx.arc(0, 0, r, Math.PI * 1.1, Math.PI * 1.9);
  ctx.closePath();
  ctx.fillStyle = pick(['#fff3e0', '#ffe0b2', '#f8bbd0']);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,40,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const b = Math.PI * (1.15 + i * 0.13);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.45);
    ctx.lineTo(Math.cos(b) * r, Math.sin(b) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function seaweed(ctx, x, y, nx, ny, h, color) {
  const a = Math.atan2(ny, nx);
  for (let s = 0; s < 3; s++) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    let px = x;
    let py = y;
    const dir = a + rnd(-0.4, 0.4);
    for (let i = 1; i <= 6; i++) {
      const k = (h / 6) * i;
      const sway = Math.sin(i * 1.3 + s) * 6;
      px = x + Math.cos(dir) * k - Math.sin(dir) * sway;
      py = y + Math.sin(dir) * k + Math.cos(dir) * sway;
      ctx.lineTo(px, py);
    }
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

// ---------------- định nghĩa chủ đề ----------------

export const THEMES = [
  {
    id: 'colosseum',
    name: 'Đấu trường La Mã',
    bg: [0xd8c9ab, 0xb9a682],
    rim: { band: 0xd8c39b, line: 0xfff5e0 },
    wall3d: { wall: 0xf1e4c8, top: 0xfcf5e6 },
    banners: true,
    ambient: { key: 'amb_dot', dir: 'drift', tint: 0xfff3d6, alpha: 0.35 },
    rays: false,
    floor(ctx, sh) {
      radialBase(ctx, sh, '#fbf2e2', '#e3cfac');
      blobs(ctx, sh, Math.round(18 * areaK(sh)), () => 'rgba(150,115,70,0.07)', 40, 120);
      // vệt sáng giữa sân
      const r0 = Math.min(sh.hw, sh.hh);
      const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, r0 * 0.75);
      lg.addColorStop(0, 'rgba(255,255,255,0.35)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(-r0, -r0, r0 * 2, r0 * 2);
      // vòng gạch đá sát tường
      const band = 0.15;
      if (sh.shape === 'circle') {
        const ri = sh.R * (1 - band);
        const rm = (ri + sh.R) / 2;
        ctx.beginPath();
        ctx.arc(0, 0, sh.R, 0, TAU);
        ctx.arc(0, 0, ri, 0, TAU, true);
        ctx.fillStyle = '#e2cca3';
        ctx.fill();
        for (const [r1, r2, off] of [[ri, rm, 0], [rm, sh.R, 0.5]]) {
          const n = Math.round((TAU * r2) / 46);
          for (let i = 0; i < n; i++) {
            const a0 = ((i + off) / n) * TAU;
            const a1 = ((i + 1 + off) / n) * TAU;
            ctx.beginPath();
            ctx.arc(0, 0, r2, a0, a1);
            ctx.arc(0, 0, r1, a1, a0, true);
            ctx.closePath();
            ctx.fillStyle = (i + (off ? 1 : 0)) % 2 ? 'rgba(255,255,255,0.13)' : 'rgba(120,90,50,0.07)';
            ctx.fill();
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = 'rgba(150,118,76,0.4)';
            ctx.stroke();
          }
        }
        for (const [r, w, c] of [[ri, 5, 'rgba(150,118,76,0.5)'], [ri - 6, 2.5, 'rgba(255,255,255,0.7)']]) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.lineWidth = w;
          ctx.strokeStyle = c;
          ctx.stroke();
        }
      } else {
        const bw = Math.min(sh.hw, sh.hh) * band;
        ctx.fillStyle = '#e4d1ac';
        ctx.fillRect(-sh.hw, -sh.hh, sh.hw * 2, bw);
        ctx.fillRect(-sh.hw, sh.hh - bw, sh.hw * 2, bw);
        ctx.fillRect(-sh.hw, -sh.hh, bw, sh.hh * 2);
        ctx.fillRect(sh.hw - bw, -sh.hh, bw, sh.hh * 2);
        ctx.strokeStyle = 'rgba(150,120,80,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = -sh.hw; x < sh.hw; x += 48) {
          ctx.moveTo(x, -sh.hh);
          ctx.lineTo(x, -sh.hh + bw);
          ctx.moveTo(x, sh.hh);
          ctx.lineTo(x, sh.hh - bw);
        }
        for (let y = -sh.hh; y < sh.hh; y += 48) {
          ctx.moveTo(-sh.hw, y);
          ctx.lineTo(-sh.hw + bw, y);
          ctx.moveTo(sh.hw, y);
          ctx.lineTo(sh.hw - bw, y);
        }
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(150,120,80,0.45)';
        ctx.strokeRect(-sh.hw + bw, -sh.hh + bw, (sh.hw - bw) * 2, (sh.hh - bw) * 2);
      }
      // vết nứt nhẹ + cỏ mọc sát mép
      ctx.beginPath();
      for (let i = 0; i < Math.round(6 * areaK(sh)); i++) {
        const [x, y] = randIn(sh, 40);
        crack(ctx, x, y, rnd(30, 80), rnd(0, TAU), 1);
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(140,110,70,0.35)';
      ctx.stroke();
      for (let i = 0; i < Math.round(10 * perimK(sh)); i++) {
        const [x, y, nx, ny] = randEdge(sh, -rnd(4, 14));
        seaweed(ctx, x, y, -nx, -ny, rnd(10, 18), pick(['#7cb342', '#8bc34a', '#689f38']));
      }
    },
    deco(ctx, sh) {
      const n = Math.round(36 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const [x, y] = randEdge(sh, rnd(18, 50));
        if (Math.random() < 0.75) rock(ctx, x, y, rnd(10, 20), '#f3e6cc', '#b9a27a');
        else seaweed(ctx, x, y, x, y, rnd(16, 26), '#7cb342');
      }
    },
  },
  {
    id: 'reef',
    name: 'Rạn san hô',
    bg: [0x0b4f8a, 0x006064],
    rim: { band: 0x0d3f4f, line: 0x6fe3d0 },
    ambient: { key: 'bubble', dir: 'up', tint: 0xffffff, alpha: 0.35 },
    rays: true,
    floor(ctx, sh) {
      radialBase(ctx, sh, '#9ff0e2', '#3a9fae');
      blobs(ctx, sh, Math.round(26 * areaK(sh)), () => 'rgba(255,240,200,0.25)', 40, 110);
      pebbles(ctx, sh, Math.round(140 * areaK(sh)), ['#c9b08a', '#a1887f', '#e0d4bc', '#8d9a9a']);
      caustics(ctx, sh, 70, 0.09);
      const n = Math.round(14 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const [x, y, nx, ny] = randEdge(sh, -rnd(12, 40));
        if (Math.random() < 0.6) coral(ctx, x, y, rnd(12, 22), pick(['#ff7f8e', '#ff9e5e', '#f06292', '#ba68c8']), Math.atan2(-ny, -nx));
        else anemone(ctx, x, y, rnd(9, 14), pick(['#ffab91', '#ce93d8', '#80cbc4']), '#ffeb3b');
      }
    },
    deco(ctx, sh) {
      const n = Math.round(40 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const [x, y] = randEdge(sh, rnd(14, 46));
        if (Math.random() < 0.55) rock(ctx, x, y, rnd(12, 26), '#6d7b7f', '#2f3b3f');
        else coral(ctx, x, y, rnd(14, 26), pick(['#ff6f7d', '#ffa15c', '#e05bb0', '#9c6ade']), rnd(0, TAU));
      }
    },
  },
  {
    id: 'sand',
    name: 'Đáy cát vàng',
    bg: [0x0277bd, 0x00897b],
    rim: { band: 0x7a5a36, line: 0xf5deb3 },
    ambient: { key: 'bubble', dir: 'up', tint: 0xffffff, alpha: 0.3 },
    rays: true,
    floor(ctx, sh) {
      radialBase(ctx, sh, '#f6e3b4', '#d2b07a');
      // gợn cát
      ctx.save();
      ctx.rotate(rnd(-0.4, 0.4));
      const span = Math.max(sh.hw, sh.hh) * 1.5;
      for (let y = -span; y < span; y += 16) {
        ctx.beginPath();
        for (let x = -span; x <= span; x += 20) {
          const yy = y + Math.sin(x * 0.025 + y * 0.1) * 5;
          if (x === -span) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(150,105,55,0.16)';
        ctx.stroke();
        ctx.translate(0, 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.stroke();
        ctx.translate(0, -2);
      }
      ctx.restore();
      caustics(ctx, sh, 90, 0.06);
      pebbles(ctx, sh, Math.round(80 * areaK(sh)), ['#bfa27a', '#9e8a6e', '#e8dcc4']);
      for (let i = 0; i < Math.round(14 * areaK(sh)); i++) {
        const [x, y] = randIn(sh, 20);
        shell(ctx, x, y, rnd(6, 10));
      }
      for (let i = 0; i < Math.round(6 * areaK(sh)); i++) {
        const [x, y] = randIn(sh, 20);
        starfish(ctx, x, y, rnd(10, 16), pick(['#ff7043', '#ef5350', '#ffa726']));
      }
    },
    deco(ctx, sh) {
      const n = Math.round(46 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const [x, y, nx, ny] = randEdge(sh, rnd(10, 30));
        if (Math.random() < 0.5) seaweed(ctx, x, y, nx, ny, rnd(30, 60), pick(['#2e7d32', '#558b2f', '#33691e']));
        else rock(ctx, x, y, rnd(10, 22), '#b0a089', '#5d4e3a');
      }
    },
  },
  {
    id: 'ice',
    name: 'Băng Bắc Cực',
    bg: [0x0d2b52, 0x1a5276],
    rim: { band: 0x5d8fb5, line: 0xffffff },
    ambient: { key: 'amb_dot', dir: 'down', tint: 0xffffff, alpha: 0.8 },
    rays: true,
    floor(ctx, sh) {
      radialBase(ctx, sh, '#f2fbff', '#a8d4ee');
      blobs(ctx, sh, Math.round(30 * areaK(sh)), () => 'rgba(255,255,255,0.55)', 30, 90);
      blobs(ctx, sh, Math.round(14 * areaK(sh)), () => 'rgba(120,180,220,0.25)', 40, 100);
      for (const [w, c] of [[3, 'rgba(255,255,255,0.9)'], [1.2, 'rgba(70,130,180,0.55)']]) {
        ctx.beginPath();
        for (let i = 0; i < Math.round(16 * areaK(sh)); i++) {
          const [x, y] = randIn(sh);
          crack(ctx, x, y, rnd(60, 160), rnd(0, TAU));
        }
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < Math.round(160 * areaK(sh)); i++) {
        const [x, y] = randIn(sh);
        ctx.beginPath();
        ctx.arc(x, y, rnd(0.8, 2), 0, TAU);
        ctx.fill();
      }
    },
    deco(ctx, sh) {
      const n = Math.round(38 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const [x, y] = randEdge(sh, rnd(14, 42));
        const r = rnd(12, 26);
        ctx.beginPath();
        const k = Math.round(rnd(4, 7));
        for (let j = 0; j < k; j++) {
          const a = (j / k) * TAU + rnd(-0.2, 0.2);
          const rr = r * rnd(0.75, 1.1);
          if (j === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.5, '#cfeaf9');
        g.addColorStop(1, '#7fb6dc');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(40,90,140,0.5)';
        ctx.stroke();
      }
    },
  },
  {
    id: 'lava',
    name: 'Núi lửa dung nham',
    bg: [0x2a0a05, 0x5d1a08],
    rim: { band: 0x1a100e, line: 0xff6d00, glow: 0xff3d00 },
    ambient: { key: 'amb_dot', dir: 'up', tint: 0xff9100, alpha: 0.9, add: true },
    rays: false,
    floor(ctx, sh) {
      radialBase(ctx, sh, '#3b302c', '#191212');
      blobs(ctx, sh, Math.round(40 * areaK(sh)), () => (Math.random() < 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(110,95,85,0.25)'), 20, 70);
      // vũng dung nham
      for (let i = 0; i < Math.round(5 * areaK(sh)); i++) {
        const [x, y] = randIn(sh, 60);
        const r = rnd(18, 40);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, '#fff176');
        g.addColorStop(0.35, '#ff9100');
        g.addColorStop(0.75, '#dd2c00');
        g.addColorStop(1, 'rgba(60,10,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * rnd(0.6, 0.9), rnd(0, TAU), 0, TAU);
        ctx.fill();
      }
      // khe nứt phát sáng
      ctx.beginPath();
      for (let i = 0; i < Math.round(22 * areaK(sh)); i++) {
        const [x, y] = randIn(sh);
        crack(ctx, x, y, rnd(60, 180), rnd(0, TAU));
      }
      for (const [w, c] of [[9, 'rgba(255,61,0,0.22)'], [4, 'rgba(255,109,0,0.75)'], [1.4, 'rgba(255,241,118,0.95)']]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.stroke();
      }
    },
    deco(ctx, sh) {
      const n = Math.round(44 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const [x, y] = randEdge(sh, rnd(12, 44));
        rock(ctx, x, y, rnd(12, 28), '#4a3b36', '#120c0b', 'rgba(255,100,0,0.55)');
      }
    },
  },
  {
    id: 'temple',
    name: 'Đền cổ dưới biển',
    bg: [0x0b3b3a, 0x10324a],
    rim: { band: 0x4f5a55, line: 0xd4c38a },
    ambient: { key: 'bubble', dir: 'up', tint: 0xb2dfdb, alpha: 0.3 },
    rays: true,
    floor(ctx, sh) {
      radialBase(ctx, sh, '#b9c4bd', '#7f8c86');
      const t = 58;
      for (let gx = -Math.ceil(sh.hw / t) * t - t; gx < sh.hw + t; gx += t) {
        for (let gy = -Math.ceil(sh.hh / t) * t - t; gy < sh.hh + t; gy += t) {
          const l = rnd(-14, 14);
          ctx.fillStyle = `rgba(${150 + l},${162 + l},${155 + l},0.55)`;
          ctx.fillRect(gx + 2, gy + 2, t - 4, t - 4);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(gx + 2, gy + 2, t - 4, 3);
        }
      }
      ctx.strokeStyle = 'rgba(60,70,65,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let gx = -Math.ceil(sh.hw / t) * t - t; gx < sh.hw + t; gx += t) {
        ctx.moveTo(gx, -sh.hh - t);
        ctx.lineTo(gx, sh.hh + t);
      }
      for (let gy = -Math.ceil(sh.hh / t) * t - t; gy < sh.hh + t; gy += t) {
        ctx.moveTo(-sh.hw - t, gy);
        ctx.lineTo(sh.hw + t, gy);
      }
      ctx.stroke();
      // biểu tượng trung tâm
      const er = Math.min(sh.hw, sh.hh) * 0.32;
      for (const [r, c, w] of [[er, '#c9b26a', 8], [er * 0.82, '#2f6f6a', 4], [er * 0.5, '#c9b26a', 4]]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.stroke();
      }
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const r = i % 2 ? er * 0.5 : er * 0.8;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(201,178,106,0.35)';
      ctx.fill();
      blobs(ctx, sh, Math.round(26 * areaK(sh)), () => 'rgba(76,140,60,0.35)', 20, 70);
      ctx.beginPath();
      for (let i = 0; i < Math.round(10 * areaK(sh)); i++) {
        const [x, y] = randIn(sh);
        crack(ctx, x, y, rnd(40, 100), rnd(0, TAU), 1);
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(40,45,42,0.6)';
      ctx.stroke();
    },
    deco(ctx, sh) {
      const n = Math.round(16 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const k = i / n;
        let x;
        let y;
        if (sh.shape === 'circle') {
          x = Math.cos(k * TAU) * (sh.R + 30);
          y = Math.sin(k * TAU) * (sh.R + 30);
        } else [x, y] = randEdge(sh, 30);
        // trụ đá cổ
        const r = 17;
        ctx.beginPath();
        ctx.arc(x + 4, y + 6, r, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
        const g = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, r);
        g.addColorStop(0, '#e8e4d6');
        g.addColorStop(1, '#8c8878');
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#5f5b4e';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.65, 0, TAU);
        ctx.strokeStyle = 'rgba(95,91,78,0.6)';
        ctx.stroke();
        if (Math.random() < 0.5) seaweed(ctx, x, y, x, y, 20, '#4caf50');
      }
      for (let i = 0; i < Math.round(30 * perimK(sh)); i++) {
        const [x, y] = randEdge(sh, rnd(10, 50));
        rock(ctx, x, y, rnd(5, 11), '#b8b4a6', '#6b675c');
      }
    },
  },
  {
    id: 'abyss',
    name: 'Vực thẳm phát quang',
    bg: [0x020814, 0x081a3a],
    rim: { band: 0x08142a, line: 0x00e5ff, glow: 0x00b8d4 },
    ambient: { key: 'amb_dot', dir: 'drift', tint: 0x64ffda, alpha: 0.8, add: true },
    rays: false,
    floor(ctx, sh) {
      radialBase(ctx, sh, '#13254a', '#050b1a');
      const rr = Math.max(sh.hw, sh.hh);
      for (let r = 60; r < rr * 1.3; r += 60) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,229,255,0.08)';
        ctx.stroke();
      }
      for (let i = 0; i < Math.round(260 * areaK(sh)); i++) {
        const [x, y] = randIn(sh);
        const r = rnd(2, 7);
        const c = pick(['0,229,255', '100,255,218', '234,128,252', '118,255,3']);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        g.addColorStop(0, `rgba(${c},0.9)`);
        g.addColorStop(0.3, `rgba(${c},0.35)`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);
      }
      caustics(ctx, sh, 110, 0.035, '0,229,255');
    },
    deco(ctx, sh) {
      const n = Math.round(30 * perimK(sh));
      for (let i = 0; i < n; i++) {
        const [x, y, nx, ny] = randEdge(sh, rnd(10, 36));
        if (Math.random() < 0.5) {
          // tinh thể phát sáng
          const a = Math.atan2(ny, nx) + rnd(-0.5, 0.5);
          const h = rnd(18, 40);
          ctx.beginPath();
          ctx.moveTo(x - Math.sin(a) * 7, y + Math.cos(a) * 7);
          ctx.lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h);
          ctx.lineTo(x + Math.sin(a) * 7, y - Math.cos(a) * 7);
          ctx.closePath();
          const c = pick(['#18ffff', '#ea80fc', '#69f0ae']);
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        } else seaweed(ctx, x, y, nx, ny, rnd(28, 50), 'rgba(0,229,255,0.45)');
      }
    },
  },
  {
    id: 'classic',
    name: 'Cổ điển',
    bg: [0x0b3d91, 0x00796b],
    rim: { band: 0x01579b, line: 0x4fc3f7 },
    ambient: { key: 'bubble', dir: 'up', tint: 0xffffff, alpha: 0.35 },
    rays: true,
    floor(ctx, sh) {
      ctx.fillStyle = '#e0f7fa';
      ctx.fillRect(-sh.hw - 60, -sh.hh - 60, sh.hw * 2 + 120, sh.hh * 2 + 120);
      ctx.strokeStyle = '#b2ebf2';
      ctx.lineWidth = 3;
      if (sh.shape === 'circle') {
        for (let r = sh.R * 0.25; r < sh.R; r += sh.R * 0.25) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        for (let x = -sh.hw + 80; x < sh.hw; x += 80) {
          ctx.moveTo(x, -sh.hh);
          ctx.lineTo(x, sh.hh);
        }
        for (let y = -sh.hh + 80; y < sh.hh; y += 80) {
          ctx.moveTo(-sh.hw, y);
          ctx.lineTo(sh.hw, y);
        }
        ctx.stroke();
      }
    },
    deco() {},
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export function resolveTheme(id) {
  if (id === 'random' || !THEME_BY_ID[id]) return THEMES[Math.floor(Math.random() * (THEMES.length - 1))];
  return THEME_BY_ID[id];
}

export const ARENA_PAD = 70;

/**
 * Vẽ sàn (cắt theo hình đấu trường ban đầu) + trang trí ngoài tường vào một canvas.
 * Trả về { canvas, res } — canvas có tâm là tâm đấu trường, kích thước (2hw+2pad)×(2hh+2pad).
 */
export function buildArenaCanvas(theme, arena) {
  const oval = arena.shape === 'oval';
  // bầu dục: vẽ như hình tròn bán kính = nửa trục ngang rồi kéo giãn theo chiều dọc
  const sh = oval
    ? { shape: 'circle', R: arena.outerHalfWidth, hw: arena.outerHalfWidth, hh: arena.outerHalfWidth }
    : { shape: arena.shape, R: arena.baseR, hw: arena.outerHalfWidth, hh: arena.outerHalfHeight };
  const W = (arena.outerHalfWidth + ARENA_PAD) * 2;
  const H = (arena.outerHalfHeight + ARENA_PAD) * 2;
  const res = Math.max(0.6, Math.min(2, 2400 / Math.max(W, H)));
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * res);
  c.height = Math.ceil(H * res);
  const ctx = c.getContext('2d');
  ctx.setTransform(res, 0, 0, res, (W / 2) * res, (H / 2) * res);
  if (oval) ctx.scale(1, arena.outerHalfHeight / arena.outerHalfWidth);
  ctx.lineJoin = 'round';
  // trang trí ngoài tường
  theme.deco(ctx, sh);
  // sàn
  ctx.save();
  shapePath(ctx, sh);
  ctx.clip();
  theme.floor(ctx, sh);
  // tối dần về mép tường → chiều sâu
  const r = Math.max(sh.hw, sh.hh);
  const vg = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(-W, -H, W * 2, H * 2);
  ctx.restore();
  return { canvas: c, res };
}
