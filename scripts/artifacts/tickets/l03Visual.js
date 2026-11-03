/**
 * The L0.3 one-pager: what is actually blocking each of the 39 open tickets, and what to drop.
 *
 * ONE PAGE, landscape, or the renderer refuses — which is acceptance criterion 4 enforced by
 * the build rather than promised in a sentence.
 *
 * The page is laid out to answer three questions in the order a reader asks them: how much of
 * this is real work (the stat row), where is each ticket stuck (the grid), and what goes first
 * if something must (the cut list). Every number is derived from l03Data, so this page cannot
 * drift from the document that ships beside it.
 */
const D = require('./l03Data');
const { esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  body { font-size: 8.5pt; }
  h1 { font-size: 16pt; margin: 0 0 3px; }
  .sub { color: var(--muted); font-size: 8pt; margin: 0 0 7px; }
  .takeaway { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
              padding: 7px 11px; margin: 0 0 9px; font-size: 8.4pt; }
  .stat { display: flex; gap: 9px; margin-bottom: 9px; }
  .stat > div { flex: 1; border: 1px solid var(--border); border-radius: 5px; padding: 6px 9px; }
  .stat .big { font-size: 15pt; font-weight: 700; color: var(--cherry); line-height: 1.05; }
  .stat .lbl { font-size: 6.4pt; color: var(--muted); text-transform: uppercase;
               letter-spacing: .05em; }
  h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .07em; color: var(--ink);
       border: 0; padding: 0; margin: 0 0 5px; }
  .wrap { display: flex; gap: 14px; align-items: flex-start; }
  .col { flex: 1; min-width: 0; }
  .col.wide { flex: 1.75; }
  .grp { margin-bottom: 5px; }
  .grp > .gh { font-size: 6.6pt; font-weight: 700; color: var(--muted);
               text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
  .row { display: flex; gap: 4px; flex-wrap: wrap; }
  .tk { display: inline-block; padding: 1.5px 5px; border-radius: 3px; font-size: 6.8pt;
        font-weight: 700; white-space: nowrap; border: 1px solid transparent; }
  .tk .p0 { font-size: 5.6pt; opacity: .75; }
  .key { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 8px; font-size: 6.7pt; }
  .key span { display: inline-flex; align-items: center; gap: 3px; }
  .sw { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .cut { border-left: 2px solid var(--border); padding: 0 0 0 7px; margin-bottom: 5px;
         font-size: 7.1pt; }
  .cut b { display: block; }
  .cut .why { color: var(--muted); }
  .keep { font-size: 7.1pt; margin-bottom: 4px; }
  .keep b { color: var(--cherry-deep); }
  .foot { margin-top: 9px; padding-top: 5px; border-top: 1px solid var(--border);
          color: var(--muted); font-size: 6.4pt; }
`;

/** The 39 tickets, grouped as the board groups them, colored by what blocks each one. */
function grid() {
  return D.GROUPS.map((g, gi) => {
    const rows = D.TICKETS.filter((t) => t.g === gi);
    if (!rows.length) return '';
    const chips = rows.map((t) => {
      const c = D.CLASSES[t.cls];
      return `<span class="tk" style="background:${c.bg};color:${c.color};`
        + `border-color:${c.color}33">${esc(t.id)}`
        + (t.p === 'P0' ? ' <span class="p0">P0</span>' : '')
        + `</span>`;
    }).join('');
    return `<div class="grp"><div class="gh">${esc(g)} &middot; ${rows.length}</div>`
      + `<div class="row">${chips}</div></div>`;
  }).join('');
}

function key() {
  return Object.keys(D.CLASSES).map((k) => {
    const c = D.CLASSES[k];
    return `<span><i class="sw" style="background:${c.color}"></i>`
      + `${esc(c.label)} (${D.TOTALS.by[k]})</span>`;
  }).join('');
}

function build() {
  const T = D.TOTALS;
  const parts = Object.keys(D.CLASSES).map((k) => ({
    label: D.CLASSES[k].label, value: T.by[k], color: D.CLASSES[k].color,
  })).filter((p) => p.value > 0);

  const body = `
<h1>Colaberry Live — launch-risk review</h1>
<p class="sub">
  Ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.date)} &middot; board read live from
  Basecamp project ${esc(D.META.project)} &middot; ${T.open} open tickets, every one past its
  due date, so lateness by date classifies nothing and is not used here
</p>

<div class="takeaway">
  <b>${T.builtNotMarked} of the ${T.open} open tickets already hold finished work</b> — built,
  merged, in several cases deployed a fortnight ago. The board therefore overstates what is
  left by about a quarter. A further <b>${T.airingGated} are gated on one live airing</b>, not
  on engineering. What is genuinely unstarted and unblocked is the documentation set and the
  paywall test.
</div>

<div class="stat">
  <div><div class="big">${T.open}</div><div class="lbl">Open tickets</div></div>
  <div><div class="big">${T.builtNotMarked}</div><div class="lbl">Built, not marked</div></div>
  <div><div class="big">${T.airingGated}</div><div class="lbl">Need a real airing</div></div>
  <div><div class="big">${T.by.owner}</div><div class="lbl">Need a named person</div></div>
  <div><div class="big">${T.by.writable}</div><div class="lbl">Writable tonight</div></div>
  <div><div class="big">${T.p0}</div><div class="lbl">Marked P0</div></div>
</div>

${stackBar({ parts, width: 980, height: 26 })}

<div class="wrap" style="margin-top:9px">
  <div class="col wide">
    <h2>What is blocking each ticket</h2>
    <div class="key">${key()}</div>
    ${grid()}
  </div>

  <div class="col">
    <h2>Cut list, in order</h2>
    ${D.CUTS.map((c) => `<div class="cut"><b>${c.n}. ${esc(c.what)}</b>`
      + `<span class="why">${esc(c.why)}</span></div>`).join('')}
  </div>

  <div class="col">
    <h2>Do not cut</h2>
    ${D.KEEP.map((k) => `<div class="keep"><b>${esc(k.what)}</b> — ${esc(k.why)}</div>`).join('')}
  </div>
</div>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.ticket)} &middot; session
  ${esc(D.META.session)} &middot; classification is by what blocks the ticket, never by the due
  date having passed (criterion 2) &middot; a ticket is called built only where the artifacts
  its own criteria name were found in the tree at a named commit &middot; nothing here closes a
  ticket or sets a review state &middot; built from the same data module as the register
</div>`;

  return htmlDoc({ title: 'L0.3 launch-risk review, one page', css: CSS, body });
}

module.exports = { build };
