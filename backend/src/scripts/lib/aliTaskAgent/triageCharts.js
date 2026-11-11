/**
 * triageCharts - the SVG marks for the triage board. Pure: (data) -> string.
 *
 * Inline SVG rather than a charting library, because this file is read by a human deciding what
 * to kill and by a browser with no network guarantee. Every chart here carries direct labels and
 * is repeated as a table in the board, which is what discharges the contrast WARN the palette
 * validator raised on the lightest ramp step.
 *
 * COLOUR, and why it is a ramp rather than a set of hues:
 *
 * Age is ordinal magnitude, not identity, so it takes ONE hue varying in lightness. The first
 * attempt used amber/orange/red as a categorical set and failed validation - amber against red is
 * ΔE 2.9 under deuteranopia, which is to say indistinguishable. Lightness order survives every
 * kind of colour blindness; hue order does not.
 *
 * Dormant is NEUTRAL on purpose. It is the one band that is not an emergency, and colouring the
 * oldest items the most alarming shade is precisely the mistake the board exists to correct.
 *
 * Both ramps are validated (scripts/validate_palette.js): light passes every check with one
 * contrast WARN on the lightest step, relieved by labels and the table; dark passes lightness,
 * chroma and contrast.
 */

const RAMP_LIGHT = { fresh: '#f59e0b', overdue: '#ea580c', aging: '#9a3412', dormant: '#64748b' };
const RAMP_DARK = { fresh: '#9c560e', overdue: '#b86718', aging: '#d07922', dormant: '#94a3b8' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Band colour as a CSS variable, so dark mode is a redefinition rather than a second code path. */
const bandVar = (key) => `var(--band-${key})`;

/**
 * Horizontal bars for the age histogram.
 *
 * Horizontal because the category labels are words ("61-120d"), and words read straight across.
 * Marks are thin with a 4px rounded end anchored to the baseline, and every bar is directly
 * labelled, so no legend is needed and no value is hidden behind a hover.
 */
function histogramSvg(histogram, opts = {}) {
  const rows = histogram.filter((h) => h.n > 0 || opts.keepEmpty);
  if (!rows.length) return '<p class="empty">Nothing to chart.</p>';
  const max = Math.max(...rows.map((r) => r.n), 1);
  const rowH = 30;
  const labelW = 74;
  const valueW = 56;
  const w = 560;
  const barMax = w - labelW - valueW - 12;
  const h = rows.length * rowH + 8;

  const bars = rows.map((r, i) => {
    const y = i * rowH + 4;
    const bw = Math.max(2, Math.round((r.n / max) * barMax));
    const key = r.max <= 0 ? 'fresh' : r.max <= 30 ? 'overdue' : r.max <= 60 ? 'aging' : 'dormant';
    const pct = opts.total ? ` (${Math.round((r.n / opts.total) * 100)}%)` : '';
    return `<g class="bar-row">
      <title>${esc(r.label)}: ${r.n} task${r.n === 1 ? '' : 's'}${esc(pct)}</title>
      <text x="0" y="${y + 15}" class="cat">${esc(r.label)}</text>
      <rect x="${labelW}" y="${y + 4}" width="${bw}" height="14" rx="4" fill="${bandVar(key)}"/>
      <text x="${labelW + bw + 8}" y="${y + 15}" class="val">${r.n}${esc(pct)}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img"
    aria-label="Task count by how overdue it is. ${rows.map((r) => `${r.label}: ${r.n}`).join('. ')}">
    ${bars}
  </svg>`;
}

/**
 * The scatter that proves the point: days overdue against the urgency the engine assigned.
 *
 * If urgency measured urgency, the cloud would slope. Because `dueIn < 0` contributes a flat +40,
 * it forms a horizontal band: a task 100 days late scores the same as one a day late. This chart
 * is the argument, which is why it is here rather than a sentence claiming the same thing.
 */
const SCATTER_MAX = 600;

/**
 * Overplotting is a real failure, not a cosmetic one. The first run against production fed 2,694
 * points in and produced an unreadable slab plus a 512KB file. Above SCATTER_MAX the chart takes
 * an even stride through the set and SAYS SO on the chart, because a sampled chart presented as a
 * complete one is a lie told in pictures. The stride is deterministic, so the same input always
 * draws the same picture.
 */
function sampleEvenly(points, max = SCATTER_MAX) {
  if (points.length <= max) return { shown: points, sampled: false };
  const stride = points.length / max;
  const shown = [];
  for (let i = 0; i < max; i += 1) shown.push(points[Math.floor(i * stride)]);
  return { shown, sampled: true };
}

function scatterSvg(pointsIn, opts = {}) {
  if (!pointsIn || !pointsIn.length) return '<p class="empty">No dated tasks to plot.</p>';
  const { shown: points, sampled } = sampleEvenly(pointsIn, opts.max || SCATTER_MAX);
  const w = 560;
  const h = 240;
  const pad = { l: 42, r: 14, t: 14, b: 34 };
  const maxDays = Math.max(...points.map((p) => p.days), 10);
  const x = (d) => pad.l + (Math.max(0, d) / maxDays) * (w - pad.l - pad.r);
  const y = (s) => h - pad.b - (Math.min(100, Math.max(0, s)) / 100) * (h - pad.t - pad.b);

  const grid = [0, 25, 50, 75, 100].map((s) =>
    `<line x1="${pad.l}" y1="${y(s)}" x2="${w - pad.r}" y2="${y(s)}" class="grid"/>
     <text x="${pad.l - 6}" y="${y(s) + 4}" class="axis" text-anchor="end">${s}</text>`).join('');

  const ticks = [0, Math.round(maxDays / 2), maxDays].map((d) =>
    `<text x="${x(d)}" y="${h - 10}" class="axis" text-anchor="middle">${d}d</text>`).join('');

  // Smaller marks and partial opacity, because even 600 points overlap: the shape of the cloud is
  // the message, and a solid slab has no shape.
  const dots = points.map((p) => {
    const key = p.days <= 0 ? 'fresh' : p.days <= 30 ? 'overdue' : p.days <= 60 ? 'aging' : 'dormant';
    return `<circle cx="${x(p.days).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="3.5"
      fill="${bandVar(key)}" class="dot"><title>${esc(p.title)}
${p.days} days overdue, urgency ${p.score}</title></circle>`;
  }).join('');

  const notes = [opts.note, sampled ? `showing ${points.length} of ${pointsIn.length}, evenly sampled` : null]
    .filter(Boolean);
  const note = notes.map((t, i) =>
    `<text x="${pad.l + 6}" y="${pad.t + 12 + i * 14}" class="note">${esc(t)}</text>`).join('');

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img"
    aria-label="Urgency score against days overdue. ${pointsIn.length} dated tasks${sampled ? `, ${points.length} drawn` : ''}. The points form a flat band rather than a slope, which shows urgency does not rise with lateness.">
    ${grid}${ticks}${note}${dots}
    <text x="${(w / 2).toFixed(0)}" y="${h - 1}" class="axis" text-anchor="middle">days overdue</text>
  </svg>`;
}

/** A stat tile. The hero number is the figure; the caption says what it is; no chart junk. */
function tile(value, caption, opts = {}) {
  const tone = opts.tone ? ` tone-${opts.tone}` : '';
  const sub = opts.sub ? `<div class="tile-sub">${esc(opts.sub)}</div>` : '';
  return `<div class="tile${tone}">
    <div class="tile-value">${esc(String(value))}</div>
    <div class="tile-cap">${esc(caption)}</div>${sub}
  </div>`;
}

/** Band pill: colour AND icon AND word, never colour alone. */
function bandPill(band) {
  return `<span class="pill pill-${band.key}"><span class="pill-icon" aria-hidden="true">${band.icon}</span>${esc(band.label)}</span>`;
}

module.exports = { RAMP_LIGHT, RAMP_DARK, histogramSvg, scatterSvg, tile, bandPill, esc, bandVar };
