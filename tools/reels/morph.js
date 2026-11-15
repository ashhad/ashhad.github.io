// "Ink morph" reel style: monochrome. Thousands of fine ink particles draw one image per line or
// couplet. The first image is a flower blooming; at each new line the particles drift apart like
// smoke and re-form into the next image (moon, waves, birds, house, city, rain, flame, window,
// tree), chosen from the words. The last scene, with the whole excerpt, blooms back into the
// flower so the reel loops. The page exposes window.setFrame(seconds).

const fs = require('fs');
const path = require('path');

const W = 1080, H = 1920;
const SCENE = 3.0;   // seconds per scene
const RECAP = 4.0;   // final scene with the whole excerpt (also the cover)
const MORPH = 1.6;   // how long particles take to re-form into the next image

const SHAPES = [
  ['window', /khidki|window|sill/i],
  ['flame', /maachis|teeli|cigarette|\baag\b|jalaa|flame|burn|sulag/i],
  ['rain', /baarish|baadal|\brain|barsaat|barasti|garaj|saavan|bauchhar/i],
  ['waves', /nadi|dariya|samundar|sahil|\bsea\b|river|lehar|jheel|paani|ufna/i],
  ['moon', /chaand|chand\b|moon|mehtab|chaandni|chakor|raat|night|shab|sitaar/i],
  ['city', /sheher|shahar|city|traffic|daftar|metro|bazaar|sadk/i],
  ['house', /\bghar\b|aashiyana|home|deewar|aangan|balcony|chhat|kamre|room/i],
  ['tree', /\bped\b|shajar|deodar|patte|tree|leaves|bagiche|shaakh/i],
  ['birds', /parinda|parwaz|birds|udd|chale gaye|jaane do|leaving/i],
];
const BY_MOOD = { longing: 'moon', heartbreak: 'birds', love: 'twin', city: 'city', life: 'tree', wit: 'birds', hope: 'sun' };

const hash = s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

function chunks(lines) {
  if (lines.length <= 2) return lines.map(l => [l]);
  if (lines.length === 3) return [[lines[0]], [lines[1], lines[2]]];
  return [lines.slice(0, 2), lines.slice(2, 4), ...(lines.length > 4 ? [lines.slice(4)] : [])];
}

function plan(piece) {
  const groups = chunks(piece.lines);
  const used = new Set(['flower']);
  const all = piece.lines.join(' ');
  const shapeFor = text => {
    // The scene's own words first, then images from elsewhere in the excerpt, then the mood.
    const hit = SHAPES.find(([name, re]) => re.test(text) && !used.has(name)) || SHAPES.find(([name, re]) => re.test(all) && !used.has(name));
    const name = hit ? hit[0] : [BY_MOOD[piece.mood], 'moon', 'birds', 'waves', 'tree'].find(n => n && !used.has(n));
    used.add(name);
    return name;
  };
  // Scene 1 always blooms as a flower; later scenes transform into what their words describe.
  const scenes = groups.map((g, i) => ({ lines: g, shape: i === 0 ? 'flower' : shapeFor(g.join(' ')) }));
  scenes.push({ lines: piece.lines, shape: 'flower', recap: true });
  return { scenes, duration: groups.length * SCENE + RECAP, seed: hash(piece.id) };
}

const fontData = f => `url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f)).toString('base64')})`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function page(piece, bank, label) {
  const { scenes, duration, seed } = plan(piece);
  const dark = piece.theme === 'night';
  const ink = dark ? '#efe4d0' : '#1f1a15', bg = dark ? ['#211d19', '#0b0908'] : ['#f6efe0', '#ddd0b6'];
  const muted = dark ? '#a99d8a' : '#6d5f4e';
  const longest = Math.max(...piece.lines.map(l => l.length));
  const size = longest > 48 ? 60 : 68;
  const config = { scenes: scenes.map(s => ({ shape: s.shape, recap: !!s.recap })), duration, seed, SCENE, MORPH, W, H, ink, dark };
  const texts = scenes.map((s, i) => `<div class="txt${s.recap ? ' recap' : ''}" id="t${i}">${s.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:PoemSerif;font-weight:500;font-style:italic;src:${fontData('cormorant-garamond-latin-500-italic.woff2')}}
@font-face{font-family:UiSans;font-weight:400;src:${fontData('source-sans-pro-latin-400-normal.woff2')}}
@font-face{font-family:UiSans;font-weight:600;src:${fontData('source-sans-pro-latin-600-normal.woff2')}}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(ellipse at 50% 55%, ${bg[0]} 0%, ${bg[1]} 100%)}
canvas{position:absolute;inset:0}
.hook{position:absolute;left:90px;right:90px;top:250px;text-align:center;font:600 44px/1.25 UiSans;letter-spacing:.1em;text-transform:uppercase;color:${ink}}
.txt{position:absolute;left:100px;right:100px;top:390px;height:560px;display:flex;flex-direction:column;justify-content:center;text-align:center;opacity:0;color:${ink}}
.txt p{margin:0 0 28px;font:italic 500 ${size}px/1.28 PoemSerif}
.txt.recap p{font-size:${Math.round(size * 0.8)}px;margin-bottom:20px}
.sig{position:absolute;left:0;right:0;top:1640px;text-align:center;font:400 30px/1 UiSans;letter-spacing:.06em;color:${muted}}
.sig b{font-weight:600;color:${ink}}
.sig i{font-style:normal;text-transform:uppercase;letter-spacing:.14em;font-size:26px}
.grain{position:absolute;inset:0;opacity:${dark ? .06 : .09};mix-blend-mode:${dark ? 'screen' : 'multiply'}}
</style></head><body>
<canvas id="c" width="${W}" height="${H}"></canvas>
<svg class="grain" width="${W}" height="${H}"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="5"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
<div class="hook">${esc(piece.hook)}</div>
${texts}
<div class="sig">${label ? `<i>${label}</i> · ` : ''}<b>${esc(piece.work)}</b> · ${esc(bank.handle)}</div>
<script>window.CONFIG = ${JSON.stringify(config)};</script>
<script>${fs.readFileSync(path.join(__dirname, 'morph-page.js'), 'utf8')}</script>
</body></html>`;
}

module.exports = { page, plan };
