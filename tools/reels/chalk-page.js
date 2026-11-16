// Runs inside the rendering page. Every drawing is a list of SVG paths; each path is turned into
// thousands of tiny chalk dabs along its length, so it can be revealed progressively (it "draws
// itself") and re-textured a few times a second for a hand-drawn wobble.
// window.setFrame(t) paints the frame for time t (seconds).
(() => {
  const { scenes, SCENE, DRAW, W, H, seed } = window.CONFIG;
  const GROUND = 1400, INK = '#f4f0e6';
  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.style.cssText = 'position:absolute;width:0;height:0'; document.body.appendChild(svg);
  const probe = document.createElementNS(NS, 'path'); svg.appendChild(probe);

  const rng = s => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hashStr = s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
  const ease = x => { x = Math.min(Math.max(x, 0), 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const clamp = x => Math.min(Math.max(x, 0), 1);
  const f = n => Math.round(n * 10) / 10;

  // ---------- the drawings (local coordinates: x centred, y = 0 is the ground, up is negative) ----------
  const L = (d, o = {}) => ({ d, w: 5, a: 1, ...o });
  const circle = (cx, cy, r) => `M${f(cx - r)},${f(cy)} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0`;
  const rect = (x, y, w, h) => `M${f(x)},${f(y)} h${f(w)} v${f(h)} h${f(-w)} Z`;
  const outlined = (d, fill, o = {}) => [L(d, { fill }), L(d, o)];

  function flower(r, x, h, lean, type) {
    const cx = x + lean, cy = -h, out = [];
    out.push(L(`M${f(x)},0 C${f(x + lean * .1)},${f(-h * .4)} ${f(x + lean * 1.2)},${f(-h * .65)} ${f(cx)},${f(cy)}`, { w: 4 }));
    const leaf = (fr, dir) => {
      const px = x + lean * fr * fr, py = -h * fr, s = dir * (26 + r() * 22);
      return L(`M${f(px)},${f(py)} c${f(s * .5)},${f(-Math.abs(s) * .2 - 18)} ${f(s * 1.3)},-22 ${f(s * 1.6)},-6 c${f(-s * .5)},14 ${f(-s * 1.2)},14 ${f(-s * 1.6)},6`, { w: 3 });
    };
    out.push(leaf(.28 + r() * .12, 1));
    if (h > 150) out.push(leaf(.45 + r() * .15, -1));
    if (type === 'daisy') {
      const n = 9 + Math.floor(r() * 4), len = 30 + r() * 16, rc = 11;
      for (let k = 0; k < n; k++) {
        const a = k / n * 2 * Math.PI + r() * .15, c = Math.cos(a), s = Math.sin(a);
        const bx = cx + c * rc, by = cy + s * rc, tx = cx + c * (rc + len), ty = cy + s * (rc + len), mx = cx + c * (rc + len * .6), my = cy + s * (rc + len * .6);
        out.push(L(`M${f(bx)},${f(by)} Q${f(mx - s * 10)},${f(my + c * 10)} ${f(tx)},${f(ty)} Q${f(mx + s * 10)},${f(my - c * 10)} ${f(bx)},${f(by)}`, { w: 3 }));
      }
      out.push(...outlined(circle(cx, cy, rc), .9, { w: 3 }));
    } else if (type === 'tulip') {
      out.push(L(`M${f(cx - 20)},${f(cy + 4)} c-8,-28 0,-52 6,-62 c6,10 10,18 14,24 c4,-8 8,-16 14,-24 c8,12 14,36 6,62 c-10,12 -30,12 -40,0 Z`, { w: 3.5 }));
      out.push(L(`M${f(cx)},${f(cy + 10)} c-2,-14 -2,-30 0,-44`, { w: 2.5, a: .7 }));
    } else if (type === 'allium') {
      const n = 15;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI + k / (n - 1) * Math.PI + (r() - .5) * .1, len = 26 + r() * 14, ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
        out.push(L(`M${f(cx)},${f(cy)} L${f(ex)},${f(ey)}`, { w: 2.5 }), L(circle(ex, ey, 3), { w: 3 }));
      }
    } else {   // sprig with a bud
      for (const fr of [.62, .78, .92]) out.push(leaf(fr, fr > .7 && fr < .9 ? -1 : 1));
      out.push(L(`M${f(cx)},${f(cy)} c-12,-14 -8,-34 0,-42 c8,8 12,28 0,42`, { w: 3 }));
    }
    return out;
  }
  const grass = (r, x) => [L(`M${f(x)},0 q-6,-20 -14,-${f(26 + r() * 14)} M${f(x + 5)},0 q2,-24 0,-${f(34 + r() * 16)} M${f(x + 10)},0 q8,-18 16,-${f(22 + r() * 14)}`, { w: 2.5, a: .85 })];
  const TYPES = ['daisy', 'tulip', 'allium', 'sprig', 'daisy'];
  function flowers(r, n, spread, hmin, hmax) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = -spread + (i + .5) / n * 2 * spread + (r() - .5) * spread / n;
      out.push(...flower(r, x, hmin + r() * (hmax - hmin), (r() - .5) * 60, TYPES[Math.floor(r() * TYPES.length)]));
      if (r() < .8) out.push(...grass(r, x + 30 + r() * 30));
    }
    return out;
  }
  function pine(r, x, h) {
    const out = [L(`M${f(x)},0 L${f(x + 2)},${f(-h)}`, { w: 4 })], n = Math.floor(h / 36);
    for (let i = 0; i < n; i++) {
      const y = -h + 22 + i * (h - 60) / n, w = 16 + i * h * .034;
      out.push(L(`M${f(x - w)},${f(y + w * .6)} Q${f(x - w * .35)},${f(y + w * .28)} ${f(x + 1)},${f(y - 8)} Q${f(x + w * .35)},${f(y + w * .28)} ${f(x + w)},${f(y + w * .6)}`, { w: 4 }));
    }
    return out;
  }
  function tree(r, bare) {
    const out = [];
    const br = (x, y, len, ang, d) => {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len, mx = (x + x2) / 2 + (r() - .5) * len * .25, my = (y + y2) / 2 + (r() - .5) * len * .1;
      out.push(L(`M${f(x)},${f(y)} Q${f(mx)},${f(my)} ${f(x2)},${f(y2)}`, { w: 2 + d * 1.4 }));
      if (d > 1) { br(x2, y2, len * .73, ang - .34 - r() * .3, d - 1); br(x2, y2, len * .73, ang + .34 + r() * .3, d - 1); }
      else if (!bare) for (let k = 0; k < 2; k++) { const a = ang + (r() - .5) * 2, s = 16 + r() * 12, ex = x2 + Math.cos(a) * s, ey = y2 + Math.sin(a) * s; out.push(L(`M${f(x2)},${f(y2)} Q${f(ex - Math.sin(a) * 9)},${f(ey + Math.cos(a) * 9)} ${f(ex)},${f(ey)} Q${f(ex + Math.sin(a) * 9)},${f(ey - Math.cos(a) * 9)} ${f(x2)},${f(y2)}`, { w: 2.5 })); }
    };
    br(0, 0, 135, -Math.PI / 2 + (r() - .5) * .15, 5);
    return out;
  }
  const lamp = () => [
    L('M-16,0 h32 M-10,-14 h20', { w: 4 }), L('M0,-14 V-330 C0,-392 58,-402 88,-374'), ...outlined('M70,-376 l44,0 l-9,28 l-26,0 Z', .85, { w: 4 }),
    L('M78,-338 l-34,150 M92,-338 l0,160 M106,-338 l34,150', { w: 2.5, a: .45 }),
  ];
  const campfire = () => [
    L('M-56,-6 L56,-28 M-56,-28 L56,-6', { w: 6 }),
    L('M0,-160 C10,-120 54,-96 34,-52 C50,-56 52,-74 50,-84 C74,-40 40,-22 0,-22 C-40,-22 -70,-44 -44,-92 C-42,-74 -34,-62 -24,-58 C-40,-100 -8,-120 0,-160 Z', { w: 4.5, wob: 3 }),
    L('M0,-96 C16,-74 22,-56 10,-40 C4,-34 -6,-34 -12,-42 C-22,-58 -8,-74 0,-96 Z', { w: 3.5, wob: 3 }),
  ];

  const MOTIFS = {
    flowers: r => ({ items: flowers(r, 4, 150, 130, 300) }),
    meadow: r => ({ items: flowers(r, 9, 440, 120, 330) }),
    pines: r => ({ items: [...pine(r, -150, 250), ...pine(r, -50, 380), ...pine(r, 60, 300), ...pine(r, 160, 420), ...grass(r, -220)] }),
    pinesSmall: r => ({ items: [...pine(r, -70, 250), ...pine(r, 30, 340), ...pine(r, 110, 210)] }),
    tree: r => ({ items: [...tree(r, false), ...grass(r, 60), ...grass(r, -90)] }),
    baretree: r => ({ items: [...tree(r, true), ...grass(r, 70)] }),
    lamp: () => ({ items: lamp() }),
    campfire: () => ({ items: campfire() }),
    lampbench: r => ({
      items: [
        ...lamp().map(i => ({ ...i, dx: -150 })),
        L('M-40,-74 H190 M-40,-62 H190', { w: 5 }), L('M-34,-132 H184 M-34,-114 H184', { w: 5 }), L('M-22,-74 V-136 M172,-74 V-136', { w: 4 }),
        L('M-16,-62 L-26,0 M166,-62 L176,0 M14,-62 L18,0 M136,-62 L132,0', { w: 4 }), ...grass(r, 220),
      ],
    }),
    house: r => {
      const items = [
        L('M-112,0 C-114,-80 -110,-160 -112,-232'), L('M112,0 C114,-80 110,-160 112,-232'),
        ...outlined('M-150,-228 L-92,-400 L96,-400 L152,-228 Z', .5),
        L('M-152,-212 L152,-212', { w: 3 }),
      ];
      for (let x = -144; x <= 146; x += 13) items.push(L(`M${x},-228 l0,15`, { w: 2.5 }));
      items.push(L('M44,-400 L44,-446 L66,-446 L66,-400', { w: 4 }));
      // a small bird on the chimney
      items.push(L('M38,-474 c4,-28 44,-30 50,2 c-8,18 -34,20 -50,-2 Z', { w: 3.5 }), L('M38,-474 l-13,-3 l13,-6', { w: 3 }), L(circle(52, -480, 2), { w: 3 }), L('M60,-474 c8,-8 18,-4 22,6', { w: 2.5 }), L('M58,-456 l0,10 M68,-456 l0,10', { w: 2.5 }));
      for (const wx of [-74, 30]) { items.push(...outlined(rect(wx, -246, 44, 76), .3, { w: 4 }), L(`M${wx + 8},-196 l14,-34 M${wx + 22},-190 l12,-30`, { w: 2, a: .7 }), L(`M${wx - 6},-166 h56`, { w: 4 })); }
      items.push(L('M-30,0 V-62 A30,30 0 0 1 30,-62 V0', { w: 4.5 }), L('M-20,0 V-60 A20,20 0 0 1 20,-60 V0', { w: 2.5 }), L(circle(10, -34, 3), { w: 3 }));
      items.push(...flower(r, -170, 110, -14, 'sprig'), ...flower(r, 160, 130, 20, 'allium'));
      return { items };
    },
    city: r => {
      const items = []; let x = -240;
      while (x < 230) {
        const w = 52 + r() * 46, h = 190 + r() * 250;
        items.push(L(`M${f(x)},0 V${f(-h)} H${f(x + w)} V0`, { w: 4.5 }));
        for (let wy = -h + 24; wy < -30; wy += 36) for (let wx = x + 12; wx < x + w - 16; wx += 21) if (r() < .5) items.push(L(rect(wx, wy, 10, 15), { fill: .85 }));
        if (r() < .35) items.push(L(`M${f(x + w / 2)},${f(-h)} v-44 M${f(x + w / 2 - 10)},${f(-h - 28)} h20`, { w: 3 }));
        x += w + (r() < .3 ? 14 : 0);
      }
      return { items };
    },
    window: r => ({
      items: [
        L('M-140,-110 V-330 A140,140 0 0 1 140,-330 V-110 Z'), L('M-118,-124 V-328 A118,118 0 0 1 118,-328 V-124 Z', { w: 3 }),
        L('M0,-446 V-124 M-118,-300 H118', { w: 4 }), L('M-176,-110 H176 M-164,-92 H164', { w: 5 }),
        L('M-146,-452 C-176,-380 -196,-250 -206,-112 M-128,-440 C-156,-360 -172,-240 -176,-112', { w: 3 }), L('M146,-452 C176,-380 196,-250 206,-112 M128,-440 C156,-360 172,-240 176,-112', { w: 3 }),
        L('M56,-110 l8,-44 h46 l8,44', { w: 4 }), ...flower(r, 87, 96, 6, 'sprig').map(i => ({ ...i, dy: -154 })),
        L('M-250,-40 h60 M-220,-66 h60 M200,-50 h56 M176,-24 h60', { w: 2.5, a: .5 }),
      ],
    }),
    balcony: r => {
      const items = [L('M150,0 V-520', { w: 5 }), ...outlined('M-130,-250 H150 v24 H-130 Z', .35), L('M-130,-420 H150 M-130,-404 H150', { w: 5 }), L('M-100,-226 L150,-120', { w: 4 })];
      for (let x = -118; x <= 140; x += 24) items.push(L(`M${x},-404 V-250`, { w: 3.5 }));
      items.push(L('M-96,-420 l6,-36 h40 l6,36', { w: 4 }), ...flower(r, -70, 80, -6, 'tulip').map(i => ({ ...i, dy: -456 })), L('M40,-520 v40', { w: 2.5 }), ...outlined('M26,-480 h28 l6,40 h-40 Z', .5, { w: 3.5 }));
      return { items };
    },
    boat: () => {
      const items = [];
      for (let i = 0; i < 4; i++) { let d = `M-430,${-20 - i * 30} q36,${-17 + i * 2} 72,0`; for (let k = 0; k < 11; k++) d += ' t72,0'; items.push(L(d, { w: 4, a: 1 - i * .12, wob: 2 })); }
      items.push(...outlined('M-90,-162 L96,-162 L66,-118 L-62,-118 Z', .3), L('M0,-162 V-330', { w: 4 }), ...outlined('M8,-322 L84,-184 L8,-184 Z', .3, { w: 4 }), L('M-8,-312 L-64,-184 L-8,-184 Z', { w: 3.5 }), L('M0,-330 l26,8 l-26,8', { w: 3 }));
      return { items };
    },
    river: r => ({
      items: [
        L('M-470,-30 L-250,-330 L-150,-205 L-20,-440 L104,-236'), L('M128,-240 L230,-350 L470,-30'),
        L('M-296,-268 l22,-14 l16,18 l20,-22 l18,20 l14,-10', { w: 3 }), L('M-66,-372 l20,-16 l18,20 l22,-26 l20,24 l18,-14', { w: 3 }), L('M188,-304 l18,-12 l16,16 l18,-20 l16,18', { w: 3 }),
        L('M104,-236 C60,-176 150,-140 70,-92 C10,-56 -110,-40 -200,0', { w: 4.5 }), L('M128,-240 C110,-190 214,-150 160,-96 C128,-62 110,-30 120,0', { w: 4.5 }),
        L('M40,-70 c6,-18 30,-18 36,0', { w: 3.5 }), L('M-70,-26 c8,-20 36,-20 44,0', { w: 3.5 }), L('M114,-150 c4,-12 20,-12 24,0', { w: 3 }),
        ...pine(r, -350, 150), ...pine(r, -420, 100), ...pine(r, 330, 140), ...pine(r, 400, 95), ...grass(r, -260), ...grass(r, 200),
      ],
      extras: [{ type: 'flow', path: 'M116,-238 C86,-182 182,-146 116,-94 C70,-58 0,-34 -40,0' }],
    }),
    heart: r => ({
      items: [
        L('M0,-282 C-36,-350 -150,-336 -150,-244 C-150,-166 -62,-118 0,-58 C62,-118 150,-166 150,-244 C150,-336 36,-350 0,-282 Z', { fill: .1, beat: [0, -220] }),
        L('M0,-282 C-36,-350 -150,-336 -150,-244 C-150,-166 -62,-118 0,-58 C62,-118 150,-166 150,-244 C150,-336 36,-350 0,-282 Z', { w: 5.5, beat: [0, -220] }),
        L('M-440,-214 H-170 l18,-22 l18,22 h22 l24,-104 l34,196 l26,-116 l16,24 h40 l18,-22 l18,22 H440', { w: 4 }),
        L('M0,-58 C12,-36 -10,-18 0,0', { w: 2.5, a: .8 }),
        ...flower(r, -300, 150, -20, 'daisy'), ...flower(r, -240, 100, 10, 'sprig'), ...flower(r, 290, 170, 20, 'tulip'), ...grass(r, 220), ...grass(r, -180),
      ],
    }),
    lovebirds: r => {
      const bird = (x, y, dir, s) => {
        const p = (a, b) => `${f(x + dir * a * s)},${f(y + b * s)}`;
        return [
          L(`M${p(0, 0)} C${p(4, -28)} ${p(44, -30)} ${p(50, 2)} C${p(42, 20)} ${p(16, 22)} ${p(0, 0)} Z`, { w: 4 }), L(`M${p(0, -2)} L${p(-13, -5)} L${p(0, -10)}`, { w: 3 }),
          L(circle(x + dir * 13 * s, y - 8 * s, 2.5), { w: 3 }), L(`M${p(20, -2)} C${p(28, -12)} ${p(40, -8)} ${p(44, 4)}`, { w: 3 }),
          L(`M${p(48, 0)} L${p(68, 6)} M${p(47, 6)} L${p(64, 14)}`, { w: 3 }), L(`M${p(20, 17)} L${p(20, 30)} M${p(30, 17)} L${p(30, 30)}`, { w: 2.5 }),
        ];
      };
      const leafAt = (x, y, a) => { const s = 30, ex = x + Math.cos(a) * s, ey = y + Math.sin(a) * s; return L(`M${f(x)},${f(y)} Q${f(ex - Math.sin(a) * 11)},${f(ey + Math.cos(a) * 11)} ${f(ex)},${f(ey)} Q${f(ex + Math.sin(a) * 11)},${f(ey - Math.cos(a) * 11)} ${f(x)},${f(y)}`, { w: 2.5 }); };
      return {
        items: [
          L('M250,0 C238,-150 262,-290 246,-450'), L('M296,0 C288,-150 304,-300 290,-450'), L('M266,-80 q6,-20 2,-44 M276,-200 q-6,-22 0,-46 M270,-340 q6,-18 2,-40', { w: 2.5, a: .7 }),
          L('M250,-262 C130,-300 -60,-262 -262,-296'), L('M250,-240 C140,-270 -40,-244 -180,-266', { w: 3.5 }),
          L('M-170,-286 q-30,-40 -72,-50 M70,-280 q22,-50 64,-64 M-262,-296 q-24,-6 -40,-22', { w: 3 }),
          leafAt(-242, -336, -2.6), leafAt(-206, -322, -1.2), leafAt(134, -344, -.5), leafAt(100, -316, -1.9), leafAt(-302, -318, 2.9), leafAt(180, -268, 1.2), leafAt(-110, -272, 1.4),
          ...bird(-80, -330, -1, 1.7), ...bird(-12, -318, 1, 1.7),
          L('M-46,-432 c-10,-18 -36,-14 -36,8 c0,20 20,30 36,44 c16,-14 36,-24 36,-44 c0,-22 -26,-26 -36,-8 Z', { w: 3, beat: [-46, -408] }),
          ...grass(r, 180), ...grass(r, 330),
        ],
      };
    },
    phone: r => {
      const items = [L('M-62,-250 h124 a16,16 0 0 1 16,16 v218 a16,16 0 0 1 -16,16 h-124 a16,16 0 0 1 -16,-16 v-218 a16,16 0 0 1 16,-16 Z'), L('M-18,-232 h36', { w: 3.5 }), L(circle(0, -22, 7), { w: 3 })];
      items.push(L('M-56,-196 h92 a10,10 0 0 1 10,10 v36 a10,10 0 0 1 -10,10 h-78 l-14,12 Z', { w: 3 }), L('M-44,-178 l14,10 l-14,10 Z', { fill: .9 }));
      for (let i = 0; i < 7; i++) { const h = 8 + r() * 24; items.push(L(`M${-20 + i * 9},${f(-168 - h / 2)} v${f(h)}`, { w: 3 })); }
      items.push(L('M56,-110 h-70 a10,10 0 0 0 -10,10 v24 a10,10 0 0 0 10,10 h56 l14,12 Z', { w: 3, a: .8 }), L('M-10,-88 h52', { w: 2.5, a: .7 }));
      return { items, extras: [{ type: 'sound', x: 96, y: -140 }], rot: -7 };
    },
    cups: () => {
      const cup = x => [L(`M${x - 26},-166 h52 c0,40 -10,52 -26,52 c-16,0 -26,-12 -26,-52 Z`, { w: 4 }), L(`M${x + 26},-156 c22,0 22,30 0,30`, { w: 3.5 }), L(`M${x - 36},-112 h72`, { w: 3.5 })];
      return {
        items: [L('M-130,-108 H130 M-124,-96 H124', { w: 5 }), L('M-96,-96 L-108,0 M96,-96 L108,0', { w: 4.5 }), ...cup(-50), ...cup(52)],
        extras: [{ type: 'steam', x: -50, y: -176 }, { type: 'steam', x: 52, y: -176 }],
      };
    },
    // sky drawings (placed by their centre)
    moon: () => ({ items: [...outlined('M0,-66 A66,66 0 1 0 0,66 A84,84 0 0 1 0,-66 Z', .95, { w: 4 })], rot: 150 }),
    sun: () => {
      const items = [...outlined(circle(0, 0, 50), .95, { w: 4 })];
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, c = Math.cos(a), s = Math.sin(a); items.push(...outlined(`M${f(c * 68 - s * 11)},${f(s * 68 + c * 11)} L${f(c * 98)},${f(s * 98)} L${f(c * 68 + s * 11)},${f(s * 68 - c * 11)} Z`, .85, { w: 3 })); }
      return { items };
    },
    cloud: () => ({
      items: [...outlined('M-120,36 c-52,-4 -58,-70 -4,-78 c4,-58 86,-74 114,-26 c30,-32 98,-12 86,36 c46,6 46,62 -6,68 Z', .14)],
      extras: [{ type: 'rain', x: -110, y: 50, w: 230 }],
    }),
    envelope: () => ({ items: [L(rect(-78, -50, 156, 100)), L('M-78,-50 L0,14 L78,-50', { w: 4 }), L('M-78,50 L-22,-4 M78,50 L22,-4', { w: 3, a: .7 }), L('M-110,74 q-30,22 -64,18 M-196,88 q-26,-4 -44,-22 M-256,52 q-12,-18 -12,-38', { w: 3, a: .6 })], rot: -12 }),
    birds: () => ({ items: [], extras: [{ type: 'birds' }] }),
    hills: () => ({ items: [L('M-560,-170 C-400,-290 -270,-300 -150,-214 C-70,-270 70,-370 210,-236 C320,-300 450,-276 560,-190', { w: 3, a: .4 })] }),
    ground: () => ({ items: [L('M-560,0 C-300,-5 -120,4 0,-2 S380,4 560,0', { w: 5.5 })] }),
  };

  const SCALE = { river: 1.15, heart: 1.45, lovebirds: 1.25, house: 1.3, window: 1.35, balcony: 1.2, phone: 1.9, cups: 1.8, city: 1.4, pines: 1.4, tree: 1.7, baretree: 1.7, lampbench: 1.45, campfire: 2, boat: 1.2 };
  const ACCENT = { flowers: 1.3, pinesSmall: 1.2, lamp: 1.2, campfire: 1.5, tree: 1.25 };

  // ---------- turning paths into chalk dabs ----------
  const strokes = [], extras = [];
  const apply = (tf, x, y) => {
    if (tf.rot) { const a = tf.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); [x, y] = [x * c - y * s, x * s + y * c]; }
    return [tf.x + (tf.flip ? -x : x) * tf.sc, tf.y + y * tf.sc];
  };
  function build(it, tf, k, s0, span, R) {
    probe.setAttribute('d', it.d);
    const len = probe.getTotalLength(), w = Math.min(it.w * tf.sc, 8.5), dx = it.dx || 0, dy = it.dy || 0;
    const st = { k, s0, span, variants: [], per: 1, n: 0, minx: 1e9, maxx: -1e9, beat: it.beat ? apply(tf, it.beat[0], it.beat[1]) : null };
    if (it.fill) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let s = 0; s <= len; s += 4) { const p = probe.getPointAtLength(s); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      const shape = new Path2D(it.d), n = Math.ceil((x1 - x0) * (y1 - y0) * tf.sc * tf.sc * .17), pts = [];
      for (let i = 0; i < n; i++) { const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0); if (ctx.isPointInPath(shape, x, y)) pts.push([...apply(tf, x + dx, y + dy), 1.6 + R() * 2.2, it.fill * (.3 + .7 * R())]); }
      pts.sort((a, b) => a[0] + a[1] * .3 - b[0] - b[1] * .3);
      st.variants.push(Float32Array.from(pts.flat())); st.n = pts.length;
      pts.forEach(p => { st.minx = Math.min(st.minx, p[0]); st.maxx = Math.max(st.maxx, p[0]); });
      return st;
    }
    const step = 2 / tf.sc, n = Math.max(2, Math.ceil(len / step)), per = Math.max(1, Math.round(w / 2.3)), wob = it.wob || 1, base = [];
    for (let j = 0; j < n; j++) { const p = probe.getPointAtLength(Math.min(len, j * step)); base.push(p.x + dx, p.y + dy); }
    for (let v = 0; v < 3; v++) {
      const arr = new Float32Array(n * per * 4), p1 = R() * 6, p2 = R() * 6, p3 = R() * 6, p4 = R() * 6;
      for (let j = 0; j < n; j++) {
        const wx = (Math.sin(j * .045 + p1) * 1.3 + Math.sin(j * .13 + p2) * .7) * wob / tf.sc, wy = (Math.sin(j * .05 + p3) * 1.3 + Math.sin(j * .12 + p4) * .7) * wob / tf.sc;
        const [X, Y] = apply(tf, base[j * 2] + wx, base[j * 2 + 1] + wy);
        if (X < st.minx) st.minx = X; if (X > st.maxx) st.maxx = X;
        for (let d = 0; d < per; d++) {
          const a = R() * 6.283, rad = Math.sqrt(R()) * w / 2, o = (j * per + d) * 4;
          arr[o] = X + Math.cos(a) * rad; arr[o + 1] = Y + Math.sin(a) * rad; arr[o + 2] = 1.3 + R() * 2; arr[o + 3] = R() < .1 ? 0 : it.a * (.4 + .6 * R());
        }
      }
      st.variants.push(arr);
    }
    st.per = per; st.n = n;
    return st;
  }
  // Each drawing sketches its paths one after another; different drawings in a scene sketch at once.
  function addMotif(k, name, tf, delay) {
    const R = rng(hashStr(name + k) ^ seed), m = MOTIFS[name](R);
    if (m.rot) tf = { ...tf, rot: (tf.rot || 0) + m.rot };
    const lens = m.items.map(it => { probe.setAttribute('d', it.d); return Math.max(20, probe.getTotalLength() * (it.fill ? .5 : 1)); });
    const total = lens.reduce((a, b) => a + b, 0);
    let cum = 0;
    m.items.forEach((it, i) => { strokes.push(build(it, tf, k, delay + .7 * cum / total, Math.max(.16, .7 * lens[i] / total + .1), R)); cum += lens[i]; });
    (m.extras || []).forEach(e => {
      const x = { ...e, k, tf, ph: R() * 10 };
      if (e.path) { probe.setAttribute('d', e.path); const len = probe.getTotalLength(); x.pts = []; for (let s = 0; s <= len; s += 5) { const p = probe.getPointAtLength(s); x.pts.push(apply(tf, p.x, p.y)); } }
      extras.push(x);
    });
  }

  scenes.forEach((s, k) => {
    const cx = k * W + W / 2, on = (x, sc = 1, flip = false) => ({ x: cx + x, y: GROUND, sc, flip });
    addMotif(k, 'ground', on(0), 0);
    if (s.recap) { addMotif(k, 'meadow', on(0, 1.3), .05); addMotif(k, 'hills', on(0, 1.2), .1); }
    else {
      const full = ['boat', 'river', 'heart'].includes(s.main), wide = ['city', 'pines', 'lampbench', 'lovebirds'].includes(s.main);
      addMotif(k, s.main, on(full ? 0 : wide ? s.side * 150 : s.side * 215, SCALE[s.main] || 1.3, s.side < 0), .05);
      if (s.accent && !full) addMotif(k, s.accent, on(wide ? -s.side * 395 : -s.side * 310, (ACCENT[s.accent] || 1.2) * (wide ? .85 : 1), s.side > 0), .25);
      if (!full && k % 2 === 0) addMotif(k, 'hills', on(0, 1.2), .1);
    }
    // Sky drawings sit beside the scene, above the smaller companion drawing.
    const skyX = cx - s.side * (s.recap ? 380 : 330);
    if (s.sky === 'cloud') addMotif(k, 'cloud', { x: skyX + s.side * 30, y: 860, sc: 1.05 }, .15);
    else if (s.sky === 'birds') addMotif(k, 'birds', { x: skyX + s.side * 60, y: 860, sc: 1 }, .2);
    else addMotif(k, s.sky, { x: skyX, y: s.recap ? 840 : 800, sc: s.sky === 'envelope' ? .85 : 1.05, flip: s.side < 0 }, .15);
  });

  // A field of small stars drifting slower than the drawings, for depth.
  const SR = rng(seed ^ 99), worldW = scenes.length * W;
  const stars = Array.from({ length: 22 + scenes.length * 12 }, () => ({ x: SR() * (worldW * .6 + W), y: SR() < .25 ? 130 + SR() * 60 : 760 + SR() * 600, s: 2 + SR() * 3, p: SR() * 6, w: .8 + SR() * 2 }));

  // ---------- timing ----------
  const starts = scenes.map((_, i) => i * SCENE);
  const T = k => (k === 0 ? -1.0 : starts[k] - .55);     // when scene k starts sketching itself
  const camera = t => starts.slice(1).reduce((x, s) => x + ease((t - (s - .55)) / 1.1) * W, 0);

  // Quick chalk line for things that move every frame (rain, birds, steam, sound waves).
  function chalk(pts, w, a, R) {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
      for (let j = 0; j < n; j++) for (let d = 0; d < Math.max(1, Math.round(w / 2.3)); d++) {
        const sz = 1.3 + R() * 2;
        ctx.globalAlpha = a * (.4 + .6 * R());
        ctx.fillRect(x0 + (x1 - x0) * j / n + (R() - .5) * w, y0 + (y1 - y0) * j / n + (R() - .5) * w, sz, sz);
      }
    }
  }

  const texts = scenes.map((_, i) => document.getElementById(`t${i}`));

  window.setFrame = t => {
    const cam = camera(t), boil = Math.floor(t * 7) % 3;
    // A double heartbeat, about 66 beats a minute.
    const ph = t * 1.1 % 1, pulse = 1 + .06 * Math.exp(-Math.pow((ph - .1) / .06, 2)) + .04 * Math.exp(-Math.pow((ph - .32) / .06, 2));
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = INK;
    for (const s of stars) { const x = s.x - cam * .6; if (x < -10 || x > W + 10) continue; ctx.globalAlpha = .2 + .6 * Math.abs(Math.sin(t * s.w + s.p)); ctx.fillRect(x, s.y, s.s, s.s); if (s.s > 4) { ctx.fillRect(x - s.s, s.y + s.s * .3, s.s * 3, s.s * .4); ctx.fillRect(x + s.s * .3, s.y - s.s, s.s * .4, s.s * 3); } }

    for (const st of strokes) {
      if (st.maxx - cam < -20 || st.minx - cam > W + 20) continue;
      const p = clamp(((t - T(st.k)) / DRAW - st.s0) / st.span);
      if (p <= 0) continue;
      const arr = st.variants[boil % st.variants.length], count = Math.floor(p * st.n) * st.per * 4;
      if (st.beat) { const [bx, by] = st.beat; for (let i = 0; i < count; i += 4) { const a = arr[i + 3]; if (!a) continue; ctx.globalAlpha = a; ctx.fillRect(bx + (arr[i] - bx) * pulse - cam, by + (arr[i + 1] - by) * pulse, arr[i + 2], arr[i + 2]); } continue; }
      for (let i = 0; i < count; i += 4) { const a = arr[i + 3]; if (!a) continue; ctx.globalAlpha = a; ctx.fillRect(arr[i] - cam, arr[i + 1], arr[i + 2], arr[i + 2]); }
    }

    for (const e of extras) {
      const lt = t - T(e.k) - .7, vis = clamp(lt / .6), R = rng(hashStr(e.type + e.k) + boil * 977 + Math.floor(e.ph * 100));
      if (vis <= 0) continue;
      const [ox, oy] = apply(e.tf, e.x || 0, e.y || 0), x = ox - cam;
      if (x < -500 || x > W + 500) continue;
      if (e.type === 'rain') {
        const top = oy + 10, hgt = GROUND - top - 14;
        for (let i = 0; i < 26; i++) { const fr = (i * .618 + e.ph) % 1, y = top + ((fr * 997 % 1) * hgt + t * (300 + (i % 5) * 40)) % hgt, dx = x + fr * e.w * e.tf.sc; chalk([[dx, y], [dx - 7, y + 30]], 3, vis * .75 * (1 - (y - top) / hgt * .5), R); }
      } else if (e.type === 'birds') {
        for (let i = 0; i < 6; i++) { const bx = x - 160 + i * 74 + ((i * 53) % 40) + t * 26, by = oy - 60 + ((i * 97) % 150) + Math.sin(t * 1.4 + i) * 10, s = 20 + (i * 7) % 12, fl = Math.sin(t * 8 + i * 1.7) * s * .5; chalk([[bx - s, by - fl], [bx - s * .45, by - s * .25 - fl * .3], [bx, by], [bx + s * .45, by - s * .25 - fl * .3], [bx + s, by - fl]], 4, vis, R); }
      } else if (e.type === 'flow') {
        const n = e.pts.length;
        for (let i = 0; i < 16; i++) { const fr = (i / 16 + t * .32) % 1, j = Math.min(n - 4, Math.floor(fr * (n - 1))), lane = ((i * .618) % 1 - .5) * (16 + 250 * Math.pow(fr, 1.7)) * .75 * e.tf.sc, a = e.pts[j], b = e.pts[j + 3]; chalk([[a[0] - cam + lane, a[1]], [b[0] - cam + lane, b[1]]], 3, vis * (.45 + .5 * Math.sin(fr * 3.14)), R); }
      } else if (e.type === 'steam') {
        for (const off of [-9, 9]) { const pts = []; for (let j = 0; j <= 16; j++) pts.push([x + off * e.tf.sc + Math.sin(j * .55 + t * 2.4 + off) * 9 * (j / 16), oy - j * 6.5 * e.tf.sc]); for (let j = 1; j < pts.length; j++) chalk([pts[j - 1], pts[j]], 3, vis * .8 * (1 - j / 17), R); }
      } else if (e.type === 'sound') {
        const dir = e.tf.flip ? -1 : 1;
        for (let i = 0; i < 3; i++) { const rad = (36 + i * 34) * e.tf.sc, pts = []; for (let j = -6; j <= 6; j++) { const a = j * .1; pts.push([x + dir * Math.cos(a) * rad, oy + Math.sin(a) * rad]); } chalk(pts, 4, vis * (.25 + .75 * Math.max(0, Math.sin(t * 3.2 - i * .9))), R); }
      }
    }
    ctx.globalAlpha = 1;

    texts.forEach((el, i) => {
      const s = starts[i], end = i + 1 < starts.length ? starts[i + 1] : Infinity;
      const inA = i === 0 ? 1 : ease((t - s + .1) / .6), outA = end === Infinity ? 1 : 1 - ease((t - (end - .75)) / .4), o = Math.max(0, Math.min(inA, outA));
      el.style.opacity = o;
      el.style.transform = `translateX(${(1 - inA) * 60 - (1 - outA) * 60}px)`;
    });
  };
  window.setFrame(0);
})();
