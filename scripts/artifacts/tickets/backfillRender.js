/**
 * Turn one `backfillData` entry into its two PDFs.
 *
 * Generic on purpose: six tickets rendered by one pair of functions cannot drift into six
 * slightly different house styles, and a fix to the layout fixes all six. The per-ticket
 * variation that matters -- the numbers, the diagram, the corrections -- lives in the data.
 */
const { esc, baseCss, barChart } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');
const { MEASURED_ON } = require('./backfillData');

const SHARED = `
  .askdel { margin: 0 0 13px; }
  .askdel .row { margin-bottom: 4px; }
  .askdel .lbl {
    display: inline-block; min-width: 66px; font-size: 7.4pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: .07em; color: var(--muted); vertical-align: top;
    padding-top: 2px;
  }
  .askdel .val { display: inline-block; width: calc(100% - 74px); vertical-align: top; }
  .corr {
    border: 1px solid #f0c9c6; border-left: 4px solid ${'#b3261e'}; background: #fdf3f2;
    padding: 8px 11px; margin: 10px 0; border-radius: 0 5px 5px 0;
  }
  .corr .lbl {
    font-size: 7.4pt; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
    color: #b3261e; margin-bottom: 3px;
  }
`;

/** The measured figures as a bar chart. Every artifact gets one; numbers are the point. */
function metricsChart(t, width) {
  const max = t.metricMax || Math.max(...t.metrics.map((m) => m.value), 1);
  const rows = t.metrics.map((m) => ({
    label: m.label,
    value: m.value,
    display: `${m.value}${t.metricUnit || ''}`,
    color: m.color,
  }));
  return barChart({ rows, max, width, barH: 17, gap: 6, labelW: Math.round(width * 0.46) });
}

/** The one-page visual. Capped at one page by the renderer, not by hope. */
function buildVisual(t) {
  const css = `${baseCss()}${SHARED}
    body { font-size: 9pt; }
    h1 { font-size: 15.5pt; }
    h2 { font-size: 9.5pt; margin: 11px 0 5px; }
    .wrap { display: flex; gap: 15px; }
    .col { flex: 1; }
    .takeaway { padding: 8px 11px; margin-bottom: 9px; }
    .takeaway .headline { font-size: 11pt; }
    .takeaway .label { font-size: 7pt; }
    ol.tk { margin: 4px 0 0 15px; padding: 0; font-size: 8pt; }
    ol.tk li { margin-bottom: 5px; }
    .mermaid svg { max-height: 150px; }
    figcaption { font-size: 7pt; }
    .footer { margin-top: 9px; font-size: 6.8pt; color: var(--muted);
              border-top: 1px solid var(--border); padding-top: 5px; }
    .ne { font-size: 7.6pt; margin: 3px 0 0 15px; padding: 0; }
    .ne li { margin-bottom: 3px; }
    .corr { padding: 6px 9px; font-size: 7.6pt; margin: 7px 0; }`;

  const body = `
  <h1>${esc(t.code)} &middot; ${esc(t.title)}</h1>
  <div class="meta">Agent Factory &middot; measured ${esc(MEASURED_ON)} &middot; shipped in
    ${esc(t.prLabel)} &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${t.headline}</div>
  </div>

  <div class="wrap">
    <div class="col">
      <h2>What was found</h2>
      <ol class="tk">${t.takeaway.slice(0, 3).map(([h, b]) =>
    `<li><strong>${h}</strong> ${b}</li>`).join('')}</ol>
      ${t.corrections.length ? `<div class="corr"><div class="lbl">Correction</div>
        ${t.corrections.map((c) => `<div>${c}</div>`).join('')}</div>` : ''}
    </div>
    <div class="col">
      <h2>Measured</h2>
      ${metricsChart(t, 420)}
      <figure><div class="mermaid">${t.mermaid}</div>
        <figcaption>${esc(t.mermaidCaption)}</figcaption></figure>
    </div>
  </div>

  <h2>What this does NOT establish</h2>
  <ul class="ne">${t.notEstablished.map((n) => `<li>${n}</li>`).join('')}</ul>

  <div class="footer">
    Built from the same data module as the ${esc(t.code)} document, so a number here cannot drift
    from a number there. Filed in ${esc(t.folder)}.
  </div>`;

  return htmlDoc({ title: `${t.code} one page`, css, body });
}

/** The document. Same spine as AF2.3's: asked/delivered, takeaway, evidence, limits. */
function buildDocument(t) {
  const css = `${baseCss()}${SHARED}
    ol.tk { margin: 6px 0 0 18px; padding: 0; }
    ol.tk li { margin-bottom: 8px; }`;

  const body = `
  <h1>${esc(t.code)} &middot; ${esc(t.title)}</h1>
  <div class="meta">Agent Factory &middot; measured ${esc(MEASURED_ON)} &middot; shipped in
    <a href="${esc(t.pr)}">${esc(t.prLabel)}</a> &middot; prepared for Ali Muwwakkil</div>
  <div class="rule"></div>

  <div class="askdel">
    <div class="row"><span class="lbl">Asked</span><span class="val">${esc(t.asked)}</span></div>
    <div class="row"><span class="lbl">Delivered</span><span class="val">${t.delivered}</span></div>
  </div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${t.headline}</div>
  </div>

  <ol class="tk">${t.takeaway.map(([h, b]) => `<li><strong>${h}</strong> ${b}</li>`).join('')}</ol>

  ${t.corrections.length ? `<div class="corr"><div class="lbl">What I got wrong first</div>
    ${t.corrections.map((c) => `<div>${c}</div>`).join('')}
    <div style="margin-top:4px;font-size:8.5pt;color:var(--muted)">Kept here rather than quietly
      overwritten: a backfill that tidies away its own mistakes is worth less than no backfill.
    </div></div>` : ''}

  <h2>Measured</h2>
  <figure>${metricsChart(t, 660)}
    <figcaption>Measured against production on ${esc(MEASURED_ON)}. Bars are to scale against
      ${t.metricMax ? `a maximum of ${t.metricMax}` : 'the largest value shown'}.</figcaption>
  </figure>

  <h2>How it works, or did not</h2>
  <figure><div class="mermaid">${t.mermaid}</div>
    <figcaption>${esc(t.mermaidCaption)}</figcaption></figure>

  <h2>What this does not establish</h2>
  <ul>${t.notEstablished.map((n) => `<li>${n}</li>`).join('')}</ul>

  <div class="meta" style="margin-top:16px;border-top:1px solid var(--border);padding-top:7px">
    Artifact for ${esc(t.code)}, filed in ${esc(t.folder)} and attached to the ticket. Built from
    the same data module as the one-page visual. Backfilled on ${esc(MEASURED_ON)} under the rule
    that a pull request is evidence and not an artifact.
  </div>`;

  return htmlDoc({ title: `${t.code} ${t.title}`, css, body });
}

module.exports = { buildVisual, buildDocument };
