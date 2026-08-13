// internDashboardStyles.js
// Design system for the Intern Delivery Command Center.
// Tokens are taken verbatim from Ali's Reference Kit (BC todo 10039770075):
// bg #eef2f6, white cards, #e2e8f0 borders, soft shadow, 10-12px radius,
// #0f172a text, #64748b muted, #0f766e accent, system font stack.
// Semantic colour only: good green / warning amber / risk red / neutral slate /
// info blue. An entity keeps its colour everywhere it appears.

const STYLES = `
:root{
  --bg:#eef2f6; --card:#fff; --border:#e2e8f0; --text:#0f172a; --muted:#64748b;
  --accent:#0f766e; --accent-soft:#ccfbf1; --accent-deep:#134e4a;
  --good:#16a34a; --good-bg:#dcfce7; --warn:#d97706; --warn-bg:#fef3c7;
  --risk:#dc2626; --risk-bg:#fee2e2; --neutral:#64748b; --neutral-bg:#f1f5f9;
  --info:#2563eb; --info-bg:#dbeafe;
  --shadow:0 1px 2px rgba(15,23,42,.04),0 4px 12px rgba(15,23,42,.06);
  --shadow-lg:0 10px 40px rgba(15,23,42,.16);
  --r:12px; --r-sm:8px;
  --nav-h:60px;
  --font:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
}
[data-theme=dark]{
  --bg:#0b1220; --card:#111a2b; --border:#1f2c44; --text:#e2e8f0; --muted:#94a3b8;
  --accent:#2dd4bf; --accent-soft:#134e4a; --accent-deep:#5eead4;
  --good:#4ade80; --good-bg:#14532d; --warn:#fbbf24; --warn-bg:#78350f;
  --risk:#f87171; --risk-bg:#7f1d1d; --neutral:#94a3b8; --neutral-bg:#1e293b;
  --info:#60a5fa; --info-bg:#1e3a8a;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 4px 12px rgba(0,0,0,.35);
  --shadow-lg:0 10px 40px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:calc(var(--nav-h) + 16px)}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
h1,h2,h3,h4{margin:0;line-height:1.25;font-weight:700;letter-spacing:-.01em}
.wrap{max-width:1360px;margin:0 auto;padding:0 24px}

/* ---------- scroll progress ---------- */
#progress{position:fixed;top:0;left:0;height:3px;background:var(--accent);width:0;z-index:120;transition:width .1s linear}

/* ---------- nav ---------- */
nav.top{position:sticky;top:0;z-index:100;background:color-mix(in srgb,var(--card) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);height:var(--nav-h)}
nav.top .wrap{display:flex;align-items:center;gap:18px;height:var(--nav-h)}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px;white-space:nowrap}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.navlinks{display:flex;gap:2px;flex:1;overflow-x:auto;scrollbar-width:none}
.navlinks::-webkit-scrollbar{display:none}
.navlinks a{padding:7px 11px;border-radius:var(--r-sm);font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap}
.navlinks a:hover{background:var(--neutral-bg);color:var(--text);text-decoration:none}
.navlinks a.active{background:var(--accent-soft);color:var(--accent-deep)}
.navtools{display:flex;align-items:center;gap:8px}
.btn{border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:var(--r-sm);padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font);white-space:nowrap}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.primary:hover{opacity:.9;color:#fff}
#search{border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:var(--r-sm);padding:7px 11px;font-size:13px;width:190px;font-family:var(--font)}
#search:focus{outline:2px solid var(--accent-soft);border-color:var(--accent)}
.navtoggle{display:none}

/* ---------- hero ---------- */
header.hero{background:linear-gradient(135deg,var(--accent-deep) 0%,var(--accent) 100%);color:#fff;padding:44px 0 40px}
header.hero .eyebrow{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;opacity:.85}
header.hero h1{font-size:34px;margin-top:10px;color:#fff}
header.hero .sub{margin-top:10px;font-size:15px;opacity:.92;max-width:760px}
.herometa{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.herometa span{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.22);padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600}

/* ---------- sections ---------- */
section{padding:38px 0 6px;scroll-margin-top:calc(var(--nav-h) + 12px)}
.sechead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:6px;flex-wrap:wrap}
.sechead h2{font-size:21px}
.sechead .num{font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--accent);display:block;margin-bottom:5px}
.seclede{color:var(--muted);font-size:14px;max-width:860px;margin:8px 0 18px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow)}
.pad{padding:20px}

/* ---------- executive callout ---------- */
.callout{border-left:4px solid var(--accent);padding:20px 24px;margin-bottom:18px}
.callout h3{font-size:17px;margin-bottom:10px}
.callout p{margin:0 0 10px;font-size:15px}
.callout p:last-child{margin-bottom:0}
.callout.risk{border-left-color:var(--risk)}
.callout.warn{border-left-color:var(--warn)}

/* ---------- KPI ---------- */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.kpi{padding:18px}
.kpi .label{font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);font-weight:700}
.kpi .val{font-size:32px;font-weight:800;margin-top:7px;letter-spacing:-.02em}
.kpi .foot{font-size:12px;color:var(--muted);margin-top:5px}
.kpi.good .val{color:var(--good)} .kpi.warn .val{color:var(--warn)}
.kpi.risk .val{color:var(--risk)} .kpi.info .val{color:var(--info)}
.kpi.accent .val{color:var(--accent)}

/* ---------- badges / chips ---------- */
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.2px;white-space:nowrap}
.badge.good{background:var(--good-bg);color:var(--good)}
.badge.warning{background:var(--warn-bg);color:var(--warn)}
.badge.risk{background:var(--risk-bg);color:var(--risk)}
.badge.neutral{background:var(--neutral-bg);color:var(--neutral)}
.badge.info{background:var(--info-bg);color:var(--info)}
.badge.accent{background:var(--accent-soft);color:var(--accent-deep)}
.delta{font-weight:700;font-size:12px}
.delta.up{color:var(--good)} .delta.down{color:var(--risk)}
.delta.flat,.delta.new{color:var(--muted)}

/* ---------- decision queue ---------- */
.qcard{padding:16px 18px;margin-bottom:10px;border-left:4px solid var(--risk);display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}
.qcard.medium{border-left-color:var(--warn)}
.qcard.low{border-left-color:var(--info)}
.qcard.gate{border-left-color:var(--accent)}
.qcard .q{font-size:15px;font-weight:650;margin-bottom:6px}
.qcard .why{font-size:13px;color:var(--muted);margin-bottom:8px}
.qcard .meta{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:5px 12px;align-items:center}
.qcard .act{display:flex;flex-direction:column;gap:6px;align-items:stretch;min-width:150px}
.qtabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.qtab{padding:7px 13px;border-radius:999px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-size:12.5px;font-weight:650;color:var(--muted);font-family:var(--font)}
.qtab.on{background:var(--accent);border-color:var(--accent);color:#fff}

/* ---------- tables ---------- */
.tablewrap{overflow-x:auto;border-radius:var(--r)}
table{border-collapse:collapse;width:100%;font-size:13.5px;background:var(--card)}
th{text-align:left;padding:11px 13px;font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);font-weight:700;border-bottom:2px solid var(--border);white-space:nowrap;background:var(--card);position:sticky;top:0;cursor:pointer;user-select:none}
th:hover{color:var(--accent)}
th.nosort{cursor:default}
th.nosort:hover{color:var(--muted)}
td{padding:11px 13px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr{cursor:pointer;transition:background .12s}
tbody tr:hover{background:var(--neutral-bg)}
tbody tr.norow{cursor:default}
tbody tr.norow:hover{background:transparent}
.namecell{display:flex;flex-direction:column;gap:2px}
.namecell b{font-size:14px;font-weight:700}
.namecell small{color:var(--muted);font-size:11.5px}

/* ---------- progress bars (conditional formatting) ---------- */
.bar{position:relative;height:20px;background:var(--neutral-bg);border-radius:5px;overflow:hidden;min-width:112px}
.bar > i{position:absolute;inset:0 auto 0 0;display:block;border-radius:5px}
.bar > span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--text);text-shadow:0 0 3px var(--card)}
.bar.na{background:repeating-linear-gradient(45deg,var(--neutral-bg),var(--neutral-bg) 5px,transparent 5px,transparent 10px)}
.bar.na > span{color:var(--muted);font-weight:600;font-size:10px}

/* ---------- sparkline ---------- */
.spark{display:inline-flex;align-items:flex-end;gap:1.5px;height:22px}
.spark i{width:5px;background:var(--border);border-radius:1px;min-height:2px;display:block}
.spark i.on{background:var(--accent)}
.spark i.hi{background:var(--good)}

/* ---------- charts ---------- */
.chartgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}
.chartbox{padding:18px}
.chartbox h4{font-size:14px;margin-bottom:3px}
.chartbox .interp{font-size:12.5px;color:var(--muted);margin:4px 0 12px;min-height:32px}
.chartbox .cvs{position:relative;height:250px}
.chartbox.tall .cvs{height:330px}

/* ---------- mermaid ---------- */
.mermaidbox{padding:18px;overflow-x:auto}
.mermaid{text-align:center;min-height:60px}

/* ---------- heatmap ---------- */
.heat{border-collapse:separate;border-spacing:3px;font-size:12px}
.heat td.cell{width:38px;height:34px;text-align:center;border-radius:5px;font-weight:700;font-size:11px;cursor:pointer;color:#fff}
.heat td.lbl{font-size:12.5px;font-weight:650;white-space:nowrap;padding-right:10px;text-align:right;border:0}
.heat th{position:static;background:transparent;border:0;font-size:10px;padding:0 0 6px;text-align:center;writing-mode:vertical-rl;transform:rotate(180deg);height:112px;cursor:default}
.heat td{border:0}

/* ---------- project cards ---------- */
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px}
.pcard{padding:18px;display:flex;flex-direction:column;gap:11px;cursor:pointer;transition:transform .12s,box-shadow .12s;border-top:3px solid var(--neutral)}
.pcard:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg)}
.pcard.good{border-top-color:var(--good)} .pcard.warning{border-top-color:var(--warn)}
.pcard.risk{border-top-color:var(--risk)} .pcard.neutral{border-top-color:var(--neutral)}
.pcard .ptop{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.pcard h4{font-size:15px;line-height:1.35}
.pcard .owner{font-size:12px;color:var(--muted);margin-top:3px}
.pcard .sum{font-size:13px;color:var(--text);opacity:.9}
.pcard .flags{display:flex;flex-wrap:wrap;gap:5px}
.pcard .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;border-top:1px solid var(--border);padding-top:11px}
.pcard .stats div{text-align:center}
.pcard .stats b{display:block;font-size:16px;font-weight:800}
.pcard .stats small{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px}

/* ---------- drawer (drill-through) ---------- */
.scrim{position:fixed;inset:0;background:rgba(15,23,42,.45);opacity:0;pointer-events:none;transition:opacity .2s;z-index:150;backdrop-filter:blur(2px)}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(880px,100%);background:var(--bg);box-shadow:var(--shadow-lg);transform:translateX(100%);transition:transform .26s cubic-bezier(.4,0,.2,1);z-index:160;display:flex;flex-direction:column}
.drawer.on{transform:none}
.drawer .dhead{padding:18px 24px;border-bottom:1px solid var(--border);background:var(--card);display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.drawer .dbody{overflow-y:auto;padding:20px 24px 60px;flex:1}
.crumbs{font-size:11.5px;color:var(--muted);margin-bottom:6px}
.crumbs b{color:var(--accent)}
.dsec{margin-bottom:22px}
.dsec h5{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);margin-bottom:9px;font-weight:700}
.acc{border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:7px;background:var(--card);overflow:hidden}
.acc > summary{padding:11px 14px;cursor:pointer;display:flex;align-items:center;gap:11px;font-size:13.5px;font-weight:650;list-style:none}
.acc > summary::-webkit-details-marker{display:none}
.acc > summary::before{content:"›";font-size:17px;color:var(--muted);transition:transform .15s;display:inline-block}
.acc[open] > summary::before{transform:rotate(90deg)}
.acc .accbody{border-top:1px solid var(--border)}
.tasklist{list-style:none;margin:0;padding:0}
.tasklist li{display:flex;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);font-size:13px;align-items:flex-start}
.tasklist li:last-child{border-bottom:0}
.tasklist .tick{flex:0 0 16px;height:16px;border-radius:4px;border:1.5px solid var(--border);margin-top:2px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff}
.tasklist .tick.done{background:var(--good);border-color:var(--good)}
.tasklist .tick.over{border-color:var(--risk);background:var(--risk-bg)}
.tasklist .tt{flex:1}
.tasklist .tt small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.tasklist .done .tt > span{text-decoration:line-through;opacity:.6}
.cmt{border-left:2px solid var(--border);padding:2px 0 2px 12px;margin-bottom:12px;font-size:12.5px}
.cmt .ch{font-weight:700;font-size:12px;margin-bottom:2px}
.cmt .cb{color:var(--muted);white-space:pre-wrap;max-height:96px;overflow:hidden;position:relative}
.cmt .cb.open{max-height:none}
.minigrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.minigrid .m{background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:11px;text-align:center}
.minigrid .m b{display:block;font-size:19px;font-weight:800}
.minigrid .m small{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px}

/* ---------- misc ---------- */
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
.hidden{display:none !important}
.toc{columns:2;column-gap:28px}
.toc a{display:block;padding:7px 0;border-bottom:1px solid var(--border);font-size:13.5px;font-weight:600;break-inside:avoid}
.toc a small{display:block;color:var(--muted);font-weight:400;font-size:11.5px}
#totop{position:fixed;right:22px;bottom:22px;width:42px;height:42px;border-radius:50%;background:var(--accent);color:#fff;border:0;cursor:pointer;font-size:18px;box-shadow:var(--shadow-lg);opacity:0;pointer-events:none;transition:opacity .2s;z-index:90}
#totop.on{opacity:1;pointer-events:auto}
.prevnext{display:flex;justify-content:space-between;gap:12px;padding:26px 0 8px;border-top:1px solid var(--border);margin-top:30px}
footer{padding:34px 0 50px;color:var(--muted);font-size:12.5px;border-top:1px solid var(--border);margin-top:38px}
.note{font-size:12.5px;color:var(--muted);background:var(--neutral-bg);border-radius:var(--r-sm);padding:12px 14px;margin-top:12px}
.dl{display:grid;grid-template-columns:190px 1fr;gap:7px 16px;font-size:13px}
.dl dt{font-weight:700;color:var(--muted)}
.dl dd{margin:0}
.empty{padding:26px;text-align:center;color:var(--muted);font-size:13.5px}

@media(max-width:900px){
  .navlinks{position:absolute;top:var(--nav-h);left:0;right:0;background:var(--card);border-bottom:1px solid var(--border);flex-direction:column;padding:10px;display:none;box-shadow:var(--shadow)}
  .navlinks.open{display:flex}
  .navtoggle{display:block}
  #search{width:120px}
  .toc{columns:1}
  header.hero h1{font-size:26px}
  .qcard{grid-template-columns:1fr}
  .dl{grid-template-columns:1fr}
}
@media print{
  nav.top,#totop,.navtools,.scrim,.drawer,.prevnext,.qtabs,.filters{display:none !important}
  body{background:#fff}
  section{page-break-inside:avoid;padding:16px 0}
  .card{box-shadow:none}
}
`;

module.exports = { STYLES };
