#!/usr/bin/env node
/**
 * C123: render the weekly Open House funnel report from a snapshot.
 *
 *   node render.js <snapshot.json> <out.html> [--shots <dir with lp.png / form.png>]
 *
 * Pure apart from reading the snapshot and screenshots and writing the HTML. buildHtml() is what the tests call.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./lib/page');
const CSS = require('./lib/styles');
const defaultTargets = require('./targets');
const { M, I, X } = P;
const { esc, C } = X;

function section(title, lede, body) {
  return `<section><h2>${title}</h2>${lede ? `<p class="lede">${lede}</p>` : ''}${body}</section>`;
}

function buildHtml(snap, targets = defaultTargets, shots = []) {
  const cur = snap.windows.cur, prev = snap.windows.prev || null;
  const rows = M.funnel(cur, targets), prevRows = prev ? M.funnel(prev, targets) : null;
  const forks = M.forks(cur, snap.email, targets);
  const people = M.people(cur);
  const j = cur.journey, e = cur.engagement;
  const srcGrade = (r) => M.grade('signup', r.signups, r.visitors, targets);

  const hero = `<header class="hero"><div class="wrap"><h1>🎯 Open House Funnel: Weekly Report</h1>
    <div class="sub">From ad click to the first win, every person, every fork. Facebook and Instagram ads → landing page → Open House sign-up → account → welcome video → Quick check.</div>
    <div class="chips"><span class="chip">📅 ${esc(cur.from_ct)} → ${esc(cur.to_ct)} CT (${cur.hours} h)</span>
    <span class="chip">${prev ? `↔️ compared with ${esc(prev.from_ct)} → ${esc(prev.to_ct)}` : '🚀 launch week: no earlier week to compare'}</span>
    <span class="chip">🕒 generated ${esc(snap.generated_ct)} CT</span><span class="chip">🔒 read-only, people not names</span></div></div></header>`;
  const legend = `<div class="legendbar"><span><i style="background:${C.green}"></i>On target</span><span><i style="background:${C.amber}"></i>Watch</span>
    <span><i style="background:${C.red}"></i>Below target</span><span><i style="background:${C.grey}"></i>Too few to judge (under ${targets.minSample} people)</span>
    <span>Targets are starting assumptions in <code>targets.js</code>; reset after four weeks of data.</span></div>`;

  const finds = I.findings(cur, targets);
  const findHtml = finds.length ? `<div class="finds">${finds.map((f) => `<div class="find ${f.tone}"><span class="fx">${f.icon}</span><span>${esc(f.text)}</span></div>`).join('')}</div>` : '<p class="muted">Not enough traffic yet.</p>';

  const body = [
    P.kpiTiles(I.kpis(cur, prev, targets)),
    section('💡 What the data says this week', 'Built from the numbers below, biggest problem first.', findHtml),
    section(`👥 Every person this week: ${people.total}`, `One figure per person, colored by the furthest point they reached. ${people.untracked ? `Includes ${people.untracked} sign-up whose landing page visit was not tracked.` : ''}`, X.peopleGrid(people)),
    section('🔻 The funnel', 'Bar color shows the step against its target. Percentages are of the step before.', `${X.funnelSvg(rows)}<div style="height:14px"></div>${P.funnelTable(rows, prevRows, targets)}`),
    section('🌊 How everyone flowed', 'Every person from ad to Quick check. Band thickness = people.', P.mermaidSankey(M.sankey(cur))),
    section('🌳 The decision tree', 'Every place people choose, with how many went each way and the % of the step before. Green = the path we want.', P.mermaidTree(cur)),
    section('🔀 Left or right: every fork', 'At each choice, the share of people who went each way.', P.forkCards(forks)),
    section('📣 Where they come from', 'Visitors by ad source and device, with each one\'s sign-up rate (pill color = against the sign-up target).',
      `<div class="grid2"><div class="panel"><h3>By ad source</h3>${X.breakdownSvg(cur.by_source, srcGrade)}</div>
       <div class="panel"><h3>By device</h3>${X.breakdownSvg(cur.by_device, srcGrade)}</div></div>`),
    section('📜 On the landing page', `Median visit ${cur.median_visit_s ?? 'n/a'} seconds.`,
      `<div class="grid2"><div class="panel"><h3>How far down they read</h3>${X.scrollSvg(cur.scroll, cur.visitors)}</div>
       <div class="panel"><h3>What they did</h3>${X.donutSvg([
         { label: 'Save my seat', n: e.seat, color: C.green }, { label: 'Start for $0', n: e.start, color: C.teal },
         { label: 'Read and left', n: e.read, color: C.sky }, { label: 'Skimmed and left', n: e.skimmed, color: '#cbd5e0' },
         { label: 'Bounced', n: e.bounced, color: C.red }], String(cur.visitors))}</div></div>`),
    section('🎬 Inside the account', 'How new accounts went in, and where people left the welcome video.',
      `<div class="grid3"><div class="panel"><h3>How they entered</h3>${X.donutSvg([
         { label: 'Access button', n: j.entered_button, color: C.green }, { label: 'Email link', n: j.entered_link, color: C.blue },
         { label: 'Not yet', n: Math.max(0, j.new_account - j.entered), color: '#f6ad55' }], String(j.new_account))}</div>
       <div class="panel"><h3>Where quitters left the video</h3>${j.exits.length ? X.exitSvg(M.exitBins(j.exits)) : '<p class="muted">Nobody has quit partway yet.</p>'}</div>
       <div class="panel"><h3>Timing (median)</h3><div class="stat">${j.median_min_signup_to_enter ?? '—'} min</div><div class="statl">sign-up → in the account</div>
         <div class="stat" style="margin-top:10px">${j.median_min_enter_to_finish ?? '—'} min</div><div class="statl">in the account → finished the video</div>
         <div class="stat" style="margin-top:10px">${j.returned_later}</div><div class="statl">came back on a later day</div></div></div>`),
    section('📅 Day by day', 'Landing page door, by the day of the visit or sign-up (CT).', X.columnsSvg(cur.daily, [
      { key: 'visitors', label: 'Visitors', color: C.sky }, { key: 'signups', label: 'Sign-ups', color: C.blue },
      { key: 'entered', label: 'Entered', color: C.green }, { key: 'finished', label: 'Finished video', color: C.navy }])),
    section('✉️ The welcome email (Mandrill)', 'Opens and clicks are not in our database; they are read from Mandrill and are a floor.', P.emailPanel(snap.email)),
    P.shotsPanel(shots),
    section('🔭 What we cannot see yet', 'Each of these is a next build for this report. Silence here is not zero.',
      `<div class="blind">${I.blindSpots(snap).map((b) => `<div class="bs">${b.icon} <b>${esc(b.what)}</b><br/>${esc(b.why)}<br/><span class="muted">Next: ${esc(b.next)}</span></div>`).join('')}</div>`),
    section('📘 How to read and rerun', '', `<p>Other doors this week: ${cur.signups.training_site} sign-ups came from the training site and are not in the funnel above. Test sign-ups are excluded by address.</p>
      <p>Rerun on the prod host: <code>bash scripts/reports/open-house-weekly/run.sh</code> (last 7 days) or with <code>since=… until=…</code>. Read-only, one rolled-back transaction.</p>`),
  ].join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/><title>Open House Weekly Funnel</title><style>${CSS}</style></head>
<body>${hero}<main class="wrap">${legend}${body}<footer>C123 · Open House weekly funnel · snapshot ${esc(snap.generated_ct)} CT</footer></main>
<script src="${P.MERMAID}"></script>
<script>if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:'base',securityLevel:'loose',themeVariables:{fontFamily:'Segoe UI, Inter, sans-serif',fontSize:'14px',primaryColor:'#bee3f8',lineColor:'#718096'},flowchart:{htmlLabels:true,curve:'basis'},sankey:{nodeAlignment:'left',showValues:true,linkColor:'source',width:1000,height:460}});}</script>
</body></html>`;
}

function loadShots(dir) {
  if (!dir) return [];
  const want = [['lp.png', 'The ad landing page', 'Where every ad click lands. The first fork: Save my seat or Start for $0.'],
    ['form.png', 'The Open House sign-up form', 'Save my seat leads here. Submitting it creates the account.']];
  return want.filter(([f]) => fs.existsSync(path.join(dir, f)))
    .map(([f, title, caption]) => ({ title, caption, src: `data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}` }));
}

if (require.main === module) {
  const [, , inFile, outFile, ...rest] = process.argv;
  if (!inFile || !outFile) { console.error('usage: node render.js <snapshot.json> <out.html> [--shots dir]'); process.exit(2); }
  const i = rest.indexOf('--shots');
  const snap = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  fs.writeFileSync(outFile, buildHtml(snap, defaultTargets, loadShots(i >= 0 ? rest[i + 1] : null)));
  console.log('WROTE', outFile);
}

module.exports = { buildHtml };
