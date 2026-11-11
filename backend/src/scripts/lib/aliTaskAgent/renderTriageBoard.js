/**
 * renderTriageBoard - the backlog as something you look at and click, not something you read.
 *
 * REWRITTEN rather than patched. The previous version rendered its charts once, on the server, so
 * filtering could only hide rows - which made the charts lie: choose one category and the age
 * histogram still described the whole backlog while everything under it described a seventh of it.
 * A chart that does not answer the question currently on screen is worse than no chart.
 *
 * Now the page carries its data and draws every chart from the current selection (boardRuntime).
 * Picking a category re-counts, re-scales and re-labels everything above and below it.
 *
 * NO PROMPT TEXT IS RENDERED. Ali asked for a picture he can click rather than a wall of
 * instructions, so the prompts live in a JSON lookup and reach the clipboard on click. The
 * trade-off is real and is handled rather than hidden: if the clipboard is unavailable the prompt
 * is unreachable, so the click says "copy blocked by the browser" instead of failing silently.
 *
 * Still email-UNSAFE by design. renderRunReport.js remains the email renderer; this one is opened
 * in a browser and uses CSS variables, grid and script.
 */

const { BANDS, summarize } = require('./ageBands');
const { RAMP_LIGHT, RAMP_DARK, esc } = require('./triageCharts');
const { groupByCategory, categoryOf, CATEGORY_COLORS } = require('./listCategories');
const { buildListPrompt } = require('./promptBuilder');
const { RUNTIME_JS, RUNTIME_CSS } = require('./boardRuntime');

/** Chip size from task count. Five steps; more reads as noise. */
function sizeStep(n, max) {
  if (max <= 1) return 1;
  const r = n / max;
  return r > 0.75 ? 5 : r > 0.5 ? 4 : r > 0.3 ? 3 : r > 0.12 ? 2 : 1;
}

function categoryTiles(groups, total) {
  return `<div class="cats">
    <button class="cat is-on" data-cat="all" type="button">
      <span class="cat-icon">\u{1F5C2}\u{FE0F}</span><span class="cat-label">Everything</span>
      <span class="cat-n">${total}</span>
    </button>
    ${groups.map((g) => `<button class="cat" data-cat="${esc(g.key)}" type="button"
      title="${esc(g.blurb)}" style="--c:var(--cat-${esc(g.key)})">
      <span class="cat-swatch"></span>
      <span class="cat-icon">${g.icon}</span><span class="cat-label">${esc(g.label)}</span>
      <span class="cat-n">${g.total}</span>
      ${g.dormant ? `<span class="cat-dormant">${g.dormant} old</span>` : ''}
    </button>`).join('')}
  </div>`;
}

function wordChart(groups) {
  const all = groups.flatMap((g) => g.lists.map((l) => ({ ...l, cat: g.key, icon: g.icon })));
  if (!all.length) return '<p class="empty">No lists.</p>';
  const max = Math.max(...all.map((l) => l.total));
  return `<div class="chips">${all
    .slice()
    .sort((a, b) => b.total - a.total)
    .map((l) => {
      const deadness = l.total ? l.dormant / l.total : 0;
      const tone = deadness > 0.8 ? 'chip-dead' : deadness > 0.3 ? 'chip-mixed' : 'chip-live';
      return `<button class="chip s${sizeStep(l.total, max)} ${tone}" data-cat="${esc(l.cat)}"
        data-prompt="${esc(l.key)}" type="button" style="--c:var(--cat-${esc(l.cat)})"
        title="${esc(l.key)} - ${l.total} task(s), ${l.dormant} dormant. Click to copy the full prompt.">
        <span class="chip-icon">${l.icon}</span><span class="chip-label">${esc(l.name)}</span><span class="chip-n">${l.total}</span>
      </button>`;
    }).join('')}</div>`;
}

/** A list card. Carries no command text: the button is the way out of the page. */
function listCard(s) {
  const cat = categoryOf(s.key);
  const dormantPct = s.total ? Math.round((s.dormant / s.total) * 100) : 0;
  const tone = s.dormant === s.total ? 'card-dead' : (s.dormant ? 'card-mixed' : 'card-live');
  const top = (s.suggestions || [])[0];
  const bar = BANDS.map((b) => {
    const found = (s.bands || []).find((x) => x.band === b.key);
    const n = found ? found.n : 0;
    return n ? `<span class="seg seg-${b.key}" style="flex:${n}" title="${n} ${esc(b.label)}"></span>` : '';
  }).join('');

  return `<article class="card ${tone}" data-cat="${esc(cat.key)}" style="--c:var(--cat-${esc(cat.key)})">
    <header class="card-head">
      <span class="card-cat" title="${esc(cat.label)}">${cat.icon}</span>
      <h3 class="card-title">${esc(s.name)}</h3>
      <span class="card-count">${s.total}</span>
    </header>
    ${s.phaseOf ? `<div class="phase-line">Phase ${s.phaseOf.position} of ${s.phaseOf.of}</div>` : ''}
    <div class="bar">${bar}</div>
    <div class="card-stats">
      <span>${s.live} live</span><span>${s.dormant} dormant (${dormantPct}%)</span>
      ${s.oldestDue ? `<span>oldest ${esc(s.oldestDue)}</span>` : ''}
    </div>
    ${s.lead ? `<div class="lead"><div class="lead-cap">Spearhead</div>
      <div class="lead-title">${esc(s.lead.title)}</div></div>` : ''}
    ${top ? `<div class="rec"><span class="rec-cap">Proposed</span>${esc(top.label)}</div>` : ''}
    <button class="getp" data-prompt="${esc(s.key)}" type="button">
      <span class="chip-label">Copy the prompt for this list</span></button>
  </article>`;
}

function renderTriageBoard(input) {
  const today = input.today ? new Date(input.today) : new Date();
  const items = Array.isArray(input.items) ? input.items : [];
  const lists = Array.isArray(input.lists) ? input.lists : [];
  const s = summarize(items, today, { dormantAfterDays: input.dormantAfterDays });
  const groups = groupByCategory(lists);
  const total = groups.reduce((a, g) => a + g.total, 0);
  const unsorted = groups.find((g) => g.key === 'unsorted');

  // What the page draws itself from, plus the prompt lookup. Prompts are never rendered.
  const prompts = {};
  lists.forEach((l) => {
    prompts[l.key] = buildListPrompt(l, {
      category: categoryOf(l.key),
      totals: { tasks: total || items.length, lists: lists.length, dormant: s.dormantCount },
    });
  });
  const payload = {
    lists: lists.map((l) => ({
      key: l.key, name: l.name, cat: categoryOf(l.key).key, total: l.total,
      live: l.live, dormant: l.dormant,
      bands: Object.fromEntries((l.bands || []).map((b) => [b.band, b.n])),
    })),
    cats: Object.fromEntries(groups.map((g) => [g.key, {
      label: g.label, color: CATEGORY_COLORS.light[g.key],
    }])),
    prompts,
  };

  const catVars = (mode) => Object.entries(CATEGORY_COLORS[mode])
    .map(([k, v]) => `--cat-${k}:${v};`).join('');
  const bandVars = (ramp) => BANDS.map((b) => `--band-${b.key}:${ramp[b.key]};`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backlog Navigator</title>
<style>
  :root{ ${bandVars(RAMP_LIGHT)} ${catVars('light')}
    --bg:#fcfcfb; --surface:#ffffff; --ink:#0f172a; --ink-2:#475569; --ink-3:#94a3b8;
    --line:#e2e8f0; --brand:#FB2832; }
  @media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
    ${bandVars(RAMP_DARK)} ${catVars('dark')}
    --bg:#1a1a19; --surface:#232322; --ink:#f1f5f9; --ink-2:#cbd5e1; --ink-3:#94a3b8;
    --line:#334155; --brand:#FB2832; } }
  :root[data-theme="dark"]{ ${bandVars(RAMP_DARK)} ${catVars('dark')}
    --bg:#1a1a19; --surface:#232322; --ink:#f1f5f9; --ink-2:#cbd5e1; --ink-3:#94a3b8;
    --line:#334155; --brand:#FB2832; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.6 'Segoe UI',system-ui,-apple-system,sans-serif}
  .wrap{max-width:1040px;margin:0 auto;padding:22px 16px 72px}
  h1{font-size:25px;margin:0 0 2px;color:var(--brand)}
  .sub{color:var(--ink-3);font-size:12.5px;margin:0 0 16px}
  h2{font-size:17px;margin:4px 0 4px}
  h3.sub-h{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);
    margin:20px 0 8px;font-weight:700}
  .lede{color:var(--ink-2);margin:0 0 12px;font-size:13.5px}
  section{background:var(--surface);border:1px solid var(--line);border-radius:12px;
    padding:16px 16px 18px;margin-bottom:16px}
  nav.jump{position:sticky;top:0;z-index:20;display:flex;gap:14px;flex-wrap:wrap;
    background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(6px);
    border-bottom:1px solid var(--line);padding:9px 0;margin-bottom:12px;font-size:12.5px}
  nav.jump a{color:var(--ink-2);text-decoration:none}
  nav.jump a:hover{color:var(--brand)}
  .cats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}
  .cat{display:flex;align-items:center;gap:7px;cursor:pointer;border:1px solid var(--line);
    background:var(--surface);border-radius:10px;padding:8px 12px;color:var(--ink);
    font:13px/1 'Segoe UI',system-ui,sans-serif}
  .cat:hover{border-color:var(--c,var(--ink-3))}
  .cat.is-on{border-color:var(--c,var(--brand));box-shadow:inset 0 0 0 1px var(--c,var(--brand))}
  .cat-swatch{width:9px;height:9px;border-radius:3px;background:var(--c)}
  .cat-label{font-weight:600} .cat-n{font-weight:700;color:var(--ink-2)}
  .cat-dormant{font-size:10px;color:var(--ink-3);border:1px solid var(--line);
    border-radius:999px;padding:1px 6px}
  .chips{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
  .chip{cursor:pointer;border:1px solid var(--line);border-left:4px solid var(--c,var(--ink-3));
    border-radius:999px;padding:5px 11px;color:var(--ink);background:var(--surface);
    font-family:'Segoe UI',system-ui,sans-serif;display:inline-flex;align-items:center;
    gap:6px;max-width:100%}
  .chip:hover{transform:translateY(-1px);border-color:var(--c)}
  .chip-icon{font-size:12px;opacity:.85}
  .chip-n{font-weight:700;opacity:.6;font-size:11px}
  .chip.s1{font-size:11.5px} .chip.s2{font-size:13px} .chip.s3{font-size:14.5px}
  .chip.s4{font-size:16.5px;font-weight:600} .chip.s5{font-size:19px;font-weight:700}
  .chip-dead{opacity:.62} .chip-dead:hover{opacity:1}
  .tiles{display:flex;gap:10px;flex-wrap:wrap}
  .tile{flex:1 1 110px;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
  .tile-value{font-size:27px;font-weight:700;line-height:1.1}
  .tile-cap{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--ink-3);margin-top:2px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:13px;margin-top:12px}
  .card{border:1px solid var(--line);border-left:4px solid var(--c,var(--ink-3));
    border-radius:12px;padding:13px;background:var(--surface)}
  .card-head{display:flex;align-items:baseline;gap:8px}
  .card-title{font-size:14.5px;margin:0;flex:1}
  .card-count{font-size:19px;font-weight:700;color:var(--ink-2)}
  .phase-line{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);margin-top:4px}
  .bar{display:flex;gap:2px;height:7px;margin:9px 0 7px}
  .seg{border-radius:2px}
  .seg-fresh{background:var(--band-fresh)} .seg-overdue{background:var(--band-overdue)}
  .seg-aging{background:var(--band-aging)} .seg-dormant{background:var(--band-dormant)}
  .card-stats{display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--ink-3)}
  .lead{margin-top:10px;padding:8px 10px;border-radius:8px;
    background:color-mix(in srgb,var(--ink) 4%,transparent)}
  .lead-cap{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink-3)}
  .lead-title{font-size:12.5px;font-weight:600;margin-top:2px}
  .rec{margin-top:9px;font-size:12px;color:var(--ink-2)}
  .rec-cap{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink-3);
    margin-right:5px}
  .getp{margin-top:11px;width:100%;cursor:pointer;border:1px dashed var(--c,var(--ink-3));
    background:transparent;color:var(--c,var(--ink-2));border-radius:8px;padding:8px;
    font:12px/1.2 'Segoe UI',system-ui,sans-serif;font-weight:600}
  .getp:hover{background:color-mix(in srgb,var(--c) 10%,transparent)}
  .legend{font-size:11.5px;color:var(--ink-3);margin-top:11px;display:flex;gap:6px;
    align-items:center;flex-wrap:wrap}
  .key{display:inline-block;width:10px;height:10px;border-radius:3px}
  .empty{color:var(--ink-3);font-size:13px}
  .is-hidden{display:none !important}
  footer{color:var(--ink-3);font-size:11.5px;margin-top:26px;text-align:center}
  ${RUNTIME_CSS}
</style></head>
<body>
<div class="wrap">
  <h1>Backlog Navigator</h1>
  <p class="sub">${esc(input.runId || 'run')} &middot;
    ${esc(today.toISOString().slice(0, 16).replace('T', ' '))} UTC &middot;
    read-only &middot; click anything to copy its prompt</p>

  <nav class="jump"><a href="#pick">Pick a part</a><a href="#now">Where it stands</a>
    <a href="#lists">The lists</a></nav>

  <section id="pick">
    <h2>Pick a part of the business</h2>
    <p class="lede">Choosing a category filters the whole page and rebuilds every chart, so the
      numbers always describe what you selected. Clicking a list copies a full prompt, already
      carrying its history, its state, the options, and the branded report to produce.</p>
    ${categoryTiles(groups, total)}
    <h3 class="sub-h">Every list, sized by how much work is in it</h3>
    ${wordChart(groups)}
    <p class="legend">
      <span class="key" style="background:var(--band-overdue)"></span> mostly live
      <span class="key" style="background:var(--band-aging)"></span> part dormant
      <span class="key" style="background:var(--band-dormant)"></span> mostly dormant
      &middot; ${total} tasks in ${lists.length} lists
      ${unsorted ? `&middot; <strong>${unsorted.total} matched no category rule</strong>` : ''}
    </p>
  </section>

  <section id="now">
    <h2>Where it stands</h2>
    <p class="lede">Rebuilt from the current selection.</p>
    <div class="tiles" id="f-tiles"></div>
    <div class="fgrid">
      <div class="fpane"><h4>How much is alive</h4><div id="f-gauge"></div></div>
      <div class="fpane"><h4>By age band</h4><div id="f-bands"></div></div>
      <div class="fpane"><h4>By part of the business</h4><div id="f-cats"></div></div>
      <div class="fpane"><h4>Biggest lists</h4><div id="f-lists"></div></div>
    </div>
    <p id="f-note"></p>
  </section>

  <section id="lists">
    <h2>The lists</h2>
    <p class="lede">One card per list. The button copies the full prompt for it.</p>
    <div class="cards">${lists.slice(0, input.listLimit || 24).map(listCard).join('')}</div>
  </section>

  <footer>Read-only. Nothing here was posted to a ticket or changed in Basecamp.</footer>
</div>
<script>window.__BOARD__ = ${JSON.stringify(payload).replace(/</g, '\\u003c')};</script>
<script>${RUNTIME_JS}</script>
</body></html>`;
}

module.exports = { renderTriageBoard, listCard, sizeStep };
