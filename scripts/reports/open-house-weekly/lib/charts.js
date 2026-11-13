/**
 * C123: dependency-free inline SVG charts for the weekly report (funnel, clustered columns, bars, donut, scroll curve,
 * histogram) plus the people grid. Every function returns a string; text is always escaped.
 */
'use strict';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { navy: '#1a365d', blue: '#2b6cb0', sky: '#63b3ed', teal: '#319795', green: '#2f855a', amber: '#b7791f', red: '#c53030', grey: '#a0aec0', ink: '#2d3748', mute: '#718096', line: '#e2e8f0' };
const STATUS = { good: C.green, ok: C.amber, bad: C.red, low: C.grey, none: C.blue };
const TONE = { mute: '#cbd5e0', info: C.sky, warn: '#f6ad55', good: '#68d391', best: C.green };

/** Centered funnel: bar width = share of visitors (min 6% so a zero step still shows), color = target status. */
function funnelSvg(rows) {
  const W = 760, rowH = 46, top = rows[0].n || 1;
  const body = rows.map((r, i) => {
    const w = Math.max(0.06, r.n / top) * 380, x = 250 + (380 - w) / 2, y = i * rowH + 6;
    const pctTxt = r.pctPrev === null ? '' : `${r.pctPrev}% of step before`;
    return `<g><text x="0" y="${y + 26}" font-size="20">${r.icon}</text>
      <text x="30" y="${y + 18}" font-size="12.5" fill="${C.ink}" font-weight="600">${esc(r.step)}</text>
      <text x="30" y="${y + 34}" font-size="11" fill="${C.mute}">${esc(pctTxt)}</text>
      <rect x="${x}" y="${y}" width="${w}" height="${rowH - 10}" rx="6" fill="${r.n === 0 ? C.grey : STATUS[r.status] || C.blue}" opacity="0.9"/>
      <text x="440" y="${y + 23}" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">${r.n}</text>
      <text x="${W}" y="${y + 23}" text-anchor="end" font-size="12" fill="${C.mute}">${r.pctTop === null ? '' : r.pctTop + '% of visitors'}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${rows.length * rowH}" role="img" aria-label="Funnel" class="chart">${body}</svg>`;
}

/** Clustered columns by day, Power BI style, with a legend. series = [{key,label,color}]. */
function columnsSvg(daily, series) {
  const W = 760, H = 230, padL = 34, padB = 34, n = daily.length || 1;
  const max = Math.max(1, ...daily.flatMap((d) => series.map((s) => d[s.key])));
  const gw = (W - padL - 10) / n, bw = Math.min(26, (gw - 14) / series.length);
  const yOf = (v) => H - padB - (v / max) * (H - padB - 26);
  const grid = [0, 0.5, 1].map((f) => { const v = Math.round(max * f), y = yOf(v);
    return `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" stroke="${C.line}"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="${C.mute}">${v}</text>`; }).join('');
  const cols = daily.map((d, i) => {
    const gx = padL + i * gw + (gw - bw * series.length) / 2;
    const bars = series.map((s, k) => { const y = yOf(d[s.key]);
      return `<rect x="${gx + k * bw}" y="${y}" width="${bw - 3}" height="${H - padB - y}" rx="3" fill="${s.color}"><title>${esc(s.label)}: ${d[s.key]}</title></rect>
        <text x="${gx + k * bw + (bw - 3) / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="${C.ink}">${d[s.key]}</text>`; }).join('');
    const day = new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${bars}<text x="${padL + i * gw + gw / 2}" y="${H - 12}" text-anchor="middle" font-size="11" fill="${C.mute}">${esc(day)}</text>`;
  }).join('');
  const legend = series.map((s, k) => `<rect x="${padL + k * 120}" y="2" width="11" height="11" rx="2" fill="${s.color}"/><text x="${padL + k * 120 + 16}" y="12" font-size="11" fill="${C.ink}">${esc(s.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily trend" class="chart">${legend}${grid}${cols}</svg>`;
}

/** Horizontal bars for a breakdown (visitors) with the sign-up rate as a colored pill. */
function breakdownSvg(rows, gradeOf) {
  const W = 360, rowH = 34, max = Math.max(1, ...rows.map((r) => r.visitors));
  const body = rows.map((r, i) => {
    const y = i * rowH, w = (r.visitors / max) * 170, g = gradeOf(r);
    return `<text x="0" y="${y + 20}" font-size="12" fill="${C.ink}">${esc(r.label)}</text>
      <rect x="110" y="${y + 7}" width="${Math.max(2, w)}" height="18" rx="4" fill="${C.blue}" opacity="0.85"/>
      <text x="${114 + w}" y="${y + 21}" font-size="11" fill="${C.ink}">${r.visitors}</text>
      <rect x="300" y="${y + 6}" width="58" height="20" rx="10" fill="${STATUS[g.status]}"/>
      <text x="329" y="${y + 20}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${g.pct ?? 0}%</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${Math.max(1, rows.length) * rowH}" role="img" aria-label="Breakdown" class="chart">${body}</svg>`;
}

/** Donut from parts [{label,n,color}]. */
function donutSvg(parts, centerLabel) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1, R = 54, r = 34, cx = 70, cy = 70;
  let a0 = -Math.PI / 2;
  const arcs = parts.filter((p) => p.n > 0).map((p) => {
    const a1 = a0 + (p.n / total) * Math.PI * 2 - (p.n === total ? 0.0001 : 0);
    const big = a1 - a0 > Math.PI ? 1 : 0, pt = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
    const d = `M ${pt(R, a0)} A ${R} ${R} 0 ${big} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${big} 0 ${pt(r, a0)} Z`;
    a0 = a1;
    return `<path d="${d}" fill="${p.color}"><title>${esc(p.label)}: ${p.n}</title></path>`;
  }).join('');
  const legend = parts.map((p, i) => `<rect x="150" y="${18 + i * 22}" width="11" height="11" rx="2" fill="${p.color}"/><text x="166" y="${28 + i * 22}" font-size="11.5" fill="${C.ink}">${esc(p.label)}: <tspan font-weight="700">${p.n}</tspan> (${Math.round((100 * p.n) / total)}%)</text>`).join('');
  return `<svg viewBox="0 0 360 ${Math.max(140, 30 + parts.length * 22)}" role="img" aria-label="Donut" class="chart">${arcs}<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="${C.navy}">${esc(centerLabel)}</text>${legend}</svg>`;
}

/** Share of visitors still on the page at each scroll depth. */
function scrollSvg(scroll, visitors) {
  const pts = [['Arrived', visitors], ['25%', scroll.d25], ['50%', scroll.d50], ['75%', scroll.d75], ['90%', scroll.d90], ['Bottom', scroll.d100]];
  const W = 360, H = 170, x0 = 30, step = (W - x0 - 20) / (pts.length - 1), yOf = (v) => 20 + (1 - v / Math.max(1, visitors)) * 110;
  const line = pts.map(([, v], i) => `${x0 + i * step},${yOf(v)}`).join(' ');
  const dots = pts.map(([l, v], i) => `<circle cx="${x0 + i * step}" cy="${yOf(v)}" r="4" fill="${C.blue}"/>
    <text x="${x0 + i * step}" y="${yOf(v) - 9}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${C.ink}">${Math.round((100 * v) / Math.max(1, visitors))}%</text>
    <text x="${x0 + i * step}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${C.mute}">${esc(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scroll depth" class="chart"><polygon points="${x0},130 ${line} ${x0 + (pts.length - 1) * step},130" fill="${C.sky}" opacity="0.25"/><polyline points="${line}" fill="none" stroke="${C.blue}" stroke-width="2.5"/>${dots}</svg>`;
}

/** Histogram of where quitters left the video. */
function exitSvg(bins) {
  const W = 360, H = 160, max = Math.max(1, ...bins.map((b) => b.n)), bw = (W - 20) / bins.length;
  const bars = bins.map((b, i) => { const h = (b.n / max) * 100, x = 10 + i * bw;
    return `<rect x="${x + 6}" y="${125 - h}" width="${bw - 12}" height="${Math.max(1, h)}" rx="4" fill="${i === 0 ? C.red : C.amber}"/>
      <text x="${x + bw / 2}" y="${120 - h}" text-anchor="middle" font-size="11" font-weight="700" fill="${C.ink}">${b.n}</text>
      <text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle" font-size="10" fill="${C.mute}">${esc(b.label)}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Video exits" class="chart">${bars}</svg>`;
}

/** One person glyph per human, colored by the furthest point reached. */
function peopleGrid(p) {
  const glyph = (color, title) => `<svg viewBox="0 0 20 24" class="pg" aria-hidden="true"><title>${esc(title)}</title><circle cx="10" cy="6" r="5" fill="${color}"/><path d="M1 24c0-6 4-10 9-10s9 4 9 10z" fill="${color}"/></svg>`;
  const icons = p.stages.flatMap((s) => Array.from({ length: s.n }, () => glyph(TONE[s.tone], s.label))).join('');
  const legend = p.stages.filter((s) => s.n > 0).map((s) => `<span class="lg"><i style="background:${TONE[s.tone]}"></i>${esc(s.label)} <b>${s.n}</b> <em>${s.pct}%</em></span>`).join('');
  return `<div class="pgrid">${icons}</div><div class="plegend">${legend}</div>`;
}

module.exports = { esc, C, STATUS, TONE, funnelSvg, columnsSvg, breakdownSvg, donutSvg, scrollSvg, exitSvg, peopleGrid };
