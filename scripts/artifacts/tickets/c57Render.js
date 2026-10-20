/**
 * C5.7 renderers. All data comes from c57Data; nothing is restated here.
 *
 * The one-pager leads with the verification method rather than the page, because the page
 * shipped a day ago and the thing that was actually missing was proof it is live.
 */
const D = require('./c57Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .lede{font-size:12.5px;line-height:1.5;margin:0 0 10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:8px 10px;margin:8px 0;
        font-size:11px}
  .ok{background:#f0fdf4;border-left:3px solid #16a34a;padding:8px 10px;margin:8px 0;
      font-size:11px}
  .yes{color:#16a34a;font-weight:700}
  .no{color:#b3261e;font-weight:700}
  .mono{font-family:var(--font-mono,monospace);font-size:10.5px;word-break:break-all}
  .num{font-variant-numeric:tabular-nums}
`;

function probeTable() {
  return `<table>
    <thead><tr><th>Expect</th><th>Needle in the served bundle</th><th>Why it is in the set</th></tr></thead>
    <tbody>${D.PROBES.map((p) => `<tr>
      <td class="${p.expect === 'present' ? 'yes' : 'no'}">${esc(p.expect.toUpperCase())}</td>
      <td class="mono">${esc(p.needle)}</td>
      <td>${esc(p.what)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function criteriaTable() {
  return `<table>
    <thead><tr><th></th><th>Criterion</th><th>Evidence</th></tr></thead>
    <tbody>${D.CRITERIA.map((c) => `<tr>
      <td class="${c.met ? 'yes' : 'no'}">${c.met ? '&#10003;' : '&#10007;'}</td>
      <td>${esc(c.c)}</td>
      <td>${esc(c.evidence)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function manifestTable() {
  const rows = [
    ['Route', D.PAGE.route],
    ['Production URL', D.PAGE.productionUrl],
    ['Auth', D.PAGE.auth],
    ['Feature flag', D.PAGE.featureFlag],
    ['Data source', D.PAGE.dataSource],
    ['Component', D.PAGE.component],
    ['PR', `#${D.PAGE.pr}, merged ${D.PAGE.prMergedAt}`],
    ['Deployed commit', D.DEPLOYED_COMMIT],
    ['Bundle verified', `${D.BUNDLE.path} (${D.BUNDLE.bytes.toLocaleString()} bytes)`],
    ['Verified at', D.AS_OF],
    ['Rollback', D.PAGE.rollback],
  ];
  return `<table><tbody>${rows.map(([k, v]) => `<tr>
    <td style="width:26%"><strong>${esc(k)}</strong></td>
    <td class="${/URL|commit|Bundle|Route/.test(k) ? 'mono' : ''}">${esc(v)}</td>
  </tr>`).join('')}</tbody></table>`;
}

function buildVisual() {
  const probes = D.assertProbesAreTwoWay();
  const status = D.assertStatusCodeTrapIsStated();
  const crit = D.assertUnmetCriteriaAreAdmitted();
  const css = baseCss() + SHARED;
  const body = `
    <h1>C5.7 &middot; Higher education page: verified live</h1>
    <p class="lede"><strong>The page shipped on 18 October. What was missing was proof it is
    actually running, and getting that proof honestly took more than a request.</strong>
    ${crit.met} of ${crit.total} acceptance criteria are met; the one that is not is recorded
    as not met rather than reinterpreted.</p>

    <div class="flag"><strong>On a single-page app, a 200 proves nothing.</strong>
    <code>${esc(D.STATUS_CODE_TRAP.live.path)}</code> returns ${status}. So does
    <code>${esc(D.STATUS_CODE_TRAP.nonsense.path)}</code>. The router serves index.html for
    every path, so the status code cannot tell a live route from one that was never built.
    Any "production verified" resting on a 200 from this host would have passed here while
    proving nothing.</div>

    <div class="grid2">
      <div>
        <h2>The channel that does work</h2>
        <p style="font-size:11px;margin:4px 0 8px">The served JavaScript bundle, checked in
        BOTH directions: ${probes.present} strings unique to this page must be present, and
        ${probes.absent} strings from work that is written but unmerged must be absent. The
        absent half is what makes the present half mean anything.</p>
        ${probeTable()}
        <div class="ok"><strong>All six behaved as expected.</strong> The page is live at the
        URL below, and the probe could have told us if it were not.</div>
      </div>
      <div>
        <h2>Acceptance criteria</h2>
        ${criteriaTable()}
      </div>
    </div>

    <div class="ok"><strong>Live at
    <span class="mono">${esc(D.PAGE.productionUrl)}</span></strong> &middot; public, no auth,
    no feature flag &middot; served from deployed commit
    <span class="mono">${esc(D.DEPLOYED_COMMIT.slice(0, 12))}</span>, which has PR
    ${D.PAGE.pr}'s merge commit as an ancestor. The full manifest and rollback steps are in
    the document.</div>

    <p style="font-size:10px;color:#64748b;margin-top:6px">Verified ${esc(D.AS_OF)} against
    the deployed bundle. No code was changed by this artifact.</p>`;
  return htmlDoc({ title: 'C5.7 - Higher Education Page', css, body });
}

function buildDocument() {
  const probes = D.assertProbesAreTwoWay();
  const crit = D.assertUnmetCriteriaAreAdmitted();
  const css = baseCss() + SHARED;
  const body = `
    <h1>C5.7 &middot; Higher education page, and how it was verified in production</h1>
    <p class="lede">The code shipped as PR ${D.PAGE.pr} on 18 October. This records what
    shipped, proves it is live, and writes down the method, because the obvious way to check
    would have been wrong.</p>

    <h2>The criterion that kept this open</h2>
    <p>"Production URL recorded after deploy". The ticket's own watcher had already said why
    it could not close itself: <em>"Merged is not deployed. This watcher reads pull request
    state only; it has no deploy signal and does not know whether this is running in
    production."</em> That is an unusually honest piece of automation and it was right.</p>

    <h2>Why a 200 was not good enough</h2>
    <p>Measured against the live host on ${esc(D.AS_OF)}:</p>
    <table><tbody>
      <tr><td class="mono">${esc(D.STATUS_CODE_TRAP.live.path)}</td>
        <td class="num">${D.STATUS_CODE_TRAP.live.status}</td></tr>
      <tr><td class="mono">${esc(D.STATUS_CODE_TRAP.nonsense.path)}</td>
        <td class="num">${D.STATUS_CODE_TRAP.nonsense.status}</td></tr>
    </tbody></table>
    <p>${esc(D.STATUS_CODE_TRAP.lesson)} This is worth carrying to every future production
    verification on this site: the app is a single-page app, so <strong>every</strong> path
    returns 200, including paths that have never existed.</p>

    <h2>The verification that does hold</h2>
    <p>Fetch the served bundle and check it in both directions. ${probes.present} needles
    that must be present, ${probes.absent} that must be absent. The absent set is drawn from
    C5.9, which is written but not merged, so if those strings ever appear the probe is
    reading something other than production.</p>
    ${probeTable()}
    <p>All six behaved as expected, against
    <code>${esc(D.BUNDLE.path)}</code> (${D.BUNDLE.bytes.toLocaleString()} bytes) served from
    the deployed commit <code>${esc(D.DEPLOYED_COMMIT)}</code>, which has PR ${D.PAGE.pr}'s
    merge commit as an ancestor.</p>

    <h2>Acceptance criteria</h2>
    <p>${crit.met} of ${crit.total} met.</p>
    ${criteriaTable()}

    <h2>Manifest</h2>
    ${manifestTable()}

    <h2>Limits</h2>
    <ul>${D.LIMITS.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>

    <h2>What needs your decision</h2>
    <ol>
      <li>Copy approval, which the ticket names as your call and which merging the PR did
      not settle.</li>
      <li>Whether to close the ticket. The page is live and verified; one criterion reads
      "PR open, not merged" and the PR is merged, which is a fact about sequencing rather
      than a defect.</li>
    </ol>

    <p style="font-size:10px;color:#64748b;margin-top:12px">
    <strong>REVIEW STATE: READY FOR ALI REVIEW - PROD VERIFIED</strong></p>`;
  return htmlDoc({ title: 'C5.7 - Higher Education Page', css, body });
}

module.exports = { buildVisual, buildDocument };
