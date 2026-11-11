/**
 * renderTriageBoard - the visual triage board, as a standalone HTML page.
 *
 * SEPARATE FROM renderRunReport ON PURPOSE. That file is email-safe by constraint: tables, inline
 * hex, no CSS variables, no flex, because Gmail and Outlook strip the rest. This one is opened in
 * a browser, so it can carry real charts, a hover layer, dark mode and a Mermaid decision diagram.
 * Trying to serve both audiences from one renderer is how the email ends up broken and the board
 * ends up timid.
 *
 * What it is FOR: deciding. The existing digest lists tasks. This one answers, in order:
 *   1. how much of the backlog is actually alive
 *   2. whether the urgency number can be trusted at all
 *   3. which specific items are the decision today
 *
 * Pure: (summary) -> string. No I/O, no clock of its own.
 */

const { BANDS, bandFor, partition, summarize, urgencyVsAge } = require('./ageBands');
const { RAMP_LIGHT, RAMP_DARK, histogramSvg, scatterSvg, tile, bandPill, esc } = require('./triageCharts');

const pct = (n) => `${Math.round(n * 100)}%`;

function rowsTable(items, today, opts = {}) {
  if (!items.length) return `<p class="empty">${esc(opts.emptyMsg || 'Nothing here.')}</p>`;
  const body = items.slice(0, opts.limit || 40).map((it) => {
    const t = it.todo || {};
    const band = bandFor(t.due_on, today);
    const title = t.title || t.content || 'untitled';
    const link = it.url || t.url || (t.bc_app_url || '');
    const titleCell = link
      ? `<a href="${esc(link)}">${esc(title)}</a>`
      : esc(title);
    return `<tr class="band-${band.key}">
      <td class="c-band">${bandPill(band)}</td>
      <td class="c-title">${titleCell}<div class="proj">${esc(it.projectName || '')}</div></td>
      <td class="c-due">${esc(t.due_on || 'no date')}</td>
      <td class="c-score"><span class="score">${esc(String(it.score == null ? '' : it.score))}</span></td>
    </tr>`;
  }).join('');
  const more = items.length > (opts.limit || 40)
    ? `<p class="more">and ${items.length - (opts.limit || 40)} more</p>` : '';
  return `<table class="grid">
    <thead><tr><th>Band</th><th>Task</th><th>Due</th><th>Urgency</th></tr></thead>
    <tbody>${body}</tbody></table>${more}`;
}

/**
 * The decision diagram. Mermaid rather than prose because the rule has branches, and a branch
 * drawn is a branch you can argue with. It loads from a pinned CDN version and degrades to the
 * written rule underneath if the script does not load, so the page is never a blank box.
 */
function decisionDiagram() {
  return `<div class="mermaid">
flowchart TD
  A["Task is overdue"] --> B{"More than 60 days?"}
  B -- "No" --> C["Live queue: what dies today"]
  B -- "Yes" --> D{"Has anyone touched it since it was due?"}
  D -- "Yes" --> E["Re-date it. It is real, the date was wrong"]
  D -- "No" --> F{"Would anything break if it never happened?"}
  F -- "Yes" --> G["Re-date and name an owner"]
  F -- "No" --> H["Dismiss it. is_dismissed with a reason"]
  C --> I["Act, or queue for approval"]
</div>
<noscript><p class="fallback">Overdue by 60 days or less goes to the live queue. Beyond that: if someone has touched it, re-date it; if not, ask whether anything breaks if it never happens, and dismiss it when the answer is no.</p></noscript>`;
}

function renderTriageBoard(input) {
  const today = input.today ? new Date(input.today) : new Date();
  const items = Array.isArray(input.items) ? input.items : [];
  const s = summarize(items, today, { dormantAfterDays: input.dormantAfterDays });
  const { live, dormant } = partition(items, today, { dormantAfterDays: input.dormantAfterDays });
  const scatter = urgencyVsAge(items, today);

  const liveSorted = live.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  const dormantSorted = dormant.slice().sort((a, b) => {
    const da = a.todo && a.todo.due_on ? a.todo.due_on : '9999';
    const db = b.todo && b.todo.due_on ? b.todo.due_on : '9999';
    return da.localeCompare(db);
  });

  const cssVars = (ramp) => BANDS.map((b) => `--band-${b.key}:${ramp[b.key]};`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backlog Triage</title>
<style>
  :root{
    ${cssVars(RAMP_LIGHT)}
    --bg:#fcfcfb; --surface:#ffffff; --ink:#0f172a; --ink-2:#475569; --ink-3:#94a3b8;
    --line:#e2e8f0; --accent:#1a365d;
  }
  :root:not([data-theme="light"]) { }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      ${cssVars(RAMP_DARK)}
      --bg:#1a1a19; --surface:#232322; --ink:#f1f5f9; --ink-2:#cbd5e1; --ink-3:#94a3b8;
      --line:#334155; --accent:#93c5fd;
    }
  }
  :root[data-theme="dark"]{
    ${cssVars(RAMP_DARK)}
    --bg:#1a1a19; --surface:#232322; --ink:#f1f5f9; --ink-2:#cbd5e1; --ink-3:#94a3b8;
    --line:#334155; --accent:#93c5fd;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.6 'Segoe UI',system-ui,-apple-system,sans-serif;}
  .wrap{max-width:880px;margin:0 auto;padding:28px 16px 64px}
  h1{font-size:26px;line-height:1.25;margin:0 0 4px;color:var(--ink)}
  .sub{color:var(--ink-3);font-size:13px;margin:0 0 24px}
  h2{font-size:17px;margin:34px 0 4px}
  .lede{color:var(--ink-2);margin:0 0 14px;font-size:14px}
  section{background:var(--surface);border:1px solid var(--line);border-radius:12px;
    padding:18px 18px 20px;margin-bottom:18px}
  .tiles{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 6px}
  .tile{flex:1 1 150px;background:var(--surface);border:1px solid var(--line);
    border-radius:10px;padding:14px 16px}
  .tile-value{font-size:30px;font-weight:700;line-height:1.1;color:var(--ink)}
  .tile-cap{font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--ink-3);margin-top:3px}
  .tile-sub{font-size:12px;color:var(--ink-2);margin-top:6px}
  .tone-alarm .tile-value{color:var(--band-aging)}
  .tone-quiet .tile-value{color:var(--band-dormant)}
  svg{display:block;max-width:100%}
  .cat{font-size:12px;fill:var(--ink-2)}
  .val{font-size:12px;fill:var(--ink);font-weight:600}
  .axis{font-size:11px;fill:var(--ink-3)}
  .grid{stroke:var(--line);stroke-width:1}
  .note{font-size:12px;fill:var(--ink-3)}
  .dot{stroke:var(--surface);stroke-width:2;opacity:.85}
  .dot:hover{opacity:1;stroke-width:3}
  .bar-row:hover rect{opacity:.82}
  .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;
    padding:2px 9px;border-radius:999px;white-space:nowrap;color:#fff}
  .pill-icon{font-size:9px}
  .pill-fresh{background:var(--band-fresh)}
  .pill-overdue{background:var(--band-overdue)}
  .pill-aging{background:var(--band-aging)}
  .pill-dormant{background:var(--band-dormant)}
  table.grid{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  table.grid th{text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;
    color:var(--ink-3);border-bottom:1px solid var(--line);padding:6px 8px 6px 0;font-weight:600}
  table.grid td{padding:9px 8px 9px 0;border-bottom:1px solid var(--line);vertical-align:top}
  table.grid tbody tr:hover{background:color-mix(in srgb, var(--ink) 4%, transparent)}
  .c-band{width:108px}
  .c-due{width:92px;color:var(--ink-2);white-space:nowrap}
  .c-score{width:64px;text-align:right}
  .score{font-weight:700;color:var(--ink-2)}
  .c-title a{color:var(--accent);text-decoration:none}
  .c-title a:hover{text-decoration:underline}
  .proj{font-size:11px;color:var(--ink-3);margin-top:2px}
  .empty,.more,.fallback{color:var(--ink-3);font-size:13px;margin:10px 0 0}
  .callout{border-left:3px solid var(--band-aging);padding:10px 0 10px 14px;margin:14px 0 0;
    color:var(--ink-2);font-size:14px}
  .mermaid{margin-top:12px;background:transparent}
  footer{color:var(--ink-3);font-size:12px;margin-top:28px;text-align:center}
</style></head>
<body data-palette="${esc([RAMP_LIGHT.fresh, RAMP_LIGHT.overdue, RAMP_LIGHT.aging].join(','))}">
<div class="wrap">

  <h1>Backlog triage</h1>
  <p class="sub">${esc(input.runId || 'run')} &middot; ${esc(today.toISOString().slice(0, 16).replace('T', ' '))} UTC &middot; read-only</p>

  <section>
    <div class="tiles">
      ${tile(s.total, 'Assigned and active')}
      ${tile(s.liveCount, 'Live queue', { sub: 'overdue by 60 days or less, or not yet due' })}
      ${tile(s.dormantCount, 'Dormant', { tone: 'quiet', sub: `${pct(s.dormantShare)} of everything active` })}
      ${tile(s.worst ? `${s.worst.days}d` : '-', 'Oldest overdue', { tone: 'alarm', sub: s.worst ? s.worst.title.slice(0, 44) : '' })}
    </div>
    <p class="callout"><strong>${s.dormantCount} of ${s.total}</strong> active tasks have been overdue
      for more than sixty days. They are not a queue, they are a decision. Until they are dismissed or
      re-dated they will keep crowding out the work that is genuinely due, because the scoring treats
      "late" as a single flat state.</p>
  </section>

  <section>
    <h2>Where the backlog actually sits</h2>
    <p class="lede">Buckets widen as they age: the resolution that matters is at the recent end,
      where a decision is still live.</p>
    ${histogramSvg(s.histogram, { total: s.total })}
  </section>

  <section>
    <h2>Can the urgency number be trusted?</h2>
    <p class="lede">Urgency plotted against how late each task is. If the score measured urgency,
      this would slope. It does not, because being overdue contributes a flat amount no matter how
      overdue: one day late and one hundred days late score the same.</p>
    ${scatterSvg(scatter, { note: 'flat band = age is not being measured' })}
  </section>

  <section>
    <h2>The rule</h2>
    <p class="lede">What to do with an item, decided once rather than re-argued per ticket.</p>
    ${decisionDiagram()}
  </section>

  <section>
    <h2>Live queue <span class="sub">(${liveSorted.length})</span></h2>
    <p class="lede">What dies today. Sorted by urgency, which is meaningful inside this set because
      every item here is recent enough for the score to mean something.</p>
    ${rowsTable(liveSorted, today, { limit: 25, emptyMsg: 'Nothing live. That is a good day.' })}
  </section>

  <section>
    <h2>Dormant <span class="sub">(${dormantSorted.length})</span></h2>
    <p class="lede">Oldest first. For each: re-date it, or dismiss it with a reason. Leaving it is
      the one option that costs something, because it keeps the number above meaningless.</p>
    ${rowsTable(dormantSorted, today, { limit: 25, emptyMsg: 'Nothing dormant.' })}
  </section>

  <footer>Read-only. Nothing in this report was posted to a ticket.</footer>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
  try {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (window.mermaid) window.mermaid.initialize({ startOnLoad: true, theme: dark ? 'dark' : 'neutral' });
  } catch (e) { /* the written rule sits under the diagram, so a failure here loses nothing */ }
</script>
</body></html>`;
}

module.exports = { renderTriageBoard };
