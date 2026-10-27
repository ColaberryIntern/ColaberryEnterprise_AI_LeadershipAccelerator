/**
 * C8.12 - renders the one-page finding and the full evidence audit.
 *
 * Both read c812Data, whose guards refuse a softened zero-baseline trap, a criterion 3
 * marked met, a sponsor presented as a live customer, and a fix stated without its
 * before-number.
 */
const D = require('./c812Data');
const { esc, baseCss, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .met{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:9px;
       font-weight:700;padding:2px 8px;border-radius:3px}
  .notmet{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
          font-weight:700;padding:2px 8px;border-radius:3px}
  .hi{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
      font-weight:700;padding:2px 7px;border-radius:3px}
  .md{display:inline-block;background:#fff7ed;color:#9a3412;font-size:9px;
      font-weight:700;padding:2px 7px;border-radius:3px}
  .lo{display:inline-block;background:#eef2ff;color:#3730a3;font-size:9px;
      font-weight:700;padding:2px 7px;border-radius:3px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:10px 12px;font-size:11.5px}
  .key{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
       margin:8px 0}
  .ok{background:#f0fdf4;border-left:3px solid #2f7d32;padding:9px 11px;font-size:11px;
      margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

const sevClass = (s) => (s === 'HIGH' ? 'hi' : s === 'MEDIUM' ? 'md' : 'lo');

/**
 * The baseline columns, drawn to scale.
 *
 * A table of percentages would let a reader skim past this. A bar that is visually solid
 * for all three columns, with fourteen pixels of real measurement on one of them, is the
 * finding in a form nobody misreads.
 */
function zeroBars(w = 440) {
  const barH = 26;
  const gap = 13;
  const labelW = 132;
  const trackW = w - labelW - 54;
  const rows = D.BASELINE.columns.map((c, i) => {
    const y = i * (barH + gap);
    const realPct = (c.total - c.zeros) / c.total;
    const realW = Math.max(realPct > 0 ? 2 : 0, Math.round(trackW * realPct));
    const real = c.total - c.zeros;
    return `
      <text x="0" y="${y + 17}" font-size="10.5" font-weight="600"
            fill="${TOKENS.INK}" font-family="monospace">${esc(c.name)}</text>
      <rect x="${labelW}" y="${y}" width="${trackW}" height="${barH}"
            fill="#fdecea" stroke="#f3b4b4"/>
      ${realW ? `<rect x="${labelW}" y="${y}" width="${realW}" height="${barH}"
            fill="${TOKENS.SEV.ok}"/>` : ''}
      <text x="${labelW + trackW / 2}" y="${y + 17}" font-size="9.5" text-anchor="middle"
            fill="#b3261e" font-weight="700">${c.zeros.toLocaleString()} rows at exactly 0</text>
      <text x="${labelW + trackW + 8}" y="${y + 17}" font-size="10" font-weight="700"
            fill="${real ? TOKENS.SEV.ok : TOKENS.MUTED}">${real} real</text>`;
  }).join('');

  const h = D.BASELINE.columns.length * (barH + gap);
  return `<svg width="${w}" height="${h + 22}" viewBox="0 0 ${w} ${h + 22}"
      xmlns="http://www.w3.org/2000/svg">${rows}
      <text x="0" y="${h + 15}" font-size="9" fill="${TOKENS.MUTED}">
        NOT NULL, defaulted to 0. A zero is "never measured", not "measured at zero".</text>
    </svg>`;
}

/**
 * Before and after for the one thing this change fixed: how many verified commits a
 * reader can actually open.
 */
function openableBars(w = 440) {
  const d = D.DELIVERED;
  const barH = 34;
  const labelW = 58;
  const trackW = w - labelW - 46;
  const max = Math.max(d.verifiedCommits, 1);
  const after = Math.round((trackW * d.openableClaims) / max);
  return `<svg width="${w}" height="110" viewBox="0 0 ${w} 110"
      xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="22" font-size="10.5" font-weight="600" fill="${TOKENS.INK}">Before</text>
    <rect x="${labelW}" y="2" width="${trackW}" height="${barH}" fill="#f1f5f9"
          stroke="${TOKENS.BORDER}"/>
    <text x="${labelW + 9}" y="24" font-size="10.5" font-weight="700"
          fill="#b3261e">0 of ${d.verifiedCommits} openable</text>
    <text x="0" y="70" font-size="10.5" font-weight="600" fill="${TOKENS.INK}">After</text>
    <rect x="${labelW}" y="50" width="${trackW}" height="${barH}" fill="#f1f5f9"
          stroke="${TOKENS.BORDER}"/>
    <rect x="${labelW}" y="50" width="${after}" height="${barH}" fill="${TOKENS.SEV.ok}"/>
    <text x="${labelW + 9}" y="72" font-size="10.5" font-weight="700"
          fill="#fff">${d.openableClaims} of ${d.verifiedCommits} openable</text>
    <text x="0" y="101" font-size="9" fill="${TOKENS.MUTED}">
      The commits were always verified. The repository that locates them was never joined.</text>
  </svg>`;
}

/** The one-page finding. Letter landscape at 10mm, so roughly 980 x 740 px of room. */
function buildVisual() {
  const d = D.DELIVERED;
  const css = baseCss() + SHARED + `
    .wrap{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .panel{border:1px solid ${TOKENS.BORDER};border-radius:5px;padding:11px 13px}
    .h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
       color:${TOKENS.MUTED};margin:0 0 7px}
    .big{font-size:27px;font-weight:800;color:${TOKENS.CHERRY_DEEP};line-height:1}
    .cap{font-size:9.5px;color:${TOKENS.MUTED};margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:9px 0 13px}
    .stat{background:${TOKENS.BG_ALT};border-radius:4px;padding:8px 10px}
    h1{font-size:19px;margin:0 0 3px} .sub{font-size:11px;color:${TOKENS.MUTED};margin:0 0 11px}
  `;

  const stats = [
    [String(d.totalClaims), 'claims generated from real rows'],
    [String(d.openableClaims), 'a sponsor can open and check'],
    ['0', 'learners with measured movement'],
    ['0', 'real sponsors in production'],
  ].map(([n, c]) => `<div class="stat"><div class="big">${esc(n)}</div>
      <div class="cap">${esc(c)}</div></div>`).join('');

  const criteria = D.CRITERIA.map((c) => `<tr>
      <td style="width:22px"><strong>${c.n}</strong></td>
      <td>${esc(c.text)}</td>
      <td style="width:118px"><span class="${c.verdict === 'MET' ? 'met' : 'notmet'}">${
        esc(c.verdict === 'MET' ? 'MET' : 'NOT MET')}</span></td>
    </tr>`).join('');

  const defects = D.DEFECTS.slice(0, 4).map((x) => `<li><span class="${sevClass(x.severity)}">${
    esc(x.severity)}</span> <strong>${esc(x.title)}</strong></li>`).join('');

  const body = `
    <h1>C8.12 &mdash; the day-90 impact report</h1>
    <div class="sub">It generates from evidence that already exists. Its defining
      behavior is the one number it refuses to print.</div>
    <div class="stats">${stats}</div>
    <div class="wrap">
      <div>
        <div class="panel">
          <p class="h">The trap the ticket warned about, sprung the worst way</p>
          ${zeroBars(430)}
          <div class="bad" style="margin-top:9px">${esc(D.BASELINE.theDanger)}</div>
        </div>
        <div class="panel" style="margin-top:14px">
          <p class="h">And there is no sponsor to send it to</p>
          <table style="margin:0 0 7px">
            <tr><td>Company</td><td><strong>${esc(D.SPONSOR.companyName)}</strong></td></tr>
            <tr><td>Seats purchased</td><td><strong>${D.SPONSOR.seatsPurchased}</strong>
              (${esc(D.SPONSOR.plan)}, ${esc(D.SPONSOR.billingStatus)})</td></tr>
            <tr><td>Seats minted</td>
              <td><strong style="color:#b3261e">${D.SPONSOR.seatsMinted}</strong></td></tr>
            <tr><td>Portal token</td><td>${
              D.SPONSOR.hasPortalToken ? 'issued' : 'never issued'}</td></tr>
          </table>
          <div class="bad">${esc(D.SPONSOR.why)}</div>
        </div>
      </div>
      <div>
        <div class="panel">
          <p class="h">What this change actually fixed</p>
          ${openableBars(430)}
          <div class="ok" style="margin-top:7px">${esc(D.VERDICT.theFix)}</div>
        </div>
        <div class="panel" style="margin-top:14px">
          <p class="h">Acceptance criteria</p>
          <table>${criteria}</table>
          <p class="h" style="margin-top:9px">Defects this surfaced</p>
          <ul>${defects}</ul>
        </div>
      </div>
    </div>`;
  return htmlDoc({ title: 'C8.12 - Day-90 impact report', css, body });
}

/** The full audit. Portrait, unbounded pages. */
function buildDocument() {
  const css = baseCss() + SHARED + `
    h1{font-size:21px;margin:0 0 4px}
    h2{font-size:13px;margin:19px 0 7px;padding-bottom:4px;
       border-bottom:2px solid ${TOKENS.CHERRY}}
    .sub{font-size:11px;color:${TOKENS.MUTED};margin:0 0 13px}
    .lead{font-size:12px;background:${TOKENS.CHERRY_BG};border-left:3px solid
      ${TOKENS.CHERRY};padding:11px 13px;margin:0 0 15px}
  `;

  const evidence = D.EVIDENCE.map((e) => `<tr>
      <td><code>${esc(e.table)}</code></td>
      <td style="text-align:right">${e.rows.toLocaleString()}</td>
      <td style="text-align:right">${e.people}</td>
      <td>${esc(e.use)}</td>
      <td><strong>${esc(e.verdict)}</strong></td>
    </tr>`).join('');

  const columns = D.BASELINE.columns.map((c) => `<tr>
      <td><code>${esc(c.name)}</code></td>
      <td style="text-align:right">${c.zeros.toLocaleString()} / ${c.total.toLocaleString()}</td>
      <td style="text-align:right">${c.nulls}</td>
      <td>${esc(c.why)}</td>
    </tr>`).join('');

  const defects = D.DEFECTS.map((x) => `<tr>
      <td><strong>${esc(x.id)}</strong></td>
      <td><span class="${sevClass(x.severity)}">${esc(x.severity)}</span></td>
      <td><strong>${esc(x.title)}</strong><br><span style="font-size:10.5px">${
        esc(x.detail)}</span></td>
      <td><code>${esc(x.where)}</code></td>
    </tr>`).join('');

  const criteria = D.CRITERIA.map((c) => `<tr>
      <td style="width:20px"><strong>${c.n}</strong></td>
      <td>${esc(c.text)}<br><span style="font-size:10.5px;color:${TOKENS.MUTED}">${
        esc(c.evidence)}</span></td>
      <td style="width:92px"><span class="${c.verdict === 'MET' ? 'met' : 'notmet'}">${
        esc(c.verdict)}</span></td>
    </tr>`).join('');

  const decisions = D.DECISIONS.map((x) => `<tr>
      <td style="width:92px"><strong>${esc(x.kind)}</strong></td>
      <td><strong>${esc(x.ask)}</strong><br><span style="font-size:10.5px">${esc(x.why)}</span>
        <br><span style="font-size:10px;color:${TOKENS.MUTED}">Cost: ${esc(x.cost)}</span></td>
    </tr>`).join('');

  const s = D.SPONSOR;
  const body = `
    <h1>C8.12 &mdash; Executive impact report for the sponsor</h1>
    <div class="sub">Measured against production 2026-10-26, read-only. Every figure below
      came from a COUNT or an aggregate, not an estimate.</div>

    <div class="lead"><strong>${esc(D.VERDICT.built)}</strong><br><br>
      ${esc(D.VERDICT.theTrap)}<br><br>${esc(D.VERDICT.theFix)}</div>

    <h2>1. It runs, on real rows</h2>
    <p>Against the one populated cohort (${esc(D.DELIVERED.cohort)},
      ${D.DELIVERED.members} members): <strong>${D.DELIVERED.totalClaims} claims</strong>
      assembled for ${D.DELIVERED.withEvidence} learners, of which
      <strong>${D.DELIVERED.openableClaims} are independently openable</strong>. The
      richest single learner carries ${D.DELIVERED.richestLearnerClaims} claims across
      ${D.DELIVERED.richestLearnerDays} observed days. No migration was written and no
      table was added.</p>
    ${openableBars(620)}

    <h2>2. The evidence that exists</h2>
    <table><tr><th>Table</th><th style="text-align:right">Rows</th>
      <th style="text-align:right">People</th><th>What it is</th><th>Verdict</th></tr>
      ${evidence}</table>

    <h2>3. The baseline: ${esc(D.BASELINE.verdict)}</h2>
    <p>This is the center of the ticket, and it is the trap the ticket predicted, sprung
      in the worse of the two available ways. The columns are not empty. They are
      <em>full of zeros</em>, which means the arithmetic completes.</p>
    <table><tr><th>Column</th><th style="text-align:right">Zeros</th>
      <th style="text-align:right">Nulls</th><th>Why it is not a baseline</th></tr>
      ${columns}</table>
    <div class="bad">${esc(D.BASELINE.theDanger)}</div>
    <div class="key"><strong>What the report uses instead.</strong>
      ${esc(D.BASELINE.whatWeUseInstead)}</div>
    <p><strong>Cost of closing it:</strong> ${esc(D.BASELINE.costOfClosing)}</p>

    <h2>4. The sponsor</h2>
    <p><strong>${esc(s.verdict)}.</strong> ${esc(s.why)}</p>
    <table>
      <tr><th>Company</th><td>${esc(s.companyName)}</td>
          <th>Seats purchased</th><td>${s.seatsPurchased}</td></tr>
      <tr><th>Plan</th><td>${esc(s.plan)} / ${esc(s.billingStatus)}</td>
          <th>Seats minted</th><td><strong>${s.seatsMinted}</strong></td></tr>
      <tr><th>Created</th><td>${esc(s.createdOn)}</td>
          <th>Portal token</th><td>${s.hasPortalToken ? 'issued' : 'never issued'}</td></tr>
    </table>
    <p>${esc(s.consequence)}</p>

    <h2>5. Defects this surfaced</h2>
    <table><tr><th>#</th><th>Sev</th><th>Finding</th><th>Where</th></tr>${defects}</table>

    <h2>6. Acceptance criteria</h2>
    <table>${criteria}</table>

    <h2>7. What is needed, and from whom</h2>
    <table>${decisions}</table>
    <p style="margin-top:11px;font-size:10.5px;color:${TOKENS.MUTED}">
      Only the third is engineering. The first is an instrument decision and the second is
      a commercial one.</p>`;
  return htmlDoc({ title: 'C8.12 - Day-90 impact report audit', css, body });
}

module.exports = { buildVisual, buildDocument };
