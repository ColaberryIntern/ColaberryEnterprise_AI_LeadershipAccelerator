/**
 * C7.8 and C7.9 renderers. All data comes from c78c79Data; nothing is restated here.
 *
 * Four PDFs, two per ticket, and each has a reason to exist:
 *
 *   C78_1  the client one-pager itself. This is the deliverable, so it is laid out as a
 *          document a buyer receives rather than as an internal visual.
 *   C78_2  the traceability sheet: every line against the C7.7 finding behind it. That is
 *          the acceptance criterion ("every line traces to C7.7") made checkable by a
 *          reader rather than only by the build.
 *   C79_1  the procurement answers at a glance, with the subprocessor list.
 *   C79_2  the full FAQ and the buyer checklist, which is the thing a buyer uses directly.
 */
const D = require('./c78c79Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .lede{font-size:12px;line-height:1.5;margin:0 0 10px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:8px 10px;margin:8px 0;
        font-size:11px}
  .ok{background:#f0fdf4;border-left:3px solid #16a34a;padding:8px 10px;margin:8px 0;
      font-size:11px}
  .st{display:inline-block;padding:1px 6px;border-radius:9px;font-size:9px;font-weight:700;
      color:#fff;white-space:nowrap}
  .st-held{background:#16a34a}
  .st-partial{background:#b45309}
  .st-not{background:#b3261e}
  .st-na{background:#64748b}
  .ref{font-size:9px;color:#64748b;font-variant-numeric:tabular-nums}
  .caveat{font-size:10px;color:#b45309}
  ul{margin:4px 0 8px 16px;padding:0}
  li{margin:3px 0}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
`;

const stateChip = (s) => {
  const k = s === 'HELD' ? 'held' : s === 'PARTIAL' ? 'partial'
    : s === 'NOT APPLICABLE' ? 'na' : 'not';
  return `<span class="st st-${k}">${esc(s)}</span>`;
};

/* ── C7.8 ─────────────────────────────────────────────────────────────────── */

function buildC78OnePager() {
  const css = baseCss() + SHARED;
  const body = `
    <h1>Security and compliance: where we actually stand</h1>
    <p class="lede">Colaberry Enterprise AI &middot; current state as of ${esc(D.AS_OF)}.
    Every statement on this page comes from an internal assessment of the running system,
    not from a questionnaire.</p>

    <h2>What we hold</h2>
    <p style="font-size:11.5px;margin:4px 0 8px"><strong>No certifications.</strong> We would
    rather you learn that here than in week six of a procurement review.</p>
    <table><tbody>${D.HOLD_NOTHING.map((c) => `<tr>
      <td style="width:30%"><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.state)}</td>
    </tr>`).join('')}</tbody></table>

    <h2>What is genuinely in place</h2>
    <ul>${D.STRONG.map((s) => `<li>${esc(s.line)}${s.caveat
    ? ` <span class="caveat">${esc(s.caveat)}</span>` : ''}</li>`).join('')}</ul>

    <h2>What is not, and you should ask about</h2>
    ${D.CRITICAL_DISCLOSURES.map((d) => `<div class="flag">
      <strong>${esc(d.buyerQuestion)}</strong><br>${esc(d.answer)}</div>`).join('')}

    <h2>Where that leaves a pilot</h2>
    <p style="font-size:11.5px">${esc(D.POSITION)}</p>

    <p style="font-size:10px;color:#64748b;margin-top:10px">This page is reissued whenever
    the underlying assessment changes. Ask for the dated version before relying on it.</p>`;
  return htmlDoc({ title: 'Security and compliance: current state', css, body });
}

function buildC78Traceability() {
  const trace = D.assertEveryLineTracesToC77();
  const byId = new Map(D.C77.GAPS.map((g) => [g.id, g]));
  const rows = [
    ...D.STRONG.map((s) => ['In place', s.line, s.from]),
    ...D.CRITICAL_DISCLOSURES.map((d) => ['Disclosed', d.buyerQuestion, d.from]),
    ...D.HOLD_NOTHING.map((c) => ['Certification', c.name, c.from]),
  ];
  const css = baseCss() + SHARED;
  const body = `
    <h1>C7.8 &middot; Traceability: every line against the assessment</h1>
    <p class="lede">The acceptance criterion is "every line traces to C7.7". This is that
    check, readable. ${trace.lines} lines carry ${trace.refs} references against
    ${trace.available} available findings, and the build refuses a line that cites nothing
    or cites an id that does not exist.</p>

    <table>
      <thead><tr><th>Section</th><th>Line on the one-pager</th><th>C7.7 finding</th></tr></thead>
      <tbody>${rows.map(([section, line, from]) => `<tr>
        <td>${esc(section)}</td>
        <td>${esc(line)}</td>
        <td class="ref">${from.map((f) => {
    const g = byId.get(f);
    return g ? `<strong>${esc(f)}</strong> ${esc(String(g.sev.k || g.sev))}: ${esc(g.gap)}`
      : esc(f);
  }).join('<br>')}</td>
      </tr>`).join('')}</tbody>
    </table>

    <h2>Why this sheet exists separately</h2>
    <p>The one-pager goes to a buyer. This does not. It is how we check, before sending,
    that nothing on that page is something we talked ourselves into. The build enforces the
    same rule, but a build failure is only visible to whoever ran it.</p>

    <p style="font-size:10px;color:#64748b;margin-top:12px">
    <strong>REVIEW STATE: BLOCKED - ALI DECISION REQUIRED</strong></p>`;
  return htmlDoc({ title: 'C7.8 - Security One-Pager Traceability', css, body });
}

/* ── C7.9 ─────────────────────────────────────────────────────────────────── */

/**
 * `full` picks the full statement or the terse one. The visual was 59px over a page and
 * this table was the taller column; the buyer-facing document keeps every word, because
 * "what it receives" is the sentence a procurement reader is actually there for.
 */
function subprocessorTable(full) {
  return `<table>
    <thead><tr><th>Processor</th><th>Live</th><th>What it receives</th></tr></thead>
    <tbody>${D.SUBPROCESSORS.map((s) => `<tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${s.live ? '<span class="st st-held">YES</span>' : '<span class="st st-na">NO</span>'}</td>
      <td>${esc(full ? s.purpose : s.short)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function faqTable(full) {
  return `<table>
    <thead><tr><th>Question</th><th>State</th>${full ? '<th>Answer</th>' : ''}</tr></thead>
    <tbody>${D.FAQ.map((f) => `<tr>
      <td>${esc(f.q)}</td>
      <td>${stateChip(f.state)}</td>
      ${full ? `<td>${esc(f.a)} <span class="ref">[${f.from.map(esc).join(', ')}]</span></td>` : ''}
    </tr>`).join('')}</tbody></table>`;
}

function buildC79Visual() {
  const sub = D.assertSubprocessorsAreDisclosedHonestly();
  const notYet = D.FAQ.filter((f) => f.state === 'NOT YET').length;
  const css = baseCss() + SHARED;
  const body = `
    <h1>C7.9 &middot; Procurement answers, and who else touches the data</h1>
    <p class="lede"><strong>${notYet} of the ${D.FAQ.length} standard procurement questions
    are answered "not yet".</strong> That is the honest shape of a small team with a real
    audit trail and no certifications, and marking them is the point of this document.</p>

    <div class="two">
      <div>
        <h2>The questions, and where we stand</h2>
        ${faqTable(false)}
      </div>
      <div>
        <h2>Subprocessors, read from production</h2>
        ${subprocessorTable(false)}
        <div class="ok"><strong>${sub.live} live of ${sub.total} listed.</strong> Read on
        ${esc(D.AS_OF)} by checking which credentials are configured in the running system,
        presence only, never a value. This closes C7.7's gap G10, which was the absence of
        any subprocessor list at all.</div>
      </div>
    </div>

    <div class="flag"><strong>Anthropic is on the list as NOT a subprocessor, deliberately.</strong>
    We publish that we build on Claude and Claude Code, which is true. But no Anthropic key
    is configured in production and the provider switch is unset, so no customer data
    reaches them. One statement is about our engineering and the other is about your data,
    and a buyer is entitled to have them separated.</div>

    <p style="font-size:10px;color:#64748b;margin-top:6px">Nothing has been sent to any
    buyer. This is a draft for approval.</p>`;
  return htmlDoc({ title: 'C7.9 - Procurement FAQ and Buyer Checklist', css, body });
}

function buildC79Document() {
  const checklist = D.assertChecklistIsActionable();
  const css = baseCss() + SHARED;
  const body = `
    <h1>Procurement FAQ, subprocessors, and a checklist you can use on us</h1>
    <p class="lede">Colaberry Enterprise AI &middot; current state as of ${esc(D.AS_OF)}.
    Answers are marked by state rather than written around. Where the answer is "not yet",
    it says so.</p>

    <h2>The questions</h2>
    ${faqTable(true)}

    <h2>Subprocessors</h2>
    <p>Read from the running system on ${esc(D.AS_OF)} rather than from documentation, by
    checking which credentials are actually configured.</p>
    ${subprocessorTable(true)}

    <h2>Model providers specifically</h2>
    <p>OpenAI is the live provider for application features. Content submitted to those
    features is sent without redaction today; that is a known gap and it is named here
    rather than left for you to find. Anthropic is not a subprocessor: the client exists in
    our codebase and is dormant, with no key configured in production. We do build with
    Claude Code, which is a statement about how our engineers work and not about where your
    data goes.</p>

    <h2>A checklist you can run against us, and against anyone else</h2>
    <p>${checklist} questions. We would rather be measured on these than on a glossy
    questionnaire, and they work equally well on a vendor who answers more confidently
    than we do.</p>
    <ul>${D.BUYER_CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>

    <h2>What we are not claiming</h2>
    <ul>${D.HOLD_NOTHING.map((c) => `<li><strong>${esc(c.name)}:</strong> ${esc(c.state)}</li>`)
    .join('')}</ul>

    <h2>What needs your decision</h2>
    <ol>
      <li>Approval of both documents before either goes to a buyer. Nothing has been sent.</li>
      <li>Which gaps to fix before the first pilot rather than disclose. C7.7's recommendation
      stands: the backup gap is the cheapest and largest.</li>
      <li>The four live pages claiming SOC 2 alignment, which this document contradicts. They
      should come down before this goes out, or we will be handing a buyer two answers.</li>
    </ol>

    <p style="font-size:10px;color:#64748b;margin-top:12px">
    <strong>REVIEW STATE: BLOCKED - ALI DECISION REQUIRED</strong></p>`;
  return htmlDoc({ title: 'C7.9 - Procurement FAQ and Buyer Checklist', css, body });
}

module.exports = {
  buildC78OnePager, buildC78Traceability, buildC79Visual, buildC79Document,
};
