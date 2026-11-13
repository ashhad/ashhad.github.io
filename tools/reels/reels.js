#!/usr/bin/env node
// Tukbandi reels: turns the content bank into ready-to-post Instagram reels + captions.
//
//   node reels.js next --count 14 --start 2026-11-16   pick the next 14 pieces, render them,
//                                                      write out/captions.md, mark them scheduled
//   node reels.js next --count 14 --dry                show what would be picked, change nothing
//   node reels.js render <id> [<id> ...]               (re)render specific pieces
//   node reels.js ids                                  give new pieces an id (done automatically too)
//
// Needs Node.js, ffmpeg and Playwright with Chromium. Output goes to ./out (not committed).
// Add music inside Instagram when posting, so the reel is linked to that audio.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BANK = path.join(__dirname, 'content-bank.json');
const OUT = path.join(__dirname, 'out');
const FPS = 30, W = 1080, H = 1920;

// ---------- content bank ----------

const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function loadBank() {
  const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const used = new Set(bank.pieces.filter(p => p.id).map(p => p.id));
  let changed = false;
  for (const p of bank.pieces) {
    if (!bank.poems[p.poem]) throw new Error(`Piece uses poem "${p.poem}", which is missing from "poems"`);
    if (p.id) continue;
    let n = 1;
    while (used.has(`${slug(p.poem)}-${n}`)) n++;
    p.id = `${slug(p.poem)}-${n}`;
    used.add(p.id);
    changed = true;
  }
  if (changed) saveBank(bank);
  return bank;
}

// Keeps the file readable: one line per field instead of JSON.stringify's sprawling output.
function saveBank(bank) {
  const piece = p => {
    const head = Object.entries(p).filter(([k]) => k !== 'lines').map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ');
    return `    { ${head},\n      "lines": ${JSON.stringify(p.lines).replace(/","/g, '", "')} }`;
  };
  const poems = Object.entries(bank.poems).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v).replace(/,/g, ', ').replace(/:/g, ': ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`).join(',\n');
  const text = `{\n  "handle": ${JSON.stringify(bank.handle)},\n  "poems": {\n${poems}\n  },\n  "pieces": [\n${bank.pieces.map(piece).join(',\n')}\n  ]\n}\n`;
  fs.writeFileSync(BANK, text);
}

// ---------- picking what to post next ----------

// Lowest score wins. Prefers A-tier pieces, spreads posts across all poems, avoids repeating a
// poem within ~10 days, avoids three reels in a row with the same look, and spaces out
// English/Punjabi pieces so the feed stays mostly Urdu.
function pickNext(bank, count) {
  const theme = p => p.theme || 'paper';
  const lang = p => bank.poems[p.poem].lang;
  const pool = bank.pieces.map((p, i) => ({ p, i })).filter(({ p }) => !p.scheduled);
  const history = bank.pieces.filter(p => p.scheduled).sort((a, b) => a.scheduled.localeCompare(b.scheduled));
  const picks = [];
  while (picks.length < count && pool.length) {
    const seq = [...history, ...picks];
    const last = n => seq.slice(-n);
    const uses = poem => seq.filter(p => p.poem === poem).length;
    const score = ({ p, i }) =>
      (p.tier === 'A' ? 0 : 10) +
      uses(p.poem) * 4 +
      (last(10).some(q => q.poem === p.poem) ? 100 : 0) +
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
const TAGS = {
  urdu: ['#urdupoetry', '#shayari', '#hindipoetry'],
  english: ['#poetry', '#englishpoetry', '#poetsofinstagram'],
  punjabi: ['#punjabipoetry', '#shayari', '#punjabi'],
};
const FORM_TAG = { ghazal: '#ghazal', nazm: '#nazm', khat: '#urduprose', khaaka: '#urduprose', poem: '#poem' };
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function caption(bank, p) {
  const meta = bank.poems[p.poem];
  const prompts = PROMPTS[p.mood] || PROMPTS.life;
  const tags = [...(TAGS[meta.lang] || TAGS.urdu), FORM_TAG[meta.form] || '#poetry', '#tukbandi'];
  return [p.lines.join('\n'), `— ${p.poem}`, prompts[hash(p.id) % prompts.length], tags.join(' ')].join('\n\n');
}

// ---------- rendering ----------

const THEMES = {
  paper: { bg: '#f7f1e3', ink: '#231e19', muted: '#7a6d5c', accent: '#7a5f33', grain: 0.10, vignette: 'rgb(122 95 51 / 18%)' },
  night: { bg: '#141210', ink: '#f2e8d8', muted: '#9c958b', accent: '#d1b07a', grain: 0.07, vignette: 'rgb(0 0 0 / 55%)' },
};
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fontData = f => `url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'fonts', f)).toString('base64')})`;

function html(p, handle) {
  const t = THEMES[p.theme] || THEMES.paper;
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
</style></head><body>
<div class="bg" id="bg"></div>
<svg class="grain" width="100%" height="100%"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
<div class="wrap">
  <div class="hook" data-anim>${esc(p.hook)}</div>
  <div class="rule" data-anim></div>
  ${p.lines.map((l, i) => `<p class="line${n === 4 && i === 2 ? ' gap' : ''}" data-anim>${esc(l)}</p>`).join('\n  ')}
</div>
<div class="sig" data-anim><b>${esc(p.poem)}</b> · ${esc(handle)}</div>
</body></html>`;
}

// Hook and rule appear first, then each line, then the signature; then it holds so people can reread.
function timeline(n) {
  const step = n > 2 ? 1.6 : 2.2;
  const starts = [0.15, 0.35, ...Array.from({ length: n }, (_, i) => 0.8 + i * step)];
  starts.push(starts[starts.length - 1] + 1.2);
  return { starts, duration: Math.max(9, starts[starts.length - 1] + 4.5) };
}

async function render(browser, p, handle, outFile) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html(p, handle), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => { const r = document.querySelector('.wrap').getBoundingClientRect(); return r.top < 80 || r.bottom > 1450; });
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
  const bank = loadBank();

  if (cmd === 'ids') return console.log(`${bank.pieces.length} pieces, all with ids.`);

  if (cmd === 'next') {
    const count = Number(arg('count', 7));
    const start = arg('start', addDays(new Date().toISOString().slice(0, 10), 1));
    const picks = pickNext(bank, count);
    const left = bank.pieces.filter(p => !p.scheduled).length - picks.length;
    picks.forEach((p, i) => console.log(`${addDays(start, i)}  ${p.tier}  ${(p.theme || 'paper').padEnd(5)}  ${p.id}`));
    console.log(`${left} pieces left in the bank after these.`);
    if (process.argv.includes('--dry')) return;

    fs.mkdirSync(OUT, { recursive: true });
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const md = [`# Reels ${start} to ${addDays(start, picks.length - 1)}`, '',
      'For each day: upload the video as a Reel, add a song from Instagram\'s music library, paste the caption, schedule it.', ''];
    for (const [i, p] of picks.entries()) {
      const date = addDays(start, i);
      const file = `${date}-${p.id}.mp4`;
      process.stdout.write(`rendering ${file} ... `);
      await render(browser, p, bank.handle, path.join(OUT, file));
      console.log('done');
      md.push(`## ${date} · ${p.poem}`, '', `File: \`${file}\``, '', '```', caption(bank, p), '```', '');
      p.scheduled = date;
    }
    await browser.close();
    fs.writeFileSync(path.join(OUT, `captions-${start}.md`), md.join('\n'));
    saveBank(bank);
    return console.log(`Captions: out/captions-${start}.md`);
  }

  if (cmd === 'render') {
    const pieces = rest.filter(a => !a.startsWith('--')).map(id => bank.pieces.find(p => p.id === id) || (() => { throw new Error(`No piece with id ${id}`); })());
    fs.mkdirSync(OUT, { recursive: true });
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    for (const p of pieces) {
      await render(browser, p, bank.handle, path.join(OUT, `${p.id}.mp4`));
      console.log(`out/${p.id}.mp4`);
      console.log(caption(bank, p), '\n');
    }
    return browser.close();
  }

  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 12).join('\n').replace(/^\/\/ ?/gm, ''));
}

main().catch(e => { console.error(e.message); process.exit(1); });
