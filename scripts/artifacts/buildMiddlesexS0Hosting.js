/**
 * S0 decision brief for the Middlesex Glass AIA pilot: where the platform is hosted.
 *
 *   NODE_PATH=<repo>/node_modules ARTIFACT_CHROMIUM=<msedge.exe> node scripts/artifacts/buildMiddlesexS0Hosting.js
 *
 * Writes docs/MIDDLESEX_S0_HOSTING_DECISION_2026-11-16.html and .pdf (at most two pages).
 *
 * Audience: Ali and Ram. S0 is escalate-tier: it adds a new paid vendor and decides where a
 * client's contract values live, so it is theirs to make. The brief recommends, it does not decide.
 *
 * Every price below was read from the vendor's own pricing page on 16 Nov 2026 and is in DATA,
 * so the text and the cost table cannot disagree with each other. Re-read the page before you
 * change a number; aggregator sites disagreed with the vendors when this was written.
 */
const fs = require('fs');
const path = require('path');
const { baseCss, esc, SEV } = require('./artifactTheme');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const STEM = 'MIDDLESEX_S0_HOSTING_DECISION_2026-11-16';

const DATA = {
  readOn: '16 Nov 2026',
  render: {
    workspacePro: 25,          // Pro workspace: 7-day point-in-time restore, SOC 2 Type II
    web: 7,                    // 0.5 CPU / 512 MB web service
    webUp: 25,                 // 1 CPU / 2 GB, if server-side PDF rendering is ever added
    pg: 19,                    // Postgres 0.5 CPU / 1 GB, 100 connections
    pgGb: 0.30,                // per GB-month of Postgres storage
    gb: 5,                     // provisioned storage; the pilot is a few hundred lines
    pitrHobby: 3, pitrPro: 7,  // days
  },
};
const R = DATA.render;
const monthly = R.workspacePro + R.web + R.pg + R.pgGb * R.gb;
const hobbyMonthly = R.web + R.pg + R.pgGb * R.gb;
const money = (n) => '$' + (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0);

const chip = (txt, sev) => `<span class="chip" style="background:${SEV[sev]}">${esc(txt)}</span>`;

const css = baseCss() + `
  .two { display:flex; gap:14px; } .two > div { flex:1; }
  td.r, th.r { text-align:right; white-space:nowrap; }
  .tl td:first-child { white-space:nowrap; font-weight:700; width:92px; }
  .ask { border:2px solid var(--cherry); border-radius:6px; padding:10px 12px; margin:12px 0; }
  .ask b { color: var(--cherry-deep); }
  ul { margin:4px 0 8px; padding-left:18px; } li { margin:2px 0; }
`;

const body = `
<h1>S0: where the Middlesex pilot is hosted</h1>
<div class="meta">Decision brief for Ali and Ram &middot; 16 Nov 2026 &middot; Basecamp S0, due Wed 18 Nov &middot;
Middlesex Glass AIA billing, project 49361096</div>
<div class="rule"></div>

<div class="takeaway">
  <div class="label">Recommendation</div>
  <div class="headline">Host the pilot on Render: one vendor for the app and a managed Postgres, Pro
  workspace, US East. About ${money(monthly)} a month (${money(monthly * 12)} a year), billed to
  Colaberry. Build it in a new Colaberry-owned repository, not in the Accelerator repo. Decide by
  Wednesday 18 November. Every day after that comes out of the November dry run (S7).</div>
</div>

<h2>Why this has to be decided now, and why not the box we already have</h2>
<p>The December pilot has two project managers and Jamie writing to the same requisition from three
machines. Today's prototype is one HTML file that keeps its state in the browser, so it cannot run
the pilot no matter how good it looks. A shared database and a hosted app are December
dependencies, not January ones, and nothing from S1 to S7 can start until S0 is settled.</p>
<p><b>Not the Hetzner server.</b> That box runs the Accelerator, every agent, and a Postgres cluster
holding everything else we have. A client's contract values would sit beside all of it. Two deploys
there have already raced into a Cloudflare 521, and a client security review would have to answer
for a shared host. A managed platform gives the pilot its own database, its own backups and its own
deploys.</p>

<h2>The options</h2>
<table>
  <tr><th>Option</th><th>For</th><th>Against</th><th></th></tr>
  <tr><td><b>Render</b><br>app + Postgres</td>
    <td>One vendor, one bill, one login. Deploys from a git push. Postgres has point-in-time restore
    on every paid plan. SOC 2 Type II on all tiers.</td>
    <td>The restore window is ${R.pitrPro} days on Pro, not 30. That is covered by a nightly dump
    kept outside Render (part of S1).</td>
    <td>${chip('Recommended', 'ok')}</td></tr>
  <tr><td><b>Fly.io + Neon</b></td>
    <td>Neon's database branching is good for testing against copies of real data.</td>
    <td>Two vendors, two bills, two failure modes, for a pilot with one builder. Neon's own pricing
    table marks SOC 2 as unavailable below its Scale plan.</td>
    <td>${chip('No', 'watch')}</td></tr>
  <tr><td><b>Railway</b></td>
    <td>Similar developer experience to Render, at a similar price.</td>
    <td>Backups and restore are on Pro only, and public sources contradict each other on its SOC 2
    status. Not worth resolving that inside a three-week build.</td>
    <td>${chip('No', 'watch')}</td></tr>
  <tr><td><b>AWS</b></td>
    <td>The answer to a formal client security review.</td>
    <td>Days of setup that the 8 December date does not have. Revisit when a client first asks for
    a review.</td>
    <td>${chip('Later', 'none')}</td></tr>
</table>

<div class="two">
<div>
<h2>What Ram is approving</h2>
<table>
  <tr><th>Line</th><th class="r">Per month</th></tr>
  <tr><td>Render Pro workspace (${R.pitrPro}-day restore)</td><td class="r">${money(R.workspacePro)}</td></tr>
  <tr><td>Web service, 0.5 CPU / 512 MB</td><td class="r">${money(R.web)}</td></tr>
  <tr><td>Postgres, 0.5 CPU / 1 GB</td><td class="r">${money(R.pg)}</td></tr>
  <tr><td>Storage, ${R.gb} GB at ${money(R.pgGb)}</td><td class="r">${money(R.pgGb * R.gb)}</td></tr>
  <tr><td><b>Total</b></td><td class="r"><b>${money(monthly)}</b></td></tr>
</table>
<p class="meta">Prices read from render.com/pricing on ${DATA.readOn}. The free Hobby workspace
would make this ${money(hobbyMonthly)} a month, but its restore window is ${R.pitrHobby} days.
A billing mistake usually surfaces when a general contractor rejects a line, which is often more
than three days later. The account is Colaberry's, on a company card, and not tied to any one
person.</p>
</div>
<div>
<h2>A new repository, and why</h2>
<p>The schema has tenants in it from the first migration, so this is a product that Middlesex
uses, not a Middlesex project. Keeping it out of the Accelerator repo means:</p>
<ul>
  <li>its deploys don't queue behind the dozens of other workstreams merging into that repo;</li>
  <li>a client security review covers one small codebase, not ours;</li>
  <li>Render deploys it on push, with no Hetzner deploy script involved.</li>
</ul>
<p>Colaberry owns it. <b>This is the reframe still owed to Jamie</b> (she was told on 26 Oct that
she would own a repo). She should hear it from Ali, separately from any pricing talk, before she
finds out any other way.</p>
</div>
</div>

<h2>What a yes on Wednesday unlocks, against the real calendar</h2>
<table class="tl">
  <tr><td>Wed 18 Nov</td><td><b>S0 decided.</b> Ali and Ram.</td></tr>
  <tr><td>Thu 19 - Fri 20</td><td><b>S1</b>: account, repo, deploy on push, and a restore actually tested
    (one done-condition, not a checkbox). <b>S2</b>: schema and migrations, in parallel.</td></tr>
  <tr><td>Mon 23 - Wed 25</td><td><b>S3/S4</b>: pilot jobs loaded and the PM entry screen.
    <b>Thanksgiving is Thursday 26 Nov</b>, so this is a three-day week, and the board's due date of
    Sat 28 Nov really means Wednesday. S3 also needs Jamie's job list, asked for by the 24th.</td></tr>
  <tr><td>Mon 30 - Thu 3 Dec</td><td><b>S5</b>: finalize and export (G702/G703). <b>S6</b>: a PM sees
    only his own jobs.</td></tr>
  <tr><td>Fri 4 Dec</td><td><b>S7</b>: November's requisitions through the platform, tied line by line
    to what was actually sent. This is the last gate.</td></tr>
  <tr><td>Tue 8 Dec</td><td>The PMs' December run starts. (8 December is a Tuesday. An earlier note
    called it Monday; the date is the one that was sent to Jamie.)</td></tr>
</table>

<div class="ask">
  <b>If S0 slips past Wednesday</b>, nothing gets compressed into S7. The dry run against November is
  what protects the client relationship. The fallback is the one already offered to Jamie on 16 Nov:
  build against October's numbers, so the 8 December start holds, and tell her plainly what the
  pilot will and won't cover.
</div>
`;

(async () => {
  const html = htmlDoc({ title: 'S0 hosting decision', css, body });
  const htmlPath = path.join(DOCS, STEM + '.html');
  fs.writeFileSync(htmlPath, html);
  const r = await renderPdf({ html, outPath: path.join(DOCS, STEM + '.pdf'), maxPages: 2 });
  console.log(`wrote ${htmlPath}\nwrote ${r.outPath}  pages=${r.pages}  bytes=${r.bytes}`);
  console.log(`monthly=${money(monthly)} yearly=${money(monthly * 12)} hobby=${money(hobbyMonthly)}`);
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
