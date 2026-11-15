// "Shadow play" reel style: each line (or couplet) becomes its own scene of layered paper-cut
// silhouettes against a glowing sky, with ink-smoke wipes between scenes and colours that change
// from scene to scene. Everything is drawn procedurally from the words of the excerpt, so every
// reel looks different. The page exposes window.setFrame(seconds); reels.js screenshots each frame.

const fs = require('fs');
const path = require('path');

const W = 1080, H = 1920;
const SCENE = 2.9;        // seconds per scene
const RECAP = 3.8;        // final scene showing the whole excerpt (also used as the cover)
const WIPE = 1.0;         // length of the ink wipe between scenes

// Sky palettes: top, horizon, glow, silhouette ink, text.
const PALETTES = {
  dusk:   ['#2b1d3a', '#e0884a', '#ffd59a', '#150d0f', '#fff3df'],
  ember:  ['#3a1020', '#c2453a', '#ffb36b', '#130708', '#fff0e0'],
  indigo: ['#0b1030', '#3d4f95', '#d6deff', '#05060f', '#eef1ff'],
  teal:   ['#06222a', '#2f7f80', '#c4f5ea', '#031216', '#eafffb'],
  gold:   ['#3b2410', '#d9a441', '#fff1c2', '#1a0f05', '#fff8e6'],
  rose:   ['#2a1030', '#b05a7a', '#ffd6e4', '#12060f', '#fff0f5'],
};
const SEQUENCE = {
  longing: ['indigo', 'teal', 'rose', 'dusk'],
  heartbreak: ['ember', 'indigo', 'rose', 'teal'],
  love: ['rose', 'dusk', 'gold', 'indigo'],
  city: ['dusk', 'indigo', 'ember', 'teal'],
  life: ['gold', 'teal', 'indigo', 'ember'],
  wit: ['gold', 'rose', 'dusk', 'teal'],
  hope: ['dusk', 'gold', 'teal', 'rose'],
};

const MOTIFS = {
  moon: /chaand|chand\b|moon|mehtab|chaandni|chakor/i,
  night: /raat|night|shab|sitaar|stars|andhere|neend|1 baj|12 baj|11 baj/i,
  water: /nadi|dariya|samundar|sahil|\bsea\b|river|lehar|jheel|paani|ufna/i,
  rain: /baarish|baadal|\brain|barsaat|barasti|garaj|saavan|bauchhar/i,
  city: /sheher|shahar|city|traffic|daftar|metro|bazaar|sadk/i,
  home: /\bghar\b|aashiyana|home|deewar|aangan|balcony|chhat|kamre|room/i,
  window: /khidki|window|sill/i,
  tree: /\bped\b|shajar|deodar|patte|tree|leaves|bagiche|shaakh/i,
  birds: /parinda|parwaz|birds|udd/i,
  fire: /maachis|teeli|cigarette|\baag\b|jalaa|flame|burn|sulag/i,
};

const hash = s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

// Group lines into scenes: one line each for short pieces, couplets for four-line pieces.
function chunks(lines) {
  if (lines.length <= 2) return lines.map(l => [l]);
  if (lines.length === 3) return [[lines[0]], [lines[1], lines[2]]];
  return [lines.slice(0, 2), lines.slice(2, 4), ...(lines.length > 4 ? [lines.slice(4)] : [])];
}

function motifsOf(text, mood) {
  const m = Object.fromEntries(Object.entries(MOTIFS).map(([k, re]) => [k, re.test(text)]));
  // Every scene gets a middle layer and a foreground, chosen from the words first, then the mood.
  m.mid = m.water ? 'water' : m.city ? 'city' : m.home ? 'house' : m.tree ? 'tree'
    : ({ city: 'city', life: 'tree', longing: 'water', heartbreak: 'tree', love: 'house', hope: 'tree' }[mood] || 'hills');
  m.fg = m.window ? 'window' : m.fire ? 'flame' : mood === 'love' ? 'couple' : 'figure';
  m.fx = m.rain ? 'rain' : (m.birds || mood === 'heartbreak' || mood === 'hope') ? 'birds' : 'dust';
  m.showMoon = m.moon || m.night || !m.rain;
  return m;
}

function plan(piece) {
  const groups = chunks(piece.lines);
  const seq = SEQUENCE[piece.mood] || SEQUENCE.longing;
  const offset = hash(piece.id) % seq.length;
  const whole = motifsOf(piece.lines.join(' '), piece.mood);
  const hasImagery = m => Object.keys(MOTIFS).some(k => k !== 'night' && m[k]);
  const scenes = groups.map((g, i) => {
    // A scene's own words decide its pictures; if it has none, it borrows from the whole excerpt.
    const own = motifsOf(g.join(' '), piece.mood);
    const motifs = hasImagery(own) ? { ...own, night: own.night || whole.night } : { ...whole };
    // Alternate between a lone figure and an open landscape so consecutive scenes differ.
    if (i % 2 === 1 && motifs.fg === 'figure' && motifs.mid !== 'hills') motifs.fg = 'none';
    return { lines: g, palette: PALETTES[seq[(offset + i) % seq.length]], motifs, seed: hash(`${piece.id}#${i}`) };
  });
  const recap = {
    lines: piece.lines,
    palette: PALETTES[seq[(offset + groups.length) % seq.length]],
    motifs: { ...motifsOf(piece.lines.join(' '), piece.mood), fg: 'none', fx: 'dust', showMoon: true },
    seed: hash(`${piece.id}#recap`),
    recap: true,
  };
  return { scenes: [...scenes, recap], duration: groups.length * SCENE + RECAP };
}
const fontData = f => `url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f)).toString('base64')})`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function page(piece, bank, label) {
  const { scenes, duration } = plan(piece);
  const config = { scenes: scenes.map(s => ({ ...s, lines: undefined })), duration, SCENE, WIPE, W, H };
  const longest = Math.max(...piece.lines.map(l => l.length));
  const size = longest > 48 ? 60 : 68;
  const texts = scenes.map((s, i) => `<div class="txt${s.recap ? ' recap' : ''}" id="t${i}" style="color:${s.palette[4]}">${s.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:PoemSerif;font-weight:500;font-style:italic;src:${fontData('cormorant-garamond-latin-500-italic.woff2')}}
@font-face{font-family:UiSans;font-weight:400;src:${fontData('source-sans-pro-latin-400-normal.woff2')}}
@font-face{font-family:UiSans;font-weight:600;src:${fontData('source-sans-pro-latin-600-normal.woff2')}}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
svg{position:absolute;inset:0}
.hook{position:absolute;left:90px;right:90px;top:250px;text-align:center;font:600 44px/1.25 UiSans;letter-spacing:.1em;text-transform:uppercase;color:#fff;text-shadow:0 2px 18px rgb(0 0 0 / 70%)}
.txt{position:absolute;left:100px;right:100px;top:430px;height:620px;display:flex;flex-direction:column;justify-content:center;text-align:center;opacity:0}
.txt p{margin:0 0 30px;font:italic 500 ${size}px/1.28 PoemSerif;text-shadow:0 2px 24px rgb(0 0 0 / 65%), 0 0 2px rgb(0 0 0 / 40%)}
.txt.recap p{font-size:${Math.round(size * 0.8)}px;margin-bottom:22px}
.sig{position:absolute;left:0;right:0;top:1615px;text-align:center;font:400 30px/1 UiSans;letter-spacing:.06em;color:#e9dcc6}
.sig b{font-weight:600}
.sig i{font-style:normal;text-transform:uppercase;letter-spacing:.14em;font-size:26px}
</style></head><body>
<svg id="stage" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="ink" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency=".008 .012" numOctaves="4" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="260" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <g id="scenes"></g>
  <g id="smoke" filter="url(#ink)"></g>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".07" style="mix-blend-mode:overlay"/>
</svg>
<div class="hook" id="hook">${esc(piece.hook)}</div>
${texts}
<div class="sig">${label ? `<i>${label}</i> · ` : ''}<b>${esc(piece.work)}</b> · ${esc(bank.handle)}</div>
<script>window.CONFIG = ${JSON.stringify(config)};</script>
<script>${fs.readFileSync(path.join(__dirname, 'shadow-page.js'), 'utf8')}</script>
</body></html>`;
}

module.exports = { page, plan };
