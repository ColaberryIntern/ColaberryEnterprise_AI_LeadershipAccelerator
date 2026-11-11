/**
 * C123: assembles the weekly report HTML from the view model. Charts are inline SVG; the flow (Sankey) and the
 * decision tree are Mermaid, loaded from a pinned CDN build. Styling follows the baseline-ui tokens (navy/blue, calm).
 */
'use strict';
const M = require('./model');
const I = require('./insights');
const X = require('./charts');
const { esc, C, STATUS } = X;

const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
const PILL = { good: 'On target', ok: 'Watch', bad: 'Below target', low: 'Too few to judge', none: '' };

const arrow = (d, unit) => (d === null ? '<span class="d na">first week</span>'
  : d === 0 ? '<span class="d flat">● no change</span>'
  : `<span class="d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit === '%' ? ' pts' : ''}</span>`);

function kpiTiles(tiles) {
  return `<div class="kpis">${tiles.map((t) => `<div class="kpi s-${t.status}"><div class="ki">${t.icon}</div>
    <div class="kl">${esc(t.label)}</div><div class="kv">${t.value}${t.unit}</div><div class="ks">${esc(t.sub)}</div>${arrow(t.delta, t.unit)}</div>`).join('')}</div>`;
}

function funnelTable(rows, prevRows, targets) {
  const tr = rows.map((r, i) => {
    const t = r.rate ? targets.rates[r.rate] : null, p = prevRows && prevRows[i];
    return `<tr><td>${r.icon} ${esc(r.step)}</td><td class="num">${r.n}</td>
      <td class="num"><span class="cf cf-${r.status}">${r.pctPrev === null ? 'n/a' : r.pctPrev + '%'}</span></td>
      <td class="num">${r.pctTop === null ? 'n/a' : r.pctTop + '%'}</td>
      <td class="num">${t ? t.good + '%' : 'n/a'}</td>
      <td>${r.status !== 'none' ? `<span class="pill p-${r.status}">${PILL[r.status]}</span>` : ''}</td>
      <td class="num">${p ? arrow(M.delta(r.n, p.n)) : arrow(null)}</td></tr>`;
  }).join('');
  return `<table class="tbl"><thead><tr><th>Step</th><th>People</th><th>% of step before</th><th>% of visitors</th><th>Target</th><th>Status</th><th>vs last week</th></tr></thead><tbody>${tr}</tbody></table>`;
}

function forkCards(forks) {
  return `<div class="forks">${forks.map((f) => {
    const bar = f.options.filter((o) => o.n > 0).map((o) => `<span class="seg ${o.good ? 'g' : o.bad ? 'b' : 'n'}" style="flex:${o.n}" title="${esc(o.label)}">${o.pct >= 12 ? o.pct + '%' : ''}</span>`).join('') || '<span class="seg e" style="flex:1">nobody reached this fork yet</span>';
    const opts = f.options.map((o) => `<li><i class="${o.good ? 'g' : o.bad ? 'b' : 'n'}"></i>${esc(o.label)}<b>${o.n}</b><em>${o.pct === null ? 'n/a' : o.pct + '%'}</em></li>`).join('');
    const g = f.grade && f.grade.status !== 'none' ? `<span class="pill p-${f.grade.status}">${PILL[f.grade.status]}</span>` : '';
    return `<div class="fork"><div class="fh"><span class="fi">${f.icon}</span><span class="fq">${esc(f.q)}</span>${g}</div>
      <div class="split">${bar}</div><ul>${opts}</ul><div class="ft">${f.total} people at this fork${f.source ? ' · source: ' + esc(f.source) : ''}</div></div>`;
  }).join('')}</div>`;
}

// Sankey rows are CSV and sit inside HTML: drop commas/newlines, then escape (Mermaid reads the decoded text).
const sankeyLabel = (s) => esc(String(s).replace(/[,\r\n"]/g, ' ').trim());

function mermaidSankey(edges) {
  if (!edges.length) return '<p class="muted">No traffic in this window.</p>';
  return `<pre class="mermaid">---\nconfig:\n  sankey:\n    showValues: true\n    linkColor: source\n    width: 1000\n    height: 460\n---\nsankey-beta\n${edges.map((e) => `${sankeyLabel(e[0])},${sankeyLabel(e[1])},${e[2]}`).join('\n')}\n</pre>`;
}

/** Decision tree: each fork's options as branches, labeled with people and %; colored by good/bad. */
function mermaidTree(cur) {
  const j = cur.journey, e = cur.engagement, s = cur.signups, p = M.pct;
  const n = (id, label, count, base, cls) => `  ${id}["${label}<br/><b>${count}</b>${base ? ' · ' + (p(count, base) ?? 0) + '%' : ''}"]:::${cls}`;
  const lines = ['flowchart TD',
    n('V', '👀 Visited the page', cur.visitors, null, 'top'),
    n('S', '🖱️ Save my seat', e.seat, cur.visitors, 'good'),
    n('L', '🚶 Left without a click', e.read + e.skimmed + e.bounced, cur.visitors, 'bad'),
    n('Z', '💲 Start for $0', e.start, cur.visitors, 'mid'),
    n('U', '📝 Signed up', s.lp_from_seat_click, e.seat, 'good'),
    n('F', '❌ Left the form', Math.max(0, e.seat - s.lp_from_seat_click), e.seat, 'bad'),
    n('N', '🆕 New account', j.new_account, j.signups, 'good'),
    n('H', '👤 Had an account', j.existing_account, j.signups, 'mid'),
    n('B', '🚪 Entered: button', j.entered_button, j.new_account, 'good'),
    n('K', '🔗 Entered: email link', j.entered_link, j.new_account, 'good'),
    n('W', '📭 Not entered yet', Math.max(0, j.new_account - j.entered), j.new_account, 'bad'),
    n('P', '▶️ Pressed play', j.played, j.entered, 'good'),
    n('X', '⏸️ Did not press play', Math.max(0, j.entered - j.played), j.entered, 'bad'),
    n('D', '🏁 Watched 75%+', j.finished, j.played, 'good'),
    n('Q', '🚪 Quit video', Math.max(0, j.played - j.finished), j.played, 'bad'),
    n('R', '🎖️ Collected credit', M.credited(j), j.finished, 'good'),
    n('Y', '🙈 No credit collected', Math.max(0, j.finished - M.credited(j)), j.finished, 'bad'),
    n('C', '✅ Quick check', Math.min(j.took_check, M.credited(j)), M.credited(j), 'good'),
    n('A', '🏆 5 of 5', j.aced, j.took_check, 'good'),
    n('E', '🎥 At the welcome video', j.entered, null, 'mid'),
    '  V --> S & L & Z', '  S --> U & F', '  U --> N & H', '  N --> B & K & W', '  B --> E', '  K --> E', '  E --> P & X',
    '  P --> D & Q', '  D --> R & Y', '  R --> C', '  C --> A',
    `  classDef top fill:${C.navy},color:#fff,stroke:${C.navy}`,
    '  classDef good fill:#c6f6d5,color:#22543d,stroke:#2f855a', '  classDef bad fill:#fed7d7,color:#742a2a,stroke:#c53030',
    '  classDef mid fill:#bee3f8,color:#2a4365,stroke:#2b6cb0'];
  return `<pre class="mermaid">${lines.join('\n')}</pre>`;
}

function emailPanel(em) {
  if (!em) return '<p class="muted">Mandrill was not read for this run.</p>';
  const rows = [['Sent (our log)', em.emails], ['Found in Mandrill', em.found], ['Delivered', em.delivered], ['Opened', em.opened], ['Clicked', em.clicked]];
  return `<table class="tbl sm"><tbody>${rows.map(([l, v]) => `<tr><td>${l}</td><td class="num">${v}</td><td class="num">${M.pct(v, em.emails) ?? 0}%</td></tr>`).join('')}</tbody></table>`;
}

function shotsPanel(shots) {
  if (!shots || !shots.length) return '';
  return `<section><h2>📸 What the visitor sees</h2><p class="lede">Captured on a phone-sized screen, because most visitors are on a phone.</p><div class="shots">${shots.map((s) => `<figure><img src="${s.src}" alt="${esc(s.title)}"/><figcaption><b>${esc(s.title)}</b><br/>${esc(s.caption)}</figcaption></figure>`).join('')}</div></section>`;
}

module.exports = { kpiTiles, funnelTable, forkCards, mermaidSankey, mermaidTree, emailPanel, shotsPanel, MERMAID, PILL, STATUS, I, X, M };
