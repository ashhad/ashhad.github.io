// Runs inside the rendering page. Builds each scene's silhouette layers from window.CONFIG and
// exposes window.setFrame(t), which positions everything for time t (in seconds).
(() => {
  const { scenes, SCENE, WIPE, W, H } = window.CONFIG;
  const NS = 'http://www.w3.org/2000/svg';
  const root = document.getElementById('scenes');
  const smoke = document.getElementById('smoke');

  const rng = seed => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
  const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const ease = x => { x = Math.min(Math.max(x, 0), 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  // Smooth ridge line across the width, closed down to the bottom of the frame.
  const ridge = (r, base, amp, n, extra = 200) => {
    const pts = []; for (let i = 0; i <= n; i++) pts.push([-extra + i * (W + 2 * extra) / n, base - amp * (0.35 + 0.65 * r())]);
    let d = `M${pts[0][0]},${H} L${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
    return d + ` L${pts[pts.length - 1][0]},${H} Z`;
  };
  const figure = (g, x, base, s, ink) => {
    const f = el('g', { transform: `translate(${x},${base}) scale(${s})` }, g);
    el('circle', { cx: 0, cy: -205, r: 17, fill: ink }, f);
    el('path', { d: 'M-11,-189 C-38,-150 -52,-60 -60,0 L60,0 C52,-60 38,-150 11,-189 Z', fill: ink }, f);
    return f;
  };

  const built = scenes.map((sc, i) => {
    const r = rng(sc.seed);
    const [top, horizon, glow, ink] = sc.palette;
    const m = sc.motifs;
    const g = el('g', { id: `s${i}`, opacity: 0 }, root);
    const cam = el('g', {}, g);                         // slow push-in for the whole scene
    const grad = el('linearGradient', { id: `sky${i}`, x1: 0, y1: 0, x2: 0, y2: 1 }, el('defs', {}, g));
    el('stop', { offset: '0', 'stop-color': top }, grad);
    el('stop', { offset: '.62', 'stop-color': horizon }, grad);
    el('stop', { offset: '1', 'stop-color': mix(horizon, ink, .4) }, grad);
    el('rect', { x: -100, y: -100, width: W + 200, height: H + 200, fill: `url(#sky${i})` }, cam);

    const anim = { g, cam, layers: [], stars: [], waves: [], rain: [], birds: [], dust: [], windows: [], flame: null, rise: [] };
    const nightish = m.night || m.moon || /^#0/.test(top);

    if (nightish) for (let k = 0; k < 90; k++) anim.stars.push({ e: el('circle', { cx: r() * W, cy: 120 + r() * 900, r: .8 + r() * 2.2, fill: '#fff' }, cam), w: 1 + r() * 3, p: r() * 6 });

    // Moon or sun low on the horizon, with a soft halo.
    if (m.showMoon) {
      const mx = 220 + r() * 640, my = 1170 + r() * 60, mr = 150 + r() * 60;
      el('circle', { cx: mx, cy: my, r: mr * 2.2, fill: glow, opacity: .35, filter: 'url(#glow)' }, cam);
      if (nightish) {
        const id = `moonmask${i}`;
        const mask = el('mask', { id }, cam);
        el('circle', { cx: mx, cy: my, r: mr, fill: '#fff' }, mask);
        if (r() < .6) el('circle', { cx: mx + mr * .45, cy: my - mr * .25, r: mr * .9, fill: '#000' }, mask);
        el('circle', { cx: mx, cy: my, r: mr, fill: mix(glow, '#ffffff', .5), mask: `url(#${id})` }, cam);
      } else el('circle', { cx: mx, cy: my, r: mr, fill: mix(glow, '#ffffff', .3) }, cam);
      anim.moon = { x: mx, y: my };
      anim.rays = el('g', { opacity: .22 }, cam);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, a2 = a + .07; el('path', { d: `M${mx},${my} L${mx + Math.cos(a) * 1600},${my + Math.sin(a) * 1600} L${mx + Math.cos(a2) * 1600},${my + Math.sin(a2) * 1600} Z`, fill: glow }, anim.rays); }
      anim.raysAt = [mx, my];
    }

    const layer = (speed, depth) => { const l = el('g', {}, cam); anim.layers.push({ e: l, speed, depth }); return l; };

    // Far hills fade into the sky (atmospheric depth), nearer ones are pure ink.
    el('path', { d: ridge(r, 1330, 190, 7), fill: mix(horizon, ink, .55) }, layer(5, 0));
    const mid = layer(12, 1);

    if (m.mid === 'city') {
      for (let x = -150; x < W + 150;) {
        const bw = 60 + r() * 100, bh = 200 + r() * 420, by = 1500 - bh;
        el('rect', { x, y: by, width: bw, height: bh + 400, fill: mix(horizon, ink, .8) }, mid);
        for (let wy = by + 18; wy < 1470; wy += 30) for (let wx = x + 10; wx < x + bw - 14; wx += 22)
          if (r() < .28) anim.windows.push({ e: el('rect', { x: wx, y: wy, width: 9, height: 13, fill: glow, opacity: .85 }, mid), p: r() * 10 });
        x += bw + 4 + r() * 10;
      }
    } else if (m.mid === 'house') {
      const hx = r() < .5 ? 300 + r() * 120 : 680 + r() * 120, hb = 1530; anim.midX = hx;
      el('path', { d: ridge(r, 1530, 70, 5), fill: mix(horizon, ink, .85) }, mid);
      const h = el('g', { transform: `translate(${hx},${hb}) scale(1.35)` }, mid);
      el('rect', { x: -120, y: -160, width: 240, height: 160, fill: ink }, h);
      el('path', { d: 'M-145,-158 L0,-270 L145,-158 Z', fill: ink }, h);
      el('rect', { x: 60, y: -260, width: 30, height: 70, fill: ink }, h);
      el('circle', { cx: -40, cy: -95, r: 70, fill: glow, opacity: .55, filter: 'url(#glow)' }, h);
      anim.windows.push({ e: el('rect', { x: -70, y: -125, width: 60, height: 62, fill: mix(glow, '#ffffff', .2) }, h), p: 0, steady: true });
      el('rect', { x: -42, y: -125, width: 4, height: 62, fill: ink }, h);
      el('rect', { x: -70, y: -96, width: 60, height: 4, fill: ink }, h);
    } else if (m.mid === 'tree') {
      const tx = r() < .5 ? 180 + r() * 200 : 700 + r() * 200, tb = 1530; anim.midX = tx;
      el('path', { d: ridge(r, 1540, 60, 5), fill: mix(horizon, ink, .85) }, mid);
      const branch = (x, y, len, ang, depth) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        el('line', { x1: x, y1: y, x2, y2, stroke: ink, 'stroke-width': depth * 3.2, 'stroke-linecap': 'round' }, mid);
        if (depth > 1) for (let k = 0; k < 2 + (r() < .3); k++) branch(x2, y2, len * (.62 + r() * .18), ang + (r() - .5) * 1.1, depth - 1);
        else if (r() < .8) el('circle', { cx: x2, cy: y2, r: 6 + r() * 10, fill: ink }, mid);
      };
      branch(tx, tb, 190, -Math.PI / 2 + (r() - .5) * .2, 7);
    } else if (m.mid === 'water') {
      el('rect', { x: -200, y: 1370, width: W + 400, height: 700, fill: mix(horizon, ink, .7) }, mid);
      for (let k = 0; k < 9; k++) anim.waves.push({ e: el('path', { fill: 'none', stroke: glow, 'stroke-width': 2.5, opacity: .18 + k * .03 }, mid), y: 1385 + k * 22, a: 4 + k * 1.2, f: .006 + r() * .004, p: r() * 6, v: .6 + r() });
      if (anim.moon) for (let k = 0; k < 14; k++) anim.waves.push({ e: el('rect', { x: anim.moon.x - (60 - k * 3), y: 1382 + k * 14, width: (120 - k * 6) * (.5 + r() * .5), height: 4, fill: glow, opacity: .55 }, mid), shimmer: true, p: r() * 6, x0: anim.moon.x - (60 - k * 3) });
    }

    // Near ground, solid ink, with the foreground on it.
    const near = layer(22, 2);
    const groundTop = m.mid === 'water' ? 1580 : 1560;
    el('path', { d: ridge(r, groundTop, 40, 6), fill: ink }, near);
    anim.grass = el('g', {}, near);
    for (let x = -60; x < W + 60; x += 9 + r() * 10) { const h = 18 + r() * 46; el('path', { d: `M${x},${groundTop + 12} Q${x + 4},${groundTop - h * .5} ${x + (r() - .5) * 22},${groundTop - h}`, stroke: ink, 'stroke-width': 3 + r() * 2, fill: 'none', 'stroke-linecap': 'round' }, anim.grass); }
    const fg = el('g', {}, near);
    anim.rise.push(fg);
    // Figures stand clear of the house or tree.
    const spot = (lo, span) => anim.midX === undefined ? lo + r() * span : anim.midX < W / 2 ? 640 + r() * 200 : 140 + r() * 200;
    if (m.fg === 'figure') { const f = figure(fg, spot(220, 640), groundTop - 8, 1.75, ink); anim.sway = f; }
    else if (m.fg === 'couple') { const x = spot(280, 420); figure(fg, x, groundTop - 8, 1.7, ink); figure(fg, x + 100, groundTop - 6, 1.55, ink); }
    else if (m.fg === 'flame') {
      const fx = 540, fy = 1330;
      el('line', { x1: fx + 6, y1: fy + 40, x2: fx + 70, y2: fy + 190, stroke: mix(ink, '#6b4a2a', .5), 'stroke-width': 12, 'stroke-linecap': 'round' }, fg);
      el('circle', { cx: fx, cy: fy, r: 120, fill: glow, opacity: .6, filter: 'url(#glow)' }, fg);
      anim.flame = el('path', { d: `M${fx},${fy - 95} C${fx + 38},${fy - 40} ${fx + 36},${fy + 18} ${fx},${fy + 32} C${fx - 36},${fy + 18} ${fx - 38},${fy - 40} ${fx},${fy - 95} Z`, fill: mix(glow, '#ffffff', .4) }, fg);
      anim.flameAt = [fx, fy + 32];
    }
    if (m.fg === 'window') {   // a window frame in the very front, rain or night outside
      const w = el('g', {}, cam);
      el('path', { d: `M-100,-100 H${W + 100} V${H + 100} H-100 Z M150,1460 V560 A390,390 0 0 1 930,560 V1460 Z`, fill: ink, 'fill-rule': 'evenodd' }, w);
      el('rect', { x: 536, y: 160, width: 8, height: 1300, fill: ink }, w);
      el('rect', { x: 150, y: 980, width: 780, height: 8, fill: ink }, w);
      el('rect', { x: 110, y: 1460, width: 860, height: 40, fill: mix(ink, glow, .08) }, w);
    }

    if (m.fg !== 'window' && (i + (sc.seed % 2)) % 2 === 0) {   // overhanging branch in the top corner
      const side = r() < .5 ? -1 : 1, bx = side < 0 ? -40 : W + 40;
      anim.bough = el('g', {}, cam);
      const bough = (x, y, len, ang, depth) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        el('line', { x1: x, y1: y, x2, y2, stroke: ink, 'stroke-width': depth * 4, 'stroke-linecap': 'round' }, anim.bough);
        if (depth > 1) for (let k = 0; k < 2; k++) bough(x2, y2, len * (.6 + r() * .2), ang + (r() - .3) * .9 * (k ? 1 : -1), depth - 1);
        else for (let k = 0; k < 3; k++) el('ellipse', { cx: x2 + (r() - .5) * 20, cy: y2 + r() * 14, rx: 7 + r() * 6, ry: 15 + r() * 10, fill: ink, transform: `rotate(${(r() - .5) * 60},${x2},${y2})` }, anim.bough);
      };
      bough(bx, 60 + r() * 60, 230, side < 0 ? .35 : Math.PI - .35, 6);
      anim.boughAt = [bx, 80];
    }

    // Weather and life.
    const fx = el('g', {}, cam);
    if (m.fx === 'rain') for (let k = 0; k < 160; k++) anim.rain.push({ e: el('line', { stroke: '#fff', 'stroke-width': 2, opacity: .18 + r() * .25, 'stroke-linecap': 'round' }, fx), x: r() * (W + 300), y: r() * H, v: 1500 + r() * 900, l: 30 + r() * 30 });
    if (m.fx === 'birds') for (let k = 0; k < 7; k++) anim.birds.push({ e: el('path', { fill: 'none', stroke: ink, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, fx), x: -200 - r() * 500, y: 380 + r() * 380, v: 120 + r() * 60, s: 14 + r() * 12, p: r() * 6 });
    for (let k = 0; k < 36; k++) anim.dust.push({ e: el('circle', { r: 1.5 + r() * 3, fill: glow, opacity: .0 }, fx), x: r() * W, y: 400 + r() * 1100, v: 15 + r() * 30, p: r() * 6 });
    return anim;
  });

  // Darkened edges, like a lit stage.
  const vg = el('radialGradient', { id: 'vignette', cx: '50%', cy: '45%', r: '75%' }, el('defs', {}, root));
  el('stop', { offset: '.55', 'stop-color': '#000', 'stop-opacity': 0 }, vg);
  el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': .6 }, vg);
  el('rect', { width: W, height: H, fill: 'url(#vignette)' }, root);

  // The ink smoke that sweeps across between scenes.
  const ink = '#080504';
  el('rect', { x: 0, y: -300, width: 1700, height: H + 600, fill: ink }, smoke);
  for (let k = 0; k < 14; k++) { el('circle', { cx: (k % 2) * 1700, cy: -200 + k * 170, r: 220 + (k * 37) % 120, fill: ink }, smoke); }
  smoke.setAttribute('opacity', 0);

  const texts = scenes.map((_, i) => document.getElementById(`t${i}`));
  const starts = scenes.map((_, i) => i * SCENE);

  window.setFrame = t => {
    let cur = 0; for (let i = 0; i < starts.length; i++) if (t >= starts[i]) cur = i;
    // Ink wipe around each scene change (none before the first scene, so frame 0 is readable).
    let wipe = -1;
    for (let i = 1; i < starts.length; i++) if (Math.abs(t - starts[i]) < WIPE / 2) wipe = (t - starts[i] + WIPE / 2) / WIPE;
    if (wipe >= 0) { smoke.setAttribute('opacity', 1); smoke.setAttribute('transform', `translate(${-1700 + ease(wipe) * (W + 1700)},0)`); }
    else smoke.setAttribute('opacity', 0);

    built.forEach((a, i) => {
      const on = i === cur;
      a.g.setAttribute('opacity', on ? 1 : 0);
      if (!on) return;
      const lt = t - starts[i];
      a.cam.setAttribute('transform', `translate(${W / 2},${H / 2}) scale(${1 + .035 * lt / SCENE}) translate(${-W / 2},${-H / 2})`);
      a.layers.forEach(l => l.e.setAttribute('transform', `translate(${-l.speed * lt},0)`));
      // Paper-cut foreground rises into place after a wipe (already in place on frame 0).
      const rise = i === 0 ? 0 : 70 * (1 - ease(lt / .9));
      a.rise.forEach(e => e.setAttribute('transform', `translate(0,${rise})`));
      if (a.sway) { const tr = a.sway.getAttribute('transform').replace(/ rotate\([^)]*\)/, ''); a.sway.setAttribute('transform', `${tr} rotate(${Math.sin(lt * 1.3) * 1.2})`); }
      if (a.rays) { const [rx, ry] = a.raysAt; a.rays.setAttribute('transform', `rotate(${lt * 3},${rx},${ry})`); }
      if (a.grass) a.grass.setAttribute('transform', `skewX(${Math.sin(lt * 1.4) * 2.5})`);
      if (a.bough) { const [bx, by] = a.boughAt; a.bough.setAttribute('transform', `rotate(${Math.sin(lt * 1.1) * 1.4},${bx},${by})`); }
      a.stars.forEach(s => s.e.setAttribute('opacity', .25 + .75 * Math.abs(Math.sin(lt * s.w + s.p))));
      a.windows.forEach(w => { if (!w.steady) w.e.setAttribute('opacity', Math.sin(lt * 1.7 + w.p) > -.85 ? .85 : .15); });
      a.waves.forEach(w => {
        if (w.shimmer) { w.e.setAttribute('opacity', .3 + .4 * Math.abs(Math.sin(lt * 2.2 + w.p))); w.e.setAttribute('x', w.x0 + Math.sin(lt * 1.6 + w.p) * 10); return; }
        let d = `M-200,${w.y}`; for (let x = -200; x <= W + 200; x += 40) d += ` L${x},${w.y + Math.sin(x * w.f + lt * w.v + w.p) * w.a}`;
        w.e.setAttribute('d', d);
      });
      a.rain.forEach(d => { const y = (d.y + d.v * lt) % (H + 200) - 100, x = d.x - (y * .22) % (W + 300); d.e.setAttribute('x1', x); d.e.setAttribute('y1', y); d.e.setAttribute('x2', x - d.l * .22); d.e.setAttribute('y2', y + d.l); });
      a.birds.forEach(b => { const x = b.x + b.v * (lt + 2.5), y = b.y + Math.sin(lt * 1.5 + b.p) * 12, f = Math.sin(lt * 9 + b.p) * b.s * .6; b.e.setAttribute('d', `M${x - b.s},${y - f} Q${x - b.s / 2},${y - b.s * .2} ${x},${y} Q${x + b.s / 2},${y - b.s * .2} ${x + b.s},${y - f}`); });
      a.dust.forEach(d => { const y = d.y - d.v * lt, x = d.x + Math.sin(lt * .8 + d.p) * 18; d.e.setAttribute('cx', x); d.e.setAttribute('cy', y); d.e.setAttribute('opacity', .25 + .35 * Math.abs(Math.sin(lt + d.p))); });
      if (a.flame) { const s = 1 + Math.sin(lt * 13) * .05 + Math.sin(lt * 7.3) * .04, [fx, fy] = a.flameAt; a.flame.setAttribute('transform', `translate(${fx},${fy}) scale(${1 + Math.sin(lt * 11) * .03},${s}) translate(${-fx},${-fy})`); }
    });

    texts.forEach((e, i) => {
      const s = starts[i], end = i + 1 < starts.length ? starts[i + 1] : Infinity;
      const inA = i === 0 ? 1 : ease((t - s - .15) / .5);
      const outA = end === Infinity ? 1 : 1 - ease((t - (end - .45)) / .3);
      const o = Math.max(0, Math.min(inA, outA));
      e.style.opacity = o;
      e.style.transform = `translateY(${(1 - inA) * 24}px)`;
    });
  };
  window.setFrame(0);
})();
