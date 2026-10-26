/**
 * C9.4 - renders the one-page runbook and the full conversion process.
 *
 * Both read c94Data, whose guards refuse a stage name that is not in C8.4, a step with
 * no owner, timebox or exit, a reserved concession that quietly acquired a number, and
 * any discount other than the one C2.3 approved.
 */
const D = require('./c94Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .blind{display:inline-block;background:#fdecea;color:#b3261e;font-size:8px;
         font-weight:700;padding:1px 5px;border-radius:3px}
  .seen{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:8px;
        font-weight:700;padding:1px 5px;border-radius:3px}
  .appr{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:9px;
        font-weight:700;padding:2px 8px;border-radius:3px}
  .resv{display:inline-block;background:#fff7ed;color:#9a3412;font-size:9px;
        font-weight:700;padding:2px 8px;border-radius:3px}
  .legal{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
         font-weight:700;padding:2px 8px;border-radius:3px}
  .num{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:10px 12px;font-size:11.5px}
  .key{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
       margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/**
 * The pipeline. Four C8.4 stages, the steps inside each, and which of them the
 * instrumentation can actually see.
 */
function pipeline(w = 940) {
  const stages = [
    { key: 'demo_delivered', label: 'Demo delivered', seen: false },
    { key: 'pilot_proposed', label: 'Pilot proposed', seen: true },
    { key: 'contract', label: 'Contract', seen: true },
    { key: D.HANDOFF.toStageKey, label: D.HANDOFF.toStageLabel, seen: false },
  ];
  const gap = 12;
  const colW = (w - gap * (stages.length - 1)) / stages.length;
  const h = 215;
  const stepGap = 38;

  /**
   * Wrap a timebox onto at most two lines.
   *
   * The first version printed it as one line and the two longest timeboxes ran straight
   * out of their column and over the next one. SVG text does not wrap on its own, so the
   * break has to be computed. 42 characters is what fits inside a column at 8.5px with
   * the 12px padding on each side.
   */
  const wrap = (text, max = 42) => {
    const out = [];
    let line = '';
    for (const word of String(text).split(' ')) {
      if ((line + ' ' + word).trim().length > max && line) { out.push(line); line = word; } else {
        line = (line + ' ' + word).trim();
      }
    }
    if (line) out.push(line);
    return out.slice(0, 2);
  };

  const cols = stages.map((s, i) => {
    const x = i * (colW + gap);
    const steps = D.STEPS.filter((t) => t.stageKey === s.key);
    const stroke = s.seen ? '#2f7d32' : '#b3261e';
    const fill = s.seen ? '#f0fdf4' : '#fef2f2';
    const badge = s.seen ? 'COUNTABLE' : 'NOT INSTRUMENTED';

    const stepText = steps.map((t, j) => {
      const y0 = 78 + j * stepGap;
      const lines = wrap(t.timebox).map((ln, k) => `<text x="${x + 12}"
        y="${y0 + 12 + k * 11}" font-size="8.5" fill="#64748b">${esc(ln)}</text>`).join('');
      return `<text x="${x + 12}" y="${y0}" font-size="10" font-weight="600"
        fill="#334155">${t.n}. ${esc(t.step)}</text>${lines}`;
    }).join('');

    const empty = steps.length === 0
      ? `<text x="${x + 12}" y="${80}" font-size="9" fill="#64748b" font-style="italic">
           handoff out of this runbook</text>`
      : '';

    return `<rect x="${x}" y="18" width="${colW}" height="${h - 34}" rx="4"
        fill="${fill}" stroke="${stroke}" stroke-width="1"
        ${s.seen ? '' : 'stroke-dasharray="4 2"'}/>
      <text x="${x + 12}" y="40" font-size="11.5" font-weight="700"
        fill="#334155">${esc(s.label)}</text>
      <rect x="${x + 12}" y="48" width="${badge.length * 5.0 + 10}" height="13" rx="2"
        fill="${s.seen ? '#e8f5e9' : '#fdecea'}"/>
      <text x="${x + 17}" y="57.5" font-size="7.5" font-weight="700"
        fill="${stroke}">${badge}</text>
      ${stepText}${empty}
      ${i < stages.length - 1 ? `<text x="${x + colW + 2}" y="${h / 2 + 4}"
        font-size="13" fill="#94a3b8">&#8250;</text>` : ''}`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="Four C8.4 funnel stages from demo delivered to pilot running, with the
    seven runbook steps inside them; the first and last stages are not instrumented">
    <text x="0" y="10" font-size="9" font-weight="700" fill="#64748b">
      C8.4 FUNNEL STAGES, WITH THIS RUNBOOK'S STEPS INSIDE THEM</text>
    ${cols}</svg>`;
}

/** One page: the pipeline, the concession limits, and the one write that makes it measurable. */
function buildVisual() {
  const approved = D.assertConcessionsAreExplicit();
  D.assertNoInventedDiscount();
  const steps = D.assertEveryStepIsOwnedTimedAndExitable();

  const rows = D.CONCESSIONS.map((c) => {
    const cls = c.status === 'APPROVED' ? 'appr'
      : (c.status === 'RESERVED - LEGAL' ? 'legal' : 'resv');
    return `<tr><td style="width:19%"><strong>${esc(c.lever)}</strong></td>
      <td style="width:15%"><span class="${cls}">${esc(c.status)}</span></td>
      <td style="width:26%">${c.limit ? esc(c.limit) : '<em>Approver decides</em>'}</td>
      <td>${esc(c.authority)}</td></tr>`;
  }).join('');

  const body = `
    <h1 style="margin:0">Demo to pilot: ${steps} steps, one owner, and a clock that does
    not exist yet</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C9.4 &#183; stage names read
    from C8.4 at build time &#183; ${esc(D.AS_OF)}</p>

    ${pipeline()}

    <div class="bad" style="margin-top:2px"><strong>${esc(D.MEASUREMENT_GAP.metric)} cannot
    be computed today.</strong> The clock starts at <code>demo_delivered</code>, which
    C8.4 records as source null and evidence absent, and stops at
    <code>pilot_proposed</code>, which is countable. The end of the interval is
    measurable and the start is not. <strong>${esc(D.MEASUREMENT_GAP.fix)}</strong></div>

    <h2 style="font-size:13px;margin:10px 0 2px">Concession limits</h2>
    <table style="margin-top:2px"><thead><tr><th>Lever</th><th>Status</th>
      <th>Limit</th><th>Authority</th></tr></thead><tbody>${rows}</tbody></table>

    <p style="font-size:10.5px;color:#64748b;margin-top:2px">${approved} of
    ${D.CONCESSIONS.length} levers has an approved number, and it is carried from C2.3
    rather than set here. The rest are the Approver's call, and are left empty on purpose
    so this document does not make that call by looking like a process.</p>`;

  return htmlDoc({ title: 'C9.4 demo to pilot runbook', css: baseCss() + SHARED, body });
}

/** The full runbook. */
function buildDocument() {
  D.assertEveryStepIsOwnedTimedAndExitable();
  D.assertConcessionsAreExplicit();
  D.assertNoInventedDiscount();
  D.assertTheMeasurementGapIsDeclared();

  const body = `
    <h1>C9.4 &#183; Demo-to-pilot conversion runbook</h1>
    <p class="lede" style="font-size:13px">What happens between a good demo and a signed
    pilot. Seven steps across four C8.4 funnel stages, each with an owner, a timebox and
    an exit criterion, and a concession table whose only approved number comes from
    C2.3.</p>

    <h2>Who owns what</h2>
    <table><thead><tr><th style="width:20%">Role</th><th style="width:14%">Held by</th>
      <th>Note</th></tr></thead>
      <tbody>${D.ROLES.map((r) => `<tr><td><strong>${esc(r.role)}</strong></td>
        <td>${r.holder ? esc(r.holder) : '<span class="legal">UNASSIGNED</span>'}</td>
        <td>${esc(r.note)}</td></tr>`).join('')}</tbody></table>

    <h2>The runbook</h2>
    ${D.STEPS.map((s) => `
      <h3><span class="num">${s.n}</span>${esc(s.step)}
        <span style="font-size:10px;color:#64748b;font-weight:400">
        &#183; C8.4 stage: ${esc(s.stageLabel)}</span></h3>
      <table style="margin:4px 0 6px"><tbody>
        <tr><td style="width:16%"><strong>Owner</strong></td><td>${esc(s.owner)}</td></tr>
        <tr><td><strong>Timebox</strong></td><td>${esc(s.timebox)}</td></tr>
        <tr><td><strong>Exit criterion</strong></td><td>${esc(s.exit)}</td></tr>
      </tbody></table>
      <p style="font-size:10.5px;color:#475569">${esc(s.note)}</p>`).join('')}

    <h2>Handoff to ${esc(D.HANDOFF.toStageLabel)}</h2>
    <p>${esc(D.HANDOFF.what)}</p>
    <div class="key">${esc(D.HANDOFF.caveat)}</div>

    <h2>Concession limits</h2>
    <p>Every lever is listed, because an unlisted lever is the one that gets conceded in
    the room. One has an approved number. The rest are the Approver's, and this document
    deliberately does not fill them in.</p>
    <table>
      <thead><tr><th style="width:16%">Lever</th><th style="width:13%">Status</th>
        <th style="width:21%">Limit</th><th style="width:18%">Authority</th>
        <th>Basis</th></tr></thead>
      <tbody>${D.CONCESSIONS.map((c) => {
    const cls = c.status === 'APPROVED' ? 'appr'
      : (c.status === 'RESERVED - LEGAL' ? 'legal' : 'resv');
    return `<tr><td><strong>${esc(c.lever)}</strong></td>
          <td><span class="${cls}">${esc(c.status)}</span></td>
          <td>${c.limit ? esc(c.limit) : '<em>Approver decides</em>'}</td>
          <td>${esc(c.authority)}</td><td>${esc(c.basis)}</td></tr>
        <tr><td colspan="5" style="font-size:10px;color:#475569;border-bottom:1px solid #e2e8f0">
          ${esc(c.note)}</td></tr>`;
  }).join('')}</tbody>
    </table>

    <h2>What this runbook cannot yet be measured by</h2>
    <p>The ticket names "${esc(D.MEASUREMENT_GAP.metric)}" as the test of whether this was
    commercially useful. <strong>${esc(D.MEASUREMENT_GAP.verdict)}.</strong></p>
    <p>${esc(D.MEASUREMENT_GAP.because)}</p>
    <div class="key"><strong>The fix is one write.</strong>
    ${esc(D.MEASUREMENT_GAP.fix)}</div>
    <p>${esc(D.MEASUREMENT_GAP.alsoBlind)}</p>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}. The
    stage names in this document are read from
    <code>backend/src/services/commercialization/funnelStages.ts</code> at build time and
    the build fails if any of them has drifted. The data module also refuses a step with
    no owner, timebox or exit criterion, a reserved concession that has acquired a number,
    and any discount other than the ${D.PRICING.discountHeadroomPct}% C2.3 approved.</p>`;

  return htmlDoc({
    title: 'C9.4 demo-to-pilot conversion runbook',
    css: baseCss() + SHARED,
    body,
  });
}

module.exports = { buildVisual, buildDocument };
