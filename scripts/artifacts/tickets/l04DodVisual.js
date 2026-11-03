/**
 * L0.4 criterion 1, the one-pager: where the 48-point definition of done actually stands.
 *
 * WHAT THIS PAGE IS FOR. The matrix is nine columns over 48 rows and answers "what is the
 * state of requirement N". This page answers the two questions somebody asks before opening
 * that: how much of the definition of done is met, and what is not even being tracked. Those
 * are different audiences for the same data, which is why both render from one module.
 *
 * Capped at one page by the builder, and the renderer throws rather than spilling onto a
 * second, so a clean exit is the evidence that it is a one-pager.
 */
const D = require('./l04DodData');
const { TOKENS, esc, baseCss, barChart, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

function build() {
  const bar = stackBar({
    parts: [
      { label: `Satisfied (${D.TOTALS.by.SATISFIED})`, value: D.TOTALS.by.SATISFIED,
        color: D.STATUSES.SATISFIED.color },
      { label: `Partial (${D.TOTALS.by.PARTIAL})`, value: D.TOTALS.by.PARTIAL,
        color: D.STATUSES.PARTIAL.color },
      { label: `Not met (${D.TOTALS.by.NOT})`, value: D.TOTALS.by.NOT,
        color: D.STATUSES.NOT.color },
      { label: `Not assessable (${D.TOTALS.by.BLOCKED})`, value: D.TOTALS.by.BLOCKED,
        color: D.STATUSES.BLOCKED.color },
    ],
    width: 1000,
    height: 26,
  });

  const bands = barChart({
    rows: D.BANDS.map((b) => {
      const t = D.TOTALS.byBand[b.key];
      return {
        label: `${b.label} (${b.from}–${b.to})`,
        value: t.satisfied,
        display: `${t.satisfied} of ${t.count}`,
        color: t.satisfied === t.count ? D.STATUSES.SATISFIED.color
          : (t.satisfied ? D.STATUSES.PARTIAL.color : D.STATUSES.NOT.color),
      };
    }),
    max: 10,
    width: 480,
    barH: 16,
    gap: 5,
    labelW: 215,
  });

  const gaps = D.NO_TICKET.map((n) => {
    const it = D.ITEMS.find((i) => i.id === n.id);
    return `<li><strong>${n.id}.</strong> ${esc(it.req)}</li>`;
  }).join('');

  const blockers = D.ITEMS.filter((i) => i.blocker).map((i) => `
    <li><strong>${i.id}.</strong> ${esc(i.req)}
      <span class="who">${esc(i.owner)}${
        i.todo.length ? ` &middot; ${esc(i.todo.join(', '))}` : ''
      }</span></li>`).join('');

  const css = `${baseCss()}
    .grid { display:flex; gap:18px; margin-top:10px; }
    .col { flex:1; }
    .stat { display:flex; gap:20px; margin:8px 0 12px; }
    .stat div { background:${TOKENS.BG_ALT}; border:1px solid ${TOKENS.BORDER};
      border-radius:6px; padding:7px 13px; }
    .stat b { display:block; font-size:21pt; line-height:1.05; }
    .stat span { font-size:7.8pt; color:${TOKENS.MUTED}; }
    h2 { font-size:10pt; margin:12px 0 5px; }
    ul { padding-left:16px; font-size:8.4pt; margin:0; }
    li { margin-bottom:4px; }
    .who { color:${TOKENS.MUTED}; font-size:7.4pt; }
    .lede { font-size:9pt; color:#3f3f46; margin:0; }
    .quote { font-size:9.4pt; font-weight:600; color:${TOKENS.CHERRY_DEEP};
      border-left:3px solid ${TOKENS.CHERRY}; padding-left:9px; margin:0 0 8px; }
  `;

  const body = `
    <h1>Colaberry Live &mdash; the definition of done, counted</h1>
    <p class="sub">${esc(D.META.ticket)} criterion 1 &middot; ${esc(D.META.doc)} &middot;
      ${esc(D.META.date)}</p>

    <p class="quote">&ldquo;Colaberry Live is not complete merely because broadcast code
      exists.&rdquo;</p>

    <div class="stat">
      <div><b>${D.TOTALS.satisfied}</b><span>of 48 satisfied</span></div>
      <div><b>${D.TOTALS.by.PARTIAL}</b><span>partial</span></div>
      <div><b>${D.TOTALS.blockers}</b><span>launch blockers</span></div>
      <div><b>${D.TOTALS.by.BLOCKED}</b><span>not assessable here</span></div>
      <div><b>${D.TOTALS.noTicket}</b><span>with no ticket</span></div>
    </div>

    ${bar}

    <div class="grid">
      <div class="col">
        <h2>Satisfied, by band</h2>
        ${bands}
      </div>
      <div class="col">
        <h2>No Basecamp ticket covers these</h2>
        <p class="lede">Searched all 61 todos, done and open. The board cannot show this about
          itself.</p>
        <ul>${gaps}</ul>

        <h2>Launch blockers</h2>
        <ul>${blockers}</ul>
      </div>
    </div>
  `;

  return htmlDoc({ title: 'L0.4 — Definition of done, counted', css, body });
}

module.exports = { build };
