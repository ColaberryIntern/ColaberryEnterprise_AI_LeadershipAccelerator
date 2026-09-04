/**
 * teachingGuideStyles.ts — CSS + browser runtime for the pre-class TEACHING
 * GUIDE (teachingGuideHtml.ts), exported as strings so that file stays a thin
 * composer. Same split as kitDeckStyles.ts / kitDeckScript.ts.
 *
 * The guide is a document, not a deck: it is read on a laptop before class and
 * often printed, so this stylesheet optimises for long-form reading and a clean
 * print, not for a projector. Brand tokens match the deck so the two artefacts
 * for one session look like they belong together.
 *
 * The script is written WITHOUT template literals or ${...} so it nests safely
 * inside the TS backtick template that returns it — same constraint kitDeckScript
 * documents and for the same reason.
 */
export const GUIDE_CSS = `
:root{
  --cherry:#FB2832; --cherry-deep:#C20E1E; --cherry-bg:#FFF0F1;
  --leaf:#77BB4A; --good:#2F7A3E; --good-bg:#EDF7EE;
  --amber:#B5710A; --amber-bg:#FEF6E7;
  --blue:#2563EB; --blue-bg:#EEF3FE;
  --violet:#7C4DBE; --violet-bg:#F4EEFB;
  --teal:#2E6B84; --teal-bg:#E7EFF3;
  --ink:#14181B; --text:#2D3748; --muted:#718096; --muted2:#94A3B8;
  --line:#E2E8F0; --mist:#F7FAFC; --mist2:#EDF2F5;
  --mono:ui-monospace,"Cascadia Code","Consolas",monospace;
  --sans:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  --maxw:1180px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:132px}
body{margin:0;background:#fff;color:var(--text);font-family:var(--sans);font-size:16.5px;
  line-height:1.62;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--cherry-deep);text-decoration:none} a:hover{text-decoration:underline}
h1,h2,h3{font-weight:700;letter-spacing:-.02em;margin:0;color:var(--ink);text-wrap:balance}
p{margin:0}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  font-weight:600;color:var(--cherry)}

.bar{position:sticky;top:0;z-index:80;background:rgba(255,255,255,.94);
  backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--line)}
.bar .wrap{display:flex;align-items:center;gap:14px;height:58px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;min-width:0}
.brand .mark{width:24px;height:24px;border-radius:6px;background:var(--cherry);position:relative;flex:none}
.brand .mark::after{content:"";position:absolute;inset:7px 7px auto auto;width:6px;height:6px;
  border-radius:50%;background:#fff}
.brand small{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted);font-weight:500}
.barnav{margin-left:auto;display:none;gap:4px}
@media(min-width:1020px){.barnav{display:flex}}
.barnav a{font-size:12.5px;font-weight:600;color:var(--muted);padding:6px 10px;border-radius:7px}
.barnav a:hover{background:var(--mist);color:var(--ink);text-decoration:none}
.pline{position:absolute;left:0;bottom:-1px;height:3px;width:0%;
  background:linear-gradient(90deg,var(--cherry),var(--amber),var(--good))}

.hero{padding:54px 0 32px;background:linear-gradient(180deg,var(--cherry-bg),#fff 78%)}
.hero h1{font-size:clamp(1.9rem,4.4vw,3rem);line-height:1.07;margin-top:13px}
.hero .thesis{max-width:66ch;font-size:1.07rem;color:#3B4754;margin-top:17px}
.metaline{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.pill{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;
  letter-spacing:.08em;text-transform:uppercase;font-weight:600;padding:5px 11px;border-radius:999px;
  border:1px solid var(--line);background:#fff;color:var(--muted)}
.pill.on{background:var(--cherry);border-color:var(--cherry);color:#fff}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:28px}
.stat{background:#fff;padding:15px 17px}
.stat .n{font-size:25px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.stat .l{font-family:var(--mono);font-size:10px;letter-spacing:.11em;text-transform:uppercase;
  color:var(--muted);margin-top:2px}
.stat.sig .n{color:var(--cherry)} .stat.ok .n{color:var(--good)} .stat.warn .n{color:var(--amber)}

section{padding:44px 0;border-top:1px solid var(--line)}
.head{max-width:76ch}
.head h2{font-size:clamp(1.3rem,2.7vw,1.8rem);margin-top:9px}
.head .lede{color:var(--muted);margin-top:12px;font-size:1.01rem}
.prose{max-width:76ch;margin-top:16px}
.prose p+p,.prose ul+p,.prose .bul+p{margin-top:13px}
.bul{margin:11px 0 0 0;padding-left:20px;font-size:15px}
.bul li{margin-top:4px}

.rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin-top:24px}
.rnode{border:1px solid var(--line);border-top:4px solid var(--muted2);border-radius:9px;
  padding:11px 10px;background:#fff;text-align:left;cursor:pointer;font-family:inherit;
  transition:.15s;display:block;width:100%}
.rnode:hover{background:var(--mist);transform:translateY(-2px)}
.rnode .t{font-family:var(--mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.rnode .v{font-weight:700;font-size:13.5px;margin-top:4px;line-height:1.25;color:var(--ink)}
.rnode .m{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:5px}
.rnode .c{display:inline-block;font-family:var(--mono);font-size:10px;font-weight:700;margin-top:6px;
  padding:1px 6px;border-radius:4px;background:var(--mist2)}

.call{border-left:4px solid var(--muted2);background:var(--mist);border-radius:0 10px 10px 0;
  padding:13px 16px;margin-top:16px}
.call .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  font-weight:700;color:var(--muted)}
.call p{margin-top:5px;font-size:15px}
.call.gate{border-color:var(--cherry);background:var(--cherry-bg)} .call.gate .k{color:var(--cherry-deep)}
.call.risk{border-color:var(--amber);background:var(--amber-bg)} .call.risk .k{color:var(--amber)}
.call.info{border-color:var(--blue);background:var(--blue-bg)} .call.info .k{color:var(--blue)}
.call.story{border-color:var(--violet);background:var(--violet-bg)} .call.story .k{color:var(--violet)}

.controls{position:sticky;top:58px;z-index:70;background:rgba(255,255,255,.96);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:11px 0}
.chips{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.chip{font-family:var(--mono);font-size:11px;letter-spacing:.07em;text-transform:uppercase;font-weight:600;
  padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--muted);
  cursor:pointer;transition:.14s}
.chip:hover{border-color:var(--muted2);color:var(--ink)}
.chip.active{background:var(--ink);border-color:var(--ink);color:#fff}
.chip .ct{opacity:.6;margin-left:5px}
.chips .spacer{margin-left:auto}

.deck{display:flex;flex-direction:column;gap:14px;margin-top:22px}
.card{border:1px solid var(--line);border-left:5px solid var(--muted2);border-radius:12px;background:#fff;
  box-shadow:0 1px 2px rgba(20,24,27,.04);overflow:hidden;scroll-margin-top:140px}
.card.hidden{display:none}
.chead{display:flex;gap:14px;align-items:flex-start;padding:15px 18px;cursor:pointer;background:#fff}
.chead:hover{background:var(--mist)}
.num{flex:none;width:40px;height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;
  font-family:var(--mono);font-size:14px;font-weight:700;background:var(--mist2);color:var(--ink)}
.ctitle{flex:1;min-width:0}
.ctitle .eb{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted);font-weight:600}
.ctitle h3{font-size:1.04rem;margin-top:4px;line-height:1.3}
.badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.b{font-family:var(--mono);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;
  padding:3px 8px;border-radius:5px;background:var(--mist2);color:var(--muted)}
.b.k-teach,.b.k-architecture,.b.k-microbuild{background:var(--blue-bg);color:var(--blue)}
.b.k-storybeat,.b.k-hook{background:var(--violet-bg);color:var(--violet)}
.b.k-interaction{background:var(--amber-bg);color:var(--amber)}
.b.k-checkpoint,.b.k-buildmap,.b.k-prompt{background:var(--cherry-bg);color:var(--cherry-deep)}
.b.k-segment,.b.k-cover,.b.k-rules{background:var(--teal-bg);color:var(--teal)}
.b.k-demos,.b.k-broadcast,.b.k-beforeafter{background:var(--good-bg);color:var(--good)}
.b.f-run{background:var(--blue);color:#fff}
.b.f-read{background:var(--muted);color:#fff}
.b.f-answer{background:var(--good);color:#fff}
.b.f-theater{background:var(--cherry);color:#fff}
.b.f-diagram{background:var(--teal);color:#fff}
.caret{flex:none;color:var(--muted2);font-size:19px;transition:.2s;margin-top:9px}
.card.open .caret{transform:rotate(90deg)}
/* Collapsed with height:0 + visibility:hidden rather than display:none, so the
   content keeps a layout box. Mermaid sizes a diagram from its container width,
   and inside a display:none parent every diagram rendered at zero size — which
   meant a collapsed card, an anchor jump, or a PRINT (where the CSS forces every
   card open) showed raw mermaid source instead of a picture. */
.cbody{height:0;overflow:hidden;visibility:hidden;padding:0 18px;border-top:1px solid transparent}
.card.open .cbody{height:auto;overflow:visible;visibility:visible;padding:2px 18px 20px;
  border-top-color:var(--line)}

.blk{margin-top:15px}
.blk>.k{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  font-weight:700;color:var(--muted);display:flex;align-items:center;gap:7px}
.blk>.k::before{content:"";width:9px;height:9px;border-radius:2px;background:var(--muted2);flex:none}
.blk.screen>.k::before{background:var(--teal)} .blk.screen>.k{color:var(--teal)}
.blk.doing>.k::before{background:var(--blue)} .blk.doing>.k{color:var(--blue)}
.blk.why>.k::before{background:var(--violet)} .blk.why>.k{color:var(--violet)}
.blk p{margin-top:7px;font-size:15.2px}
.kindline{font-size:14.6px;color:var(--muted);font-style:italic;margin-top:10px;
  padding-left:12px;border-left:3px solid var(--line)}

.tag{margin-top:7px;padding:10px 13px;border-radius:9px;border:1px solid var(--line);
  background:var(--mist);font-size:15px}
.tag .tk{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;
  font-weight:700;display:block;margin-bottom:4px}
.tag.t-situation{background:var(--violet-bg);border-color:#E3D6F2} .tag.t-situation .tk{color:var(--violet)}
.tag.t-room{background:var(--blue-bg);border-color:#D6E2FB} .tag.t-room .tk{color:var(--blue)}
.tag.t-mood{background:var(--good-bg);border-color:#CFE6D2} .tag.t-mood .tk{color:var(--good)}
.tag.t-open,.tag.t-say{background:var(--amber-bg);border-color:#F3E2C2;font-style:italic;color:#6B4708}
.tag.t-open .tk,.tag.t-say .tk{color:var(--amber);font-style:normal}
.tag.t-do{background:var(--blue-bg);border-color:#D6E2FB} .tag.t-do .tk{color:var(--blue)}
.tag.t-note{background:var(--mist);border-color:var(--line)} .tag.t-note .tk{color:var(--muted)}

.terms{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.term{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--mist2);
  color:var(--text);border:1px solid var(--line);cursor:pointer;font-family:inherit}
.term:hover{background:var(--cherry-bg);border-color:var(--cherry);color:var(--cherry-deep)}

.mer{margin-top:12px;padding:14px;background:var(--mist);border:1px solid var(--line);
  border-radius:10px;overflow-x:auto}
.mer .cap{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted);margin-bottom:8px}
pre.code{margin-top:9px;background:#12181D;color:#E6EDF3;border-radius:10px;padding:14px 16px;
  overflow-x:auto;font-family:var(--mono);font-size:12.6px;line-height:1.55;white-space:pre-wrap;
  word-break:break-word}
pre.code.paste{border-left:4px solid var(--blue)}
pre.code.review{border-left:4px solid var(--muted)}
.codelab{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  font-weight:700;color:var(--muted);margin-top:15px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.kv{display:grid;grid-template-columns:132px 1fr;gap:6px 12px;margin-top:10px;font-size:14.2px}
.kv .kk{font-family:var(--mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--muted);padding-top:3px}
.opts{margin-top:9px;display:flex;flex-direction:column;gap:5px}
.opt{padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:14.5px;background:#fff}
.opt.right{border-color:var(--good);background:var(--good-bg);font-weight:600}
.opt.right::after{content:" \\2713 correct";font-family:var(--mono);font-size:10px;letter-spacing:.09em;
  text-transform:uppercase;color:var(--good)}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
@media(max-width:640px){.ba{grid-template-columns:1fr}}

.gloss{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px;margin-top:24px}
.gcard{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:#fff;
  scroll-margin-top:150px;transition:.3s}
.gcard.flash{background:var(--cherry-bg);border-color:var(--cherry)}
.gcard .t{font-weight:700;font-size:15px;color:var(--ink)}
.gcard .plain{font-size:14.2px;margin-top:6px}
.gcard .cat{font-family:var(--mono);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;
  font-weight:700;padding:2px 7px;border-radius:4px;background:var(--mist2);color:var(--muted);
  float:right;margin-left:8px}

footer{padding:36px 0 64px;border-top:1px solid var(--line);color:var(--muted);font-size:13.4px}
footer code{font-family:var(--mono);font-size:12.4px}
.backtop{position:fixed;right:20px;bottom:20px;z-index:90;width:44px;height:44px;border-radius:50%;
  border:1px solid var(--line);background:#fff;box-shadow:0 4px 14px rgba(20,24,27,.13);cursor:pointer;
  font-size:18px;color:var(--muted);display:none}
.backtop.show{display:block}
@media print{
  .bar,.controls,.backtop,.caret{display:none!important}
  .cbody{height:auto!important;visibility:visible!important;overflow:visible!important;
    padding:2px 18px 20px!important}
  .card{break-inside:avoid;box-shadow:none}
  .hero{background:#fff}
  section{break-before:auto}
}
`;

export function guideScript(): string {
  return `
(function(){
  var deck = document.getElementById('deck');
  var chips = document.getElementById('chips');
  var rail = document.getElementById('rail');

  function slugOf(t){ return String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

  if (deck) deck.addEventListener('click', function(e){
    var term = e.target.closest('.term');
    if (term){
      var el = document.getElementById('g-' + term.getAttribute('data-term'));
      if (el){
        el.scrollIntoView({ block:'center' });
        el.classList.add('flash');
        setTimeout(function(){ el.classList.remove('flash'); }, 1500);
      }
      return;
    }
    var head = e.target.closest('.chead');
    if (head){ head.parentElement.classList.toggle('open'); renderMermaid(); }
  });

  if (rail) rail.addEventListener('click', function(e){
    var b = e.target.closest('.rnode'); if (!b) return;
    var target = document.getElementById(b.getAttribute('data-first'));
    var all = chips ? chips.querySelector('.chip[data-f="all"]') : null;
    if (all) applyFilter(all);
    if (target) target.scrollIntoView({ block:'start' });
  });

  function applyFilter(c){
    var f = c.getAttribute('data-f');
    var list = document.querySelectorAll('.chip[data-f]');
    for (var i = 0; i < list.length; i++){ list[i].classList.toggle('active', list[i] === c); }
    var cards = document.querySelectorAll('.card');
    for (var j = 0; j < cards.length; j++){
      var card = cards[j];
      var show = f === 'all'
        || card.getAttribute('data-kind') === f
        || (card.getAttribute('data-flags') || '').indexOf(f) >= 0;
      card.classList.toggle('hidden', !show);
    }
  }

  if (chips) chips.addEventListener('click', function(e){
    var c = e.target.closest('.chip'); if (!c) return;
    if (c.id === 'expandAll'){
      var a = document.querySelectorAll('.card');
      for (var i = 0; i < a.length; i++){ a[i].classList.add('open'); }
      renderMermaid(); return;
    }
    if (c.id === 'collapseAll'){
      var b = document.querySelectorAll('.card');
      for (var k = 0; k < b.length; k++){ b[k].classList.remove('open'); }
      return;
    }
    if (c.getAttribute('data-f')) applyFilter(c);
  });

  var line = document.getElementById('pline');
  var bt = document.getElementById('backtop');
  window.addEventListener('scroll', function(){
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (line) line.style.width = (h > 0 ? (window.scrollY / h * 100) : 0) + '%';
    if (bt) bt.classList.toggle('show', window.scrollY > 700);
  }, { passive:true });
  if (bt) bt.addEventListener('click', function(){ window.scrollTo({ top:0, behavior:'smooth' }); });

  // Every diagram renders on load. Collapsed cards keep a layout box (see the
  // .cbody rule), so a card that is opened later — or printed, or jumped to by
  // anchor — already has its picture rather than raw mermaid source. The re-run
  // on expand is a cheap safety net for anything added after load.
  var mm = null;
  function renderMermaid(){
    if (!mm) return;
    var all = document.querySelectorAll('pre.mermaid:not([data-done])');
    var nodes = [];
    for (var i = 0; i < all.length; i++){ nodes.push(all[i]); }
    if (!nodes.length) return;
    for (var j = 0; j < nodes.length; j++){ nodes[j].setAttribute('data-done','1'); }
    try { mm.run({ nodes: nodes }); } catch (err) { /* a bad diagram must not kill the page */ }
  }
  (async function(){
    try {
      mm = (await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;
      mm.initialize({ startOnLoad:false, theme:'base', securityLevel:'loose',
        themeVariables:{ fontFamily:'"Segoe UI",system-ui,sans-serif', fontSize:'14px',
          primaryColor:'#FFF0F1', primaryTextColor:'#14181B', primaryBorderColor:'#FB2832',
          lineColor:'#94A3B8', secondaryColor:'#EEF3FE', tertiaryColor:'#F7FAFC' } });
      renderMermaid();
    } catch (err) { /* offline: the diagram source stays readable as text */ }
  })();
})();
`;
}
