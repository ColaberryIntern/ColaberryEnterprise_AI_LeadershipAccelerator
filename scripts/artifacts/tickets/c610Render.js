/**
 * C6.10 renderers. All data comes from c610Data, which reads the gate's own source.
 *
 * The one-pager leads with the measurement rather than the checklist, because the finding
 * is the reason anyone should care: six campaigns are already live without approval.
 */
const D = require('./c610Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .lede{font-size:12.5px;line-height:1.5;margin:0 0 10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .alarm{background:#fef2f2;border-left:4px solid #b3261e;padding:10px 12px;margin:0 0 10px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:8px 10px;margin:8px 0;
        font-size:11px}
  .ok{background:#f0fdf4;border-left:3px solid #16a34a;padding:8px 10px;margin:8px 0;
      font-size:11px}
  .big{font-size:26px;font-weight:800;letter-spacing:-.01em;line-height:1}
  .num{font-variant-numeric:tabular-nums;font-weight:700}
  .auto{display:inline-block;padding:1px 6px;border-radius:9px;font-size:9px;font-weight:700;
        color:#fff;background:#1d4ed8}
  .man{display:inline-block;padding:1px 6px;border-radius:9px;font-size:9px;font-weight:700;
       color:#fff;background:#b45309}
  ul{margin:4px 0 8px 16px;padding:0}
  li{margin:3px 0}
`;

const badge = (a) => (a ? '<span class="auto">AUTO</span>' : '<span class="man">MANUAL</span>');

function checkTable(full) {
  return `<table>
    <thead><tr><th></th><th>Check</th><th>Owner</th>${full ? '<th>Method</th>' : ''}</tr></thead>
    <tbody>${D.CHECKS.map((c) => `<tr>
      <td>${badge(c.automated)}</td>
      <td><strong>${esc(c.label)}</strong>${full
    ? `<br><code style="font-size:9.5px">${esc(c.id)}</code>` : ''}</td>
      <td>${esc(c.owner)}</td>
      ${full ? `<td>${esc(c.method)}</td>` : ''}
    </tr>`).join('')}</tbody></table>`;
}

function doorTable() {
  return `<table>
    <thead><tr><th>Entry point</th><th>Before</th><th>Now</th></tr></thead>
    <tbody>${D.DOORS.map((d) => `<tr>
      <td><code>${esc(d.fn)}</code></td>
      <td>${esc(d.was)}</td>
      <td>${esc(d.now)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function buildVisual() {
  const split = D.assertAutomationSplitIsHonest();
  const m = D.MEASURED;
  const css = baseCss() + SHARED;
  const body = `
    <h1>C6.10 &middot; Campaign activation readiness gate</h1>

    <div class="alarm">
      <div class="big">${m.activeButUnapproved} campaigns are live right now, never approved.</div>
      <p style="margin:6px 0 0;font-size:12px">Measured in production on ${esc(D.AS_OF)}:
      <strong>${m.activeButUnapproved} campaigns</strong> are <code>status='active'</code>
      with <code>approval_status='draft'</code>, one of them
      ${esc(m.unapprovedExample)}. There were two doors into "active" and only one was
      locked.</p>
    </div>

    <div class="grid2">
      <div>
        <h2>The door that was open</h2>
        ${doorTable()}
        <div class="ok"><strong>The gate now runs BEFORE the write.</strong>
        <code>activateCampaign</code> calls <code>assertActivationAllowed(id)</code> ahead of
        <code>campaign.update</code>, so a blocked campaign is never written. A build
        assertion fails if that ordering is ever reversed, and another fails if the function
        grows a bypass parameter.</div>
      </div>
      <div>
        <h2>The ${D.CHECKS.length} checks</h2>
        ${checkTable(false)}
        <p style="font-size:10.5px;color:#64748b;margin:4px 0 0">
        ${split.automated} enforced automatically against the existing services,
        ${split.manual.length} recorded as a human attestation because no service can
        decide them.</p>
      </div>
    </div>

    <div class="flag"><strong>What this will block, said plainly.</strong>
    ${m.campaigns} campaigns exist and <strong>${m.governanceConfigs} have a governance
    config</strong>, so the existing publish validator fails for every one of them today.
    <strong>${m.withSenderIdentity}</strong> have a sender identity. Turning this gate on
    stops activation until campaigns are regularized, including recovery of the
    <strong>${m.pausedAndDraft} paused campaigns</strong> still on
    <code>approval_status='draft'</code>. That is what a gate does, and it is a real
    operational change rather than a quiet one.</div>

    <p style="font-size:10px;color:#64748b;margin-top:6px">Checks are read from
    <code>campaignActivationGate.ts</code> when this page is built, so the document cannot
    describe a gate that is not there.</p>`;
  return htmlDoc({ title: 'C6.10 - Campaign Activation Readiness Gate', css, body });
}

function buildDocument() {
  const split = D.assertAutomationSplitIsHonest();
  const sig = D.assertNoBypass();
  const m = D.MEASURED;
  const css = baseCss() + SHARED;
  const body = `
    <h1>C6.10 &middot; The activation readiness gate: what must pass before a single
    message goes out</h1>
    <p class="lede">The ticket's framing is that the worst outcome of this initiative would
    be a broad send that damages the brand or breaches a rule. This is the gate that stops
    it, and it blocks rather than advises.</p>

    <h2>The finding that set the design</h2>
    <div class="alarm"><strong>${m.activeButUnapproved} campaigns are
    <code>status='active'</code> with <code>approval_status='draft'</code></strong>, measured
    in production on ${esc(D.AS_OF)}. They are live having never been approved. One is
    ${esc(m.unapprovedExample)}.</div>
    <p>They got there because there were two doors and only one was locked.</p>
    ${doorTable()}
    <p><code>activateCampaign</code> is what the admin route, <code>campaignRecoveryService</code>,
    <code>finalActivation</code> and <code>goLiveOrchestration</code> all call. It is now
    gated, and the gate runs before <code>campaign.update</code> so a refused campaign is
    never written.</p>

    <h2>The ${D.CHECKS.length} checks</h2>
    <p>${split.automated} are enforced automatically against services that already exist;
    ${split.manual.length} are recorded as a human attestation. The split is not a
    convenience: a check marked automatic that nothing enforces is the worst kind of green
    tick.</p>
    ${checkTable(true)}

    <h2>Why two checks stay manual</h2>
    <ul>
      <li><strong>claims_approved.</strong> The C0.6 registry governs page copy and lives in
      the frontend. This service cannot read a campaign's rendered message and judge whether
      every claim in it traces to a registry row. Marking it automatic would be a lie told
      by a passing test. It is attested in
      <code>settings.activation_gate.claims_approved</code>.</li>
      <li><strong>dry_run_reviewed.</strong> A machine can produce the dry run; only a person
      can have read it.</li>
    </ul>
    <p>Both require <code>{ by, at }</code>. A half-written attestation is refused, because
    that is how a tick-box gets faked.</p>

    <h2>What turning this on will block</h2>
    <p>Stated here rather than discovered by a watchdog at three in the morning:</p>
    <table><tbody>
      <tr><td>Campaigns in the system</td><td class="num">${m.campaigns}</td></tr>
      <tr><td>With a governance config (the publish validator requires one)</td>
        <td class="num">${m.governanceConfigs}</td></tr>
      <tr><td>With a sender identity</td><td class="num">${m.withSenderIdentity}</td></tr>
      <tr><td>With a tracking link</td><td class="num">${m.withTracking}</td></tr>
      <tr><td>Active but never approved</td><td class="num">${m.activeButUnapproved}</td></tr>
      <tr><td>Paused and still on approval_status='draft'</td>
        <td class="num">${m.pausedAndDraft}</td></tr>
    </tbody></table>
    <p>So: <strong>no campaign passes this gate today</strong>, and recovery of the
    ${m.pausedAndDraft} paused draft campaigns would be refused until they are approved and
    given a governance config. That is the correct behavior for a gate whose job is to stop
    an unapproved send, and it is a real operational change that is yours to time.</p>

    <h2>No bypass, deliberately</h2>
    <p><code>assertActivationAllowed(${esc(sig)})</code> takes a campaign id and nothing
    else. A gate with an escape hatch is a recommendation, and the situation in which
    somebody reaches for the hatch is exactly the situation the gate exists for. A build
    assertion fails if a <code>force</code>, <code>bypass</code>, <code>skip</code> or
    <code>override</code> parameter is ever added.</p>

    <h2>Limits</h2>
    <ul>
      <li>Contact sendability is checked for up to 200 enrolled leads per campaign. Above
      that the check is a sample, not a census, and it says so in the code.</li>
      <li>The stop rule check confirms a numeric rule was WRITTEN DOWN. It cannot judge
      whether the number is wise; C6.8 is where that argument belongs.</li>
      <li>The gate guards activation. It does not guard a send that an already-active
      campaign makes, which is <code>evaluateSend</code>'s job and unchanged here.</li>
    </ul>

    <h2>What needs your decision</h2>
    <ol>
      <li><strong>The ${m.activeButUnapproved} live, unapproved campaigns.</strong> Approve
      them retrospectively, or pause them. They are sending today.</li>
      <li><strong>When to merge.</strong> This blocks activation until campaigns carry a
      governance config and an approval. That is the point, and the timing is yours.</li>
      <li>Whether the manual attestations should be a route rather than a settings field.</li>
    </ol>

    <p style="font-size:10px;color:#64748b;margin-top:12px">
    <strong>REVIEW STATE: READY FOR ALI REVIEW - PR OPEN</strong></p>`;
  return htmlDoc({ title: 'C6.10 - Campaign Activation Readiness Gate', css, body });
}

module.exports = { buildVisual, buildDocument };
