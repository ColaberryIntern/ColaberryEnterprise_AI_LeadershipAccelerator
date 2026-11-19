/**
 * nov2026-session3-ohstyle.js — render Nov 2026 Session 3's SAVED class kit
 * in the Nov 2026 Open House visual style, as standalone files for review.
 *
 * Ali, 2026-11-19 ("Both versions"): keep the audited Class Kit as the active
 * deck (it is what ▶ Present opens), and also build an Open House-styled
 * version from the exact same saved slides, so the two can be compared side by
 * side. This file does NOT activate anything: it never writes customDeck.
 *
 * NO DRIFT BY CONSTRUCTION
 * Both outputs come from one KitSpec, built the way ▶ Present builds it:
 * getKitConfig(sid) from the database + buildSessionKit(sid) (the real
 * check-in URL and QR) + buildKitSpec. The Open House version walks
 * spec.slides one for one, so slide N is the same slide in both files, with the
 * same title, body, prompt, question and presenter notes (split with the
 * platform's own splitScript into the arrival and read screens).
 *
 * Visual model: openhouse-nov2026-deck/template.html. Its <style> block is
 * reused as-is (images stripped: they live on Ali's machine, not in the repo),
 * plus a few rules for things the Open House never had: a Claude Code prompt
 * card and a mermaid diagram card.
 *
 * Outputs (in <outDir>):
 *   openhouse-style.html  the Open House-styled deck (offline: polls run in
 *                         rehearsal mode, Lock → Reveal works locally)
 *   classkit.html         the active Class Kit deck, rendered 'standalone'
 *                         (live off), plus a tiny postMessage bridge so the
 *                         compare page can drive it
 *   compare.html          both decks side by side, one slide index, prev/next
 *
 * Run inside the container:
 *   node /app/s3oh.js <sessionId> <outDir> <template.html>
 */
const fs = require('fs');
const path = require('path');

const [SID, OUT, TEMPLATE] = process.argv.slice(2);
if (!SID || !OUT || !TEMPLATE) { console.error('usage: node s3oh.js <sessionId> <outDir> <template.html>'); process.exit(2); }

const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const attr = (s) => esc(s).replace(/'/g, '&#39;');

/* ------------------------------------------------------------- styles ---- */
function templateCss(html) {
  const m = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (!m) throw new Error('template has no <style> block');
  return m[1].replace(/url\("\{\{IMG:[^}]+\}\}"\)/g, 'none');
}
const EXTRA_CSS = `
  .wmtext{font-weight:900;letter-spacing:-.5px;font-size:22px;color:var(--cherry-deep)}
  .poll .wmtext,.statement .wmtext{color:#fff}
  .diag{border:1.5px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow);padding:2vh 1.4vw;display:flex;align-items:center;justify-content:center;min-height:0;max-height:66vh;overflow:hidden}
  .diag .mermaid{width:100%;text-align:center}
  .diag svg{max-width:100%;max-height:60vh;height:auto}
  .cap2{margin-top:1.2vh;color:var(--muted);font-size:clamp(11px,1vw,14px)}
  .pcard{border-radius:18px;background:#0f1720;color:#e7eef6;box-shadow:var(--shadow);display:flex;flex-direction:column;min-height:0;max-height:50vh;overflow:hidden;border:1px solid #26313f;margin-top:3vh}
  .prow{max-height:9vh;overflow:auto}
  .pcard .ph{display:flex;align-items:center;gap:10px;padding:1.2vh 1.2vw;background:#16202c;border-bottom:1px solid #26313f}
  .pcard .ph b{font-size:clamp(12px,1.05vw,15px);flex:1}
  .pcard .ph .where{font-size:11px;font-weight:800;letter-spacing:1.5px;background:var(--cherry);color:#fff;border-radius:999px;padding:4px 10px}
  .pcard .ph button{background:#27405f;color:#fff;border:none;border-radius:999px;padding:6px 14px;font-weight:800;cursor:pointer}
  .pcard pre{margin:0;padding:1.4vh 1.2vw;overflow:auto;font:clamp(10px,.82vw,13px)/1.5 Consolas,Menlo,monospace;white-space:pre-wrap;flex:1}
  .pcard pre .why{color:#8fd16b}
  .prows{display:grid;gap:1vh;margin-top:1.6vh}
  .prow{border-left:5px solid var(--leaf);background:var(--bg-soft);border-radius:10px;padding:1vh 1vw;font-size:clamp(12px,1vw,15px);line-height:1.4}
  .prow b{display:block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
  .prow.stop{border-left-color:var(--berry)} .prow.rescue{border-left-color:var(--amber)}
  .beat{background:radial-gradient(120% 140% at 20% 0%,#2b3a55 0%,#1a202c 60%);color:#fff}
  .beat.amber{background:radial-gradient(120% 140% at 20% 0%,#f0a43a 0%,#E8920C 45%,#a8620a 100%)}
  .beat.berry{background:radial-gradient(120% 140% at 20% 0%,#4f9cbd 0%,#367895 45%,#22536a 100%)}
  .beat .kicker{color:#ffe7c2} .beat h1{color:#fff} .beat .sub{color:#f3ece6;max-width:62ch}
  .beat .ic{font-size:clamp(40px,4.4vw,70px);margin-bottom:1.6vh}
  .beat .punch{margin-top:3vh;font-size:clamp(20px,2.3vw,34px);font-weight:800;line-height:1.2;border-left:6px solid #fff;padding-left:1.4vw;max-width:40ch}
  #qrfull{position:fixed;inset:0;background:rgba(255,255,255,.97);z-index:90;display:none;flex-direction:column;align-items:center;justify-content:center;gap:2vh}
  #qrfull.show{display:flex}
  #qrfull .box{width:min(62vh,560px);height:min(62vh,560px)} #qrfull .box svg{width:100%;height:100%}
  #qrfull .u{font-size:clamp(14px,1.4vw,20px);font-weight:700;color:var(--berry)}
  #notes .a{color:#cbd5e1;white-space:pre-wrap} #notes .r{margin-top:10px;color:#fff;white-space:pre-wrap}
  #notes .lab{font-size:11px;letter-spacing:2px;font-weight:800;color:#ff8a8f;display:block;margin-bottom:4px}
`;

/* ------------------------------------------------------------- pieces ---- */
const kicker = (t) => (t ? `<div class="kicker">${esc(t)}</div>` : '');
const sub = (t) => (t ? `<p class="sub">${esc(t)}</p>` : '');
const points = (arr) => (arr && arr.length ? `<ul class="points">${arr.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '');
const brand = (sec) => `<div class="brandbar"><span class="wmtext">Colaberry</span><span class="bsec">${esc(sec)}</span></div>`;
const diagram = (s) => (s.diagram
  ? `<div><div class="diag"><pre class="mermaid">${esc(s.diagram)}</pre></div>${s.diagramCaption ? `<div class="cap2">${esc(s.diagramCaption)}</div>` : ''}</div>`
  : '');
const qrBlock = (qrSvg, url) => `<div class="center mid" style="flex:none"><div class="bigqr" data-qr>${qrSvg}</div><div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div></div>`;

function promptCard(p) {
  // Comment lines (# WHY …) are what the July Week 10 prompts teach with, so
  // they get their own colour, exactly as the room will read them.
  const code = esc(p.prompt || p.code || '').split('\n')
    .map((l) => (/^\s*#/.test(l) ? `<span class="why">${l}</span>` : l)).join('\n');
  return `<div class="pcard"><div class="ph"><span class="where">PASTE INTO ${esc((p.pasteWhere || 'Claude Code').toUpperCase())}</span><b>${esc(p.label)}</b><button data-copy>Copy</button></div><pre>${code}</pre></div>`
    + `<div class="prows">${p.expectedResult ? `<div class="prow"><b>You should see</b>${esc(p.expectedResult)}</div>` : ''}`
    + `${p.stopCondition ? `<div class="prow stop"><b>Stop when</b>${esc(p.stopCondition)}</div>` : ''}`
    + `${p.rescue ? `<div class="prow rescue"><b>If you are stuck</b>${esc(p.rescue)}</div>` : ''}</div>`;
}

/* ------------------------------------------------------------- slides ---- */
function slideHtml(s, i, ctx) {
  const notes = ctx.split(s.presenterTip, s.body);
  const common = `data-i="${i}" data-id="${attr(s.id)}" data-kind="${attr(s.kind)}" data-title="${attr(s.title)}" `
    + `data-arrival="${attr(notes.setup)}" data-read="${attr(notes.say)}"`;
  const sec = `${s.segmentLabel || ''} · ${s.segStartMin}–${s.segEndMin} min`;
  const wantsQr = /\bQR\b/.test(s.title || '');

  if (s.kind === 'interaction' && s.interaction) {
    const q = s.interaction;
    const kind = q.kind === 'trivia' ? '● Live trivia' : '● Live poll';
    return `<section class="slide poll" ${common} data-answer="${typeof q.answer === 'number' ? q.answer : ''}">`
      + `<div class="pollhead"><span class="wmtext">Colaberry</span><span class="plabel">${esc(kind)}</span><span class="pstate">Voting open</span><span class="pnolive">rehearsal · live voting off</span>`
      + `<span class="spacer"></span><div class="qrmini"><div class="q" data-qr>${ctx.qrSvg}</div><span>scan + sign in<br>to vote</span></div></div>`
      + `<div class="kicker" style="color:#ff8a8f">${esc(s.eyebrow || '')}</div>`
      + `<div class="pq">${esc(q.q)}</div>`
      + `<div class="popts">${q.options.map((o, k) => `<div class="popt" data-idx="${k}"><div class="fill"></div><span class="lab">${String.fromCharCode(65 + k)}. ${esc(o)}</span><span class="num"></span></div>`).join('')}</div>`
      + `<div class="pctrl"><button class="pbtn" data-act="lock">🔒 Lock vote</button><button class="pbtn primary" data-act="reveal" style="display:none">🎉 Reveal</button></div>`
      + (q.reveal ? `<div class="preveal">${esc(q.reveal)}</div>` : '')
      + `</section>`;
  }
  if (s.kind === 'hook' || s.kind === 'break') {
    return `<section class="slide statement wm" ${common}><div class="center">${kicker(s.eyebrow || (s.kind === 'hook' ? 'Tonight' : ''))}<h1>${esc(s.title)}</h1>${sub(s.body)}</div></section>`;
  }
  if (s.kind === 'storybeat') {
    return `<section class="slide beat ${attr(s.tone || '')}" ${common}><div class="center"><div class="ic">${esc(s.icon || '')}</div>${kicker(s.eyebrow)}<h1>${esc(s.title)}</h1>${sub(s.body)}${s.punch ? `<div class="punch">${esc(s.punch)}</div>` : ''}</div></section>`;
  }
  if (s.kind === 'cover') {
    return `<section class="slide wm" ${common}>${brand('Forward Deployed AI Engineer Accelerator · ' + (ctx.meta.dayLabel || ''))}`
      + `<div class="split"><div>${kicker(s.eyebrow)}<h1>${esc(ctx.sessionTitle)}</h1>${sub(s.subtitle)}`
      + `<div class="stats"><div class="stat"><b>${esc(ctx.meta.durationMin)} min</b><span>live, on your phone</span></div>`
      + `<div class="stat berry"><b>2 builds</b><span>in Claude Code</span></div>`
      + `<div class="stat amber"><b>${ctx.questions} questions</b><span>on your phone</span></div></div>`
      + `<p class="src">${esc(s.body)} · ${esc(s.title)}</p></div>${qrBlock(ctx.qrSvg, ctx.checkinUrl)}</div></section>`;
  }
  if (s.kind === 'rules' || wantsQr) {
    return `<section class="slide wm" ${common}>${brand(sec)}<div class="split"><div>${kicker(s.eyebrow || 'Your phone')}<h2>${esc(s.title)}</h2>${sub(s.subtitle || s.body)}${points(s.bullets)}</div>${qrBlock(ctx.qrSvg, ctx.checkinUrl)}</div></section>`;
  }
  if (s.prompt) {
    return `<section class="slide wm" ${common}>${brand(sec)}<div class="split"><div>${kicker(s.eyebrow)}<h2>${esc(s.title)}</h2>${sub(s.body)}${points(s.bullets)}</div><div style="min-height:0">${promptCard(s.prompt)}</div></div></section>`;
  }
  if (s.diagram) {
    return `<section class="slide wm" ${common}>${brand(sec)}<div class="split"><div>${kicker(s.eyebrow)}<h2>${esc(s.title)}</h2>${sub(s.body)}${points(s.bullets)}</div>${diagram(s)}</div></section>`;
  }
  // bullets / segment / example / microbuild / cta / plain teach
  return `<section class="slide wm" ${common}>${brand(sec)}<div class="center">${kicker(s.eyebrow)}<h2>${esc(s.title)}</h2>${sub(s.subtitle || s.body)}${points(s.bullets)}</div></section>`;
}

const DECK_JS = `
(function(){
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var i = 0, notesOn = false, pstate = {};
  var notes = document.getElementById('notes'), counter = document.getElementById('counter'), progress = document.getElementById('progress');
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function renderNotes(){
    var s = slides[i];
    notes.innerHTML = '<span class="lab">ARRIVAL · before you speak</span><div class="a">' + esc(s.dataset.arrival) + '</div>'
      + '<span class="lab" style="margin-top:10px">READ · what you say</span><div class="r">' + esc(s.dataset.read) + '</div>';
    notes.style.display = notesOn ? 'block' : 'none';
  }
  function go(n){
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function(s, k){ s.classList.toggle('active', k === i); });
    counter.textContent = (i + 1) + ' / ' + slides.length;
    progress.style.width = ((i + 1) / slides.length * 100) + '%';
    renderNotes();
    if (window.__renderMermaid) window.__renderMermaid(slides[i]);
  }
  slides.forEach(function(s){
    if (s.dataset.kind !== 'interaction') return;
    s.addEventListener('click', function(e){
      var b = e.target.closest('[data-act]'); if (!b) return;
      var st = s.querySelector('.pstate');
      if (b.dataset.act === 'lock'){ st.textContent = 'Locked'; st.className = 'pstate locked'; b.style.display = 'none'; s.querySelector('[data-act=reveal]').style.display = ''; }
      if (b.dataset.act === 'reveal'){
        st.textContent = 'Revealed'; st.className = 'pstate revealed'; b.style.display = 'none';
        var rv = s.querySelector('.preveal'); if (rv) rv.style.display = 'block';
        if (s.dataset.answer !== ''){ var c = s.querySelector('.popt[data-idx="' + s.dataset.answer + '"]'); if (c) c.classList.add('correct'); }
      }
    });
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var pre = b.closest('.pcard').querySelector('pre');
    try { navigator.clipboard.writeText(pre.innerText); b.textContent = 'Copied'; } catch (x) {}
  });
  var qr = document.getElementById('qrfull');
  qr.addEventListener('click', function(){ qr.classList.remove('show'); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' '){ e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (e.key === 'n' || e.key === 'N'){ notesOn = !notesOn; renderNotes(); }
    else if (e.key === 'q' || e.key === 'Q') qr.classList.toggle('show');
  });
  window.addEventListener('message', function(e){ if (e.data && typeof e.data.goto === 'number') go(e.data.goto); });
  go(0);
})();`;

// Lets compare.html move the Class Kit deck: Home, then N × ArrowRight, using
// the deck's own key handler so nothing about the deck itself changes.
const BRIDGE_JS = `<script>window.addEventListener('message',function(e){if(!e.data||typeof e.data.goto!=='number')return;`
  + `function k(key){document.dispatchEvent(new KeyboardEvent('keydown',{key:key,bubbles:true}));}`
  + `k('Home');for(var n=0;n<e.data.goto;n++)k('ArrowRight');});</script>`;

function compareHtml(count, titles) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Session 3 Deck Comparison</title><style>
:root{--ink:#1a202c;--muted:#64748b;--line:#e8e2de;--bg:#faf7f5;--card:#fff;--cherry:#E5121D}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ink:#e2e8f0;--muted:#94a3b8;--line:#334155;--bg:#0f172a;--card:#1e293b;--cherry:#ff6a71}}
:root[data-theme="dark"]{--ink:#e2e8f0;--muted:#94a3b8;--line:#334155;--bg:#0f172a;--card:#1e293b;--cherry:#ff6a71}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink)}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--card)}
header h1{font-size:18px;margin:0;flex:1 1 260px}
button{background:var(--cherry);color:#fff;border:none;border-radius:999px;padding:8px 18px;font-weight:800;cursor:pointer;font-size:15px}
#pos{font:700 15px Consolas,monospace;min-width:70px;text-align:center}
#ttl{flex:1 1 100%;color:var(--muted);font-size:14px}
main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 16px}
@media (max-width:900px){main{grid-template-columns:1fr}}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
figcaption{padding:8px 12px;font-weight:700;font-size:14px;border-bottom:1px solid var(--line)}
figcaption span{color:var(--muted);font-weight:500}
iframe{display:block;width:100%;aspect-ratio:16/9;border:0;background:#111}
</style></head><body>
<header><h1>Session 3 · Your Know-How Is Now a Product · the same ${count} slides, two looks</h1>
<button id="prev">◀ Prev</button><span id="pos">1 / ${count}</span><button id="next">Next ▶</button>
<div id="ttl"></div></header>
<main>
<figure><figcaption>Class Kit <span>· active on the session (what ▶ Present opens)</span></figcaption><iframe id="a" src="classkit.html" title="Class Kit deck"></iframe></figure>
<figure><figcaption>Open House style <span>· review copy, not active</span></figcaption><iframe id="b" src="openhouse-style.html" title="Open House style deck"></iframe></figure>
</main>
<script>
var n=0,N=${count},T=${JSON.stringify(titles).replace(/</g, '\\u003c')};
var A=document.getElementById('a'),B=document.getElementById('b');
function sync(){document.getElementById('pos').textContent=(n+1)+' / '+N;document.getElementById('ttl').textContent=T[n]||'';
 [A,B].forEach(function(f){try{f.contentWindow.postMessage({goto:n},'*');}catch(e){}});}
document.getElementById('prev').onclick=function(){if(n>0){n--;sync();}};
document.getElementById('next').onclick=function(){if(n<N-1){n++;sync();}};
document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){document.getElementById('next').click();}if(e.key==='ArrowLeft'){document.getElementById('prev').click();}});
A.addEventListener('load',sync);B.addEventListener('load',sync);
</script></body></html>`;
}

/* ---------------------------------------------------------------- main ---- */
(async () => {
  const { getKitConfig } = require('/app/dist/services/sessionKitConfigService');
  const { buildSessionKit } = require('/app/dist/services/sessionKitService');
  const { buildKitSpec } = require('/app/dist/services/classKit/kitSpecDaySlides');
  const { splitScript } = require('/app/dist/services/classKit/kitHtml');
  const { renderSessionKitDoc } = require('/app/dist/services/sessionKitDocService');

  const kit = await buildSessionKit(SID);
  if (!kit) throw new Error('session not found ' + SID);
  const config = await getKitConfig(SID);
  if (config.customDeck) throw new Error('session has a customDeck; this renders the generated Class Kit only');
  const spec = buildKitSpec({
    session: kit.session, cohortName: kit.cohort_name, checkinUrl: kit.checkin_url,
    qrSvg: kit.qr_svg, meetLink: kit.meeting_link, config,
  });

  const ctx = {
    meta: spec.meta, qrSvg: kit.qr_svg, checkinUrl: kit.checkin_url, split: splitScript,
    sessionTitle: String(kit.session.title).replace(/\s*\(Week.*\)\s*$/, ''),
    questions: spec.slides.filter((s) => s.kind === 'interaction').length,
  };
  const css = templateCss(fs.readFileSync(TEMPLATE, 'utf8')) + EXTRA_CSS;
  const body = spec.slides.map((s, i) => slideHtml(s, i, ctx)).join('\n');
  const oh = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(kit.session.title)}</title><style>${css}</style></head><body>
<div id="progress"></div><div id="counter"></div><div id="hint">← → navigate · N notes · Q show QR</div>
<div id="livepill">REVIEW COPY · NOT ACTIVE</div><div id="notes"></div>
<div id="qrfull"><div class="box">${kit.qr_svg}</div><div class="u">${esc(kit.checkin_url)}</div></div>
${body}
<script>${DECK_JS}</script>
<script type="module">
// Same settings as the Class Kit, rendered per slide when it becomes visible
// (mermaid measures text, which fails on a display:none slide).
try {
  const mermaid = (await import('${MERMAID}')).default;
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict',
    flowchart: { useMaxWidth: true, curve: 'basis', htmlLabels: true },
    themeVariables: { fontFamily: 'Segoe UI, Roboto, sans-serif', fontSize: '18px', primaryColor: '#faf7f5', primaryBorderColor: '#e5121d', lineColor: '#367895' } });
  window.__renderMermaid = function (scope) {
    const nodes = (scope || document).querySelectorAll('pre.mermaid:not([data-processed="true"])');
    if (nodes.length) mermaid.run({ nodes }).catch(function () {});
  };
  window.__renderMermaid(document.querySelector('.slide.active'));
} catch (e) {}
</script>
</body></html>`;

  let classkit = await renderSessionKitDoc(SID, 'standalone');
  classkit = classkit.replace(/<\/body>/i, BRIDGE_JS + '</body>');

  // Same slides, same order: the comparison is only honest if this holds.
  const ohCount = (oh.match(/<section class="slide/g) || []).length;
  const ckCount = (classkit.match(/class="kslide/g) || []).length;
  if (ohCount !== spec.slides.length) throw new Error(`open house deck has ${ohCount} slides, spec has ${spec.slides.length}`);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'openhouse-style.html'), oh);
  fs.writeFileSync(path.join(OUT, 'classkit.html'), classkit);
  fs.writeFileSync(path.join(OUT, 'compare.html'), compareHtml(spec.slides.length, spec.slides.map((s, i) => `${i + 1}. ${s.title}`)));
  console.error(`WROTE slides=${spec.slides.length} ohSections=${ohCount} classkitSlides=${ckCount} qr=${kit.checkin_url} `
    + `oh=${(oh.length / 1024).toFixed(0)}KB classkit=${(classkit.length / 1024).toFixed(0)}KB`);
  process.exit(0);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
