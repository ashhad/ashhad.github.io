// Runs inside the rendering page. Each image is drawn once on an off-screen canvas and sampled into
// N points; particle i moves from its point in one image to its point in the next along a curved,
// smoky path. window.setFrame(t) draws the particles for time t (seconds).
(() => {
  const { scenes, SCENE, MORPH, W, H, ink, seed } = window.CONFIG;
  const N = 4200, CX = 540, CY = 1250;
  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');

  const rng = s => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = rng(seed);
  const ease = x => { x = Math.min(Math.max(x, 0), 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  // ---------- the images, drawn in white on an off-screen canvas ----------
  const cut = (c, fn) => { c.save(); c.globalCompositeOperation = 'destination-out'; fn(); c.restore(); };
  const petals = (c, x, y, n, len, wid, rot = 0) => {
    for (let k = 0; k < n; k++) { c.save(); c.translate(x, y); c.rotate(rot + k * 2 * Math.PI / n); c.beginPath(); c.ellipse(0, -len, wid, len, 0, 0, 7); c.fill(); c.restore(); }
    cut(c, () => { c.lineWidth = 7; for (let k = 0; k < n; k++) { c.save(); c.translate(x, y); c.rotate(rot + k * 2 * Math.PI / n); c.beginPath(); c.ellipse(0, -len, wid, len, 0, 0, 7); c.stroke(); c.restore(); } });
    c.beginPath(); c.arc(x, y, wid * .75, 0, 7); c.fill();
  };
  const stem = (c, x0, y0, x1, y1, bend) => {
    c.lineWidth = 13; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + bend, (y0 + y1) / 2, x1, y1); c.stroke();
    const leaf = (lx, ly, a) => { c.save(); c.translate(lx, ly); c.rotate(a); c.beginPath(); c.ellipse(46, 0, 50, 17, 0, 0, 7); c.fill(); c.restore(); };
    leaf((x0 + x1) / 2 + bend * .45, (y0 + y1) / 2 + 40, -.5); leaf((x0 + x1) / 2 + bend * .55, (y0 + y1) / 2 + 120, Math.PI + .5);
  };
  const DRAW = {
    flower: c => { stem(c, CX, 1590, CX, 1200, 40); petals(c, CX, 1120, 8, 118, 58, .2); },
    twin: c => { stem(c, CX - 90, 1580, CX - 120, 1220, -30); stem(c, CX + 90, 1580, CX + 130, 1260, 30); petals(c, CX - 120, 1170, 7, 74, 38, .1); petals(c, CX + 130, 1215, 6, 66, 36, .4); },
    moon: c => {
      c.beginPath(); c.arc(CX, 1240, 220, 0, 7); c.fill();
      cut(c, () => { c.beginPath(); c.arc(CX + 95, 1185, 200, 0, 7); c.fill(); });
      for (let k = 0; k < 9; k++) { c.beginPath(); c.arc(170 + r() * 740, 1000 + r() * 560, 5 + r() * 6, 0, 7); c.fill(); }
    },
    birds: c => {
      c.lineWidth = 14; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = 0; k < 9; k++) { const x = 190 + r() * 700, y = 1010 + r() * 520, s = 38 + r() * 50; c.beginPath(); c.moveTo(x - s, y - s * .45); c.quadraticCurveTo(x - s * .4, y - s * .35, x, y); c.quadraticCurveTo(x + s * .4, y - s * .35, x + s, y - s * .45); c.stroke(); }
    },
    waves: c => {
      c.lineWidth = 17; c.lineCap = 'round';
      for (let k = 0; k < 5; k++) { const y = 1070 + k * 105, ph = r() * 6; c.beginPath(); for (let x = 130; x <= 950; x += 8) { const yy = y + Math.sin(x * .016 + ph) * 30; x === 130 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.stroke(); }
    },
    rain: c => {
      for (const [x, y, rr] of [[CX - 150, 1090, 90], [CX - 40, 1040, 120], [CX + 90, 1070, 105], [CX + 190, 1105, 75], [CX, 1120, 100]]) { c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); }
      c.lineWidth = 8; c.lineCap = 'round';
      for (let k = 0; k < 34; k++) { const x = CX - 230 + r() * 460, y = 1240 + r() * 290; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 14, y + 46); c.stroke(); }
    },
    house: c => {
      c.fillRect(CX - 210, 1250, 420, 310); c.beginPath(); c.moveTo(CX - 250, 1255); c.lineTo(CX, 1050); c.lineTo(CX + 250, 1255); c.fill(); c.fillRect(CX + 110, 1080, 50, 120);
      cut(c, () => { c.fillRect(CX - 150, 1320, 52, 60); c.fillRect(CX - 92, 1320, 52, 60); c.fillRect(CX - 150, 1386, 52, 60); c.fillRect(CX - 92, 1386, 52, 60); c.fillRect(CX + 60, 1400, 90, 160); });
    },
    city: c => {
      let x = 130; const rects = [];
      while (x < 940) { const w = 70 + r() * 70, h = 220 + r() * 330; c.fillRect(x, 1570 - h, w, h); rects.push([x, w, h]); x += w + 10; }
      cut(c, () => { for (const [bx, bw, bh] of rects) for (let wy = 1590 - bh; wy < 1540; wy += 38) for (let wx = bx + 12; wx < bx + bw - 18; wx += 26) if (r() < .55) c.fillRect(wx, wy, 13, 20); });
    },
    tree: c => {
      c.lineCap = 'round';
      const br = (x, y, len, a, d) => { const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; c.lineWidth = d * 4.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); if (d > 1) { br(x2, y2, len * .72, a - .42 - r() * .2, d - 1); br(x2, y2, len * .72, a + .42 + r() * .2, d - 1); } else { c.beginPath(); c.arc(x2, y2, 13, 0, 7); c.fill(); } };
      br(CX, 1580, 170, -Math.PI / 2, 7);
    },
    flame: c => {
      const f = (x, top, bot, w) => { c.beginPath(); c.moveTo(x, top); c.bezierCurveTo(x + w, top + (bot - top) * .45, x + w * .85, bot, x, bot); c.bezierCurveTo(x - w * .85, bot, x - w, top + (bot - top) * .45, x, top); c.fill(); };
      f(CX, 1010, 1340, 150); cut(c, () => f(CX, 1170, 1320, 70));
      c.lineWidth = 18; c.lineCap = 'round'; c.beginPath(); c.moveTo(CX, 1350); c.lineTo(CX + 40, 1570); c.stroke();
    },
    window: c => {
      c.lineWidth = 24; c.beginPath(); c.moveTo(CX - 250, 1540); c.lineTo(CX - 250, 1240); c.arc(CX, 1240, 250, Math.PI, 0); c.lineTo(CX + 250, 1540); c.closePath(); c.stroke();
      c.lineWidth = 14; c.beginPath(); c.moveTo(CX, 990); c.lineTo(CX, 1540); c.moveTo(CX - 250, 1290); c.lineTo(CX + 250, 1290); c.stroke();
      c.fillRect(CX - 300, 1540, 600, 30);
    },
    sun: c => {
      c.beginPath(); c.arc(CX, 1270, 140, 0, 7); c.fill();
      c.lineWidth = 12; c.lineCap = 'round';
      for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; c.beginPath(); c.moveTo(CX + Math.cos(a) * 185, 1270 + Math.sin(a) * 185); c.lineTo(CX + Math.cos(a) * 275, 1270 + Math.sin(a) * 275); c.stroke(); }
    },
  };

  // Sample N points from a drawn image, ordered by angle around its centre so particles sweep in arcs.
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const oc = off.getContext('2d');
  const sample = name => {
    oc.clearRect(0, 0, W, H); oc.fillStyle = oc.strokeStyle = '#fff'; DRAW[name](oc);
    const data = oc.getImageData(0, 0, W, H).data, pts = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
    const out = []; for (let i = 0; i < N; i++) { const p = pts[Math.floor(r() * pts.length)]; out.push([p[0] + (r() - .5) * 3, p[1] + (r() - .5) * 3]); }
    const mx = out.reduce((s, p) => s + p[0], 0) / N, my = out.reduce((s, p) => s + p[1], 0) / N;
    return out.sort((a, b) => Math.atan2(a[1] - my, a[0] - mx) - Math.atan2(b[1] - my, b[0] - mx));
  };
  const targets = scenes.map(s => sample(s.shape));
  // Scene 1 blooms out of a seed at the flower's heart.
  const seedPts = Array.from({ length: N }, () => [CX + (r() - .5) * 30, 1120 + (r() - .5) * 30]);
  const parts = Array.from({ length: N }, () => ({ d: r() * .4, side: r() < .5 ? -1 : 1, swirl: .5 + r(), w: 1 + r() * 2, ph: r() * 6, size: 1.4 + r() * 1.8, a: .5 + r() * .5 }));

  const starts = scenes.map((_, i) => i * SCENE);
  const BLOOM_START = -0.95;   // the bloom is under way at frame 0, so the first frame is never empty

  const pos = (i, t) => {
    let k = 0; for (let s = 0; s < starts.length; s++) if (t >= starts[s] - .25) k = s;
    const from = k === 0 ? seedPts : targets[k - 1], to = targets[k];
    const t0 = k === 0 ? BLOOM_START : starts[k] - .25;
    const p = parts[i], u = Math.min(Math.max(((t - t0) / MORPH - p.d) / .6, 0), 1), e = ease(u);
    const [ax, ay] = from[i], [bx, by] = to[i];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, arc = Math.sin(Math.PI * e);
    const bend = arc * Math.min(len * .35, 240) * p.side * p.swirl;
    const drift = arc * 34;
    return [
      ax + dx * e - dy / len * bend + Math.cos(t * 2.1 + p.ph) * drift + Math.sin(t * p.w + p.ph) * 1.6,
      ay + dy * e + dx / len * bend + Math.sin(t * 1.7 + p.ph) * drift + Math.cos(t * p.w + p.ph) * 1.6,
      arc,
    ];
  };

  const texts = scenes.map((_, i) => document.getElementById(`t${i}`));

  window.setFrame = t => {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = ctx.fillStyle = ink; ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const [x, y, arc] = pos(i, t), [px, py] = pos(i, t - 1 / 55), p = parts[i];
      ctx.globalAlpha = p.a * (1 - arc * .45);
      ctx.lineWidth = p.size;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x + .01, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    texts.forEach((e, i) => {
      const s = starts[i], end = i + 1 < starts.length ? starts[i + 1] : Infinity;
      const inA = i === 0 ? 1 : ease((t - s - .25) / .6);
      const outA = end === Infinity ? 1 : 1 - ease((t - (end - .5)) / .35);
      const o = Math.max(0, Math.min(inA, outA));
      e.style.opacity = o;
      e.style.filter = `blur(${(1 - o) * 8}px)`;
    });
  };
  window.setFrame(0);
})();
