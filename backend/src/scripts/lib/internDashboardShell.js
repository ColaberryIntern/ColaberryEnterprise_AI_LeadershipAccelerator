// internDashboardShell.js
//
// Builds the single self-contained HTML file. The shell is deliberately thin:
// it carries the navigation, the section scaffolding, and the embedded data
// object, and the client runtime fills every section from that object. That is
// the Reference Kit contract ("everything renders from one data object"), and
// it is also what makes the output safe to regenerate on a cron.

const fs = require('fs');
const path = require('path');
const { STYLES } = require('./internDashboardStyles');

const CLIENT = fs.readFileSync(path.resolve(__dirname, './assets/internDashboardClient.js'), 'utf8');

// A literal close-script tag in the JSON payload would end the tag early, and
// U+2028/U+2029 are line terminators to a JS parser but not to JSON. Escape all
// four so the embedded object can carry arbitrary Basecamp comment text.
function safeJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SECTIONS = [
  { id: 'summary', n: '01', title: 'Executive summary', nav: 'Summary', lede: 'Lead with the conclusion. What is true right now, and the single thing to do before the call starts.' },
  { id: 'decisions', n: '02', title: 'Needs your call', nav: 'Needs your call', lede: 'Every question and approval gate where work has stopped until you answer, each with a direct link into the thread that answers it.' },
  { id: 'kpis', n: '03', title: 'Portfolio KPIs', nav: 'KPIs', lede: 'The headline numbers for the whole intern portfolio, with the week-over-week move on each.' },
  { id: 'charts', n: '04', title: 'Trends and mix', nav: 'Trends', lede: 'How the portfolio is distributed and which way momentum is pointing. Each chart carries its own read.' },
  { id: 'people', n: '05', title: 'People', nav: 'People', lede: 'Everyone actively working with an update or a closed task in the window. Click any row to drill into their projects, cadence and blockers.' },
  { id: 'timeline', n: '06', title: 'Delivery timeline', nav: 'Timeline', lede: 'Each live project from its first task to its projected finish at current pace. Red bars are stalled or at risk.' },
  { id: 'coverage', n: '07', title: 'Coverage matrix', nav: 'Coverage', lede: 'Who is on what, colour-coded by how far along that project is. The fastest way to spot a person carrying too much or a project carrying no one.' },
  { id: 'projects', n: '08', title: 'Project detail', nav: 'Projects', lede: 'Full records. Every project, its status read, its risk flags, and a drill-through to releases, tasks and the Basecamp tickets behind them.' },
  { id: 'dormant', n: '09', title: 'Dormant roster', nav: 'Dormant', lede: 'People holding assigned work who have not posted an update or closed a task in the window. Shown so the roster is complete, not because they belong on the call.' },
  { id: 'method', n: '10', title: 'How to read this', nav: 'Method', lede: 'Definitions, thresholds and the provenance of every number above.' },
];

function navHtml() {
  return SECTIONS.map((s) => `<a href="#${s.id}" data-scroll>${esc(s.nav || s.title)}</a>`).join('');
}

function sectionOpen(s) {
  return `<section id="${s.id}"><div class="wrap">
    <div class="sechead"><div><span class="num">${s.n} / ${SECTIONS.length}</span><h2>${esc(s.title)}</h2></div>__AUX__</div>
    <p class="seclede">${esc(s.lede)}</p>`;
}

function buildHtml(data) {
  const S = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
  const generated = new Date(data.generatedAt);
  const generatedLabel = generated.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Chicago' });
  const questionCount = data.decisionQueue.filter((q) => q.kind === 'open_question').length;
  const gateCount = data.decisionQueue.filter((q) => q.kind === 'approval_gate' && q.approver === 'Ali').length;

  const chartBoxes = [
    { id: 'chart-status', title: 'Project status mix', interp: 'Anything in the red or amber bands is a project that will not move without an intervention from you.' },
    { id: 'chart-people', title: 'Completion by person (owned work)', interp: 'Share of their own assigned tasks each person has closed. People owning a single task are excluded because a percentage there is meaningless.' },
    { id: 'chart-momentum', title: `Momentum, last ${data.lookbackDays} days`, interp: 'Updates posted against tasks actually closed. Updates running well ahead of closures means talk outpacing delivery.' },
    { id: 'chart-stream', title: 'Closed vs open by stream', interp: 'Where the remaining work is concentrated between the Internship programme and the Gov Contracts push.' },
  ];

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Intern Delivery Command Center - ${esc(generated.toISOString().slice(0, 10))}</title>
<meta name="description" content="Portfolio view of every intern actively delivering across the Internship and Gov Contracts programmes, with drill-through to Basecamp.">
<style>${STYLES}</style>
</head>
<body>
<div id="progress"></div>

<nav class="top"><div class="wrap">
  <div class="brand"><span class="dot"></span>Intern Delivery Command Center</div>
  <div class="navlinks" id="navlinks">${navHtml()}</div>
  <div class="navtools">
    <input id="search" type="search" placeholder="Search people, projects  /" aria-label="Search">
    <button class="btn" id="theme" title="Toggle light and dark">◐</button>
    <button class="btn" id="print" title="Print or save as PDF">Print</button>
    <button class="btn navtoggle" id="navtoggle" aria-label="Menu">☰</button>
  </div>
</div></nav>

<header class="hero"><div class="wrap">
  <div class="eyebrow">Colaberry &middot; Scrum call briefing</div>
  <h1>Every intern, every project, one page</h1>
  <div class="sub">Ali, this is the state of all intern delivery across the Internship / Apprenticeship programme and the Gov Contracts push, as of ${esc(generatedLabel)} Central. Start at "Needs your call" and work down.</div>
  <div class="herometa">
    <span>${data.portfolio.peopleReporting} of ${data.portfolio.peopleActive} delivering reported in</span>
    <span>${data.portfolio.projectsTotal} projects</span>
    <span>${data.portfolio.taskDone} / ${data.portfolio.taskTotal} tasks closed</span>
    <span>${questionCount} questions waiting on you</span>
    <span>${gateCount} approval gates open</span>
  </div>
</div></header>

${sectionOpen(S.summary).replace('__AUX__', '')}
  <div id="exec-body"></div>
  <div class="card pad" style="margin-top:16px">
    <h3 style="font-size:14px;margin-bottom:12px">Contents</h3>
    <div class="toc" id="toc-body"></div>
  </div>
</div></section>

${sectionOpen(S.decisions).replace('__AUX__', '')}
  <div class="qtabs">
    <button class="qtab on" data-q="questions">Questions for you</button>
    <button class="qtab" data-q="gates">Your approval gates</button>
    <button class="qtab" data-q="ram">Ram's approval gates</button>
    <button class="qtab" data-q="all">Everything</button>
  </div>
  <div id="queue-body"></div>
  <div class="note">A question lands here when someone asked it on a Basecamp task and you have not commented in that thread since. Answering in Basecamp is what clears it from this list on the next run.</div>
</div></section>

${sectionOpen(S.kpis).replace('__AUX__', '')}
  <div class="kpis" id="kpi-body"></div>
</div></section>

${sectionOpen(S.charts).replace('__AUX__', '')}
  <div class="chartgrid">
    ${chartBoxes.map((c) => `<div class="card chartbox"><h4>${esc(c.title)}</h4><div class="interp">${esc(c.interp)}</div><div class="cvs"><canvas id="${c.id}"></canvas></div></div>`).join('')}
  </div>
</div></section>

${sectionOpen(S.people).replace('__AUX__', '<div style="font-size:12.5px;color:var(--muted)"><b id="people-count">0</b> active</div>')}
  <div class="tablewrap card">
    <table id="people-table">
      <thead><tr>
        <th data-k="name">Person</th>
        <th data-k="statusRank">Status</th>
        <th data-k="projectCount">Projects</th>
        <th data-k="percentComplete">Owned work complete</th>
        <th data-k="updatesInLookback">Update cadence</th>
        <th data-k="doneLast7">Closed 7d</th>
        <th class="nosort">Trajectory</th>
        <th data-k="daysSinceUpdate">Last seen</th>
        <th class="nosort">Flags</th>
      </tr></thead>
      <tbody id="people-body"></tbody>
    </table>
  </div>
  <div class="note">Click any row to drill through to that person: their projects, their cadence, and anything of theirs blocked on you. Column headers sort.</div>
</div></section>

${sectionOpen(S.timeline).replace('__AUX__', '')}
  <div class="card mermaidbox"><pre class="mermaid" id="gantt"></pre></div>
  <div class="note">Bars run from the project's first task to its projected finish, forecast from the completion rate over the last ${data.historyDays} days. Red means stalled or at risk. A project with no completions has no credible forecast and is drawn as a stub labelled "no forecast".</div>
</div></section>

${sectionOpen(S.coverage).replace('__AUX__', '')}
  <div id="heat"></div>
</div></section>

${sectionOpen(S.projects).replace('__AUX__', '<div style="font-size:12.5px;color:var(--muted)"><b id="proj-count">0</b> shown</div>')}
  <div class="filters">
    <button class="btn pfilter on" data-f="all">All</button>
    <button class="btn pfilter" data-f="attention">Needs attention</button>
    <button class="btn pfilter" data-f="moving">Moving</button>
    <button class="btn pfilter" data-f="done">Complete</button>
    <button class="btn pfilter" data-f="Internship">Internship</button>
    <button class="btn pfilter" data-f="Gov Contracts">Gov Contracts</button>
  </div>
  <div class="pgrid" id="proj-body"></div>
</div></section>

${sectionOpen(S.dormant).replace('__AUX__', '<div style="font-size:12.5px;color:var(--muted)"><b id="dormant-count">0</b> dormant</div>')}
  <div class="card" id="dormant-body"></div>
</div></section>

${sectionOpen(S.method).replace('__AUX__', '')}
  <div class="card pad">
    <dl class="dl">
      <dt>Who appears</dt><dd>Anyone assigned a task or posting an update in Basecamp projects <a href="https://app.basecamp.com/3945211/projects/24865175" target="_blank" rel="noopener">24865175 (Internship / Apprenticeship)</a> and <a href="https://app.basecamp.com/3945211/projects/47346103" target="_blank" rel="noopener">47346103 (Gov Contracts)</a>. Ali, Ram, Jackie and the CB System and "+ai" twin accounts are excluded as staff or bots.</dd>
      <dt>Active</dt><dd>Posted an update or closed a task in the last ${data.lookbackDays} days. Someone closing tasks without commenting is marked "no comment" rather than hidden, because they are still working.</dd>
      <dt>Percent complete</dt><dd>Closed delivery tasks divided by total delivery tasks. Approval gates are excluded from the denominator, since those are yours to close, not theirs. Projects with fewer than two tasks report "not calculable" rather than a misleading 0 or 100 percent.</dd>
      <dt>Velocity and cadence</dt><dd>Tasks closed, and updates posted, in the last 7 days against the 7 days before that. A zero baseline reports as "new activity" rather than an infinite percentage.</dd>
      <dt>Status</dt><dd><b>Stalled</b> no activity in 14+ days. <b>At Risk</b> quiet 7 to 13 days, or nothing closed in a fortnight. <b>Watch</b> moving but with past-due tasks or a velocity drop over 50 percent. <b>On Track</b> active and closing work. <b>Complete</b> every task closed.</dd>
      <dt>Projected finish</dt><dd>Remaining tasks divided by the completion rate over the last ${data.historyDays} days. Deliberately conservative. Blank where the rate is zero, because "stalled" is the honest answer there.</dd>
      <dt>Sentiment</dt><dd>Read from the actual text of recent updates, not from the metrics. It answers whether the person sounds blocked, confident or quiet, and always shows the reason behind the read.</dd>
      <dt>Questions for you</dt><dd>Found by rule, not by guesswork: a comment from someone other than you carrying a question or blocked-on-you signal, where you have not replied in that thread since. ${data.meta.narrativeMode === 'llm' ? `Each one was then screened by ${esc(data.meta.narrativeModel)} to drop the ones not genuinely yours; ${data.meta.questionsScreenedOut || 0} were screened out.` : 'The language model screen was unavailable on this run, so the list is unscreened and may be slightly noisy.'}</dd>
      <dt>Narrative</dt><dd>${data.meta.narrativeMode === 'llm' ? `Summaries, sentiment and talking points written by ${esc(data.meta.narrativeModel)} from precomputed figures plus raw update text. The model never calculates a number.` : 'Generated deterministically; the language model was unavailable on this run.'}</dd>
      <dt>Data freshness</dt><dd>Live read of the Basecamp API at ${esc(generatedLabel)} Central. ${data.meta.commentCount} comments and ${data.portfolio.taskTotal} tasks across ${data.portfolio.projectsTotal} project lists.</dd>
      <dt>Connectivity</dt><dd>Charts use Chart.js and the timeline uses Mermaid, both loaded from a CDN, so this page needs an internet connection to draw them. Everything else, including all figures and drill-through, works offline. An offline build with both libraries inlined can be produced on request.</dd>
    </dl>
  </div>
  <div class="prevnext"><a class="btn" href="#summary" data-scroll>&larr; Back to the summary</a><a class="btn" href="#decisions" data-scroll>Back to what needs your call &rarr;</a></div>
</div></section>

<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" aria-label="Detail">
  <div class="dhead">
    <div><div class="crumbs" id="drawer-crumbs"></div><h3 id="drawer-title" style="font-size:18px"></h3></div>
    <button class="btn" id="drawer-close" aria-label="Close">✕</button>
  </div>
  <div class="dbody" id="drawer-body"></div>
</aside>

<button id="totop" aria-label="Back to top">↑</button>

<footer><div class="wrap">
  Intern Delivery Command Center &middot; generated ${esc(generatedLabel)} Central from the live Basecamp API.
  Built to the Dynamic Data-Storytelling reference kit (<a href="https://app.basecamp.com/3945211/buckets/7463955/todos/10039770075" target="_blank" rel="noopener">BC todo 10039770075</a>).
  Regenerate with <code>node backend/src/scripts/buildInternDeliveryDashboard.js</code> then <code>node backend/src/scripts/renderInternDeliveryDashboard.js</code>.
</div></footer>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js"></script>
<script>window.DATA=${safeJson(data)};</script>
<script>${CLIENT}</script>
</body></html>`;
}

module.exports = { buildHtml, SECTIONS };
