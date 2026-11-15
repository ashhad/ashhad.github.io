// "Chalk" reel style: white chalk line drawings on a blackboard. Each line or couplet gets its
// own small scene (a house, a moon, pines, a window, rain, a phone...) chosen from its words. The
// drawings sketch themselves stroke by stroke, flowers grow from the ground, and the camera glides
// along one continuous ground line from scene to scene. The last scene shows the whole excerpt
// over a meadow in bloom and doubles as the cover. The page exposes window.setFrame(seconds).

const fs = require('fs');
const path = require('path');

const W = 1080, H = 1920;
const SCENE = 3.3;   // seconds per scene
const RECAP = 3.8;   // final scene with the whole excerpt
const DRAW = 1.5;    // seconds a scene takes to sketch itself

// Main drawing, picked from the words (first match wins).
const MAIN = [
  ['phone', /voice note|message|phone|\bcall\b|suniye|\bapp\b/i],
  ['window', /khidki|window|\bsill\b/i],
  ['balcony', /balcony|jharok/i],
  ['boat', /nadi|dariya|samundar|sahil|\bsea\b|river|lehar|jheel|paani|ufna/i],
  ['city', /sheher|shahar|\bcity\b|traffic|daftar|metro|bazaar|sadk/i],
  ['cups', /chai|coffee|cafe|\bcup\b/i],
  ['house', /\bghar\b|aashiyana|\bhome\b|deewar|aangan|chhat|kamre|khandahar|\bden\b/i],
  ['campfire', /maachis|teeli|cigarette|\baag\b|jala|flame|\bburn|sulag/i],
  ['pines', /pahad|deodar|jungle|mountain/i],
  ['tree', /\bped\b|shajar|patte|\btree|leaves|bagiche|shaakh/i],
  ['lampbench', /akel|tanha|intezar|\bwait|alone|chup\b|khamosh|silence/i],
];
const MAIN_BY_MOOD = { longing: 'lampbench', heartbreak: 'baretree', love: 'house', city: 'city', life: 'pines', wit: 'cups', hope: 'tree' };
const SKY = [
  ['cloud', /baarish|baadal|\brain|barsaat|barasti|garaj|saavan|bauchhar|aansu|\btears/i],
  ['sun', /sooraj|dhoop|subah|seher|morning|\bdin\b|ujaale|\bsun\b|light/i],
  ['envelope', /\bkhat\b|letter|likh/i],
  ['birds', /parinda|parwaz|\bbirds?\b|chale gaye|jaane do|leaving|hijr/i],
  ['moon', /chaand|chand\b|moon|mehtab|chaandni|raat|night|shab|sitaar|neend|khwab/i],
];
const ACCENTS = ['flowers', 'pinesSmall', 'lamp', 'campfire', 'tree'];

const hash = s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

function chunks(lines) {
  if (lines.length <= 2) return lines.map(l => [l]);
  if (lines.length === 3) return [[lines[0]], [lines[1], lines[2]]];
  return [lines.slice(0, 2), lines.slice(2, 4), ...(lines.length > 4 ? [lines.slice(4)] : [])];
}

function plan(piece, isLetter) {
  const groups = chunks(piece.lines);
  const all = piece.lines.join(' ');
  const seed = hash(piece.id);
  const used = new Set();
  const first = (table, text) => (table.find(([name, re]) => re.test(text) && !used.has(name)) || [])[0];
  const scenes = groups.map((g, i) => {
    const text = g.join(' ');
    // A scene's own words first, then images from the rest of the excerpt, then the mood.
    const main = first(MAIN, text) || first(MAIN, all)
      || [MAIN_BY_MOOD[piece.mood], 'house', 'pines', 'tree', 'lampbench', 'city'].find(n => n && !used.has(n));
    used.add(main);
    let sky = first(SKY, text) || (i === 0 && isLetter ? 'envelope' : null) || first(SKY, all) || (piece.mood === 'heartbreak' && !used.has('birds') ? 'birds' : 'moon');
    if (sky !== 'moon') used.add(sky);
    // Flowers bloom in the first scene; later scenes get a different companion drawing.
    const taken = n => n === main || used.has(n) || (n === 'pinesSmall' && main === 'pines') || (n === 'lamp' && main === 'lampbench');
    const accent = i === 0 ? 'flowers' : ACCENTS.slice(1).find(n => !taken(n)) || 'flowers';
    if (accent !== 'flowers') used.add(accent);
    return { lines: g, main, sky, accent, side: (seed + i) % 2 ? 1 : -1 };
  });
  scenes.push({ lines: piece.lines, main: 'meadow', sky: 'moon', accent: null, side: (seed + groups.length) % 2 ? 1 : -1, recap: true });
  return { scenes, duration: groups.length * SCENE + RECAP, seed };
}

const fontData = f => `url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f)).toString('base64')})`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function page(piece, bank, label) {
  const { scenes, duration, seed } = plan(piece, label === 'letter');
  const longest = Math.max(...piece.lines.map(l => l.length));
  const size = longest > 48 ? 54 : 60;
  const config = { scenes: scenes.map(({ lines, ...s }) => s), duration, seed, SCENE, DRAW, W, H };
  const texts = scenes.map((s, i) => `<div class="txt${s.recap ? ' recap' : ''}" id="t${i}">${s.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Chalk;font-weight:300;src:${fontData('lato-latin-300-normal.woff2')}}
@font-face{font-family:Chalk;font-weight:400;src:${fontData('lato-latin-400-normal.woff2')}}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(ellipse at 50% 50%, #161616 0%, #080808 100%)}
canvas{position:absolute;inset:0}
.hook{position:absolute;left:80px;right:80px;top:215px;text-align:center;font:400 36px/1.3 Chalk;letter-spacing:.16em;text-transform:uppercase;color:#cfcabf}
.txt{position:absolute;left:90px;right:90px;top:320px;height:400px;display:flex;flex-direction:column;justify-content:center;text-align:center;opacity:0;color:#f6f2e9}
.txt p{margin:0 0 20px;font:300 ${size}px/1.3 Chalk}
.txt.recap p{font-size:${Math.round(size * 0.78)}px;margin-bottom:14px}
.sig{position:absolute;left:0;right:0;top:1466px;text-align:center;font:300 30px/1 Chalk;letter-spacing:.06em;color:#a8a399}
.sig b{font-weight:400;color:#e9e4d9}
.sig i{font-style:normal;text-transform:uppercase;letter-spacing:.14em;font-size:25px}
</style></head><body>
<canvas id="c" width="${W}" height="${H}"></canvas>
<div class="hook">${esc(piece.hook)}</div>
${texts}
<div class="sig">${label ? `<i>${label}</i> · ` : ''}<b>${esc(piece.work)}</b> · ${esc(bank.handle)}</div>
<script>window.CONFIG = ${JSON.stringify(config)};</script>
<script>${fs.readFileSync(path.join(__dirname, 'chalk-page.js'), 'utf8')}</script>
</body></html>`;
}

module.exports = { page, plan };
