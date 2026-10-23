/**
 * C8.5 - renders the one-page summary and the full build document.
 *
 * Both read c85Data, which parses the kinds and the forbidden-column list out of the
 * shipped TypeScript, so neither page can claim a taxonomy the code does not have.
 */
const D = require('./c85Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;
     font-weight:700;margin:0 0 5px}
  .sid{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  .no{display:inline-block;background:#fdecea;color:#b3261e;font-size:8.5px;
      font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase}
  .yes{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:8.5px;
       font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:10px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:9px 11px;font-size:11px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
        margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/**
 * The shape of the thing: an account pointing at artifacts that live somewhere else.
 *
 * Geometry learned by looking at the render rather than by measuring its height. The
 * first version put four 140px boxes at a 150px pitch starting at x=352, which ran the
 * fourth one 2px past the viewBox, and it emitted each connector AFTER the previous box,
 * so every line painted over the boxes to its left. The page measured comfortably inside
 * its budget throughout. Lines are now emitted as one layer underneath all the boxes.
 */
function diagram(w = 940, h = 186) {
  const BOX_W = 128;
  const PITCH = 148;
  const COL0 = 356;
  const ROW0 = 18;
  const ROW_H = 46;
  const HUB = { x: 300, y: 78 };

  const at = (i) => ({
    x: COL0 + (i % 4) * PITCH,
    y: ROW0 + Math.floor(i / 4) * ROW_H,
  });

  // One layer of connectors, drawn first so the boxes sit on top of them.
  const lines = D.KINDS.map((_, i) => {
    const { x, y } = at(i);
    return `<line x1="${HUB.x}" y1="${HUB.y}" x2="${x - 5}" y2="${y + 17}"
      stroke="#0f766e" stroke-width="1.1" stroke-dasharray="3 2" opacity="0.55"/>`;
  }).join('');

  const boxes = D.KINDS.map((k, i) => {
    const { x, y } = at(i);
    return `<rect x="${x}" y="${y}" width="${BOX_W}" height="34" rx="4" fill="#fff"
        stroke="#cbd5e1"/>
      <text x="${x + BOX_W / 2}" y="${y + 21}" text-anchor="middle" font-size="9.5"
        fill="#334155">${esc(k.replace(/_/g, ' '))}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="The account record points at artifacts that stay in the Basecamp vault">
    ${lines}
    <rect x="120" y="54" width="180" height="48" rx="6" fill="#0f766e"/>
    <text x="210" y="74" text-anchor="middle" font-size="12" font-weight="700"
      fill="#fff">The account</text>
    <text x="210" y="90" text-anchor="middle" font-size="9.5"
      fill="#c7eae4">organizations row</text>
    <text x="210" y="126" text-anchor="middle" font-size="10" fill="#64748b">holds</text>
    <text x="210" y="140" text-anchor="middle" font-size="10.5" font-weight="700"
      fill="#b3261e">no documents</text>
    ${boxes}
    <text x="${COL0}" y="${h - 10}" font-size="9.5" fill="#64748b">
      every line is a pointer; the artifact stays in the vault</text>
  </svg>`;
}

/** One page: what it is, what it refuses, and the decision to argue with. */
function buildVisual() {
  const kinds = D.assertSevenKinds();
  const forbidden = D.assertServiceHoldsNoArtifact();

  const body = `
    <h1 style="margin:0">Every artifact for an account, one click away</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C8.5 artifact and evidence
    links &middot; ${kinds} kinds &middot; links only &middot; prepared ${esc(D.AS_OF)}</p>

    <div class="bad" style="margin-top:9px"><strong>The app never holds the
    document.</strong> Each row is a pointer to the one canonical copy in the vault. That
    is structural, not a promise: the table has no column that could carry a file
    (${forbidden} content words refused, no BYTEA), the service makes no network call of
    any kind, and the card has no file input. Each is a test, not a comment.</div>

    ${diagram()}

    <table>
      <thead><tr><th style="width:30%">What cannot happen</th>
        <th>How it is prevented</th></tr></thead>
      <tbody>${D.STRUCTURAL_GUARDS.map((g) => `<tr>
        <td><span class="no">refused</span> <strong>${esc(g.what)}</strong></td>
        <td>${esc(g.how)}</td></tr>`).join('')}</tbody>
    </table>

    <div class="flag"><strong>The decision to argue with: a link table, not the JSONB
    column that already exists.</strong> ${esc(D.DESIGN_DECISION.why)}</div>`;

  return htmlDoc({ title: 'C8.5 account artifact links', css: baseCss() + SHARED, body });
}

/** The full build document. */
function buildDocument() {
  const body = `
    <h1>C8.5 &middot; Artifact and evidence links in the account view</h1>
    <p class="lede" style="font-size:13px">Every canonical artifact for an account, one
    click from the account record, as a link and never as a copy. The named failure mode
    on this ticket is "copying artifacts into the app and creating a second canonical
    location", so most of the work here is making that impossible rather than unlikely.</p>

    <h2>What was built</h2>
    <table><tbody>
      <tr><td style="width:22%"><strong>Route</strong></td>
        <td><code>/admin/business-accounts/:id</code>, a new Artifacts card on the
        existing page. No new page and no new nav entry.</td></tr>
      <tr><td><strong>API</strong></td><td><code>GET</code>, <code>POST</code> and
        <code>DELETE /api/admin/organizations/:id/artifacts</code>, added to the
        organization router beside the cohort pair it is modeled on.</td></tr>
      <tr><td><strong>Storage</strong></td><td>One table,
        <code>account_artifact_links</code>: account, kind, title, canonical URL, source
        pointer, who linked it. No document, ever.</td></tr>
      <tr><td><strong>Kinds</strong></td>
        <td>${D.KINDS.map((k) => `<code>${esc(k)}</code>`).join(' ')}</td></tr>
      <tr><td><strong>Auth</strong></td><td><code>requireAdmin</code>, inherited from the
        organization router.</td></tr>
    </tbody></table>

    <h2>The decision worth defending</h2>
    <p><strong>Chosen:</strong> ${esc(D.DESIGN_DECISION.chosen)}.
    <strong>Rejected:</strong> ${esc(D.DESIGN_DECISION.rejected)}.</p>
    <p>${esc(D.DESIGN_DECISION.why)}</p>
    <p><strong>What it costs:</strong> ${esc(D.DESIGN_DECISION.cost)}</p>

    <h2>What the survey found, and how it changed the design</h2>
    <p>The first plan was to reuse the existing artifact tables. A read-only survey of the
    subsystem showed that could not work, and the design changed because of it:</p>
    <table>
      <thead><tr><th style="width:26%">Assumption</th><th style="width:12%">Verdict</th>
        <th>What is actually true</th></tr></thead>
      <tbody>${D.SURVEY.map((s) => `<tr>
        <td>${esc(s.claim)}</td>
        <td><span class="${s.verdict === 'TRUE' ? 'yes' : 'no'}">${esc(s.verdict)}</span></td>
        <td>${esc(s.detail)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>How each C0.3 rule is honored</h2>
    <table>
      <thead><tr><th style="width:5%">#</th><th style="width:30%">The rule</th>
        <th>How this surface honors it</th></tr></thead>
      <tbody>${D.C03_RULES.map((r) => `<tr>
        <td><span class="sid">${r.n}</span></td>
        <td><strong>${esc(r.rule)}</strong></td>
        <td>${esc(r.here)}</td></tr>`).join('')}</tbody>
    </table>

    <div class="flag"><strong>Rule 3 is enforced in code because I broke it myself on
    ${esc(D.AS_OF)}.</strong> After a one-word fix to a C8.4 artifact I refiled it as
    <code>..._REV2_2026-10-23.pdf</code>, which carries a date and a version marker and
    put the suffix on the CURRENT copy rather than the superseded one, leaving the same
    document in the folder twice with different content. That is the precise failure C0.3
    exists to prevent. The folder has been corrected, and linking a URL with a filename
    like that is now refused with the rule quoted back. The test case is that exact
    filename.</div>

    <h2>What this does not do</h2>
    <ul>
      <li><strong>It does not discover artifacts.</strong> A link is created deliberately.
      Nothing crawls the vault, because a crawler would need a rule for which copy is
      canonical and C0.3 already says a human decides that at creation time.</li>
      <li><strong>It does not render or preview the document.</strong> Opening a link
      goes to the vault. A preview would be a cached copy wearing a different name.</li>
      <li><strong>It does not validate that the URL resolves.</strong> Checking would mean
      fetching, and the service deliberately makes no network call. A dead link is
      visible the moment somebody clicks it.</li>
      <li><strong>Existing non-compliant links are shown, not hidden.</strong> The naming
      rule governs what is created; concealing a badly named link that already exists
      would hide the evidence rather than fix it.</li>
    </ul>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}.
    Kinds and guard lists parsed from the shipped source.</p>`;

  return htmlDoc({
    title: 'C8.5 account artifact links', css: baseCss() + SHARED, body,
  });
}

module.exports = { buildVisual, buildDocument };
