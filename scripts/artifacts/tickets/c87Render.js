/**
 * C8.7 - renders the one-page design and the full integration document.
 *
 * Both read c87Data, which parses the measure mappings out of the shipped policy module,
 * so neither page can describe a mapping the code does not enforce.
 */
const D = require('./c87Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .mid{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  .no{display:inline-block;background:#fdecea;color:#b3261e;font-size:8.5px;
      font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase}
  .yes{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:8.5px;
       font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:9px 11px;font-size:11px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
        margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

const LADDER = [
  { k: 'story_hypothesis', note: 'where every study is born' },
  { k: 'build_record', note: 'a verified story or a merged enrichment' },
  { k: 'capability_demonstration', note: 'a verified story AND a demonstration' },
  { k: 'operational_result', note: 'needs an approved measurement definition' },
  { k: 'impact_case_study', note: 'needs a client-confirmed business impact' },
];

/** The ladder, with the publish line and the ceiling a pilot can actually reach. */
function ladder(w = 940) {
  const rowH = 34;
  const h = LADDER.length * rowH + 34;
  const boxW = 268;
  const x = 150;

  const rows = LADDER.map((r, i) => {
    // Drawn bottom-up so the ladder reads as a ladder.
    const y = 10 + (LADDER.length - 1 - i) * rowH;
    const reachable = i <= 2;
    const fill = reachable ? '#e8f5e9' : '#fdecea';
    const stroke = reachable ? '#2f7d32' : '#b3261e';
    return `<rect x="${x}" y="${y}" width="${boxW}" height="${rowH - 10}" rx="4"
        fill="${fill}" stroke="${stroke}"/>
      <text x="${x + 10}" y="${y + 16}" font-size="10.5" font-weight="600"
        fill="#334155">${esc(r.k)}</text>
      <text x="${x + boxW + 12}" y="${y + 16}" font-size="9.5"
        fill="#64748b">${esc(r.note)}</text>`;
  }).join('');

  // ONE line, not two. The publish floor (operational_result, index 3) and the ceiling a
  // pilot reaches (capability_demonstration, index 2) are adjacent rungs, so both markers
  // land on the same boundary - the first draft drew them 1px apart and the two labels
  // printed on top of each other. That they coincide IS the finding, so the boundary is
  // drawn once and labeled from both sides.
  const boundaryY = 10 + (LADDER.length - 1 - 3) * rowH + rowH - 5;
  const ceilingRowY = 10 + (LADDER.length - 1 - 2) * rowH + 16;

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="The five-rung publish ladder: a pilot reaches the rung immediately below the publish line">
    ${rows}
    <line x1="${x - 8}" y1="${boundaryY}" x2="${w - 10}" y2="${boundaryY}"
      stroke="#b3261e" stroke-width="2" stroke-dasharray="5 3"/>
    <text x="${x - 12}" y="${boundaryY - 3}" text-anchor="end" font-size="9.5"
      font-weight="700" fill="#b3261e">publishes from here, up</text>
    <text x="${x - 12}" y="${ceilingRowY}" text-anchor="end" font-size="9.5"
      font-weight="700" fill="#2f7d32">a pilot stops here</text>
  </svg>`;
}

/** One page: the answer to "is a pilot outcome publishable", and why that is correct. */
function buildVisual() {
  const count = D.assertFiveMeasuresParsed();
  const m = D.MEASURED;

  const body = `
    <h1 style="margin:0">A pilot produces a case study draft, not a published one</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C8.7 pilot outcome to case
    study &middot; ${count} measures from C7.6 &middot; engine reused, ladder respected
    &middot; prepared ${esc(D.AS_OF)}</p>

    <div class="bad" style="margin-top:9px"><strong>The ladder is not blocking a pilot by
    oversight. It is asking for exactly the claim C7.6 refused to make.</strong>
    Publishing needs <code>operational_result</code>, which the engine documents as
    unreachable because it requires an outcome measured through an approved measurement
    definition. C7.6 declined to measure business outcome at all, on the grounds that a
    twelve-week pilot cannot be separated from everything else that moved. Both are
    right, and they agree.</div>

    ${ladder()}

    <table>
      <thead><tr><th style="width:27%">C7.6 measure</th><th style="width:11%">Attribution</th>
        <th style="width:19%">Lands as</th><th>In a published case study</th></tr></thead>
      <tbody>${D.MAPPINGS.map((x) => `<tr>
        <td><strong>${esc(x.measure)}</strong></td>
        <td>${esc(x.attribution)}</td>
        <td>${x.verification
    ? `<code>${esc(x.verification.class)}</code> / <code>${esc(x.verification.method)}</code>`
    : '<span class="no">never measured</span>'}</td>
        <td>${x.publishable
    ? `<span class="yes">yes</span> ${x.inlineCaveat
      ? `&mdash; always worded "${esc(x.inlineCaveat)}"` : '&mdash; needs no hedge'}`
    : '<span class="no">no</span>'}</td></tr>`).join('')}</tbody>
    </table>

    <div class="flag"><strong>The trap.</strong> ${esc(D.TRAP.what)} ${esc(D.TRAP.fix)}
    Measured today: ${m.caseStudies.total} case studies, ${m.publications.approvedAndPublished}
    approved and published across ${m.publications.rows} surface publications, and
    ${m.naming.namedWithConsent} of ${m.naming.named} named studies carry consent.
    ${m.pilotsRun} pilots have been run.</div>`;

  return htmlDoc({ title: 'C8.7 pilot to case study', css: baseCss() + SHARED, body });
}

/** The full integration design. */
function buildDocument() {
  const m = D.MEASURED;

  const body = `
    <h1>C8.7 &middot; Pilot outcome into the case-study engine</h1>
    <p class="lede" style="font-size:13px">How a finished pilot flows into the existing
    engine without re-measurement and without rebuilding anything. The short answer to
    the question this ticket asks - whether a pilot outcome is publishable - is no, not
    as a published case study, and the reason is a good one.</p>

    <div class="bad"><strong>The finding.</strong> Publishing requires maturity
    <code>operational_result</code>. The engine documents that rung as unreachable
    because it needs "an outcome measured through an approved measurement definition",
    and no measurement-definition concept exists. C7.6 - the pilot measurement spec -
    deliberately declined to measure business outcome, because a twelve-week pilot
    touching a handful of problems cannot be separated from everything else that moved.
    <strong>The gate is asking for precisely the claim the measurement spec refused to
    make.</strong> A pilot therefore produces a build record and, with a demonstration,
    a capability demonstration. That is the correct ceiling, not a gap to engineer past.</div>

    <h2>What the engine already does, with the file that proves it</h2>
    <table>
      <thead><tr><th style="width:62%">Fact</th><th>Where</th></tr></thead>
      <tbody>${D.ENGINE_FACTS.map((f) => `<tr><td>${esc(f.fact)}</td>
        <td><code>${esc(f.where)}</code></td></tr>`).join('')}</tbody>
    </table>

    <h2>The five C7.6 measures, mapped onto the engine's own axes</h2>
    <p>There is no single provenance enum to extend. The engine splits the question in
    two: a <strong>class</strong> (how much may be shown) and a <strong>method</strong>
    (who checked). Every C7.6 measure lands in slots that already exist, so the
    integration adds no vocabulary.</p>
    ${D.MAPPINGS.map((x) => `
      <h3>${esc(x.measure)} <span class="${x.publishable ? 'yes' : 'no'}">
        ${x.publishable ? 'may be published' : 'draft only'}</span></h3>
      <table><tbody>
        <tr><td style="width:20%"><strong>C7.6 attribution</strong></td>
          <td>${esc(x.attribution)}</td></tr>
        <tr><td><strong>Lands as</strong></td>
          <td>${x.verification
    ? `class <code>${esc(x.verification.class)}</code>, method <code>${esc(x.verification.method)}</code>`
    : 'nothing. A number that was never measured cannot be given a class, and giving it '
      + 'one would make it read as a figure merely awaiting a check.'}</td></tr>
        <tr><td><strong>Why</strong></td><td>${esc(x.why)}</td></tr>
        ${x.inlineCaveat ? `<tr><td><strong>Published wording</strong></td>
          <td>The number always travels with "${esc(x.inlineCaveat)}", in the sentence
          that carries it. C7.6's publication rule: not a footnote, and not at review
          time.</td></tr>` : ''}
      </tbody></table>`).join('')}

    <h2>The trap, and why the design avoids it rather than solving it</h2>
    <p><strong>${esc(D.TRAP.what)}</strong></p>
    <p>${esc(D.TRAP.how)}</p>
    <p><strong>${esc(D.TRAP.fix)}</strong> An engagement-sourced study therefore uses
    <code>source_type: 'engagement'</code> - already in the union, with no writer until
    now - and leaves <code>project_id</code> null. That keeps the maturity rule the
    deliberate no-op it was designed to be for non-project studies, rather than
    weakening it.</p>

    <h2>What this reuses rather than builds</h2>
    <ul>
      <li><strong>The delivery adapter that already exists and is unwired.</strong>
      <code>services/delivery/caseStudyAdapter.ts</code> and
      <code>modules/delivery/caseStudy.ts</code> are pure, tested, and have zero
      production callers. They already encode three independent consent flags, a
      nine-value allowlist of what a delivery may export, and a client-identifier check
      that refuses rather than strips. That is the policy this ticket asks for, written
      already.</li>
      <li><strong>The row writer.</strong> <code>createCaseStudyRow</code> is the single
      creation path in the codebase outside tests.</li>
      <li><strong>The consent enforcement.</strong> Naming requires consent true in both
      the record and the approved snapshot, re-checked on every publish. Nothing new is
      needed for the customer-naming criterion; the engine is already stricter than the
      criterion asks.</li>
    </ul>

    <h2>What was measured, 24 October 2026</h2>
    <table><tbody>
      <tr><td style="width:36%"><strong>Case studies</strong></td>
        <td>${m.caseStudies.total} rows: ${m.caseStudies.approved} approved,
        ${m.caseStudies.archived} archived, ${m.caseStudies.draft} draft</td></tr>
      <tr><td><strong>Publications</strong></td>
        <td>${m.publications.rows} rows across ${m.publications.distinctStudies} studies
        &mdash; ${m.publications.approvedAndPublished} approved and published, plus
        ${m.publications.archivedButPublished} published then archived. Publication is
        keyed per surface, so a row count is not a study count.</td></tr>
      <tr><td><strong>Customer naming</strong></td>
        <td>${m.naming.named} named, all ${m.naming.namedWithConsent} with consent;
        ${m.naming.anonymized} anonymized; ${m.naming.hidden} hidden</td></tr>
      <tr><td><strong>Verification logs</strong></td>
        <td>${m.verificationLogs.total.toLocaleString()} records:
        ${m.verificationLogs.partial.toLocaleString()} partial,
        ${m.verificationLogs.notVerified} not verified,
        ${m.verificationLogs.fullyVerified} fully verified. C7.6's figure, re-counted and
        unchanged.</td></tr>
      <tr><td><strong>Pilots run</strong></td><td>${m.pilotsRun}</td></tr>
    </tbody></table>
    <p style="font-size:11px;color:#64748b">On the published count: C0.1 flagged "13
    published" as possibly 13 publication rows rather than 13 studies, marked it an
    inference, and left C0.5 to settle it. Settled here: 13 studies are both approved and
    published, so the figure is sound; the rows are 38, so the worry was about the right
    risk and the wrong arithmetic.</p>

    <h2>What this design does not do</h2>
    <ul>
      <li><strong>It does not make a pilot publishable.</strong> That needs the
      measurement-definition concept the engine is waiting for, which is a separate
      scoped piece of work and a decision about whether we want to make outcome claims at
      all. C7.6's answer today is no.</li>
      <li><strong>It does not wire the delivery adapter yet.</strong> Zero pilots have
      run, so the bridge would ship untested against any real outcome. The policy it must
      obey is encoded and tested now; the wiring belongs with the first pilot.</li>
      <li><strong>It does not touch the publish gate.</strong> Every check there is a
      hard block with no override, and that is the property worth keeping.</li>
    </ul>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}.
    Measure mappings parsed from the shipped policy module. Engine facts cited to file.
    Production figures measured the same day.</p>`;

  return htmlDoc({
    title: 'C8.7 pilot outcome to case study', css: baseCss() + SHARED, body,
  });
}

module.exports = { buildVisual, buildDocument };
