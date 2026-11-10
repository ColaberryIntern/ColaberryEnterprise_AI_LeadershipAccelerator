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

  /**
   * The tile says "N with no ticket" and counts every item whose `todo` is empty, which
   * includes the ones deliberately left unticketed. The list beneath it shows only the gaps.
   * Printed without this line the page says five and shows four, and a reader who counts is
   * right to stop trusting the rest of it. The reason is carried from the data, not retyped.
   */
  const MARK = 'Not counted as a coverage gap: ';
  const sequenced = D.SEQUENCED.length ? `<p class="lede">${
    D.SEQUENCED.map((id) => {
      const it = D.ITEMS.find((i) => i.id === id);
      if (!it) throw new Error(`l04DodVisual: SEQUENCED names item ${id}, which is not in ITEMS`);
      // The reason is READ from the row rather than written here. If the data stops carrying
      // one, the page must not quietly supply a plausible sentence in its place.
      const i = String(it.notes || '').indexOf(MARK);
      if (i < 0) {
        throw new Error(`l04DodVisual: item ${id} is SEQUENCED but its notes do not say why `
          + `(no "${MARK}" in them). An item excluded from the gap count without a stated `
          + 'reason is the thing this line exists to prevent.');
      }
      return `<strong>${id}</strong> also has no ticket and is not counted a gap: `
        + `${esc(it.notes.slice(i + MARK.length))}`;
    }).join(' ')
  }</p>` : '';

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
        ${sequenced}

        <h2>Launch blockers</h2>
        <ul>${blockers}</ul>
      </div>
    </div>
  `;

  return htmlDoc({ title: 'L0.4 — Definition of done, counted', css, body });
}

/**
 * The page had no check of its own until 2026-11-10, and it shipped a tile reading "5 with no
 * ticket" above a list of four. Nothing was watching the one relationship that makes the tile
 * readable, so these guards are about arithmetic the reader can do by eye, not about the data
 * being internally consistent - the data was already right.
 */
function selfCheck() {
  const html = build();
  const fail = (msg) => { throw new Error(`l04DodVisual: ${msg}`); };

  // 1. The tile against the two lists beneath it. A reader counts the bullets; so does this.
  if (D.NO_TICKET.length + D.SEQUENCED.length !== D.TOTALS.noTicket) {
    fail(`the tile says ${D.TOTALS.noTicket} with no ticket, while the page shows `
      + `${D.NO_TICKET.length} gaps and ${D.SEQUENCED.length} sequenced. A tile that does not `
      + 'equal what is listed under it is how the first version of this page shipped.');
  }

  // 2. Every deliberately-excluded item must be NAMED on the page, not merely counted into it.
  for (const id of D.SEQUENCED) {
    if (!new RegExp(`<strong>${id}</strong> also has no ticket`).test(html)) {
      fail(`item ${id} is excluded from the gap list but never appears on the page, so the tile `
        + 'counts something the reader cannot find.');
    }
  }

  // 3. Every gap must be named too, for the same reason in the other direction.
  for (const n of D.NO_TICKET) {
    if (!new RegExp(`<strong>${n.id}\\.</strong>`).test(html)) {
      fail(`condition ${n.id} has no ticket but is not listed on the page.`);
    }
  }

  // 4. The headline count must be the one the data derives, never a figure typed into the page.
  if (!new RegExp(`<b>${D.TOTALS.satisfied}</b><span>of 48 satisfied`).test(html)) {
    fail(`the satisfied tile does not carry the derived total ${D.TOTALS.satisfied}.`);
  }

  return {
    noTicket: D.TOTALS.noTicket,
    gaps: D.NO_TICKET.length,
    sequenced: D.SEQUENCED.length,
    blockers: D.TOTALS.blockers,
  };
}

module.exports = { build, selfCheck };
