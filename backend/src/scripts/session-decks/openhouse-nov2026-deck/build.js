/**
 * build.js — assemble the November 2026 Open House deck (July Open House
 * format) and its teaching guide from template.html.
 *
 *   node build.js <imageDir> <outDir>
 *
 * - Every {{IMG:file}} becomes a data: URI read from <imageDir> (searched
 *   recursively one level: <imageDir>/file or <imageDir>/deck-img/file), so the
 *   deck is ONE self-contained file: ▶ Present writes it into an about:blank
 *   tab, where relative image URLs would not resolve.
 * - The teaching guide is generated from the SAME slides (title, minutes,
 *   speaker note, and each poll's question/options/answer), so the deck and
 *   the guide can never describe different shows.
 * - Lint: TWC banned words (assembled from pieces so this file never contains
 *   them), a question every few slides, total minutes = 60.
 * Outputs: <outDir>/deck.html, <outDir>/guide.html. Deterministic.
 */
const fs = require('fs');
const path = require('path');

const [imageDir, outDir] = process.argv.slice(2);
if (!imageDir || !outDir) { console.error('usage: node build.js <imageDir> <outDir>'); process.exit(2); }

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
function dataUri(file) {
  const tries = [path.join(imageDir, file), path.join(imageDir, 'deck-img', file)];
  const hit = tries.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`image not found: ${file}`);
  return `data:${MIME[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(hit).toString('base64')}`;
}

const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const deck = template.replace(/\{\{IMG:([^}]+)\}\}/g, (_, f) => dataUri(f));

/* ---- parse slides (attributes only; the template is ours and regular) ---- */
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const slides = [];
const re = /<section class="slide([^"]*)"([\s\S]*?)>/g;
let m;
while ((m = re.exec(template))) {
  const attrs = {};
  m[2].replace(/data-([a-z]+)=(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => { attrs[k] = decode(a != null ? a : b); return ''; });
  slides.push({ cls: m[1].trim(), ...attrs });
}

/* ---- lint ---- */
const bad = [];
const banned = new RegExp('\\b(fr' + 'ee|guarant' + 'eed?)\\b', 'gi');
const hits = template.match(banned) || [];
if (hits.length) bad.push('TWC banned word(s): ' + hits.join(', '));
const minutes = slides.reduce((n, s) => n + Number(s.min || 0), 0);
if (minutes !== 60) bad.push(`run time is ${minutes} min, expected 60`);
let run = 0;
slides.forEach((s, k) => {
  if (!s.title || !s.note) bad.push(`slide ${k + 1} missing title or note`);
  if (s.poll) { JSON.parse(s.options); run = 0; } else if (++run > 4) bad.push(`slide ${k + 1}: ${run} slides in a row without a question`);
  if (s.kind === 'trivia' && s.answer == null) bad.push(`slide ${k + 1}: trivia without answer`);
});
if (/\$199/.test(template.replace(/data-note="[^"]*"/g, ''))) bad.push('$199 on a slide (presenter notes only)');
if (bad.length) { console.error('LINT FAIL\n  ' + bad.join('\n  ')); process.exit(1); }

/* ---- teaching guide ---- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let clock = 0;
const rows = slides.map((s, k) => {
  const at = clock; clock += Number(s.min || 0);
  const mm = (t) => `${Math.floor(t)}:00`;
  let pollHtml = '';
  if (s.poll) {
    const opts = JSON.parse(s.options);
    pollHtml = `<div class="q"><b>On their phones:</b> ${esc(s.q)}<ol type="A">${opts.map((o, j) =>
      `<li${String(j) === s.answer && !s.raffle ? ' class="right"' : ''}>${esc(o)}</li>`).join('')}</ol>`
      + (s.reveal ? `<div class="rv"><b>Reveal line:</b> ${esc(s.reveal)}</div>` : '')
      + `<div class="how">Controls: <b>Lock vote</b> → <b>Reveal</b>${s.raffle ? ` → <b>Draw winner</b> × ${esc(s.raffle)}` : ''}. Bars move live as votes land.</div></div>`;
  }
  const tag = s.poll ? (s.raffle ? 'LIVE DRAW' : s.kind === 'trivia' ? 'TRIVIA' : s.kind === 'prediction' ? 'PREDICTION' : 'POLL') : s.cls.includes('statement') ? 'STATEMENT' : s.oh === 'lobby' ? 'CHECK-IN' : 'SLIDE';
  return `<section class="row${s.poll ? ' poll' : ''}"><div class="when">${mm(at)}<span>~${esc(s.min)} min</span></div>`
    + `<div class="body"><div class="tag">${tag} · slide ${k + 1}</div><h2>${esc(s.title)}</h2><p class="note">${esc(s.note)}</p>${pollHtml}</div></section>`;
}).join('\n');

const guide = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teaching Guide — Open House, Oct 29</title><style>
:root{--cherry:#FB2832;--ink:#1a202c;--muted:#64748b;--line:#e8e2de;--leaf:#5BA63C;--amber:#E8920C}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:#faf7f5}
header{background:var(--ink);color:#fff;padding:28px 6vw}header h1{margin:0;font-size:30px}header p{margin:8px 0 0;color:#cbd5e1;line-height:1.5}
main{max-width:980px;margin:0 auto;padding:24px 16px 80px}
.brief{background:#fff;border:1.5px solid var(--line);border-left:6px solid var(--cherry);border-radius:14px;padding:18px 22px;margin-bottom:22px;line-height:1.55}
.brief li{margin:4px 0}
.row{display:grid;grid-template-columns:90px 1fr;gap:18px;background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:16px 18px;margin:12px 0}
.row.poll{border-color:#c9b8f0;background:#fbf9ff}
.when{font:700 20px Consolas,monospace;color:var(--cherry)}.when span{display:block;font:600 12px "Segoe UI",sans-serif;color:var(--muted);margin-top:4px}
.tag{font-size:11px;font-weight:800;letter-spacing:2px;color:var(--muted)}h2{margin:4px 0 8px;font-size:20px}
.note{margin:0;line-height:1.6;font-size:15.5px}.q{margin-top:10px;padding:10px 14px;background:#fff;border:1px dashed #c9b8f0;border-radius:10px;font-size:14.5px}
.q li.right{color:var(--leaf);font-weight:700}.q li.right::after{content:"  ✓ correct"}.rv{margin-top:6px}.how{margin-top:6px;color:var(--muted);font-size:13px}
@media print{body{background:#fff}.row{break-inside:avoid}}
</style></head><body>
<header><h1>Teaching Guide · Open House · Thursday, Oct 29 · 60 minutes</h1>
<p>"Open House — The Forward Deployed Engineer" · Cohort - November 2026 · ${slides.length} slides · ${slides.filter((s) => s.poll).length} live questions and draws. Generated from the deck itself: every note below is the note on that slide, and your presenter phone shows the same note live as you advance.</p></header>
<main>
<div class="brief"><b>Before you start</b><ul>
<li>Open with <b>▶ Present</b> (top-right pill says <b>LIVE</b>). <b>🎓 Rehearse</b> runs the same deck with live voting off.</li>
<li>Keys: <b>→ / ←</b> move · <b>N</b> toggles these notes on screen · <b>Q</b> jumps back to the QR slide.</li>
<li>Open <b>📱 My presenter link</b> on your phone: it follows the deck, slide by slide, with the note for each one.</li>
<li>Have a second tab logged in to the platform for the live business (slide 6, back on slide 23).</li>
<li>Pricing order: <b>$149/mo billed annually</b> first and alone. $199 month-to-month only if someone pushes back. Never the banned price word: say "$0 to start" or "no card needed" (TWC rule).</li>
<li>Draws: entrants are everyone logged in who taps "I'm in". Lock → Reveal → Draw winner, once per winner. Winners are remembered in this browser even if you reload; write them down anyway for admissions.</li>
</ul></div>
${rows}
</main></body></html>`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'deck.html'), deck);
fs.writeFileSync(path.join(outDir, 'guide.html'), guide);
console.error(`BUILD OK  slides=${slides.length} questions=${slides.filter((s) => s.poll).length} minutes=${minutes} deck=${(deck.length / 1024).toFixed(0)}KB guide=${(guide.length / 1024).toFixed(0)}KB`);
