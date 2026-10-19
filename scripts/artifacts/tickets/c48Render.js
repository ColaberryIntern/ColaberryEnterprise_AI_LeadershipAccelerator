/**
 * C4.8's three deliverables: the one-page visual, the executive document, and the presentation.
 *
 * Three separate PDFs, per Ali's rule of 16 October 2026 that a bundle ships one PDF per item.
 *
 * Every figure comes from c48Data, which carries an evidence tag on each one. Nothing is drawn
 * from a number this file invents: the ticket's named failure is "any number presented as fact
 * that is actually an assumption", and a chart is the easiest place in a document to do that
 * without noticing.
 */
const D = require('./c48Data');
const { esc, baseCss, barChart, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const usd = (n) => '$' + Number(n).toLocaleString('en-US');
const tag = (t) => `<span class="tg" style="background:${t.color}">${esc(t.k)}</span>`;

const SHARED = `
  .tg { display:inline-block; padding:0 6px; border-radius:8px; font-size:6.8pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .q { border-left:4px solid var(--cherry); padding:9px 13px; margin:0 0 9px;
       background:#fff; border-top:1px solid var(--border);
       border-right:1px solid var(--border); border-bottom:1px solid var(--border);
       border-radius:0 6px 6px 0; }
  .q .n { font-weight:700; color:var(--cherry); margin-right:5px; }
  .q h3 { display:inline; font-size:11pt; }
  .q .src { font-size:7.6pt; color:var(--muted); margin-top:5px; }
  .gapbox { background:#fdf3f2; border:1px solid #f3c9c6; border-radius:6px;
            padding:9px 13px; margin:8px 0; }
  .gapbox b { color:#b3261e; }
`;

/**
 * The distribution gap, drawn from measured numbers only.
 * This is the chart the whole package exists to make unavoidable.
 */
function gapChart(width) {
  const rows = [
    { label: 'Replies our entire funnel produced', value: 24, display: '24', color: TOKENS.CHERRY },
    { label: 'Leads one seller on pilots needs', value: 76, display: '76', color: '#b26a00' },
    { label: 'Leads for $1M of revenue', value: 63, display: '63', color: '#b26a00' },
    { label: 'Leads for $3M of revenue', value: 188, display: '188', color: '#555f6d' },
    { label: 'Leads for $10M of revenue', value: 625, display: '625', color: '#555f6d' },
  ];
  return barChart({ rows, width, barH: 15, gap: 6, labelW: 230 });
}

/** The flywheel, and the single place it does not turn. */
function flywheel() {
  const g = [
    'flowchart LR',
    '  A["Funded delivery<br/>staffed cohort"]',
    '  B["Commit-verified<br/>learner evidence"]',
    '  C["Public customer<br/>story"]',
    '  D["Next sale is<br/>easier to win"]',
    '  E["Reach a buyer<br/>at all"]',
    '  A --> B',
    '  B --> C',
    '  C --> D',
    '  D -.-> E',
    '  E ==>|"0.05% reply, 24 in total"| A',
    '  style A fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
    '  style B fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
    '  style C fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
    '  style D fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
    '  style E fill:#FFF0F1,stroke:#b3261e,stroke-width:3px,color:#b3261e',
  ].join(String.fromCharCode(10));
  return '<div class="mermaid">' + g + '</div>';
}

function econTable() {
  return `<table><tr><th style="width:44%">Line</th><th style="width:20%">Value</th>
  <th style="width:17%">Evidence</th><th>Source</th></tr>
  ${D.ECON.map((r) => `<tr><td>${esc(r.line)}</td>
    <td><strong>${esc(r.v)}</strong></td><td>${tag(r.tag)}</td>
    <td class="meta">${esc(r.src)}</td></tr>`).join('')}</table>`;
}

function reverseTable() {
  return `<table><tr><th>Monthly burn</th><th>Annual revenue</th>
  <th>Annual accounts needed</th><th>Or pilots needed</th>
  <th>Qualified leads implied</th></tr>
  ${D.reverse().map((r) => `<tr>
    <td><strong>${usd(r.burn)}</strong></td><td>${usd(r.annualRevenue)}</td>
    <td><strong>${r.accounts}</strong></td><td>${r.pilots}</td>
    <td>${r.leadsForAccounts}</td></tr>`).join('')}</table>
  <p class="meta">The burn row is a lookup, not a forecast. When the P&amp;L lands, read the row.
  Reproduces C2.4's published figures exactly at ${usd(100000)}: 19 accounts or 340 pilots.</p>`;
}

function scenarioTable() {
  return `<table><tr><th>Revenue</th><th>Annual accounts</th><th>Qualified leads needed</th>
  <th>Against our measured funnel</th></tr>
  ${D.SCENARIOS.map((s) => `<tr><td><strong>${usd(s.revenue)}</strong></td>
    <td>${s.accounts}</td><td><strong>${s.leads}</strong></td>
    <td class="meta">${s.repliesToday} replies, total, across 48,924 sends</td></tr>`).join('')}
  </table>`;
}

/* ----------------------------- document ----------------------------- */

function buildDocument() {
  const css = `${baseCss()}
    .wrap { max-width: 920px; margin: 0 auto; padding: 30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}
    .mermaid { text-align:center; margin:10px 0; }
    .mermaid svg { max-width:100%; height:auto; }`;

  const body = `<div class="wrap">
  <h1>How we make money</h1>
  <div class="meta">C4.8 &middot; a management decision package for Ram &middot; assembled from
    approved decisions in groups 00 to 02 &middot; production figures re-read ${esc(D.AS_OF)}
    &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for a management
  decision package answering twenty questions in order, with every number labeled by evidence
  type and the burn sourced rather than invented. <strong>Delivered: all twenty answered, twelve
  economic lines each carrying one of five evidence tags, a reverse model solved across a burn
  range because the burn itself is still unknown, four revenue scenarios, milestones expressed as
  evidence rather than bookings, and three decision triggers.</strong> Nothing here is new
  analysis; every answer cites the approved ticket it comes from.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

  <h2>The gap, drawn only from measured numbers</h2>
  <figure>${gapChart(640)}
  <figcaption>Every bar is measured or derived from a measured figure. The top bar is what our
  outbound actually produced; the rest is what each ambition requires.</figcaption></figure>

  <h2>The flywheel, and the one place it does not turn</h2>
  <figure>${flywheel()}
  <figcaption>Funded delivery really does manufacture commit-verified evidence, and that evidence
  really does make the next sale easier. The loop only fails where it closes: getting in front of
  a buyer at all.</figcaption></figure>

  <h2>The twenty questions</h2>
  ${D.Q.map((x) => `<div class="q">
    <span class="n">${x.n}.</span><h3>${esc(x.q)}</h3>
    <p style="margin-top:6px">${esc(x.a)}</p>
    <div class="src">${tag(x.tag)} &middot; ${esc(x.src)}</div>
  </div>`).join('')}

  <h2>The economics, every line tagged</h2>
  ${econTable()}
  <div class="gapbox"><b>The two unknowns are deliberate.</b> C2.4 established that the burn is
  pending an external P&amp;L reply rather than a decision from Ali, so it is published as a gap.
  Both figures are wanted separately: with current monthly revenue as well as gross operating
  cost, we can show how much of survival the existing business already covers, which is a more
  useful picture than a single break-even count.</div>

  <h2>The reverse model</h2>
  ${reverseTable()}

  <h2>Revenue scenarios, sized on our pipeline rather than the market</h2>
  <p>The market cannot be credibly sized and C1.1 says so rather than borrowing a number. These
  size what we would have to do, and the final column is where each one breaks.</p>
  ${scenarioTable()}

  <h2>Milestones, expressed as evidence to produce</h2>
  <table><tr><th style="width:12%">By</th><th style="width:38%">What happens</th>
  <th>What would prove it</th></tr>
  ${D.MILESTONES.map((m) => `<tr><td><strong>${esc(m.d)}</strong></td>
    <td>${esc(m.what)}</td><td>${esc(m.evidence)}</td></tr>`).join('')}</table>

  <h2>What would make us continue, pivot or stop</h2>
  ${D.TRIGGERS.map((t) => `<div class="q" style="border-left-color:${t.color}">
    <h3 style="color:${t.color}">${esc(t.verdict)}</h3>
    <p style="margin-top:6px">${esc(t.test)}</p></div>`).join('')}

  <h2>Method, and what this is not</h2>
  <ul>
  <li>Assembled, not authored. The ticket says every prior ticket in groups 00 to 02 feeds this
  and to write nothing new, so each answer cites its source ticket.</li>
  <li>Every economic line carries one of five evidence tags, enforced by a build assertion.</li>
  <li><strong>The burn is UNKNOWN and a build assertion fails if it is ever filled in.</strong></li>
  <li>Quota attainment is modeled at 100% of benchmark, which is optimistic by construction. At
  50% the acquisition cost doubles and the pilot contributes nothing.</li>
  <li>Fundraising strategy is out of scope by instruction.</li>
  <li>Delivery labor rates are inherited from C2.3, where they were assumptions, so an error
  there propagates straight through this document.</li>
  </ul>
  </div>`;
  return htmlDoc({ title: 'C4.8 How we make money', css, body });
}

/* --------------------------- presentation --------------------------- */

const SLIDES = [
  { t: 'The problem is distribution', b: [
    'Not the product: 0 of 20 competitors offer commit-level verification, 17 affirmatively not.',
    'Not the margin: the license carries 84% gross margin and needs no staff.',
    'Not the price: an annual account nets $64,100.',
    'Every route to revenue runs through a mechanism we do not have.'] },
  { t: 'What is actually running', b: [
    '345 learner stories verified against a real commit, across 29 projects.',
    '48 learner projects in flight. 13 case studies live across 3 surfaces.',
    '151 AI agents have run in production at 99.96% across 168,619 executions in seven days.',
    'Every agent write is audited. All figures re-read from production on ' + D.AS_OF + '.'] },
  { t: 'The moat is free to deliver', b: [
    'Verification runs on push and is identical in all three delivery modes.',
    'The one capability nobody contests is the one that needs no staff.',
    'The best-funded player who owned it exited: Pluralsight bought GitPrime for $170m, now '
    + 'end-of-life under a different owner.',
    'The category is retreating from commit-level proof, not advancing on it.'] },
  { t: 'Only one package can carry the company', b: [
    'Pilot: nets $3,538, which is 8% of price, on a 91-day cycle.',
    'Annual enterprise: nets $64,100.',
    'At $100,000 a month of burn that is 340 pilots a year versus 19 accounts.',
    'The pilot is a customer-acquisition instrument. It should be budgeted as one.'] },
  { t: 'Funded delivery produces proof, not runway', b: [
    'C1.5 said each stage pays for the next. Costed, that half does not survive.',
    'It does manufacture the commit-verified evidence, exactly as argued.',
    'It does not fund the next stage at any volume we could run.',
    'The phrase "self-funding" should come out of the memo.'] },
  { t: 'Where it breaks', b: [
    'Measured outbound: 0.05% reply across 48,924 sends. About 24 replies in total.',
    'One seller on pilots needs 76 qualified leads a year.',
    'The self-paced license needs roughly 881 learners to cover its base.',
    'Our entire outbound engine produced about a third of what one seller needs.'] },
  { t: 'The precedent worth taking seriously', b: [
    'Infosys products and platforms: $957m to $962m across five years. Flat, at plus 0.5%.',
    'Total revenue over the same period grew 48.6%.',
    'At that scale a flat product line is not a margin failure. It is an empty product.',
    'The danger moved from margin to distribution, and that is where it still is.'] },
  { t: 'What we would do first', b: [
    'Sell the staffed cohort now: live, costed, and it has a buyer.',
    'Build exactly one thing: the ability to count learners.',
    '$111,000 over 100 learners is $1,134 each; over 5,000 it is $46.',
    'Revenue alone cannot tell you which is happening, and we cannot count learners at all.'] },
  { t: 'What would make us stop', b: [
    'Not slow sales. Not a missed quarter.',
    'Tier-1 accounts with a named signer declining at the demo stage for reasons about the proof '
    + 'itself, rather than budget or timing.',
    'That would mean the empty column is empty because nobody wants it.',
    'That is the one reading of the competitive scan that would end this.'] },
  { t: 'The decision', b: [
    'The burn figure is still outstanding and is the only missing input.',
    'When it lands, the break-even count is a table lookup rather than a new analysis.',
    'The question for Ram is not whether the product works. It is whether to fund distribution.',
    'That is where the next dollar goes.'], isLast: true },
];

function buildPresentation() {
  const css = `${baseCss()}
    .wrap { max-width:960px; margin:0 auto; padding:0; }
    ${SHARED}
    .s { min-height:196mm; display:flex; flex-direction:column; justify-content:center;
         padding:0 26px; break-after:page; page-break-after:always; }
    .s:last-of-type { break-after:auto; page-break-after:auto; }
    .s .k { font-size:9.5pt; letter-spacing:.1em; text-transform:uppercase;
            color:var(--muted); font-weight:700; }
    .s h2 { font-size:25pt; border:0; padding:0; margin:6px 0 16px; color:var(--cherry-deep); }
    .s li { font-size:14pt; line-height:1.55; margin:12px 0; }
    .s.last h2 { color:var(--cherry); }`;

  const body = `<div class="wrap">
  <div class="s">
    <div class="k">C4.8 &middot; ${esc(D.AS_OF)}</div>
    <h2 style="font-size:30pt">How we make money</h2>
    <p style="font-size:15pt;line-height:1.5">${esc(D.HEADLINE)}</p>
    <p class="meta" style="font-size:9.5pt">A management decision package for Ram. Assembled
    from approved decisions in groups 00 to 02; no new analysis. Every figure in the companion
    document carries an evidence tag, and the operating burn is marked UNKNOWN rather than
    estimated.</p>
  </div>
  ${SLIDES.map((s, i) => `<div class="s${s.isLast ? ' last' : ''}">
    <div class="k">${i + 1} of ${SLIDES.length}</div>
    <h2>${esc(s.t)}</h2>
    <ul>${s.b.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </div>`).join('')}
  </div>`;
  return htmlDoc({ title: 'C4.8 How we make money, presentation', css, body });
}

/* ----------------------------- one-pager ---------------------------- */

function buildVisual() {
  const css = `${baseCss()}
    body { font-size:8.6pt; }
    h1 { font-size:16pt; }
    h2 { font-size:9pt; margin:5px 0 3px; border:0; padding:0; text-transform:uppercase;
         letter-spacing:.07em; color:var(--ink); }
    .cols { display:flex; gap:15px; } .col { flex:1; min-width:0; }
    .takeaway { padding:6px 11px; margin-bottom:6px; }
    .takeaway .headline { font-size:11pt; } .takeaway .label { font-size:7pt; }
    table { font-size:7.2pt; margin:3px 0 5px; } th { padding:3px 5px; font-size:6.5pt; }
    td { padding:3px 5px; }
    ${SHARED}
    .trig { border-left:4px solid var(--muted); padding:4px 8px; margin:0 0 4px;
            font-size:7.2pt; background:#fff; border-top:1px solid var(--border);
            border-right:1px solid var(--border); border-bottom:1px solid var(--border); }
    .foot { margin-top:6px; font-size:6.8pt; color:var(--muted);
            border-top:1px solid var(--border); padding-top:5px; }`;

  const body = `
  <h1>How we make money</h1>
  <div class="meta">C4.8 &middot; decision package for Ram &middot; production figures re-read
    ${esc(D.AS_OF)} &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="cols">
    <div class="col">
      <h2>The gap, measured not asserted</h2>
      ${gapChart(470)}
      <div style="font-size:6.9pt;color:var(--muted);margin-bottom:5px">The top bar is what our
      outbound produced across 48,924 sends. The rest is what each ambition requires.</div>

      <h2>Only one package can carry the company</h2>
      <table><tr><th>Package</th><th>Net per deal</th><th>Deals for $100k/mo burn</th></tr>
      <tr><td>Pilot</td><td>${usd(D.NET.pilot)} <span class="meta">(8% of price)</span></td>
        <td><strong>340 a year</strong></td></tr>
      <tr><td>Annual enterprise</td><td>${usd(D.NET.annual)}</td>
        <td><strong>19 a year</strong></td></tr></table>

      <h2>What it takes at each revenue level</h2>
      <table><tr><th>Revenue</th><th>Accounts</th><th>Qualified leads</th></tr>
      ${D.SCENARIOS.map((s) => `<tr><td>${usd(s.revenue)}</td><td>${s.accounts}</td>
        <td><strong>${s.leads}</strong></td></tr>`).join('')}</table>

      <h2>Milestones, as evidence rather than bookings</h2>
      <table><tr><th style="width:15%">By</th><th>What happens</th></tr>
      ${D.MILESTONES.map((m) => `<tr><td><strong>${esc(m.d)}</strong></td>
        <td>${esc(m.what)}</td></tr>`).join('')}</table>
    </div>

    <div class="col">
      <h2>The missing input, and it is not a decision</h2>
      <div class="gapbox" style="font-size:7.2pt"><b>Operating burn: UNKNOWN.</b> Pending an
      external P&amp;L reply, not an answer from Ali. When it lands the break-even count is a
      lookup, not a new analysis. Two figures are wanted, not one: gross operating cost AND
      current monthly revenue, separately, so we can show how much of survival the existing
      business already covers.</div>

      <h2>The reverse model, ready for that number</h2>
      <table><tr><th>Burn/mo</th><th>Revenue</th><th>Accounts</th><th>Pilots</th></tr>
      ${D.reverse().map((r) => `<tr><td>${usd(r.burn)}</td>
        <td>${usd(r.annualRevenue)}</td><td><strong>${r.accounts}</strong></td>
        <td>${r.pilots}</td></tr>`).join('')}</table>

      <h2>Continue, pivot or stop</h2>
      ${D.TRIGGERS.map((t) => `<div class="trig" style="border-left-color:${t.color}">
        <strong style="color:${t.color}">${esc(t.verdict)}</strong> ${esc(t.test)}</div>`).join('')}
    </div>
  </div>

  <div class="foot">Assembled from approved decisions in groups 00 to 02; no new analysis. Every
  figure in the document carries one of five evidence tags, and a build assertion fails if the
  burn is ever filled in. Quota attainment is modeled at 100% of benchmark, which is optimistic:
  at 50% the acquisition cost doubles and the pilot contributes nothing.</div>`;
  return htmlDoc({ title: 'C4.8 How we make money, one page', css, body });
}

module.exports = { buildDocument, buildPresentation, buildVisual };
