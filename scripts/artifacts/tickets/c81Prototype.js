/**
 * C8.1's HTML prototype of the Commercialization Command Center.
 *
 * Standalone and static on purpose: it fetches nothing, so it can be opened from the
 * Basecamp folder with no backend. It uses the REAL token names from
 * frontend/src/styles/tokens.css rather than invented colours, which is what makes it
 * droppable into the admin shell and is checked by assertPrototypeUsesRealTokens().
 *
 * The thing to look at is what the blank tiles do. They are not zeroes and they are not
 * skeleton loaders: each states that it is not measurable and names what would populate
 * it. A reviewer should be able to tell at a glance which numbers are real.
 */
const D = require('./c81Data');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tile(t) {
  const live = t.status === D.STATUS.LIVE;
  const cls = live ? 'live' : (t.status === D.STATUS.PROXY ? 'proxy' : 'none');
  return `<article class="tile ${cls}">
      <div class="tile__label">${esc(t.label)}</div>
      ${live
    ? `<div class="tile__value">${esc(t.value)}</div>
         <div class="tile__sub">${esc(t.sub)}</div>`
    : `<div class="tile__blank">${esc(t.status.k)}</div>`}
      <div class="tile__src"><span class="tile__srclab">Source</span> ${esc(t.source)}</div>
      <div class="tile__note">${esc(t.caveat)}</div>
    </article>`;
}

function build() {
  const c = D.counts();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Commercialization Command Center - prototype</title>
<style>
/* Tokens copied by NAME from frontend/src/styles/tokens.css so this prototype can be
   lifted into the admin shell unchanged. Values mirror that file. */
:root {
  --color-primary: #FB2832;
  --color-primary-light: #C20E1E;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-bg: #ffffff;
  --color-bg-alt: #f7fafc;
  --color-text: #2d3748;
  --color-text-light: #718096;
  --color-border: #e2e8f0;
  --font-heading: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-body: 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-mono: 'Consolas', 'Monaco', 'Courier New', monospace;
}
* { box-sizing: border-box; }
body { margin:0; background:var(--color-bg-alt); color:var(--color-text);
       font-family:var(--font-body); font-size:15px; line-height:1.5; }
.wrap { max-width:1180px; margin:0 auto; padding:28px 20px 60px; }
header h1 { font-family:var(--font-heading); font-size:1.6rem; margin:0 0 4px;
            color:var(--color-primary); }
.meta { color:var(--color-text-light); font-size:.82rem; }
.banner { background:#fff; border:1px solid var(--color-border);
          border-left:5px solid var(--color-primary); border-radius:0 6px 6px 0;
          padding:14px 16px; margin:18px 0 22px; }
.banner b { display:block; margin-bottom:4px; }
.legend { display:flex; gap:16px; flex-wrap:wrap; margin:0 0 18px; font-size:.78rem;
          color:var(--color-text-light); }
.dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(290px,1fr)); gap:14px; }
.tile { background:var(--color-bg); border:1px solid var(--color-border);
        border-top:3px solid var(--color-text-light); border-radius:8px; padding:14px 16px; }
.tile.live { border-top-color:var(--color-success); }
.tile.proxy { border-top-color:var(--color-warning); }
.tile.none { border-top-color:var(--color-danger); }
.tile__label { font-size:.72rem; text-transform:uppercase; letter-spacing:.06em;
               color:var(--color-text-light); font-weight:700; }
.tile__value { font-size:2rem; font-weight:700; line-height:1.1; margin:6px 0 2px; }
.tile__sub { font-size:.8rem; color:var(--color-text-light); margin-bottom:8px; }
.tile__blank { font-size:.82rem; font-weight:700; color:var(--color-danger);
               margin:10px 0 8px; letter-spacing:.03em; }
.tile.proxy .tile__blank { color:var(--color-warning); }
.tile__src { font-size:.76rem; font-family:var(--font-mono); background:var(--color-bg-alt);
             border:1px solid var(--color-border); border-radius:4px; padding:6px 8px;
             margin-bottom:7px; word-break:break-word; }
.tile__srclab { display:block; font-family:var(--font-body); font-weight:700;
                text-transform:uppercase; font-size:.64rem; letter-spacing:.06em;
                color:var(--color-text-light); margin-bottom:2px; }
.tile__note { font-size:.78rem; color:var(--color-text-light); }
h2 { font-family:var(--font-heading); font-size:1.05rem; margin:26px 0 10px;
     color:var(--color-primary-light); }
table { width:100%; border-collapse:collapse; background:#fff; font-size:.84rem;
        border:1px solid var(--color-border); border-radius:6px; overflow:hidden; }
th { text-align:left; background:var(--color-bg-alt); font-size:.72rem; text-transform:uppercase;
     letter-spacing:.05em; padding:8px 10px; border-bottom:1px solid var(--color-border); }
td { padding:8px 10px; border-bottom:1px solid var(--color-border); vertical-align:top; }
tr:last-child td { border-bottom:none; }
footer { margin-top:26px; font-size:.78rem; color:var(--color-text-light); }
</style></head>
<body><div class="wrap">
<header>
  <h1>Commercialization Command Center</h1>
  <div class="meta">Prototype for C8.1 &middot; ${esc(D.AS_OF)} &middot; proposed route
    <code>${esc(D.ROUTE.path)}</code> &middot; static, fetches nothing</div>
</header>

<div class="banner">
  <b>Read the blanks, not the numbers.</b>
  ${esc(D.headline())}
</div>

<div class="legend">
  <span><span class="dot" style="background:var(--color-success)"></span>Live, computed from production</span>
  <span><span class="dot" style="background:var(--color-warning)"></span>Proxy only, not the metric asked for</span>
  <span><span class="dot" style="background:var(--color-danger)"></span>Not yet measurable, no source exists</span>
</div>

<div class="grid">${D.TILES.map(tile).join('')}</div>

<h2>What has to exist before this board is worth building</h2>
<table>
  <tr><th style="width:26%">Schema addition</th><th>What it unlocks</th></tr>
  ${D.PREREQS.map((p) => `<tr><td><b>${esc(p[0])}</b></td><td>${esc(p[1])}</td></tr>`).join('')}
</table>

<h2>Route and access</h2>
<table>
  <tr><th style="width:26%">Field</th><th>Value</th></tr>
  <tr><td><b>Route</b></td><td><code>${esc(D.ROUTE.path)}</code></td></tr>
  <tr><td><b>Authorisation</b></td><td>${esc(D.ROUTE.auth)}</td></tr>
  <tr><td><b>Built by</b></td><td>${esc(D.ROUTE.note)}</td></tr>
</table>

<footer>
  ${c.live} of ${c.total} tiles populatable today. Every figure shown was measured against
  the production database with SELECT statements only on ${esc(D.AS_OF)}. No tile without a
  real source carries a number, which a build assertion enforces.
</footer>
</div></body></html>`;
}

module.exports = { build };
