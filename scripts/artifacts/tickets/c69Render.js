/**
 * C6.9 renderers. All data and all arithmetic come from c69Data; nothing is restated here.
 *
 * The one-pager leads with the verdict, because the ticket asks for a decision and a reader
 * who only sees the first line should get it.
 */
const D = require('./c69Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .lede{font-size:12.5px;line-height:1.5;margin:0 0 10px}
  .grid2{display:grid;grid-template-columns:1.05fr 1fr;gap:14px}
  .verdict{background:#f0fdf4;border-left:4px solid #16a34a;padding:10px 12px;margin:0 0 10px}
  .verdict strong{font-size:13px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:8px 10px;margin:8px 0;
        font-size:11px}
  .num{font-variant-numeric:tabular-nums;font-weight:700}
  .big{font-size:22px;font-weight:800;letter-spacing:-.01em}
  .vs{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;
      text-align:center;margin:8px 0}
  .vs .mid{font-size:11px;color:#64748b;font-weight:700}
  .tick{color:#16a34a;font-weight:700}
  ul{margin:4px 0 8px 16px;padding:0}
  li{margin:3px 0}
`;

/**
 * `full` picks the long detail or the terse one. The one-pager was 185px over a page and
 * this table was the taller column; the document keeps every word.
 */
function evidenceTable(full) {
  return `<table>
    <thead><tr><th>Verified against the repository</th>
      ${full ? '<th>What it means</th>' : ''}</tr></thead>
    <tbody>${D.EVIDENCE.map((e) => `<tr>
      <td><span class="tick">&#10003;</span> ${esc(full ? e.claim : e.short)}</td>
      ${full ? `<td>${esc(e.detail)}</td>` : ''}
    </tr>`).join('')}</tbody></table>`;
}

function schemaTable() {
  return `<table>
    <thead><tr><th>Section</th><th>Needs a source URL + date</th></tr></thead>
    <tbody>${D.SECTIONS.map((s) => `<tr>
      <td>${esc(s.label)}</td>
      <td>${s.sourced ? '<strong>Yes</strong>' : 'No, it is about us'}</td>
    </tr>`).join('')}</tbody></table>`;
}

function triggersTable() {
  return `<table>
    <thead><tr><th>Revisit when</th><th>Threshold</th><th>Why that number</th></tr></thead>
    <tbody>${D.WOULD_CHANGE_THE_ANSWER.map((t) => `<tr>
      <td>${esc(t.trigger)}</td>
      <td class="num">${t.threshold} ${esc(t.unit)}</td>
      <td>${esc(t.why)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function buildVisual() {
  const cost = D.assertCostIsDerived();
  const css = baseCss() + SHARED;
  const body = `
    <h1>C6.9 &middot; Strategic account intelligence: build or do it by hand</h1>

    <div class="verdict"><strong>${esc(D.RECOMMENDATION.verdict)}</strong><br>
    The blocker is not the model, it is the sourcing. Nothing in the backend can find out
    what an account is doing with AI, and the one runtime that could is deny-listed from the
    open internet on purpose.</div>

    <div class="grid2">
      <div>
        <h2>The arithmetic that settles it</h2>
        <div class="vs">
          <div><div class="big">$${cost.all.toFixed(2)}</div>
            <div style="font-size:10px;color:#64748b">of model time for all
            ${D.COST.accounts} briefs</div></div>
          <div class="mid">versus</div>
          <div><div class="big">${cost.hours.toFixed(0)} hours</div>
            <div style="font-size:10px;color:#64748b">of research, at
            ${D.COST.researchMinutesPerAccount} minutes an account</div></div>
        </div>
        <p style="font-size:11px;margin:4px 0 8px">A brief costs about
        ${(cost.per * 100).toFixed(1)} cents to generate. The model is not the cost and
        therefore is not the argument. The research is the cost, and a generator does not
        reduce it, it hides it.</p>

        <h2>Most of it is already done</h2>
        <p style="font-size:11px;margin:4px 0">C6.7 hand-produced a sourced opening for
        ${D.ALREADY_DONE.withASourcedOpening} of these accounts, each with a fact, an http
        source and the date it was read.</p>
        <table><tbody>
          <tr><td>Tier-1 accounts</td><td class="num">${D.ALREADY_DONE.accounts}</td></tr>
          <tr><td>with a named person</td><td class="num">${D.ALREADY_DONE.withAPerson}</td></tr>
          <tr><td>with a verified email</td>
            <td class="num">${D.ALREADY_DONE.withAVerifiedEmail}</td></tr>
          <tr><td><strong>with a sourced opening already written</strong></td>
            <td class="num">${D.ALREADY_DONE.withASourcedOpening}</td></tr>
        </tbody></table>
      </div>
      <div>
        <h2>What was checked, not recalled</h2>
        ${evidenceTable(false)}
        <div class="flag"><strong>Every row is re-checked when this PDF is built.</strong>
        If one stops being true the build fails, rather than the verdict going stale.</div>
      </div>
    </div>

    <h2>Instead of a generator</h2>
    <ul>${D.RECOMMENDATION.instead.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>

    <p style="font-size:10px;color:#64748b;margin-top:6px">Measured against the repository on
    ${esc(D.AS_OF)}. Nothing was built and no account was researched.</p>`;
  return htmlDoc({ title: 'C6.9 - Strategic Account Intelligence Brief Generator', css, body });
}

function buildDocument() {
  const cost = D.assertCostIsDerived();
  const schema = D.assertGateCoversTheSchema();
  const css = baseCss() + SHARED;
  const body = `
    <h1>C6.9 &middot; Strategic account intelligence brief: the recommendation and the gate</h1>
    <p class="lede">The ticket asks a question before it asks for a build: does an
    account-intelligence capability already exist, and if not, does 25 to 40 accounts justify
    a generator. This answers it, and ships the one piece worth having either way.</p>

    <div class="verdict"><strong>${esc(D.RECOMMENDATION.verdict)}</strong></div>

    <h2>Why</h2>
    <ul>${D.RECOMMENDATION.because.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>

    <h2>What was checked</h2>
    <p>Every row is re-checked at build time. A recommendation resting on an audit that was
    true last week is the failure this guards against.</p>
    ${evidenceTable(true)}

    <h2>The arithmetic</h2>
    <p>A brief of roughly ${D.COST.inputTokens.toLocaleString()} input and
    ${D.COST.outputTokens.toLocaleString()} output tokens on gpt-4o, at
    $${D.COST.inputPer1m.toFixed(2)} and $${D.COST.outputPer1m.toFixed(2)} per million,
    costs <strong>$${cost.per.toFixed(3)}</strong>. For ${D.COST.accounts} accounts that is
    <strong>$${cost.all.toFixed(2)}</strong>. The research behind those briefs, at
    ${D.COST.researchMinutesPerAccount} minutes an account, is
    <strong>${cost.hours.toFixed(0)} hours</strong>. Those two numbers are the whole
    argument: automating the cheap half does not touch the expensive half.</p>

    <h2>Instead</h2>
    <ul>${D.RECOMMENDATION.instead.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>

    <h2>The brief schema</h2>
    <p>${schema.sections} sections, ${schema.sourced} of which must carry an http source and
    the date it was read. A section that cannot be filled is recorded as
    <code>{ available: false, reason }</code> rather than omitted, because a brief that
    quietly has six sections instead of seven is one a reviewer cannot distinguish from a
    brief that answered them all.</p>
    ${schemaTable()}

    <h2>The gate</h2>
    <p><code>scripts/artifacts/tickets/c69Guards.js</code> refuses, in order: a section that
    asserts something about the account with no source URL, a source with no date it was
    read, a line with no confidence level, an absent section, a figure about us that is not
    in the C0.6 claim registry, and two briefs whose openings share more than 40 percent of
    their vocabulary. The last one is the template detector: two briefs that could be swapped
    between accounts are not research.</p>
    <p>It works the same whether a person or a model wrote the brief, which is the point. The
    gate is the deliverable; the author is an implementation detail.</p>

    <h2>What would change this answer</h2>
    <p>Stated numerically, so "revisit later" cannot quietly mean "never".</p>
    ${triggersTable()}

    <h2>Limits</h2>
    <ul>
      <li>No tier-2 roster exists, so the ${D.COST.accounts} is the tier-1 list only.</li>
      <li>The ${D.COST.researchMinutesPerAccount}-minute research estimate is a judgment, not
      a measurement. It is the one soft number here and the conclusion is not sensitive to
      it: the verdict holds anywhere from 10 to 60 minutes.</li>
      <li>Nothing was researched and no brief was generated. This is a decision document and
      a gate.</li>
    </ul>

    <h2>What needs your decision</h2>
    <ol>
      <li>Accept the recommendation, or tell me to build the generator anyway.</li>
      <li>If you want automation later, the blocker to clear first is the web-search
      dependency and the deny-list, which is a security-posture decision rather than a
      feature.</li>
    </ol>

    <p style="font-size:10px;color:#64748b;margin-top:12px">
    <strong>REVIEW STATE: BLOCKED - ALI DECISION REQUIRED</strong></p>`;
  return htmlDoc({ title: 'C6.9 - Strategic Account Intelligence Brief Generator', css, body });
}

module.exports = { buildVisual, buildDocument };
