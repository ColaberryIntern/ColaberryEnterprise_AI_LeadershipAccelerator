/**
 * The shared look for every artifact PDF, plus the chart primitives.
 *
 * ## Why hand-rolled SVG rather than a charting library
 *
 * These PDFs are rendered headless and then attached to a Basecamp ticket, where nobody will ever
 * re-run the build. A chart that silently renders empty because a CDN was slow is worse than no
 * chart, because the PDF still looks finished. Every chart here is a pure function from numbers to
 * an SVG string: no network, no canvas, no race. Mermaid is the one exception (it genuinely needs
 * a layout engine) and `renderArtifactPdf` asserts its SVG exists before it will emit a PDF.
 *
 * ## Colors
 *
 * From `frontend/src/styles/tokens.css`, which is the source of truth. The baseline-ui skill's
 * summary table was wrong about this for months -- it listed a navy `--color-primary` that appears
 * nowhere in the stylesheet -- so these are copied from the file, not from the summary.
 */

const CHERRY = '#FB2832';
const CHERRY_DEEP = '#C20E1E';
const CHERRY_BG = '#FFF0F1';
const LEAF = '#77BB4A';
const INK = '#2d3748';
const MUTED = '#718096';
const BORDER = '#e2e8f0';
const BG_ALT = '#f7fafc';

/** Severity ramp for matrices and status chips. Red is reserved for "this is actually bad". */
const SEV = { ok: '#2f7d32', watch: '#b26a00', bad: '#b3261e', none: MUTED };

const TOKENS = { CHERRY, CHERRY_DEEP, CHERRY_BG, LEAF, INK, MUTED, BORDER, BG_ALT, SEV };

/** Escape for text that lands inside markup. Artifact text is ours, but data is data. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function baseCss() {
  return `
  :root {
    --cherry: ${CHERRY}; --cherry-deep: ${CHERRY_DEEP}; --cherry-bg: ${CHERRY_BG};
    --leaf: ${LEAF}; --ink: ${INK}; --muted: ${MUTED}; --border: ${BORDER}; --bg-alt: ${BG_ALT};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: var(--ink); background: #fff;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 10.5pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 19pt; line-height: 1.15; margin: 0 0 4px; color: var(--cherry); font-weight: 700; }
  h2 {
    font-size: 12.5pt; margin: 20px 0 8px; color: var(--cherry-deep); font-weight: 700;
    border-bottom: 2px solid var(--cherry-bg); padding-bottom: 4px;
  }
  h3 { font-size: 10.5pt; margin: 14px 0 5px; font-weight: 700; color: var(--ink); }
  p { margin: 0 0 8px; }
  code { font-family: Consolas, monospace; font-size: 9pt; background: var(--bg-alt);
         padding: 1px 4px; border-radius: 3px; }
  .meta { font-size: 8.5pt; color: var(--muted); }
  .rule { height: 3px; background: var(--cherry); margin: 10px 0 14px; border-radius: 2px; }

  /* The takeaway box. Ali reads this and nothing else if the day is bad. */
  .takeaway {
    background: var(--cherry-bg); border-left: 5px solid var(--cherry);
    padding: 12px 14px; margin: 0 0 16px; border-radius: 0 5px 5px 0;
  }
  .takeaway .label {
    font-size: 8pt; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
    color: var(--cherry-deep); margin-bottom: 4px;
  }
  .takeaway .headline { font-size: 12pt; font-weight: 700; line-height: 1.35; }

  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; }
  th {
    text-align: left; background: var(--bg-alt); color: var(--ink); font-weight: 700;
    padding: 6px 8px; border-bottom: 2px solid var(--border); font-size: 8.5pt;
    text-transform: uppercase; letter-spacing: .04em;
  }
  td { padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:nth-child(even) td { background: #fcfcfd; }

  .chip {
    display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: 7.8pt;
    font-weight: 700; color: #fff; white-space: nowrap;
  }
  .cards { display: flex; gap: 10px; margin: 10px 0 14px; }
  .card {
    flex: 1; border: 1px solid var(--border); border-radius: 6px; padding: 9px 11px;
    background: #fff;
  }
  .card .n { font-size: 20pt; font-weight: 700; line-height: 1; color: var(--cherry); }
  .card .k { font-size: 7.8pt; color: var(--muted); text-transform: uppercase;
             letter-spacing: .05em; margin-top: 3px; }
  .note {
    border: 1px solid var(--border); border-left: 4px solid var(--muted);
    background: var(--bg-alt); padding: 9px 11px; margin: 10px 0; font-size: 9pt;
    border-radius: 0 5px 5px 0;
  }
  .note.warn { border-left-color: ${SEV.bad}; background: #fdf3f2; }
  .note.good { border-left-color: ${SEV.ok}; background: #f3f9f3; }
  figure { margin: 10px 0 14px; page-break-inside: avoid; }
  figcaption { font-size: 8pt; color: var(--muted); margin-top: 5px; }
  .mermaid { text-align: center; }
  .pagebreak { page-break-before: always; }
  `;
}

/**
 * Horizontal bar chart. Values are drawn to scale against `max`, and every bar carries its own
 * number, because a bar whose label has to be inferred from its length is decoration.
 */
function barChart({ rows, max, width = 660, barH = 20, gap = 7, labelW = 190 }) {
  const top = max || Math.max(...rows.map((r) => r.value), 1);
  const plotW = width - labelW - 56;
  const h = rows.length * (barH + gap);
  const bars = rows.map((r, i) => {
    const y = i * (barH + gap);
    const w = Math.max(1, Math.round((r.value / top) * plotW));
    const fill = r.color || CHERRY;
    return `
    <text x="0" y="${y + barH * 0.72}" font-size="9" fill="${INK}">${esc(r.label)}</text>
    <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="2.5" fill="${fill}"/>
    <text x="${labelW + w + 6}" y="${y + barH * 0.72}" font-size="9" font-weight="700"
          fill="${INK}">${esc(r.display != null ? r.display : r.value)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${h}" width="100%" role="img">${bars}</svg>`;
}

/**
 * Stacked single bar, for "N of M" compositions where the parts must visibly sum to the whole.
 * A pie would make the reader estimate angles; this makes the proportion literal.
 */
function stackBar({ parts, width = 660, height = 30 }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let x = 0;
  const segs = parts.map((p) => {
    const w = (p.value / total) * width;
    const seg = `<rect x="${x}" y="0" width="${w}" height="${height}" fill="${p.color}"/>`
      + (w > 26
        ? `<text x="${x + w / 2}" y="${height * 0.68}" font-size="11" font-weight="700"
                 fill="#fff" text-anchor="middle">${p.value}</text>` : '');
    x += w;
    return seg;
  }).join('');
  const key = parts.map((p) => `
    <span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:8.5pt">
      <span style="width:9px;height:9px;border-radius:2px;background:${p.color};
                   display:inline-block"></span>${esc(p.label)}
    </span>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img">${segs}</svg>
          <div style="margin-top:5px">${key}</div>`;
}

module.exports = { TOKENS, SEV, esc, baseCss, barChart, stackBar };
