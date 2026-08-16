/**
 * renderFamilyDashboardHtml — renders the full interactive Family Dashboard
 * (Chart.js + Mermaid, sticky nav, dark mode) from a compiled data object.
 *
 * This is the production counterpart of docs/FAMILY_DASHBOARD_DESIGN_PREVIEW.html
 * (the approved design). It renders LIVE sections only (Basecamp is fully
 * wired); calendar/travel/Procare sections collapse into one compact
 * "Coming Soon" block until those sources are connected, rather than
 * repeating fabricated sample content in a real daily send.
 *
 * Not emailable directly (Outlook/Gmail strip <script> + block CDN loads) —
 * sent as an attached .html file by sendFamilyDashboardDaily.js so the
 * charts/dark-mode/search still work when opened.
 */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderFamilyDashboardHtml(data) {
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Family Dashboard — ${esc(data.todayLabel)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  :root{
    --navy:#1a365d; --navy-light:#2b6cb0;
    --red:#e53e3e; --green:#38a169; --amber:#d69e2e;
    --bg:#ffffff; --bg-alt:#f7fafc;
    --card:#ffffff; --border:#e2e8f0;
    --text:#2d3748; --text-light:#718096;
    --radius:11px;
    --shadow:0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.06);
    --font: 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
  @media (prefers-color-scheme: dark){
    :root{
      --bg:#0f1720; --bg-alt:#141e2a; --card:#16212c; --border:#28394b;
      --text:#e6edf3; --text-light:#93a4b8;
      --navy-light:#5b9bd8; --red:#f56565; --green:#48bb78; --amber:#f0b429;
      --shadow:0 1px 2px rgba(0,0,0,.3), 0 6px 18px rgba(0,0,0,.35);
    }
  }
  html[data-theme="dark"]{
    --bg:#0f1720; --bg-alt:#141e2a; --card:#16212c; --border:#28394b;
    --text:#e6edf3; --text-light:#93a4b8;
    --navy-light:#5b9bd8; --red:#f56565; --green:#48bb78; --amber:#f0b429;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 6px 18px rgba(0,0,0,.35);
  }
  html[data-theme="light"]{
    --bg:#ffffff; --bg-alt:#f7fafc; --card:#ffffff; --border:#e2e8f0;
    --text:#2d3748; --text-light:#718096;
    --navy-light:#2b6cb0; --red:#e53e3e; --green:#38a169; --amber:#d69e2e;
    --shadow:0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.06);
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth; scroll-padding-top:76px}
  body{margin:0;background:var(--bg-alt);color:var(--text);font-family:var(--font);line-height:1.6}
  a{color:var(--navy-light)}
  :focus-visible{outline:3px solid var(--navy-light);outline-offset:2px}
  @media (prefers-reduced-motion: reduce){ *{animation:none !important; transition:none !important; scroll-behavior:auto !important} }
  .skip-nav{position:absolute;left:-999px;top:0;background:var(--navy);color:#fff;padding:10px 16px;z-index:200}
  .skip-nav:focus{left:12px;top:12px}
  #progress{position:fixed;top:0;left:0;height:3px;background:var(--navy-light);width:0;z-index:220}
  header.topnav{position:sticky;top:0;z-index:200;background:var(--navy);border-bottom:1px solid rgba(255,255,255,.08)}
  .nav-row{max-width:1240px;margin:0 auto;display:flex;align-items:center;gap:18px;padding:0 20px;height:58px}
  .brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;letter-spacing:-.01em;white-space:nowrap;text-decoration:none}
  .brand .mark{width:26px;height:26px;background:var(--navy-light);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border-radius:6px}
  .nav-links{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;flex:1}
  .nav-links::-webkit-scrollbar{display:none}
  .nav-links a{color:rgba(255,255,255,.78);text-decoration:none;font-size:13px;font-weight:600;padding:8px 11px;white-space:nowrap;border-radius:7px}
  .nav-links a:hover{background:rgba(255,255,255,.08);color:#fff}
  .nav-links a.active{background:rgba(255,255,255,.14);color:#fff}
  .nav-tools{display:flex;align-items:center;gap:6px}
  .icon-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px}
  .icon-btn:hover{background:rgba(255,255,255,.18)}
  .hamburger{display:none}
  @media (max-width:900px){
    .nav-links{display:none;position:fixed;top:58px;left:0;right:0;background:var(--navy);flex-direction:column;padding:8px;max-height:calc(100vh - 58px);overflow-y:auto}
    .nav-links.open{display:flex}
    .nav-links a{padding:12px 14px}
    .hamburger{display:flex}
  }
  .wrap{max-width:1240px;margin:0 auto;padding:0 20px}
  section{scroll-margin-top:74px;padding:40px 0}
  section:first-of-type{padding-top:0}
  .eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--navy-light);margin-bottom:8px}
  h2{font-size:22px;font-weight:700;color:var(--navy);margin:0 0 6px;letter-spacing:-.01em}
  .section-sub{color:var(--text-light);font-size:14px;max-width:70ch;margin-bottom:22px}
  .status-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:20px}
  .status-pill.live{background:rgba(56,161,105,.13);color:var(--green)}
  .status-pill.planned{background:rgba(214,158,46,.15);color:var(--amber)}
  .status-pill.broken{background:rgba(229,62,62,.13);color:var(--red)}
  .status-pill .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
  #summary{padding-top:36px}
  .hero{background:linear-gradient(135deg, var(--navy) 0%, #0e2036 100%);color:#fff;border-radius:16px;padding:38px 36px;box-shadow:var(--shadow)}
  .hero .eyebrow{color:#c9d8ee}
  .hero h1{font-size:clamp(24px,3.4vw,34px);margin:6px 0 14px;font-weight:800;letter-spacing:-.015em;text-wrap:balance}
  .hero p{max-width:68ch;color:#dbe6f3;font-size:15.5px;margin:0 0 18px}
  .hero-badges{display:flex;flex-wrap:wrap;gap:8px}
  .hbadge{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18);padding:6px 12px;border-radius:20px;font-size:12.5px;font-weight:600}
  .hbadge.good{background:rgba(56,161,105,.22);border-color:rgba(56,161,105,.45)}
  .hbadge.warn{background:rgba(214,158,46,.22);border-color:rgba(214,158,46,.45)}
  .kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
  .kpi{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)}
  .kpi-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-light);margin-bottom:10px}
  .kpi-val{font-size:26px;font-weight:800;color:var(--navy);letter-spacing:-.01em}
  .kpi-val.good{color:var(--green)}
  .kpi-sub{font-size:12px;color:var(--text-light);margin-top:6px}
  .two-col{display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:start}
  .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px}
  .card + .card{margin-top:16px}
  .card h3{margin:0 0 4px;font-size:15.5px;font-weight:700}
  .card .hint{font-size:12.5px;color:var(--text-light);margin-bottom:16px}
  .chart-box{position:relative;height:260px}
  .insight{margin-top:14px;font-size:13px;background:var(--bg-alt);border-left:3px solid var(--navy-light);padding:10px 12px;border-radius:0 8px 8px 0;color:var(--text)}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-light);border-bottom:2px solid var(--border);padding:8px 10px}
  td{padding:11px 10px;border-bottom:1px solid var(--border)}
  tr:last-child td{border-bottom:none}
  .chip{display:inline-block;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:20px}
  .chip.soon{background:rgba(214,158,46,.15);color:var(--amber)}
  .chip.future{background:var(--bg-alt);color:var(--text-light)}
  .chip.overdue{background:rgba(229,62,62,.13);color:var(--red)}
  .search-row{display:flex;gap:8px;margin-bottom:14px}
  .search-row input{flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg-alt);color:var(--text)}
  .table-wrap{overflow-x:auto}
  .record{padding:13px 0;border-top:1px solid var(--border)}
  .record:first-child{border-top:none}
  .record-title{font-weight:600;font-size:13.5px}
  .record-meta{font-size:12px;color:var(--text-light);margin:2px 0 4px}
  .record a{font-size:12px;font-weight:600;text-decoration:none}
  .record a:hover{text-decoration:underline}
  .empty-note{font-size:13px;color:var(--text-light)}
  .risk-row{display:flex;gap:12px;padding:13px 0;border-top:1px solid var(--border)}
  .risk-row:first-child{border-top:none}
  .risk-mark{width:26px;height:26px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
  .risk-mark.risk{background:rgba(229,62,62,.13);color:var(--red)}
  .mermaid-box{background:var(--bg-alt);border:1px solid var(--border);border-radius:10px;padding:18px;overflow-x:auto}
  .status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}
  .status-card{border:1px solid var(--border);border-radius:10px;padding:14px}
  .status-card .name{font-weight:700;font-size:13.5px;margin-bottom:4px}
  .status-card .detail{font-size:12px;color:var(--text-light)}
  .planned-card{border:1px dashed var(--border);border-radius:var(--radius);padding:18px;background:var(--bg-alt)}
  .planned-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:14px}
  .planned-item{background:var(--card);border:1px solid var(--border);border-radius:9px;padding:13px}
  .planned-item .name{font-weight:700;font-size:13px;margin-bottom:3px}
  .planned-item .desc{font-size:11.5px;color:var(--text-light);line-height:1.5}
  ol.reco{padding-left:20px;margin:0}
  ol.reco li{margin-bottom:10px;font-size:14px}
  .appendix dl{display:grid;grid-template-columns:180px 1fr;gap:8px 16px;font-size:13.5px;margin:0}
  .appendix dt{color:var(--text-light);font-weight:600}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px}
  .legend span{font-size:12px;color:var(--text-light);display:flex;align-items:center;gap:6px}
  .legend .sw{width:10px;height:10px;border-radius:3px}
  .section-nav{display:flex;justify-content:space-between;margin-top:26px;gap:12px}
  .section-nav a{flex:1;border:1px solid var(--border);border-radius:10px;padding:12px 14px;text-decoration:none;color:var(--text);font-size:12.5px;background:var(--card)}
  .section-nav a:hover{border-color:var(--navy-light)}
  .section-nav .lbl{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-light);margin-bottom:3px}
  .section-nav .to-next{text-align:right}
  #totop{position:fixed;bottom:22px;right:22px;width:42px;height:42px;border-radius:50%;background:var(--navy);color:#fff;border:none;cursor:pointer;font-size:16px;box-shadow:var(--shadow);display:none;align-items:center;justify-content:center;z-index:150}
  #totop.show{display:flex}
  footer.pagefoot{background:var(--navy);color:#cfd9e6;padding:28px 0;margin-top:20px;font-size:12.5px}
  @media print{ header.topnav, #totop, #progress, .section-nav, .icon-btn, .search-row{display:none !important} section{padding:14px 0 !important} body{background:#fff !important} }
  @media (max-width:980px){ .kpi-grid{grid-template-columns:repeat(2,1fr)} .two-col{grid-template-columns:1fr} .hero{padding:28px 22px} }
</style>
</head>
<body>
<a class="skip-nav" href="#summary">Skip to content</a>
<div id="progress"></div>
<header class="topnav">
  <div class="nav-row">
    <a class="brand" href="#summary"><span class="mark">FD</span> Family Dashboard</a>
    <button class="icon-btn hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false">☰</button>
    <nav class="nav-links" id="navLinks">
      <a href="#summary">Summary</a>
      <a href="#kpis">KPIs</a>
      <a href="#week-load">Week Load</a>
      <a href="#bc-health">Basecamp Health</a>
      <a href="#new-since">New Since Yesterday</a>
      <a href="#money">Money</a>
      <a href="#pipeline">Data Pipeline</a>
      <a href="#risks">Risks</a>
      <a href="#coming-soon">Coming Soon</a>
      <a href="#recommendations">Next Steps</a>
      <a href="#appendix">Appendix</a>
    </nav>
    <div class="nav-tools">
      <button class="icon-btn" id="themeToggle" aria-label="Toggle dark mode" title="Toggle dark/light">◐</button>
      <button class="icon-btn" id="printBtn" aria-label="Print dashboard" title="Print / export PDF">⎙</button>
    </div>
  </div>
</header>

<div class="wrap">
  <section id="summary">
    <div class="hero">
      <div class="eyebrow">Colaberry Family Ops · Weekdays 5:00 AM CT · To Ali · Cc Addie</div>
      <h1 id="heroTitle">Family Dashboard</h1>
      <p>Everything that changed in the family Basecamp overnight, in one page. Sections tagged <strong>Live</strong> are real Basecamp data pulled this morning; sections tagged <strong>Planned</strong> are reserved for Calendar/Procare once wired in.</p>
      <div class="hero-badges" id="heroBadges"></div>
    </div>
  </section>

  <section id="kpis">
    <div class="eyebrow">At a Glance</div>
    <h2>KPI Dashboard</h2>
    <div class="section-sub">Five numbers that summarize the whole page.</div>
    <div class="kpi-grid" id="kpiGrid"></div>
    <div class="section-nav" data-section="kpis"></div>
  </section>

  <section id="week-load">
    <div class="eyebrow">This Week</div>
    <h2>Basecamp Ticket Load <span class="status-pill live"><span class="dot"></span>Live</span></h2>
    <div class="section-sub">Family tickets due each day this week.</div>
    <div class="card">
      <h3>Tickets due per day</h3>
      <div class="hint">Source: Family Goals &amp; Life Planning, bucket 33392153</div>
      <div class="chart-box"><canvas id="weekChart"></canvas></div>
    </div>
    <div class="section-nav" data-section="week-load"></div>
  </section>

  <section id="bc-health">
    <div class="eyebrow">Where the Open Work Lives</div>
    <h2>Family Basecamp Health <span class="status-pill live"><span class="dot"></span>Live</span></h2>
    <div class="section-sub">Open tickets by list. Filter by list name; earliest due date per list is shown.</div>
    <div class="two-col">
      <div class="card">
        <h3>Open tickets by list</h3>
        <div class="chart-box" style="height:280px"><canvas id="healthChart"></canvas></div>
      </div>
      <div class="card">
        <h3>Detail — searchable</h3>
        <div class="search-row"><input type="search" id="healthSearch" placeholder="Filter by list name…" aria-label="Filter Basecamp lists" /></div>
        <div class="table-wrap">
          <table id="healthTable"><thead><tr><th>List</th><th>Open</th><th>Earliest due</th></tr></thead><tbody></tbody></table>
        </div>
      </div>
    </div>
    <div class="section-nav" data-section="bc-health"></div>
  </section>

  <section id="new-since">
    <div class="eyebrow">Overnight</div>
    <h2>New Since Yesterday <span class="status-pill live"><span class="dot"></span>Live</span></h2>
    <div class="section-sub">Tickets created in the family project in the last 24 hours.</div>
    <div class="card" id="newSinceCard"></div>
    <div class="section-nav" data-section="new-since"></div>
  </section>

  <section id="money">
    <div class="eyebrow">Money</div>
    <h2>Reconciliation &amp; Money Tickets <span class="status-pill live"><span class="dot"></span>Live</span></h2>
    <div class="section-sub">Any open family ticket with a dollar amount in its title or notes.</div>
    <div class="card" id="moneyCard"></div>
    <div class="section-nav" data-section="money"></div>
  </section>

  <section id="pipeline">
    <div class="eyebrow">Under the Hood</div>
    <h2>Data Pipeline</h2>
    <div class="section-sub">What feeds this dashboard today, and what's next.</div>
    <div class="card">
      <h3>Sources → Dashboard</h3>
      <div class="mermaid-box"><pre class="mermaid" id="mermaidDiagram"></pre></div>
      <div class="status-grid" id="statusGrid"></div>
    </div>
    <div class="section-nav" data-section="pipeline"></div>
  </section>

  <section id="risks">
    <div class="eyebrow">Watch List</div>
    <h2>Risks &amp; Flags <span class="status-pill live"><span class="dot"></span>Live</span></h2>
    <div class="section-sub">Anything that needs attention or is blocking the pipeline.</div>
    <div class="card" id="risksCard"></div>
    <div class="section-nav" data-section="risks"></div>
  </section>

  <section id="coming-soon">
    <div class="eyebrow">Coming Next</div>
    <h2>Coming Soon <span class="status-pill planned"><span class="dot"></span>Planned</span></h2>
    <div class="section-sub">These sections lived in the old 6 AM Family Command Center email. They move here once Calendar/Procare are wired into this dashboard.</div>
    <div class="planned-card"><div class="planned-grid" id="comingSoonGrid"></div></div>
    <div class="section-nav" data-section="coming-soon"></div>
  </section>

  <section id="recommendations">
    <div class="eyebrow">Decisions</div>
    <h2>Recommendations</h2>
    <div class="card"><ol class="reco" id="recoList"></ol></div>
    <div class="section-nav" data-section="recommendations"></div>
  </section>

  <section id="appendix">
    <div class="eyebrow">Reference</div>
    <h2>Appendix</h2>
    <div class="card appendix">
      <dl>
        <dt>Cadence</dt><dd>Weekdays, 5:00 AM CT</dd>
        <dt>Recipients</dt><dd>To Ali · Cc Addie</dd>
        <dt>Generated</dt><dd id="generatedAt"></dd>
        <dt>Design system</dt><dd>Colaberry UI/UX (navy #1a365d / red #e53e3e / green #38a169)</dd>
        <dt>Built from</dt><dd>BC 10031928327 (design system) + BC 10039770075 (dashboard reference kit)</dd>
      </dl>
      <div class="legend">
        <span><span class="sw" style="background:var(--green)"></span>Live — real data</span>
        <span><span class="sw" style="background:var(--amber)"></span>Planned — source not yet connected</span>
        <span><span class="sw" style="background:var(--red)"></span>Broken — needs attention</span>
      </div>
    </div>
  </section>
</div>

<button id="totop" aria-label="Back to top">↑</button>
<footer class="pagefoot"><div class="wrap">Family Dashboard — automated weekdays 5:00 AM CT. Reply to ali@colaberry.com to adjust.</div></footer>

<script>
const DATA = ${dataJson};
const COMING_SOON = [
  { name: "Today's Snapshot & Conflicts", desc: 'Family events + work-calendar overlaps, from Google Calendar.' },
  { name: '7-Day Calendar Grid', desc: 'Family + kids events across the coming week.' },
  { name: 'Travel Countdown', desc: 'Confirmed trips pulled from calendar entries.' },
  { name: 'Weekly Recap', desc: 'One-paragraph roll-up of the last 7 days.' },
  { name: 'Photo Flashback', desc: 'Recent family photos surfaced from Gmail/Drive.' },
  { name: 'Procare Spend Trend', desc: 'Monthly school-charge history and projection.' },
];
const RECOMMENDATIONS = [
  'Re-auth the Hotmail/MS Graph connection so trip-cost emails and Procare charges can be read automatically.',
  'Wire in Google Calendar and Procare so the Coming Soon section goes live.',
  'Once those are live, this single page fully replaces the old 6 AM Family Command Center email.',
];

document.getElementById('heroTitle').textContent = 'Family Dashboard — ' + DATA.todayLabel;
document.getElementById('generatedAt').textContent = new Date(DATA.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

const overdueGood = DATA.kpis.overdue === 0;
document.getElementById('heroBadges').innerHTML = [
  overdueGood ? '<span class="hbadge good">✓ 0 overdue</span>' : '<span class="hbadge warn">' + DATA.kpis.overdue + ' overdue</span>',
  '<span class="hbadge">' + DATA.kpis.dueThisWeek + ' tickets due this week</span>',
  '<span class="hbadge">' + DATA.kpis.newSinceYesterday + ' new since yesterday</span>',
  '<span class="hbadge ' + (DATA.kpis.sourcesConnected < DATA.kpis.sourcesTotal ? 'warn' : 'good') + '">' + DATA.kpis.sourcesConnected + ' of ' + DATA.kpis.sourcesTotal + ' data sources live</span>',
].join('');

document.getElementById('kpiGrid').innerHTML = [
  { label: 'Due This Week', value: DATA.kpis.dueThisWeek, sub: 'across ' + DATA.basecampHealth.length + ' Basecamp lists' },
  { label: 'Overdue', value: DATA.kpis.overdue, sub: overdueGood ? 'nothing overdue' : 'needs a reschedule pass', good: overdueGood },
  { label: 'New Since Yesterday', value: DATA.kpis.newSinceYesterday, sub: 'created in the last 24h' },
  { label: 'Money Pending', value: '$' + DATA.kpis.moneyPendingTotal.toFixed(2), sub: DATA.moneyItems.length + ' ticket(s) with a dollar amount' },
  { label: 'Sources Connected', value: DATA.kpis.sourcesConnected + ' / ' + DATA.kpis.sourcesTotal, sub: 'see Data Pipeline below' },
].map(k => '<div class="kpi"><div class="kpi-label">' + k.label + '</div><div class="kpi-val ' + (k.good ? 'good' : '') + '">' + k.value + '</div><div class="kpi-sub">' + k.sub + '</div></div>').join('');

document.getElementById('newSinceCard').innerHTML = DATA.newSinceYesterday.length
  ? DATA.newSinceYesterday.map(r => '<div class="record"><div class="record-title">' + r.title + '</div><div class="record-meta">' + r.meta + '</div><a href="' + r.url + '" target="_blank" rel="noopener">Open in Basecamp →</a></div>').join('')
  : '<div class="empty-note">Nothing new in the last 24 hours.</div>';

document.getElementById('moneyCard').innerHTML = DATA.moneyItems.length
  ? DATA.moneyItems.map(m => '<div class="record"><div class="record-title">' + m.title + '</div><div class="record-meta">' + m.listName + ' · ' + (m.amount || '') + '</div><a href="' + m.url + '" target="_blank" rel="noopener">Open in Basecamp →</a></div>').join('')
  : '<div class="empty-note">Nothing pending right now.</div>';

document.getElementById('statusGrid').innerHTML = DATA.sources.map(s =>
  '<div class="status-card"><div class="name">' + s.name + '</div><span class="status-pill ' + s.status + '"><span class="dot"></span>' + s.status + '</span><div class="detail" style="margin-top:6px">' + s.detail + '</div></div>'
).join('');

document.getElementById('risksCard').innerHTML = DATA.risks.length
  ? DATA.risks.map(r => '<div class="risk-row"><div class="risk-mark risk">!</div><div><div class="record-title">' + r.title + '</div><div class="record-meta">' + r.detail + '</div></div></div>').join('')
  : '<div class="empty-note">No flags today.</div>';

document.getElementById('comingSoonGrid').innerHTML = COMING_SOON.map(r => '<div class="planned-item"><div class="name">' + r.name + '</div><div class="desc">' + r.desc + '</div></div>').join('');
document.getElementById('recoList').innerHTML = RECOMMENDATIONS.map(r => '<li>' + r + '</li>').join('');

function renderHealthTable(filter) {
  filter = filter || '';
  const rows = DATA.basecampHealth.filter(r => r.list.toLowerCase().includes(filter.toLowerCase()));
  document.querySelector('#healthTable tbody').innerHTML = rows.map(r =>
    '<tr><td><a href="' + r.url + '" target="_blank" rel="noopener">' + r.list + '</a></td><td>' + r.open + '</td><td><span class="chip ' + r.tier + '">' + r.dueLabel + '</span></td></tr>'
  ).join('') || '<tr><td colspan="3" style="color:var(--text-light)">No lists match "' + filter + '"</td></tr>';
}
renderHealthTable();
document.getElementById('healthSearch').addEventListener('input', e => renderHealthTable(e.target.value));

const navy = '#1a365d', navyLight = '#2b6cb0', green = '#38a169', red = '#e53e3e', amber = '#d69e2e', slate = '#718096';
function initCharts() {
  new Chart(document.getElementById('weekChart'), {
    type: 'bar',
    data: { labels: DATA.weekLoad.map(d => d.dow + ' ' + d.date), datasets: [{ label: 'Tickets due', data: DATA.weekLoad.map(d => d.due), backgroundColor: DATA.weekLoad.map(d => d.today ? navy : navyLight), borderRadius: 5, maxBarThickness: 46 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
  const palette = [navy, navyLight, green, amber, red, slate];
  new Chart(document.getElementById('healthChart'), {
    type: 'doughnut',
    data: { labels: DATA.basecampHealth.map(l => l.list), datasets: [{ data: DATA.basecampHealth.map(l => l.open), backgroundColor: palette, borderWidth: 2, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card') }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } },
  });
}
if (window.Chart) initCharts(); else window.addEventListener('load', initCharts);

const graphSource = DATA.sources.find(s => /graph/i.test(s.name));
const graphClass = graphSource && graphSource.status === 'live' ? 'live' : 'broken';
document.getElementById('mermaidDiagram').textContent =
  'flowchart LR\\n' +
  '  BC["Basecamp API"]:::live --> DASH["Family Dashboard"]:::hub\\n' +
  '  GM["Hotmail / MS Graph<br/>(email)"]:::' + graphClass + ' -.-> DASH\\n' +
  '  CAL["Google Calendar"]:::planned -.-> DASH\\n' +
  '  PC["Procare<br/>(school charges)"]:::planned -.-> DASH\\n' +
  '  classDef live fill:#38a169,stroke:#276749,color:#fff\\n' +
  '  classDef broken fill:#e53e3e,stroke:#9b2c2c,color:#fff\\n' +
  '  classDef planned fill:#d69e2e,stroke:#975a16,color:#fff\\n' +
  '  classDef hub fill:#1a365d,stroke:#0e2036,color:#fff';
if (window.mermaid) mermaid.initialize({ startOnLoad: true, theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default', securityLevel: 'loose' });

const hamburger = document.getElementById('hamburger');
const navLinksEl = document.getElementById('navLinks');
hamburger.addEventListener('click', () => { const open = navLinksEl.classList.toggle('open'); hamburger.setAttribute('aria-expanded', String(open)); });
navLinksEl.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinksEl.classList.remove('open')));

const navAnchors = [...document.querySelectorAll('.nav-links a')];
const progressEl = document.getElementById('progress');
const totopBtn = document.getElementById('totop');
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  progressEl.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%';
  totopBtn.classList.toggle('show', h.scrollTop > 500);
}, { passive: true });
totopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) navAnchors.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); });
}, { rootMargin: '-40% 0px -50% 0px' });
document.querySelectorAll('.wrap > section').forEach(s => observer.observe(s));

const sections = [...document.querySelectorAll('.wrap > section')];
const titleOf = (id) => { const el = document.querySelector('.nav-links a[href="#' + id + '"]'); return el ? el.textContent : id; };
sections.forEach((s, i) => {
  const holder = s.querySelector('.section-nav');
  if (!holder) return;
  const prev = sections[i - 1], next = sections[i + 1];
  holder.innerHTML =
    (prev ? '<a href="#' + prev.id + '"><span class="lbl">← Previous</span>' + titleOf(prev.id) + '</a>' : '<span></span>') +
    (next ? '<a class="to-next" href="#' + next.id + '"><span class="lbl">Next →</span>' + titleOf(next.id) + '</a>' : '<span></span>');
});

const themeToggle = document.getElementById('themeToggle');
function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
applyTheme(localStorage.getItem('fd-theme'));
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('fd-theme', next);
});
document.getElementById('printBtn').addEventListener('click', () => window.print());
</script>
</body>
</html>`;
}

module.exports = { renderFamilyDashboardHtml };
