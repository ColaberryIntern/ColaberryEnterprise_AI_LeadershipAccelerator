/**
 * C8.10 - renders the one-page summary and the full instrumentation report.
 *
 * Both read c810Data, whose guards refuse a criterion marked met on mechanism alone, a
 * failure with no stated way to close it, and a document that has stopped explaining why
 * the viewer table is empty.
 */
const D = require('./c810Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .met{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:9px;
       font-weight:700;padding:2px 8px;border-radius:3px}
  .notmet{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
          font-weight:700;padding:2px 8px;border-radius:3px}
  .num{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .key{background:#fff7ed;border-left:3px solid #ea580c;padding:10px 12px;font-size:11.5px;
       margin:8px 0}
  .flat{background:#f1f5f9;border-left:3px solid #64748b;padding:9px 11px;font-size:11px;
        margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/**
 * The timeline, which is the whole finding in one picture: both airings sit inside the
 * window in which the instrument was not recording, and the fix landed after the last one.
 */
function timeline(w = 940) {
  const h = 196;
  const x0 = 62;
  const x1 = w - 46;
  const DAY0 = 9;
  const DAYN = 27;
  const px = (d) => x0 + ((d - DAY0) / (DAYN - DAY0)) * (x1 - x0);
  const axisY = 112;

  const ticks = [9, 12, 15, 18, 21, 24, 27].map((d) => `
    <line x1="${px(d).toFixed(1)}" y1="${axisY}" x2="${px(d).toFixed(1)}" y2="${axisY + 5}"
      stroke="#94a3b8" stroke-width="1"/>
    <text x="${px(d).toFixed(1)}" y="${axisY + 20}" text-anchor="middle" font-size="9"
      fill="#64748b">${d} Oct</text>`).join('');

  const marker = (d, color) => `<circle cx="${px(d).toFixed(1)}" cy="${axisY}" r="5.5"
    fill="${color}" stroke="#ffffff" stroke-width="2"/>`;

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="Timeline showing both Colaberry Live airings inside the period when
    telemetry was not recording, with the fix landing four days after the last airing">

    <!-- The band stops ABOVE the date labels on purpose. At full height it covered
         "9 Oct" through "18 Oct", and the one thing a reader has to be able to do with
         this picture is read the dates the outage spans. -->
    <rect x="${px(9).toFixed(1)}" y="${axisY - 28}" width="${(px(18) - px(9)).toFixed(1)}"
      height="36" fill="#fdecea" stroke="#b3261e" stroke-dasharray="3 2" stroke-width="1"/>
    <text x="${((px(9) + px(18)) / 2).toFixed(1)}" y="${axisY - 36}" text-anchor="middle"
      font-size="10.5" font-weight="700" fill="#b3261e">
      Every telemetry beat write failed</text>

    <line x1="${x0}" y1="${axisY}" x2="${x1}" y2="${axisY}" stroke="#94a3b8" stroke-width="1.5"/>
    ${ticks}

    ${marker(13, '#b3261e')}
    <line x1="${px(13).toFixed(1)}" y1="${axisY - 7}" x2="${px(13).toFixed(1)}" y2="${axisY - 58}"
      stroke="#b3261e" stroke-width="1"/>
    <text x="${px(13).toFixed(1)}" y="${axisY - 63}" text-anchor="middle" font-size="10"
      font-weight="600" fill="#334155">Test airing</text>

    ${marker(14, '#b3261e')}
    <line x1="${px(14).toFixed(1)}" y1="${axisY + 7}" x2="${px(14).toFixed(1)}" y2="${axisY + 34}"
      stroke="#b3261e" stroke-width="1"/>
    <text x="${px(14).toFixed(1)}" y="${axisY + 47}" text-anchor="middle" font-size="10"
      font-weight="600" fill="#334155">First private technical airing</text>

    ${marker(18, '#2f7d32')}
    <line x1="${px(18).toFixed(1)}" y1="${axisY - 7}" x2="${px(18).toFixed(1)}" y2="${axisY - 58}"
      stroke="#2f7d32" stroke-width="1"/>
    <text x="${px(18).toFixed(1)}" y="${axisY - 63}" text-anchor="middle" font-size="10"
      font-weight="600" fill="#1b5e20">Beat writes fixed</text>

    <circle cx="${px(26).toFixed(1)}" cy="${axisY}" r="4" fill="#0f766e"/>
    <text x="${px(26).toFixed(1)}" y="${axisY - 16}" text-anchor="middle" font-size="10"
      font-weight="600" fill="#0f766e">Today</text>

    <text x="${((px(18) + px(26)) / 2).toFixed(1)}" y="${axisY + 47}" text-anchor="middle"
      font-size="10.5" font-weight="700" fill="#64748b">No airing since the fix</text>
  </svg>`;
}

/** One page: what is built, what is empty, and the two things that are not code. */
function buildVisual() {
  const total = D.assertEveryVerdictIsBinaryAndActionable();
  const met = D.assertNoCriterionIsMetOnMechanismAlone();
  const r = D.RECOMMENDATION;

  const rows = D.CRITERIA.map((c) => `<tr>
      <td><span class="num">${c.n}</span></td>
      <td><strong>${esc(c.name)}</strong></td>
      <td><span class="${c.verdict === 'MET' ? 'met' : 'notmet'}">${c.verdict}</span></td>
      <td>${c.blockedOn ? `Waiting on ${esc(c.blockedOn)}` : 'Done'}</td>
    </tr>`).join('');

  const body = `
    <h1 style="margin:0">Colaberry Live: the instrument is built, the audience is unproven</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C8.10 &middot;
    ${met} of ${total} criteria met &middot; measured against production ${esc(D.AS_OF)}</p>

    <div class="key" style="margin-top:9px"><strong>The viewer table is empty, and that is
    not a finding about the audience.</strong> Colaberry Live has aired twice. Every
    telemetry beat written between 9 and 18 October failed, and the fix landed four days
    after the last airing. Nobody has aired since.</div>

    ${timeline()}

    <table>
      <thead><tr><th style="width:5%">#</th><th style="width:46%">Criterion</th>
        <th style="width:13%">Verdict</th><th>Blocked on</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="flat"><strong>Neither open criterion is waiting on engineering.</strong>
    ${esc(r.ask)}</div>

    <p style="font-size:11px;color:#64748b;margin-top:4px"><strong>On the 881:</strong>
    ${esc(D.EIGHT_EIGHT_ONE.soWhat)}</p>`;

  return htmlDoc({ title: 'C8.10 Colaberry Live population', css: baseCss() + SHARED, body });
}

/** The full report. */
function buildDocument() {
  const m = D.MEASURED;
  const r = D.RECOMMENDATION;
  D.assertTheZeroIsExplained();
  D.assertTheProbeShowsBothSides();

  const body = `
    <h1>C8.10 &middot; Colaberry Live population instrumentation</h1>
    <p class="lede" style="font-size:13px">Three criteria. One is met. The other two are
    waiting on an airing and on a token permission, and neither is a code gap.</p>

    <div class="key"><strong>${esc(r.verdict)}.</strong> ${esc(r.because)}</div>

    <h2>What the production data actually says</h2>
    <p>Colaberry Live has two live inputs in the Cloudflare account, and that is its entire
    history:</p>
    <ul>${m.liveInputs.map((i) => `<li><strong>${esc(i.name)}</strong> &mdash; created
      ${esc(i.created)}, a ${esc(i.kind)}</li>`).join('')}</ul>
    <table><tbody>
      <tr><td style="width:52%">Broadcast occurrences</td><td>${m.occurrenceRows}</td></tr>
      <tr><td>Broadcast series</td><td>${m.seriesRows}</td></tr>
      <tr><td><strong>Per-person viewer rows</strong></td>
        <td><strong>${m.viewerPeopleRows}</strong></td></tr>
      <tr><td>Per-tab viewer sessions</td><td>${m.viewerSessionRows}</td></tr>
      <tr><td>Occurrence rollups</td><td>${m.rollupRows}</td></tr>
      <tr><td>Recorded videos in Cloudflare</td><td>${m.recordedVideos}</td></tr>
      <tr><td>Recorded content minutes (not delivered minutes)</td>
        <td>${m.recordedContentMinutes}</td></tr>
    </tbody></table>

    <div class="key"><strong>Why the zero is not an audience number.</strong> Commit
    <code>3fac2543</code>, dated 18 October 2026, reads "Every broadcast beat write has
    failed since 2026-10-09; found by trying to test its lock". Both airings fall inside
    that window. The instrument was not recording while the only two broadcasts ran, and
    no broadcast has run since it was repaired. Reporting "0 learners" for October would
    describe the instrument and read as a fact about the audience.</div>

    <h2>Each criterion</h2>
    ${D.CRITERIA.map((c) => `
      <h3><span class="num">${c.n}</span>${esc(c.name)}
        <span class="${c.verdict === 'MET' ? 'met' : 'notmet'}">${c.verdict}</span></h3>
      <p><strong>Evidence.</strong> ${esc(c.evidence)}</p>
      <p><strong>Why.</strong> ${esc(c.why)}</p>
      ${c.toClose ? `<p><strong>What would close it.</strong> ${esc(c.toClose)}</p>` : ''}`).join('')}

    <h2>Criterion 2, probed rather than assumed</h2>
    <p>The conclusion rests on the contrast between these calls, not on any one of them.
    A single failing call would be consistent with a bad credential; a failing analytics
    call beside a working Stream call is not.</p>
    <table>
      <thead><tr><th style="width:34%">Call</th><th style="width:22%">Result</th>
        <th>What it means</th></tr></thead>
      <tbody>${D.CLOUDFLARE_PROBE.map((p) => `<tr>
        <td><code>${esc(p.call)}</code></td><td>${esc(p.result)}</td>
        <td>${esc(p.means)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>The 881 figure is not what the brief takes it for</h2>
    <p>The ticket states: "${esc(D.EIGHT_EIGHT_ONE.asStated)}" That reads as though 881
    were a claim about Colaberry Live's audience. It is not. In
    ${esc(D.EIGHT_EIGHT_ONE.source)} it reads
    "${esc(D.EIGHT_EIGHT_ONE.actually)}".</p>
    <p>${esc(D.EIGHT_EIGHT_ONE.soWhat)}</p>

    <h2>What was built</h2>
    ${D.BUILT.map((b) => `<p><strong>${esc(b.what)}.</strong> ${esc(b.detail)}</p>`).join('')}

    <h2>What was deliberately not built</h2>
    <p>This ticket warns against shipping a schema that reads as capability. The mirror
    risk is shipping a second implementation of something already there, so these were
    considered and rejected:</p>
    <ul>${D.NOT_BUILT.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

    <h2>What is needed to close this</h2>
    <p><strong>${esc(r.ask)}</strong></p>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}.
    All production figures were read read-only. The data module refuses to mark a
    criterion met on the strength of code existing, and refuses to ship this document at
    all if the explanation for the empty table is removed or if viewer rows appear without
    the measurement being redone.</p>`;

  return htmlDoc({
    title: 'C8.10 Colaberry Live population instrumentation',
    css: baseCss() + SHARED,
    body,
  });
}

module.exports = { buildVisual, buildDocument };
