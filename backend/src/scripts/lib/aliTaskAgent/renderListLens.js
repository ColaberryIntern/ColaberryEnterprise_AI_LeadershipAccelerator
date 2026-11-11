/**
 * renderListLens - the strategic half of the board: one card per list.
 *
 * Each card has to answer four things without being opened, because a card nobody opens is a card
 * that failed:
 *
 *   how big and how dead   the counts and a band bar, so the shape is visible at a glance
 *   where it sits          its position in the numbered program it belongs to
 *   what the spearhead is  the single most urgent task, named, with its date
 *   what to do about it    ranked moves, each with its evidence and a command
 *
 * Both modes are on every card on purpose. Ali asked to be strategic about a list as a whole OR to
 * drop into one ticket, so "work just the lead task" is always present and always last. A report
 * that forces one mode makes the other mode somebody else's problem.
 */

const { esc } = require('./triageCharts');
const { categoryOf } = require('./listCategories');

const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/**
 * A stacked band bar, in pure CSS widths rather than SVG.
 *
 * At this size an SVG would carry more markup than mark. The 2px gaps between segments are the
 * house rule for adjacent fills, and each segment is titled so the hover gives the number without
 * printing four labels on a 6px-tall bar.
 */
function bandBar(bands, total) {
  const seg = bands.filter((b) => b.n > 0).map((b) =>
    `<span class="seg seg-${b.band}" style="flex:${b.n}" title="${b.n} ${esc(b.band)}"></span>`).join('');
  return `<div class="bar" role="img" aria-label="${bands.filter((b) => b.n).map((b) => `${b.n} ${b.band}`).join(', ')} of ${total}">${seg}</div>`;
}

function leadBlock(lead) {
  if (!lead) return '';
  const when = lead.daysOverdue != null && lead.daysOverdue > 0
    ? `${lead.daysOverdue}d overdue`
    : (lead.dueOn ? `due ${lead.dueOn}` : 'no date');
  const title = lead.url
    ? `<a href="${esc(lead.url)}">${esc(lead.title)}</a>`
    : esc(lead.title);
  return `<div class="lead">
    <div class="lead-cap">Spearhead</div>
    <div class="lead-title">${title}</div>
    <div class="lead-meta">${esc(when)}${lead.urgency != null ? ` &middot; urgency ${esc(String(lead.urgency))}` : ''}</div>
  </div>`;
}

function phaseBlock(s) {
  if (!s.phaseOf) return '';
  const dots = s.siblings.concat([s])
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((o) => {
      const me = o.key === s.key;
      const dead = o.dormant === o.total && o.total > 0;
      return `<span class="phase ${me ? 'phase-me' : ''} ${dead ? 'phase-dead' : ''}"
        title="${esc(String(o.position))}. ${esc(o.name)} - ${o.total} task${o.total === 1 ? '' : 's'}${dead ? ', all dormant' : ''}">${esc(String(o.position))}</span>`;
    }).join('');
  return `<div class="phases">
    <span class="phases-cap">Phase ${s.phaseOf.position} of ${s.phaseOf.of}</span>${dots}
  </div>`;
}

function suggestionsBlock(s) {
  return `<ul class="moves">${s.suggestions.map((m) => `<li class="move move-${m.key}">
    <div class="move-top"><span class="move-label">${esc(m.label)}</span>
      <button class="copy" data-copy="${esc(m.command)}" type="button">copy</button></div>
    <div class="move-why">${esc(m.why)}</div>
    <code class="move-cmd">${esc(m.command)}</code>
  </li>`).join('')}</ul>`;
}

function taskRows(s, limit = 6) {
  const rows = s.tasks.slice(0, limit).map((t) => {
    const title = t.url ? `<a href="${esc(t.url)}">${esc(t.title)}</a>` : esc(t.title);
    const late = t.daysOverdue != null && t.daysOverdue > 0 ? `${t.daysOverdue}d` : '';
    return `<tr class="band-${esc(t.band)}">
      <td class="t-mark" title="${esc(t.band)}"><span class="dot dot-${esc(t.band)}"></span></td>
      <td class="t-title">${title}</td>
      <td class="t-due">${esc(t.dueOn || '-')}</td>
      <td class="t-late">${esc(late)}</td>
    </tr>`;
  }).join('');
  const more = s.tasks.length > limit
    ? `<tr><td></td><td class="t-more" colspan="3">and ${s.tasks.length - limit} more</td></tr>` : '';
  return `<details class="drill"><summary>All ${s.total} tasks</summary>
    <table class="tasks"><tbody>${rows}${more}</tbody></table></details>`;
}

function listCard(s) {
  const dormantPct = pctOf(s.dormant, s.total);
  const tone = s.dormant === s.total ? 'card-dead' : (s.dormant ? 'card-mixed' : 'card-live');
  const cat = categoryOf(s.key);
  return `<article class="card ${tone}" data-cat="${esc(cat.key)}">
    <header class="card-head">
      <h3 class="card-title"><span class="card-cat" title="${esc(cat.label)}">${cat.icon}</span> ${esc(s.name)}</h3>
      <span class="card-count">${s.total}</span>
    </header>
    ${phaseBlock(s)}
    ${bandBar(s.bands, s.total)}
    <div class="card-stats">
      <span>${s.live} live</span>
      <span>${s.dormant} dormant (${dormantPct}%)</span>
      ${s.oldestDue ? `<span>oldest ${esc(s.oldestDue)}</span>` : ''}
      ${s.humanShare >= 0.5 ? `<span class="warn">${Math.round(s.humanShare * 100)}% human</span>` : ''}
      ${s.generatedShare >= 0.6 ? '<span class="warn">generated</span>' : ''}
    </div>
    ${leadBlock(s.lead)}
    ${suggestionsBlock(s)}
    ${taskRows(s)}
  </article>`;
}

function renderListLens(summaries, opts = {}) {
  const shown = summaries.slice(0, opts.limit || 12);
  if (!shown.length) return '';
  const covered = shown.reduce((a, s) => a + s.total, 0);
  const all = summaries.reduce((a, s) => a + s.total, 0);

  return `<section id="lists">
    <h2>By list: the strategic view</h2>
    <p class="lede">A list is a phase, not a folder. Deciding one list resolves every task in it,
      which is why the biggest are shown first. Every card also carries the single most urgent task,
      so you can drop into the trenches from the same place you set strategy.</p>
    <p class="callout"><strong>${shown.length} lists cover ${covered} of ${all} tasks.</strong>
      Deciding these is worth more than working any individual ticket in them.</p>
    <div class="cards">${shown.map(listCard).join('')}</div>
  </section>`;
}

const LIST_LENS_CSS = `
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;margin-top:14px}
  .card{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface)}
  .card-dead{border-left:4px solid var(--band-dormant)}
  .card-mixed{border-left:4px solid var(--band-aging)}
  .card-live{border-left:4px solid var(--band-overdue)}
  .card-head{display:flex;align-items:baseline;gap:10px}
  .card-title{font-size:15px;margin:0;flex:1;color:var(--ink)}
  .card-count{font-size:20px;font-weight:700;color:var(--ink-2)}
  .phases{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:8px 0 2px}
  .phases-cap{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);margin-right:4px}
  .phase{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;
    border-radius:4px;font-size:10px;font-weight:700;background:color-mix(in srgb,var(--ink) 9%,transparent);
    color:var(--ink-3)}
  .phase-dead{opacity:.45}
  .phase-me{background:var(--band-overdue);color:#fff}
  .bar{display:flex;gap:2px;height:7px;margin:9px 0 7px}
  .seg{border-radius:2px}
  .seg-fresh{background:var(--band-fresh)}
  .seg-overdue{background:var(--band-overdue)}
  .seg-aging{background:var(--band-aging)}
  .seg-dormant{background:var(--band-dormant)}
  .card-stats{display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--ink-3)}
  .card-stats .warn{color:var(--band-aging);font-weight:600}
  .lead{margin:11px 0 0;padding:9px 11px;border-radius:8px;
    background:color-mix(in srgb,var(--ink) 4%,transparent)}
  .lead-cap{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink-3)}
  .lead-title{font-size:13px;font-weight:600;margin-top:2px;color:var(--ink)}
  .lead-title a{color:var(--accent);text-decoration:none}
  .lead-meta{font-size:11px;color:var(--ink-3);margin-top:2px}
  .moves{list-style:none;margin:11px 0 0;padding:0}
  .move{border-top:1px solid var(--line);padding:9px 0 8px}
  .move-top{display:flex;align-items:center;gap:8px}
  .move-label{font-size:12.5px;font-weight:600;color:var(--ink)}
  .move-why{font-size:11.5px;color:var(--ink-3);margin:2px 0 5px}
  .move-cmd{display:block;font:11px/1.5 ui-monospace,Consolas,monospace;color:var(--ink-2);
    background:color-mix(in srgb,var(--ink) 5%,transparent);padding:5px 8px;border-radius:5px;
    overflow-x:auto;white-space:nowrap}
  .drill{margin-top:10px}
  .drill summary{font-size:11.5px;color:var(--ink-3);cursor:pointer}
  table.tasks{width:100%;border-collapse:collapse;margin-top:7px;font-size:12px}
  table.tasks td{padding:5px 6px 5px 0;border-bottom:1px solid var(--line);vertical-align:top}
  .t-mark{width:14px}
  .dot{display:inline-block;width:7px;height:7px;border-radius:50%}
  .dot-fresh{background:var(--band-fresh)} .dot-overdue{background:var(--band-overdue)}
  .dot-aging{background:var(--band-aging)} .dot-dormant{background:var(--band-dormant)}
  .t-title a{color:var(--accent);text-decoration:none}
  .t-due,.t-late{color:var(--ink-3);white-space:nowrap;font-size:11px}
  .t-more{color:var(--ink-3);font-size:11px}
`;

module.exports = { renderListLens, listCard, bandBar, LIST_LENS_CSS };
