/**
 * C23 WP-11: the side-by-side review doc (screenshot-review skill). Pairs the design shots (scripts/captureCampusDesign.js) with
 * the build's fidelity shots (scripts/captureCampusLocal.js --fidelity) by `<account>-<size>-<view>.png`, and writes one HTML
 * page per run next to them: for every view and audience, design left and build right, desktop then phone, the fidelity gate's
 * result for that shot (required elements missing, and the deliberate differences it reports as `known`), and a verdict and
 * notes box per view. The Compile button turns every verdict, ticked difference and note into one Markdown prompt.
 *
 *   node scripts/buildCampusReview.js <designDir> <buildDir> <out.html>
 *
 * Image paths are written relative to the HTML, so the page, the two folders and a PDF print of it travel together. Nothing is
 * read from the network; a missing shot renders as a labeled gap, never as a silently dropped pair.
 */
const fs = require('fs');
const path = require('path');

const [, , designDirArg, buildDirArg, outArg] = process.argv;
if (!designDirArg || !buildDirArg || !outArg) { console.error('usage: buildCampusReview.js <designDir> <buildDir> <out.html>'); process.exit(2); }
const DESIGN = path.resolve(designDirArg);
const BUILD = path.resolve(buildDirArg);
const OUT = path.resolve(outArg);
const rel = (p) => path.relative(path.dirname(OUT), p).split(path.sep).join('/');
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fidelity = readJson(path.join(BUILD, 'fidelity-results.json'), []);
const designRuns = readJson(path.join(DESIGN, 'design-results.json'), []);
const AUD = { member: 'Enrolled learner', explorer: 'Explorer', business: 'Business partner', staff: 'Staff' };
const SIZES = ['desktop', 'phone'];

/** What each view is, in the words a reviewer needs (the design state it is compared against). */
const VIEW_TITLES = {
  '01-gate': ['The gate', 'The welcome screen before entering the campus.'],
  '02-home': ['Campus home', 'The map with the concierge panel, right after entering.'],
  '03-arrive': ['Arriving at a building', 'Tapping the audience\'s signature building. The prototype flies straight inside, so 03 and 04 compare against the same design state.'],
  '04-inside': ['Inside a building', 'The room view of the signature building, with its side panel.'],
  '05-page': ['A page in a building', 'The Library page opened from its building.'],
  '06-live': ['A live session', 'The campus while a session is live (the build uses a mocked live broadcast on the local stack).'],
  '07-notifications': ['Notifications', 'The bell panel.'],
  '08-person-card': ['A person card', 'The first help desk person\'s card.'],
  '09-chat': ['A chat', 'A chat with the first help desk person.'],
  '10-toast': ['A message toast', 'An incoming message on the map. The design\'s sender and text are a demo.'],
  '11-list': ['List view', 'The campus as a plain list.'],
  '12-me': ['Me panel', 'The account panel.'],
  '16-tour': ['The tour', 'The guided tour, first stop.'],
  '18-wayfinder': ['Wayfinder', '"Where are you headed?" search.'],
  '35-inbox': ['Messages', 'The message inbox.'],
};
const ORDER = Object.keys(VIEW_TITLES);

const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const fidOf = (a, s, v) => fidelity.find((r) => r.account === a && r.size === s && r.view === v);
const designErr = (a, s, v) => (designRuns.find((r) => r.account === a && r.size === s && r.view === v) || {}).error;

function shot(dir, a, s, v, label) {
  const p = path.join(dir, `${a}-${s}-${v}.png`);
  if (!exists(p)) return `<figure class="shot gap"><figcaption>${label}</figcaption><div class="none">No ${label.toLowerCase()} shot${label === 'Design' && designErr(a, s, v) ? `: ${esc(designErr(a, s, v))}` : ''}</div></figure>`;
  return `<figure class="shot"><figcaption>${label} <a href="${esc(rel(p))}" target="_blank" rel="noopener">open full size</a></figcaption><img loading="lazy" src="${esc(rel(p))}" alt="${label}: ${esc(AUD[a])}, ${s}, ${esc(v)}"></figure>`;
}

const views = ORDER.filter((v) => fidelity.some((r) => r.view === v) || designRuns.some((r) => r.view === v));
const buildOnly = Array.from(new Set(fidelity.map((r) => r.view))).filter((v) => !ORDER.includes(v)).sort();
let diffId = 0;
const totals = { pairs: 0, missing: 0, known: 0, open: 0 };

const sections = views.map((v, i) => {
  const [title, what] = VIEW_TITLES[v];
  const accounts = Object.keys(AUD).filter((a) => fidelity.some((r) => r.view === v && r.account === a) || designRuns.some((r) => r.view === v && r.account === a));
  const rows = accounts.map((a) => {
    const pairs = SIZES.map((s) => {
      const f = fidOf(a, s, v);
      if (f || exists(path.join(DESIGN, `${a}-${s}-${v}.png`))) totals.pairs += 1;
      const missing = (f && f.missing) || [];
      const known = (f && f.known) || [];
      // C23 WP-11: `open` = not built and not decided (a gap to build or to decide); `seed` = built, not showable on the local stack
      const open = (f && f.open) || [];
      const seed = (f && f.seed) || [];
      totals.missing += missing.length; totals.known += known.length; totals.open += open.length;
      const gate = !f ? '<p class="gate warn">Build not captured for this size.</p>'
        : f.error ? `<p class="gate bad">Build run error: ${esc(f.error)}</p>`
          : missing.length ? `<p class="gate bad">Missing in the build: ${missing.map(esc).join(', ')}</p>`
            : '<p class="gate ok">Every required element present and visible.</p>';
      const diffs = known.map((k) => { diffId += 1; return `<label class="diff"><input type="checkbox" data-diff="${esc(`${v} / ${AUD[a]} / ${s}: ${k}`)}" id="d${diffId}"> ${esc(k)}</label>`; }).join('');
      const gaps = open.map((k) => { diffId += 1; return `<label class="diff"><input type="checkbox" data-diff="${esc(`${v} / ${AUD[a]} / ${s}: OPEN: ${k}`)}" id="d${diffId}"> ${esc(k)}</label>`; }).join('');
      const seeds = seed.length ? `<p class="gate warn">Built, not shown on the test stack: ${seed.map(esc).join('; ')}</p>` : '';
      return `<div class="pair-block"><h4>${s === 'desktop' ? 'Desktop 1440×900' : 'Phone 390×844'}</h4><div class="pair ${s}">${shot(DESIGN, a, s, v, 'Design')}${shot(BUILD, a, s, v, 'Build')}</div>${gate}${gaps ? `<div class="diffs"><b>Not built yet, not decided</b> (tick to build it)${gaps}</div>` : ''}${diffs ? `<div class="diffs"><b>Deliberate differences: your Section 3 decisions or the real-data rule</b> (tick any you want changed)${diffs}</div>` : ''}${seeds}</div>`;
    }).join('');
    return `<div class="aud"><h3>${esc(AUD[a])}</h3>${pairs}</div>`;
  }).join('');
  return `<section class="stop" data-view="${esc(v)}" id="v-${esc(v)}">
  <div class="stop-h"><span class="num">${i + 1}</span><div><h2>${esc(title)} <small>${esc(v)}</small></h2><p>${esc(what)}</p></div></div>
  <p class="step">① See it</p>${rows}
  <p class="step">④ Your verdict</p>
  <div class="verdict" role="radiogroup" aria-label="Verdict for ${esc(title)}">
    <label><input type="radio" name="vd-${esc(v)}" value="matches"> 👍 Matches</label>
    <label><input type="radio" name="vd-${esc(v)}" value="needs changes"> ⚠ Needs changes</label>
    <label><input type="radio" name="vd-${esc(v)}" value="wrong"> ✕ Wrong</label>
  </div>
  <textarea data-notes="${esc(v)}" rows="3" placeholder="Notes on ${esc(title)}"></textarea>
</section>`;
}).join('\n');

const toc = views.map((v, i) => `<a href="#v-${esc(v)}">${i + 1}. ${esc(VIEW_TITLES[v][0])}</a>`).join('');
const generated = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campus Design Review</title>
<style>
:root{--ink:#1a2233;--muted:#5b6475;--line:#dde2ea;--bg:#f5f7fa;--card:#fff;--ok:#1d7a4a;--bad:#b3261e;--warn:#8a5a00;--accent:#1a4a7a;--frame:#1e2633}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ink:#e7ebf2;--muted:#a3acbb;--line:#2e3646;--bg:#121620;--card:#1a202c;--ok:#5fc48c;--bad:#ff8a80;--warn:#e0b050;--accent:#8ab8ea;--frame:#0b0f16}}
:root[data-theme="dark"]{--ink:#e7ebf2;--muted:#a3acbb;--line:#2e3646;--bg:#121620;--card:#1a202c;--ok:#5fc48c;--bad:#ff8a80;--warn:#e0b050;--accent:#8ab8ea;--frame:#0b0f16}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
.wrap{max-width:1500px;margin:0 auto;padding:24px 16px 80px}
header.hero{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:20px}
.hero h1{margin:0 0 6px;font-size:26px}.hero p{margin:4px 0;color:var(--muted)}
.bar{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}.bar div{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 14px}.bar b{display:block;font-size:20px}
nav.toc{display:flex;flex-wrap:wrap;gap:6px 14px;margin:14px 0 0;font-size:14px}nav.toc a{color:var(--accent)}
.stop{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin:18px 0;break-inside:auto}
.stop-h{display:flex;gap:12px;align-items:flex-start}.num{background:var(--accent);color:var(--card);border-radius:50%;min-width:32px;height:32px;display:grid;place-items:center;font-weight:700}
.stop h2{margin:0;font-size:20px}.stop h2 small{color:var(--muted);font-weight:400;font-size:13px}.stop-h p{margin:2px 0 0;color:var(--muted)}
.step{font-weight:700;margin:16px 0 6px;color:var(--accent)}
.aud{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.aud h3{margin:4px 0 8px;font-size:17px}
.pair-block h4{margin:8px 0 6px;font-size:14px;color:var(--muted)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pair.phone{grid-template-columns:repeat(2,minmax(0,300px))}
.shot{margin:0;background:var(--frame);border-radius:8px;padding:6px;break-inside:avoid}.shot figcaption{color:#cfd6e2;font-size:12px;padding:0 4px 6px;display:flex;justify-content:space-between}
.shot figcaption a{color:#9cc4ef}.shot img{display:block;width:100%;height:auto;border-radius:4px}
.shot.gap .none{color:#cfd6e2;padding:40px 10px;text-align:center;font-size:13px}
.gate{margin:6px 0;font-size:14px}.gate.ok{color:var(--ok)}.gate.bad{color:var(--bad);font-weight:600}.gate.warn{color:var(--warn)}
.diffs{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:6px 0 4px;font-size:14px}.diff{display:block;margin-top:4px}
.verdict{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px}
textarea{width:100%;font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.actions{position:sticky;bottom:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:var(--card);cursor:pointer}button.alt{background:transparent;color:var(--accent)}
#out{width:100%;min-height:160px;margin-top:8px;display:none}
@media (max-width:760px){.pair{grid-template-columns:1fr}.pair.phone{grid-template-columns:1fr 1fr}}
@media print{.actions,#out,textarea,.verdict,.step:last-of-type{display:none}.stop{page-break-inside:auto}.pair-block{page-break-inside:avoid}body{background:#fff}}
</style></head><body><div class="wrap">
<header class="hero">
  <h1>Campus: design next to build</h1>
  <p>C23 WP-11 part 2. Left is the original prototype (<code>docs/design/campus/colaberry-campus.html</code>), right is the build from main on the local test stack with the four seeded test accounts. Generated ${generated}.</p>
  <p>Differences that come from later design rounds, DECISIONS.md or the real-data rule are expected; the gate lists them under each shot. A missing element is a real gap.</p>
  <div class="bar"><div><b>${views.length}</b>views</div><div><b>${totals.pairs}</b>design / build pairs</div><div><b>${totals.missing}</b>missing elements</div><div><b>${totals.known}</b>deliberate differences reported</div><div><b>${totals.open}</b>not built, not decided</div></div>
  <nav class="toc" aria-label="Views">${toc}</nav>
  ${buildOnly.length ? `<p style="margin-top:12px">Build-only views (no state in this prototype; later rounds have their own design files and reviews, or the view is a behavior the e2e asserts): ${buildOnly.map(esc).join(', ')}.</p>` : ''}
</header>
${sections}
<div class="actions"><button type="button" id="compile">Compile my review</button><button type="button" class="alt" id="reset">Reset</button><span id="msg" role="status"></span><textarea id="out" readonly aria-label="Compiled review"></textarea></div>
</div>
<script>
const KEY='campus-review-c23-wp11';
const fields=()=>[...document.querySelectorAll('input,textarea[data-notes]')];
function save(){try{const s={};fields().forEach(f=>{s[f.type==='radio'?f.name+'='+f.value:(f.id||f.dataset.notes)]=f.type==='radio'||f.type==='checkbox'?f.checked:f.value});localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');fields().forEach(f=>{const k=f.type==='radio'?f.name+'='+f.value:(f.id||f.dataset.notes);if(!(k in s))return;if(f.type==='radio'||f.type==='checkbox')f.checked=s[k];else f.value=s[k]})}catch(e){}}
document.addEventListener('input',save);load();
document.getElementById('compile').onclick=()=>{
  const lines=['# Campus design review (C23 WP-11): my verdicts',''];
  document.querySelectorAll('.stop').forEach(st=>{
    const v=st.dataset.view,t=st.querySelector('h2').firstChild.textContent.trim();
    const vd=st.querySelector('input[type=radio]:checked'),notes=st.querySelector('textarea[data-notes]').value.trim();
    const ticks=[...st.querySelectorAll('input[data-diff]:checked')].map(x=>x.dataset.diff);
    if(!vd&&!notes&&!ticks.length)return;
    lines.push('## '+t+' ('+v+')','Verdict: '+(vd?vd.value:'none'));
    if(ticks.length){lines.push('Change these deliberate differences:');ticks.forEach(x=>lines.push('- '+x))}
    if(notes)lines.push('Notes: '+notes);lines.push('');
  });
  const o=document.getElementById('out');o.style.display='block';o.value=lines.length>2?lines.join('\\n'):'Nothing marked yet.';o.select();
  try{navigator.clipboard.writeText(o.value);document.getElementById('msg').textContent='Copied to the clipboard.'}catch(e){}
};
document.getElementById('reset').onclick=()=>{try{localStorage.removeItem(KEY)}catch(e){}fields().forEach(f=>{if(f.type==='radio'||f.type==='checkbox')f.checked=false;else f.value=''});document.getElementById('out').style.display='none'};
</script></body></html>
`;
fs.writeFileSync(OUT, html);
console.log(`review: ${views.length} views, ${totals.pairs} pairs, ${totals.missing} missing, ${totals.known} known, ${totals.open} open -> ${OUT}`);
