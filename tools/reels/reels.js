#!/usr/bin/env node
// Tukbandi reels: turns the content bank into ready-to-post Instagram reels + captions.
//
//   node reels.js next --count 14 --start 2026-11-16   pick the next 14 pieces, render them,
//                                                      write out/captions-<start>.md, mark them scheduled
//   node reels.js next --count 14 --dry                show what would be picked, change nothing
//   node reels.js render <id> [<id> ...]               (re)render specific pieces
//   node reels.js captions --start 2026-11-16 --count 14   rewrite the captions file for scheduled pieces
//   node reels.js ids                                  give new pieces an id and tidy the bank file
//
// Needs Node.js, ffmpeg and Playwright with Chromium. Output goes to ./out (not committed).
// Add music inside Instagram when posting, so the reel is linked to that audio.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BANK = path.join(__dirname, 'content-bank.json');
const OUT = path.join(__dirname, 'out');
const FPS = 30, W = 1080, H = 1920;

// Site categories: Kalaam = poems, Khutoot = letters, Khaake = sketches.
const KIND = { Kalaam: null, Khutoot: 'letter', Khaake: 'sketch' };

// ---------- content bank ----------

const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function loadBank({ tidy = false } = {}) {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const used = new Set(bank.pieces.filter(p => p.id).map(p => p.id));
  let changed = tidy;
  for (const p of bank.pieces) {
    const w = bank.works[p.work];
    if (!w) throw new Error(`Piece uses "${p.work}", which is missing from "works"`);
    if (!(w.category in KIND)) throw new Error(`"${p.work}" has category "${w.category}"; use Kalaam, Khutoot or Khaake`);
    if (p.id) continue;
    let n = 1;
    while (used.has(`${slug(p.work)}-${n}`)) n++;
    p.id = `${slug(p.work)}-${n}`;
    used.add(p.id);
    changed = true;
  }
  if (changed) saveBank(bank);
  return bank;
}

// Keeps the file readable: one line of fields per piece, then its lines.
function saveBank(bank) {
  const flat = o => `{ ${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
  const piece = p => {
    const { lines, ...rest } = p;
    return `    ${flat(rest).slice(0, -2)},\n      "lines": ${JSON.stringify(lines).replace(/","/g, '", "')} }`;
  };
  const works = Object.entries(bank.works).map(([k, v]) => `    ${JSON.stringify(k)}: ${flat(v)}`).join(',\n');
  fs.writeFileSync(BANK, `{\n  "handle": ${JSON.stringify(bank.handle)},\n  "works": {\n${works}\n  },\n  "pieces": [\n${bank.pieces.map(piece).join(',\n')}\n  ]\n}\n`);
}

// ---------- picking what to post next ----------

// Lowest score wins. Prefers S, then A, then B pieces; gives writing added in the last 30 days a
// boost; spreads posts across all writings, avoids repeating one within ~10 days, avoids three
// reels in a row with the same look, and spaces out English/Punjabi pieces so the feed stays
// mostly Urdu.
const TIER = { S: -6, A: 0, B: 10 };
function pickNext(bank, count, start) {
  const theme = p => p.theme || 'paper';
  const lang = p => bank.works[p.work].lang;
  const pool = bank.pieces.map((p, i) => ({ p, i })).filter(({ p }) => !p.scheduled);
  const history = bank.pieces.filter(p => p.scheduled).sort((a, b) => a.scheduled.localeCompare(b.scheduled));
  const picks = [];
  while (picks.length < count && pool.length) {
    const day = addDays(start, picks.length);
    const fresh = p => { const a = bank.works[p.work].added; return a && a <= day && day <= addDays(a, 30); };
    const seq = [...history, ...picks];
    const last = n => seq.slice(-n);
    const uses = work => seq.filter(p => p.work === work).length;
    const score = ({ p, i }) =>
      (TIER[p.tier] ?? 10) +
      (fresh(p) ? -4 : 0) +
      uses(p.work) * 4 +
      (last(10).some(q => q.work === p.work) ? 100 : 0) +
      (last(2).length === 2 && last(2).every(q => theme(q) === theme(p)) ? 25 : 0) +
      (lang(p) !== 'urdu' && last(3).some(q => lang(q) !== 'urdu') ? 25 : 0) +
      (last(1).some(q => q.mood === p.mood) ? 2 : 0) +
      i * 0.001;
    pool.sort((a, b) => score(a) - score(b));
    picks.push(pool.shift().p);
  }
  return picks;
}

// ---------- captions ----------

const PROMPTS = {
  longing: ['Send this to someone you still think about.', 'Who came to mind first?', 'Send this to the one it reminds you of.'],
  heartbreak: ['Send this to someone who needs to hear it.', 'Have you ever felt this?', 'Send this to a friend going through it.'],
  love: ['Send this to your person.', 'Tag the one you would say this to.', 'Send this to someone, without saying anything.'],
  city: ['Send this to someone who moved away for work.', 'Which city did this to you?', 'Send this to your flatmate.'],
  life: ['Save this for a hard day.', 'Send this to a friend who is tired.', 'Does this feel familiar?'],
  wit: ['Tag the friend who does this.', 'Be honest: guilty?', 'Send this to someone who will get it.'],
  hope: ['Save this for the day you need it.', 'Send this to someone having a hard week.'],
};
const POEM_TAGS = {
  urdu: ['#urdupoetry', '#shayari', '#hindipoetry'],
  english: ['#poetry', '#englishpoetry', '#poetsofinstagram'],
  punjabi: ['#punjabipoetry', '#shayari', '#punjabi'],
};
const FORM_TAG = { ghazal: '#ghazal', nazm: '#nazm', poem: '#poem' };
const PROSE_TAGS = {
  letter: ['#unsentletters', '#letters', '#urduprose', '#urdu'],
  sketch: ['#urduprose', '#shortstory', '#storytelling', '#urdu'],
};
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function hashtags(work) {
  const kind = KIND[work.category];
  const tags = kind ? PROSE_TAGS[kind] : [...(POEM_TAGS[work.lang] || POEM_TAGS.urdu), FORM_TAG[work.form] || '#poetry'];
  return [...tags, '#tukbandi'].join(' ');
}

function caption(bank, p) {
  const work = bank.works[p.work];
  const kind = KIND[work.category];
  const prompts = PROMPTS[p.mood] || PROMPTS.life;
  return [p.lines.join('\n'), `— ${p.work}${kind ? ` (a ${kind})` : ''}`, prompts[hash(p.id) % prompts.length], hashtags(work)].join('\n\n');
}

function captionsFile(bank, pieces) {
  const first = pieces[0].scheduled, last = pieces[pieces.length - 1].scheduled;
  return [`# Reels ${first} to ${last}`, '',
    'For each day: upload the video as a Reel, add a song from Instagram\'s music library, paste the caption, schedule it.', '',
    ...pieces.flatMap(p => [`## ${p.scheduled} · ${p.work}`, '', `File: \`${fileName(p)}\``, '', '```', caption(bank, p), '```', '']),
  ].join('\n');
}

const fileName = p => (p.scheduled ? `${p.scheduled}-${p.id}.mp4` : `${p.id}.mp4`);

// ---------- rendering ----------

const THEMES = {
  paper: { bg: '#f7f1e3', ink: '#231e19', muted: '#7a6d5c', accent: '#7a5f33', grain: 0.10, vignette: 'rgb(122 95 51 / 18%)' },
  night: { bg: '#141210', ink: '#f2e8d8', muted: '#9c958b', accent: '#d1b07a', grain: 0.07, vignette: 'rgb(0 0 0 / 55%)' },
};
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fontData = f => `url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f)).toString('base64')})`;

function html(p, bank) {
  const t = THEMES[p.theme] || THEMES.paper;
  const kind = KIND[bank.works[p.work].category];
  const n = p.lines.length;
  const longest = Math.max(...p.lines.map(l => l.length));
  const size = (n <= 2 ? 74 : n === 3 ? 68 : 62) - (longest > 48 ? 8 : 0);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:PoemSerif;font-weight:500;font-style:italic;src:${fontData('cormorant-garamond-latin-500-italic.woff2')}}
@font-face{font-family:UiSans;font-weight:400;src:${fontData('source-sans-pro-latin-400-normal.woff2')}}
@font-face{font-family:UiSans;font-weight:600;src:${fontData('source-sans-pro-latin-600-normal.woff2')}}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${t.bg}}
.bg{position:absolute;inset:-4%;background:radial-gradient(ellipse at 50% 45%, transparent 40%, ${t.vignette} 100%), ${t.bg}}
.grain{position:absolute;inset:0;opacity:${t.grain};mix-blend-mode:multiply}
.wrap{position:absolute;left:110px;right:110px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;transform:translateY(-60px)}
.hook{font:600 34px/1.3 UiSans;letter-spacing:.14em;text-transform:uppercase;color:${t.muted};margin-bottom:90px}
.rule{width:120px;height:2px;background:${t.accent};margin:0 auto 90px}
.line{font:italic 500 ${size}px/1.3 PoemSerif;color:${t.ink};margin:0 0 ${n > 2 ? 30 : 44}px}
.line.gap{margin-top:36px}
.sig{position:absolute;left:0;right:0;bottom:430px;text-align:center;font:400 30px/1 UiSans;letter-spacing:.06em;color:${t.muted}}
.sig b{font-weight:600;color:${t.accent}}
.sig i{font-style:normal;text-transform:uppercase;letter-spacing:.14em;font-size:26px}
</style></head><body>
<div class="bg" id="bg"></div>
<svg class="grain" width="100%" height="100%"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
<div class="wrap">
  <div class="hook" data-anim>${esc(p.hook)}</div>
  <div class="rule" data-anim></div>
  ${p.lines.map((l, i) => `<p class="line${n === 4 && i === 2 ? ' gap' : ''}" data-anim>${esc(l)}</p>`).join('\n  ')}
</div>
<div class="sig" data-anim>${kind ? `<i>${kind}</i> · ` : ''}<b>${esc(p.work)}</b> · ${esc(bank.handle)}</div>
</body></html>`;
}

// Hook and rule appear first, then each line, then the signature; then it holds so people can reread.
function timeline(n) {
  const step = n > 2 ? 1.6 : 2.2;
  const starts = [0.15, 0.35, ...Array.from({ length: n }, (_, i) => 0.8 + i * step)];
  starts.push(starts[starts.length - 1] + 1.2);
  return { starts, duration: Math.max(9, starts[starts.length - 1] + 4.5) };
}

async function render(browser, p, bank, outFile) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html(p, bank), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // Text must stay clear of Instagram's own overlays (profile row and caption at the bottom).
  const overflow = await page.evaluate(() => {
    const kids = [...document.querySelectorAll('.wrap > *')].map(e => e.getBoundingClientRect());
    return Math.min(...kids.map(r => r.top)) < 150 || Math.max(...kids.map(r => r.bottom)) > 1420;
  });
  if (overflow) console.warn(`  warning: ${p.id} has a lot of text; check that it fits`);
  const { starts, duration } = timeline(p.lines.length);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`)))));
  for (let f = 0, frames = Math.round(duration * FPS); f < frames; f++) {
    await page.evaluate(({ time, starts, duration }) => {
      const ease = x => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
      document.querySelectorAll('[data-anim]').forEach((el, i) => {
        const k = ease((time - starts[i]) / 0.9);
        el.style.opacity = k;
        el.style.transform = `translateY(${(1 - k) * 18}px)`;
        el.style.filter = `blur(${(1 - k) * 6}px)`;
      });
      document.getElementById('bg').style.transform = `scale(${1 + 0.04 * time / duration})`;
    }, { time: f / FPS, starts, duration });
    ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 95 }));
  }
  ff.stdin.end();
  await done;
  await page.close();
}

// ---------- commands ----------

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : fallback; };
const addDays = (iso, d) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

async function main() {
  const [cmd = 'help', ...rest] = process.argv.slice(2);
  const bank = loadBank({ tidy: cmd === 'ids' });

  if (cmd === 'ids') return console.log(`${bank.pieces.length} pieces, all with ids.`);

  if (cmd === 'next') {
    const count = Number(arg('count', 7));
    const start = arg('start', addDays(new Date().toISOString().slice(0, 10), 1));
    const picks = pickNext(bank, count, start);
    const left = bank.pieces.filter(p => !p.scheduled).length - picks.length;
    picks.forEach((p, i) => console.log(`${addDays(start, i)}  ${p.tier}  ${(p.theme || 'paper').padEnd(5)}  ${p.id}`));
    console.log(`${left} pieces left in the bank after these.`);
    if (process.argv.includes('--dry')) return;

    fs.mkdirSync(OUT, { recursive: true });
    picks.forEach((p, i) => { p.scheduled = addDays(start, i); });
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    for (const p of picks) {
      process.stdout.write(`rendering ${fileName(p)} ... `);
      await render(browser, p, bank, path.join(OUT, fileName(p)));
      console.log('done');
    }
    await browser.close();
    fs.writeFileSync(path.join(OUT, `captions-${start}.md`), captionsFile(bank, picks));
    saveBank(bank);
    return console.log(`Captions: out/captions-${start}.md`);
  }

  if (cmd === 'captions') {
    const start = arg('start');
    const end = addDays(start, Number(arg('count', 7)) - 1);
    const pieces = bank.pieces.filter(p => p.scheduled && p.scheduled >= start && p.scheduled <= end).sort((a, b) => a.scheduled.localeCompare(b.scheduled));
    if (!pieces.length) throw new Error(`Nothing is scheduled between ${start} and ${end}`);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `captions-${start}.md`), captionsFile(bank, pieces));
    return console.log(`out/captions-${start}.md (${pieces.length} reels)`);
  }

  if (cmd === 'render') {
    const pieces = rest.filter(a => !a.startsWith('--')).map(id => {
      const p = bank.pieces.find(q => q.id === id);
      if (!p) throw new Error(`No piece with id ${id}`);
      return p;
    });
    fs.mkdirSync(OUT, { recursive: true });
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    for (const p of pieces) {
      await render(browser, p, bank, path.join(OUT, fileName(p)));
      console.log(`out/${fileName(p)}\n${caption(bank, p)}\n`);
    }
    return browser.close();
  }

  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 13).join('\n').replace(/^\/\/ ?/gm, ''));
}

main().catch(e => { console.error(e.message); process.exit(1); });
