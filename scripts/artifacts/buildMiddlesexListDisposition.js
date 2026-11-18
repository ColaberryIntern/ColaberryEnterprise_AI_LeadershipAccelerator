/**
 * What happens to the Middlesex Phase 1 Basecamp list as a whole, plus one one-page memo per
 * decision that is Ali's (and Ram's) to make.
 *
 *   NODE_PATH=<repo>/node_modules ARTIFACT_CHROMIUM=<msedge.exe> node scripts/artifacts/buildMiddlesexListDisposition.js
 *
 * Writes docs/MIDDLESEX_LIST_DISPOSITION_2026-11-18.html and .pdf. Exactly four pages: the
 * disposition, then the three memos, each forced onto its own page. If any memo overflows its
 * page the PDF comes out at five and the render throws, so "one page per decision" is enforced.
 *
 * Audience: Ali. The memos recommend; they do not decide. Every ticket id below came from a fresh
 * read-only dump of list 10443345153 on 18 Nov 2026 (22 open), not from the Morning Five, which
 * counted 17.
 *
 * Deliberately absent: the demo URL and the pricing briefing URL (they must not be cross-linked),
 * and the three retired figures.
 */
const fs = require('fs');
const path = require('path');
const { baseCss, esc, SEV, stackBar } = require('./artifactTheme');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const STEM = 'MIDDLESEX_LIST_DISPOSITION_2026-11-18';

// Every open ticket on the list, in exactly one bin. The counts on page 1 are computed from this.
const BINS = [
  { key: 'decide', label: 'Your decision (memos 1-3)', color: '#9b1b30', items: [
    ['10508457955', 'S0. Hosting', 'Memo 1. Due today.'],
    ['10508458205', 'S10. Nick and the price', 'Memo 2: the three subscription points, due Thu 19 Nov.'],
    ['10444638249', 'Repo Jamie was told she would own', 'Memo 3: what you tell Jamie, and when.'],
  ] },
  { key: 'close', label: 'Close with your go', color: '#5b6b7a', items: [
    ['10443345445', 'Sign-off gate on lifecycle and data model',
      'The December plan answers its scope question (billing slice first). Move the sign-off into S2 ("Ali and Ram approve the schema before migrations run") and close.'],
    ['10444638301', 'Park Sage and NetSuite',
      'Record: parked for December; Ram wants Sage later "if time permits". Close.'],
  ] },
  { key: 'session', label: 'Session work, can start now', color: '#2f7d32', items: [
    ['10508458163', 'S8. Re-describe Module 3', 'New description; the price stays with you and William.'],
    ['10508458180', 'S9. Backup-document cascade', 'Inventory the forms on file, find the shared fields, phase it.'],
    ['10519775807', 'Req revisions', 'Design the change-with-history (feeds S2).'],
    ['10444638294', 'Stored materials in the entry design', 'Design only (feeds S2 and S9).'],
    ['10444638264', 'Estimating SOV formats', 'Map the variation from the two workbooks on file.'],
    ['10492351715', 'R6. E-signature and notarization', 'Split answer: our e-signature is a build; portal notarization already works; email notarization is a GC question.'],
    ['10443345232', 'Scanned copies', 'Check the 23 Oct files hold a pencil and a signed final of one req.'],
  ] },
  { key: 'blocked', label: 'Blocked on S0', color: '#b26a00', items: [
    ['10508457987', 'S1. Hosted platform and deploy path', ''],
    ['10508458011', 'S2. Data model and migrations', ''],
    ['10508458068', 'S4. PM entry screen', ''],
    ['10508458096', 'S5. Finalize and export', ''],
    ['10508458119', 'S6. A PM sees only his jobs', ''],
    ['10508458147', 'S7. Dry run against November', ''],
    ['10492351684', 'R4. Intake and reminder ladder', ''],
  ] },
  { key: 'person', label: 'Waiting on a person', color: '#3d5a99', items: [
    ['10508458047', 'S3. Load the pilot jobs', 'Jamie: November AIAs and job list on Mon 23 Nov.'],
    ['10492351725', 'R7. Terry and Chris', 'Jamie forwards the demo link. This is the one ask in the 23rd email.'],
    ['10444638278', 'GC SOV approval as a process change', 'Needs Nick and estimating to agree. Raise it at the Nick meeting.'],
  ] },
];
const total = BINS.reduce((a, b) => a + b.items.length, 0);
if (total !== 22) throw new Error(`bins hold ${total} tickets; the board dump on 18 Nov has 22 open`);

const REDATE = [
  ['10444638249', 'Repo / Jamie', '3 Nov', 'Tue 24 Nov (the call)'],
  ['10508458205', 'S10', '18 Nov', 'The Nick meeting date, once set'],
  ['10444638264', 'Estimating SOV formats', '30 Oct', 'Fri 20 Nov'],
  ['10444638294', 'Stored materials', '4 Nov', 'Fri 20 Nov'],
  ['10443345232', 'Scanned copies', '27 Oct', 'Fri 20 Nov'],
  ['10444638278', 'GC SOV approval', '4 Nov', 'The Nick meeting date'],
  ['10492351725', 'R7. Terry and Chris', '13 Nov', 'Mon 30 Nov'],
];

const chip = (txt, sev) => `<span class="chip" style="background:${SEV[sev]}">${esc(txt)}</span>`;

const css = baseCss() + `
  .id { font-family: Consolas, monospace; font-size: 7.4pt; white-space: nowrap; color:#666; }
  td.bin { font-weight:700; white-space:nowrap; }
  .ask { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0; }
  .ask b { color: var(--cherry-deep); }
  ul { margin:4px 0 8px; padding-left:18px; } li { margin:2px 0; }
  table { font-size: 8.3pt; } td, th { padding-top: 2px; padding-bottom: 2px; }
  .opt td:first-child { white-space:nowrap; font-weight:700; width:24px; }
  h2 { margin-top: 10px; }
`;

// Tickets with no note (the build tickets behind S0) share one row, so page 1 stays one page.
const binRows = BINS.map((b) => {
  const noted = b.items.filter((it) => it[2]);
  const bare = b.items.filter((it) => !it[2]);
  const rows = noted.map((it) => `<td><b>${esc(it[1])}</b> <span class="id">${it[0]}</span>. ${esc(it[2])}</td>`);
  if (bare.length) rows.unshift(`<td>${bare.map((it) => `<b>${esc(it[1])}</b> <span class="id">${it[0]}</span>`).join('; ')}</td>`);
  return rows.map((cell, i) => `<tr>${i === 0 ? `<td class="bin" rowspan="${rows.length}" style="border-left:5px solid ${b.color}">
      ${esc(b.label)}<br><span class="meta">${b.items.length}</span></td>` : ''}${cell}</tr>`).join('');
}).join('');

const page1 = `
<h1>Middlesex Phase 1 list: what happens to it</h1>
<div class="meta">For Ali &middot; Wed 18 Nov 2026 &middot; Basecamp list 10443345153, project 49361096 &middot;
22 open tickets, read from the board this morning (the Morning Five counted 17)</div>
<div class="rule"></div>

<div class="takeaway">
  <div class="label">Recommendation</div>
  <div class="headline">Don't run this list unattended. Only 7 of the 22 can go to a session today; the rest wait
  on your three decisions or on a person. Decide memos 1 to 3 at today's S0 meeting with Ram, and say
  "go" on the board changes below.</div>
</div>

${stackBar({ parts: BINS.map((b) => ({ value: b.items.length, color: b.color, label: b.label })) })}

<table style="margin-top:8px">
  <tr><th>Bin</th><th>Ticket, and what happens to it</th></tr>
  ${binRows}
</table>

<div class="ask">
  <b>Your go covers:</b> closing the 2 tickets above, re-dating the 7 below, and starting the 7
  session tickets (each gets a Basecamp comment when it's done). Nothing changes on the board until
  you say so. <b>Nobody at Middlesex gets an email before Mon 23 Nov.</b>
  <div style="margin-top:5px;font-size:8.4pt">Re-dates: ${REDATE.map((r) =>
    `<b>${esc(r[1])}</b> ${esc(r[2])} &rarr; ${esc(r[3])}`).join(' &middot; ')}</div>
</div>
`;

const memo1 = `
<div class="pagebreak"></div>
<h1>Memo 1. S0: where the pilot is hosted</h1>
<div class="meta">Ali and Ram &middot; ticket 10508457955 &middot; due today, Wed 18 Nov &middot; full brief:
MIDDLESEX_S0_HOSTING_DECISION_2026-11-16 (2 pages, sent 16 Nov)</div>
<div class="rule"></div>
<div class="takeaway"><div class="label">Recommendation</div>
<div class="headline">Render, Pro workspace: the app plus a managed Postgres, about $52.50 a month
($630 a year) on a Colaberry card, in its own repository that Enterprise controls. Decide it today.
Seven tickets are stuck behind it.</div></div>

<h2>The decision</h2>
<p>The December pilot has two project managers and Jamie writing to the same requisition from
three machines. The prototype keeps its state in one browser, so it can't run the pilot. S1 to S7
and R4 can't start until a host is chosen. This is a new paid vendor holding a client's contract
values, so it is yours and Ram's to decide, not a build call.</p>

<h2>Options</h2>
<table>
  <tr><th>Option</th><th>Cost / month</th><th>For</th><th>Against</th><th></th></tr>
  <tr><td><b>A. Render</b> (app + Postgres, Pro)</td><td>$52.50</td>
    <td>One vendor, one bill. Deploys on a git push. 7-day point-in-time restore. SOC 2 Type II.</td>
    <td>A 7-day restore window, so S1 adds a nightly dump kept off Render.</td><td>${chip('Recommended', 'ok')}</td></tr>
  <tr><td><b>B. Fly.io + Neon</b></td><td>similar</td>
    <td>Neon can branch a copy of real data for testing.</td>
    <td>Two vendors and two failure modes for one builder. No SOC 2 below Neon's Scale plan.</td><td>${chip('No', 'watch')}</td></tr>
  <tr><td><b>C. Render Hobby</b></td><td>$27.50</td>
    <td>Saves $25 a month.</td>
    <td>A 3-day restore window. A billing error usually shows up when a GC rejects a line, which
    is often later than that.</td><td>${chip('No', 'watch')}</td></tr>
  <tr><td><b>D. The Hetzner box</b></td><td>$0 extra</td>
    <td>Already paid for.</td>
    <td>The client's contract values would sit next to everything else we run, on a host where two
    deploys have already collided (a Cloudflare 521). It fails any client security review.</td><td>${chip('No', 'bad')}</td></tr>
  <tr><td><b>E. AWS</b></td><td>varies</td>
    <td>The answer to a formal security review.</td>
    <td>Days of setup that 8 December doesn't have. Revisit when a client asks for a review.</td><td>${chip('Later', 'none')}</td></tr>
</table>

<h2>What a yes today unlocks</h2>
<ul>
  <li><b>Thu 19 to Fri 20:</b> S1 (account, repo, deploy on push, a restore run once and timed) and S2 (schema), in parallel.</li>
  <li><b>Mon 23 to Wed 25:</b> S3 and S4 against Jamie's job list. Thanksgiving makes this a three-day week.</li>
  <li><b>Mon 30 Nov to Fri 4 Dec:</b> S5, S6, then S7, the dry run against November.</li>
  <li><b>Tue 8 Dec:</b> the PMs' December run starts.</li>
</ul>

<div class="ask"><b>If it slips past today:</b> nothing gets squeezed out of S7. The fallback already
offered to Jamie stands: build against October's numbers so 8 December holds, and tell her plainly
what the pilot covers.</div>
`;

const memo2 = `
<div class="pagebreak"></div>
<h1>Memo 2. The subscription in William's proposal: three points</h1>
<div class="meta">Ali and Ram &middot; ticket S10, 10508458205 &middot; promised to William for Thu 19 Nov &middot;
the proposal is held until after Fri 20 Nov, and Nick sees it first, in person</div>
<div class="rule"></div>
<div class="takeaway"><div class="label">Recommendation</div>
<div class="headline">Keep the subscription in the proposal, but charge it the way the retainer is
already charged: it starts the month they stop using the spreadsheet, billed monthly or quarterly,
with no money upfront. Price shop drawings in only after you've confirmed what ShopDraw cost them,
and promise takeoff no date until it's built.</div></div>

<p>The 17 Nov proposal adds Ram's "entire platform subscription": $5,000 a month, or $60,000 for
12 months paid upfront, covering billing, shop drawings and takeoff. Options A ($12,000 + $1,500 a
month) and B ($12,000 + $1,750 a month) are unchanged and not in question here.</p>

<h2>1. How the subscription treats ShopDraw</h2>
<table class="opt">
  <tr><td>a</td><td>Count shop drawings as already theirs: the subscription covers support and updates, not a second purchase. <b>Recommended</b>, once step c is done.</td></tr>
  <tr><td>b</td><td>Credit what they paid for ShopDraw against year one.</td></tr>
  <tr><td>c</td><td><b>First, in every case:</b> Ram confirms what was paid and on what terms. Right now the only source is William's "I think", and the retired "already paid" figure came from exactly that kind of guess.</td></tr>
</table>

<h2>2. Committing to takeoff in "3 to 6 months"</h2>
<table class="opt">
  <tr><td>a</td><td>Leave the window in. It's a delivery promise for something not started, with no capacity check behind it.</td></tr>
  <tr><td>b</td><td>Say "takeoff joins the subscription when it goes live", and price the subscription without it until then. That's the same step-up logic as options A and B. <b>Recommended.</b></td></tr>
  <tr><td>c</td><td>Drop takeoff from the subscription until it's scoped.</td></tr>
</table>

<h2>3. $60,000 upfront</h2>
<table class="opt">
  <tr><td>a</td><td>Keep it. The page is headed "Proven first", and December and January are unbilled. Nick will ask why he should pay a year ahead before January has measured anything.</td></tr>
  <tr><td>b</td><td>Same annual price, billed monthly or quarterly, starting the month they stop using the spreadsheet. That's the rule William already accepted on 14 Nov. <b>Recommended.</b></td></tr>
  <tr><td>c</td><td>Offer annual prepay with a discount, but only after the January run closes, when there's a measured result to pay for.</td></tr>
</table>

<div class="ask"><b>The page reads "licensed".</b> That word is memo 3. Jamie hears it from you
before the proposal reaches her or Nick.</div>
`;

const memo3 = `
<div class="pagebreak"></div>
<h1>Memo 3. Who owns the platform, and how Jamie hears it</h1>
<div class="meta">Ali (Ram on the substance) &middot; ticket 10444638249, overdue since 3 Nov &middot; must happen
before William's proposal goes to anyone at Middlesex</div>
<div class="rule"></div>
<div class="takeaway"><div class="label">Recommendation</div>
<div class="headline">Colaberry owns and runs the platform, and Middlesex owns its data. Call Jamie on
Tue 24 Nov, after her AIAs ship, then show the proposal to Nick. Lead with what she no longer has to
do: no repository to hold and no system access to grant.</div></div>

<h2>What changed</h2>
<ul>
  <li><b>26 Oct</b>, to Jamie: build it "within your system", in a repository she ultimately owns.</li>
  <li><b>28 Oct</b>, Ram: one multi-company cloud application for 10+ companies, where Jamie is a user, not an owner.</li>
  <li><b>16 Nov</b>, S0 brief: the product gets its own Colaberry-owned repository.</li>
  <li><b>17 Nov</b>, William's proposal: an annual "licensed" subscription.</li>
</ul>
<p>She has never been told about the change. If she first reads "licensed" in a pricing document,
it looks like a reversal we hid, and the pilot depends on her goodwill.</p>

<h2>What to tell her</h2>
<table class="opt">
  <tr><td>A</td><td><b>Colaberry owns and runs it; Middlesex owns its data.</b> Every requisition exports as Excel and PDF at any time, and she grants no access on her side. <b>Recommended.</b> It matches Ram's direction, the S0 brief and the proposal.</td></tr>
  <tr><td>B</td><td>A, plus a written promise that Middlesex gets the code (an escrow or buyout clause) if Colaberry ever stops supporting it. Hold this back in case she or Nick pushes on lock-in. Offering it is a contract term, so Ram signs off first.</td></tr>
  <tr><td>C</td><td>Keep the 26 Oct promise: a repository Middlesex owns. This conflicts with the multi-company product and with any subscription. Not recommended.</td></tr>
</table>

<h2>When, and how</h2>
<table class="opt">
  <tr><td>1</td><td><b>Phone, Tue 24 Nov.</b> She finishes AIAs Fri 20 Nov and sends them Mon 23 Nov, and Thanksgiving is Thu 26 Nov. A call, not an email: this is news that changes a promise. <b>Recommended.</b></td></tr>
  <tr><td>2</td><td>Fri 20 Nov, before the weekend. She's still finishing AIAs, which is the week we promised to stay out of.</td></tr>
  <tr><td>3</td><td>At the Nick meeting. She would hear it in front of her boss, at the same moment as the price. Not recommended.</td></tr>
</table>

<div class="ask"><b>Sequence:</b> Jamie's call (24 Nov), then Nick in person with the proposal (date
to be set with William), then the proposal goes out in writing. William holds until the call has
happened.</div>
`;

(async () => {
  const html = htmlDoc({ title: 'Middlesex list disposition', css, body: page1 + memo1 + memo2 + memo3 });
  const htmlPath = path.join(DOCS, STEM + '.html');
  fs.writeFileSync(htmlPath, html);
  const r = await renderPdf({ html, outPath: path.join(DOCS, STEM + '.pdf'), maxPages: 4 });
  if (r.pages !== 4) throw new Error(`expected 4 pages (disposition + 3 memos), got ${r.pages}`);
  console.log(`wrote ${htmlPath}\nwrote ${r.outPath}  pages=${r.pages}  bytes=${r.bytes}`);
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
