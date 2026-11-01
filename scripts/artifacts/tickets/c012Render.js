/**
 * C0.12's two deliverables: a one-page decision sheet and the full governance document.
 *
 * The one-pager answers the only question Ali has to answer - whether these numbers are the
 * right numbers - and gets out of the way. The document carries the measurement, the
 * per-field derivation, the code reach table and the open flags.
 */
const D = require('./c012Data');
const { esc, baseCss, TOKENS, SEV } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const css = () => `${baseCss()}
  .lede { font-size: 12.5px; line-height: 1.5; }
  .kpi { display: flex; gap: 10px; margin: 10px 0; }
  .kpi > div { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 8px 10px;
    background: ${TOKENS.BG_ALT}; }
  .kpi .n { font-size: 20px; font-weight: 700; color: ${TOKENS.CHERRY_DEEP}; line-height: 1.1; }
  .kpi .l { font-size: 9px; color: ${TOKENS.MUTED}; text-transform: uppercase;
    letter-spacing: .04em; margin-top: 3px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 10px; margin: 8px 0; }
  table.t th { text-align: left; background: ${TOKENS.BG_ALT}; padding: 5px 6px;
    border-bottom: 1.5px solid ${TOKENS.BORDER}; font-size: 9px; text-transform: uppercase;
    letter-spacing: .03em; color: ${TOKENS.MUTED}; }
  table.t td { padding: 5px 6px; border-bottom: 1px solid ${TOKENS.BORDER}; vertical-align: top; }
  table.t td.num { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
  .mv { color: ${TOKENS.CHERRY_DEEP}; font-weight: 700; }
  .kept { color: ${TOKENS.MUTED}; }
  .box { border-left: 3px solid ${TOKENS.CHERRY}; background: ${TOKENS.CHERRY_BG};
    padding: 8px 11px; margin: 10px 0; font-size: 11px; line-height: 1.5; }
  .box.ok { border-left-color: ${SEV.ok}; background: #f1f8f1; }
  .chip { display: inline-block; font-size: 8.5px; font-weight: 700; padding: 1px 6px;
    border-radius: 9px; text-transform: uppercase; letter-spacing: .04em; }
  .chip.pass { background: #e8f3e9; color: ${SEV.ok}; }
  .chip.fail { background: #fdecea; color: ${SEV.bad}; }
  .chip.ali { background: #fff4e0; color: ${SEV.watch}; }
  .flag { border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 8px 11px;
    margin: 7px 0; font-size: 10.5px; line-height: 1.5; }
  .flag h4 { margin: 0 0 4px; font-size: 11px; }
  .flag .sev { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em;
    color: ${TOKENS.MUTED}; font-weight: 700; }
  h2 { font-size: 14px; margin: 16px 0 6px; }
  h3 { font-size: 11.5px; margin: 12px 0 4px; color: ${TOKENS.CHERRY_DEEP}; }
  p { font-size: 11px; line-height: 1.55; margin: 6px 0; }
`;

const fmt = (v) => (typeof v === 'number' ? String(v) : esc(v));

function kpis() {
  return `<div class="kpi">
    <div><div class="n">${D.TABLE.configs.value}</div><div class="l">governance configs before</div></div>
    <div><div class="n">${D.TABLE.campaigns.value}</div><div class="l">campaigns in the system</div></div>
    <div><div class="n">1 of 6</div><div class="l">active campaigns the ceilings reached</div></div>
    <div><div class="n">3 &rarr; 2</div><div class="l">gate blockers, both now Ali's</div></div>
  </div>`;
}

/** The per-field derivation table: value, what the default was, and why it moved. */
function fieldTable(config, withBasis) {
  const rows = config.fields.map((f) => {
    const moved = String(f.value) !== String(f.platformDefault);
    return `<tr>
      <td>${esc(f.field)}</td>
      <td class="num ${moved ? 'mv' : 'kept'}">${fmt(f.value)}</td>
      <td class="num kept">${fmt(f.platformDefault)}</td>
      ${withBasis ? `<td>${esc(f.basis)}</td>` : ''}
    </tr>`;
  }).join('');
  return `<table class="t">
    <tr><th>field</th><th>set to</th><th>platform default</th>${withBasis ? '<th>why this number</th>' : ''}</tr>
    ${rows}
  </table>`;
}

function gateTable(rows, title) {
  const body = rows.map((g) => {
    const chip = g.passed ? '<span class="chip pass">pass</span>'
      : (g.owner === 'Ali' ? '<span class="chip ali">ali only</span>' : '<span class="chip fail">blocks</span>');
    return `<tr><td>${esc(g.id)}</td><td>${chip}</td><td>${esc(g.owner)}</td><td>${esc(g.detail)}</td></tr>`;
  }).join('');
  return `<h3>${esc(title)}</h3><table class="t">
    <tr><th>check</th><th>state</th><th>owner</th><th>detail</th></tr>${body}</table>`;
}

function criteriaTable(withEvidence) {
  const rows = D.CRITERIA.map((c) => `<tr>
    <td class="num">${c.id}</td><td>${esc(c.text)}</td>
    <td><span class="chip ${c.verdict === 'MET' ? 'pass' : 'fail'}">${esc(c.verdict)}</span></td>
    ${withEvidence ? `<td>${esc(c.evidence)}</td>` : ''}
  </tr>`).join('');
  return `<table class="t">
    <tr><th>#</th><th>acceptance criterion</th><th>verdict</th>${withEvidence ? '<th>evidence</th>' : ''}</tr>
    ${rows}</table>`;
}

/** The one-pager. Landscape, one page, and the limit is the deliverable. */
function buildVisual() {
  const ceo = D.CONFIGS.find((c) => c.key === 'ceo_direct');
  const body = `
  <h1>C0.12 &middot; The first campaign governance config this platform has had</h1>
  <p class="lede"><strong>Nothing governed the CEO-direct motion, and a row of defaults would not have
  either.</strong> <code>campaign_governance_configs</code> held zero rows against
  ${D.TABLE.campaigns.value} campaigns, so the publish gate's governance check had never once
  answered yes. It would not have meant much if it had: the check read whether a row existed and
  never a field of it, and every column in the table carries a database default, so an empty admin
  write created a complete row. Your decision here is whether these nine numbers are the right
  nine numbers.</p>
  ${kpis()}
  <h3>What governs the CEO-direct motion, and what it used to be</h3>
  ${fieldTable(ceo, false)}
  <div class="box">Seven of nine moved off the platform default. <strong>advance_threshold 70 and
  hold_threshold 50 were kept deliberately</strong> - nothing measured argues for moving them, and
  inventing a different number would be the placeholder problem in reverse. The one judgment rather
  than derivation is <strong>min_open_rate at 0.25</strong>, and nothing enforces it today.</div>
  <h3>Acceptance criteria</h3>
  ${criteriaTable(false)}
  <p style="font-size:10px;color:${TOKENS.MUTED};margin-top:10px">Measured read-only against
  production on ${esc(D.MEASURED_AT)}. The campaign is still <code>draft</code> and both of your
  attestations still read false; this change removes the mechanical blocker and nothing else.</p>`;
  return htmlDoc({ title: 'C0.12 - Campaign governance config', css: css(), body });
}

function buildDocument() {
  const inv = D.INVENTORY.map((r) => `<tr>
    <td>${esc(r.status)}</td><td>${esc(r.approval)}</td><td class="num">${r.n}</td><td>${esc(r.note)}</td>
  </tr>`).join('');

  const reach = D.COLUMN_REACH.map((r) => `<tr>
    <td>${esc(r.column)}</td><td>${esc(r.before)}</td><td>${esc(r.after)}</td>
  </tr>`).join('');

  const active = D.ACTIVE.map((a) => `<tr>
    <td>${esc(a.name)}</td><td>${esc(a.type)}</td>
    <td>${a.governed ? '<span class="chip pass">ceilings applied</span>' : '<span class="chip fail">ungoverned</span>'}</td>
  </tr>`).join('');

  const flags = D.FLAGS.map((f) => `<div class="flag">
    <div class="sev">${esc(f.id)} &middot; ${esc(f.severity)}</div>
    <h4>${esc(f.title)}</h4><div>${esc(f.detail)}</div></div>`).join('');

  const configs = D.CONFIGS.map((c) => `
    <h3>${esc(c.key)} &middot; ${esc(c.campaign)}</h3>
    <p>${c.applied
      ? 'Written to production by the committed seed.'
      : 'Declared and validated, <strong>not written</strong>: this campaign is <code>status=active</code>, so changing its live ceilings is your call. One flag applies it.'}</p>
    ${fieldTable(c, true)}`).join('');

  const verified = D.VERIFIED
    ? `<div class="box ok"><strong>Post-seed reading, ${esc(D.VERIFIED.readAt)}.</strong>
       ${esc(String(D.VERIFIED.configRows))} config row(s) in the table.
       ${gateTable(D.VERIFIED.gateAfter, 'The gate, after')}</div>`
    : '';

  const body = `
  <h1>C0.12 &middot; Create a campaign governance config, which no campaign in the system has</h1>
  <p class="lede"><strong>The ticket asked for one governance config and warned against the way it
  would most likely be produced.</strong> Its words: <em>"Creating an empty config purely to
  satisfy the check. A governance record that governs nothing is worse than its absence, because
  the gate then reads green."</em> That was not a risk to avoid. It was the design. Reading the
  code first, as the ticket instructs, found that <code>validateCampaignForPublish</code> asked
  only whether a row existed, that every column in the table carries a database default, and that
  the one column with a NULL default - <code>ramp_profile</code> - was stored, resolved, and then
  ignored in favor of a hardcoded map keyed on campaign type. A row of defaults would have turned
  the check green and changed nothing about how any campaign sends.</p>

  <h2>What was measured</h2>
  <p>Read-only against production on ${esc(D.MEASURED_AT)}. Nothing is carried over from the
  ticket, whose own evidence line had moved: 46 campaigns on 23 October, ${D.TABLE.campaigns.value}
  now, and the number running unapproved has doubled.</p>
  ${kpis()}
  <table class="t">
    <tr><th>status</th><th>approval_status</th><th>n</th><th>note</th></tr>${inv}
  </table>

  <h3>The six campaigns that are active right now</h3>
  <p>Every one of them carries <code>channel=null</code>, so every one of them would fail the
  publish validator. They are live because <code>activateCampaign</code> never consults it.</p>
  <table class="t"><tr><th>campaign</th><th>type</th><th>governance reach before</th></tr>${active}</table>

  <h2>What each column actually governed, before and after</h2>
  <p>This table is the answer to the ticket's question - <em>what does the config constrain</em> -
  and the honest answer before this change was "almost nothing, for almost every campaign".</p>
  <table class="t"><tr><th>column</th><th>governed before</th><th>governs after</th></tr>${reach}</table>
  <div class="box">Two columns still govern nothing. <code>min_open_rate</code> and
  <code>min_reply_rate</code> are read by the resolver and enforced by nobody, and they cannot be
  enforced as written: both are <code>DECIMAL(5,4)</code> with fraction defaults, while
  <code>campaign_health.metrics</code> stores <code>open_rate</code> as a percentage - measured
  values 1.53, 2.15, 2.63 and 30.69. Comparing them directly is wrong by a factor of one hundred.
  They are declared and validated here, and flagged as F6 rather than described as governed.</div>

  <h2>The gate, before</h2>
  ${gateTable(D.GATE_BEFORE, 'evaluateActivationReadiness on the CEO-direct campaign, ' + D.MEASURED_AT)}
  ${verified}

  <h2>The configs, number by number</h2>
  <p>Each value carries the measured fact it came from, so the next person can disagree with the
  derivation rather than guess at the intent. The values live in
  <code>backend/src/seeds/campaignGovernanceDeclarations.ts</code>; a build guard refuses to render
  this document if any number here has drifted from that file.</p>
  ${configs}

  <h2>What the code now refuses</h2>
  <p><code>validateGovernanceConfig</code> is a pure function both the admin route and the publish
  validator call, so the write path and the read path cannot disagree about what a valid config is.
  It refuses a row of column defaults, a threshold of zero, a percentage written into a fraction
  column, and a ramp profile that would strand a phase. The admin PUT now judges the end state
  rather than the request body, so a partial update is validated on what the config will say once
  written, and an empty body returns 400 with the specific failures instead of 200 with a hollow
  row.</p>
  <p>Zero deserves a note, because it looks like the strictest possible ceiling and is not one. The
  ramp compares with <code>&gt;=</code>, so <code>max_unsubscribe_rate = 0</code> pauses a campaign
  that has had no unsubscribes at all. The resolver used to hide that by coalescing a stored zero
  away with <code>||</code>, which also meant the tightest value anybody could type was the one
  value the resolver threw away. The coalesce is gone and the band refuses zero at the point of
  writing, where somebody can be told why.</p>

  <h2>Acceptance criteria</h2>
  ${criteriaTable(true)}

  <h2>What this does not fix</h2>
  ${flags}

  <p style="font-size:10px;color:${TOKENS.MUTED};margin-top:14px">All production reads were
  SELECT-only. The campaign remains <code>draft</code>; both activation attestations remain false
  and are yours alone to set. REVIEW STATE: READY FOR ALI REVIEW.</p>`;
  return htmlDoc({ title: 'C0.12 - Campaign governance config', css: css(), body });
}

module.exports = { buildVisual, buildDocument };
