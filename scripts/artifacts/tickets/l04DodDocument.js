/**
 * L0.4 criterion 1 — the matrix PDF, and DOC 09 as a document in the repository.
 *
 * TWO RENDERINGS, ONE SELF-CHECK, ONE DATA MODULE, for the same reason L11.5 was built this
 * way: the PDF goes in the Basecamp folder the ticket names, and the Markdown is what a future
 * session with no chat history can actually read. Generating both from `l04DodData` is the only
 * arrangement in which the count in the repo and the count in the PDF cannot drift apart.
 *
 * THE SELF-CHECK IS THE ACCEPTANCE CRITERION, NOT ARITHMETIC. DOC 09 specifies nine columns
 * and the requirement axis is a fixed list of 48 conditions, so three things can go wrong in a
 * way that reads as a finished document:
 *
 *   - a condition is dropped or duplicated, and the matrix covers 47 while claiming 48;
 *   - a cell is left blank, and a column DOC 09 requires is quietly absent for that row;
 *   - a row claims SATISFIED with nothing naming where that was found.
 *
 * The third is the one that matters most, and it is the lesson L0.4 itself taught: its first
 * method scanned merge commits and produced three confident false negatives on shipped P0s. A
 * status is only worth as much as the artifact behind it, so a status claim with no artifact
 * refuses to render rather than rendering as a fact.
 *
 * The coverage gap gets the same treatment from the other direction. An empty Basecamp-todo
 * cell is how "no ticket covers this" would disappear into whitespace, so every empty one must
 * be declared — either in NO_TICKET with a reason or in SEQUENCED — and the declaration must
 * match the rows exactly, in both directions.
 */
const D = require('./l04DodData');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

/** Markdown table cells cannot carry a bare pipe. Learned by reading a generated file. */
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

function selfCheck() {
  // 1. The requirement axis is a fixed list of 48. Covering 47 and claiming 48 is the failure
  //    this guards, and a duplicate id is the same failure wearing a different hat.
  const ids = D.ITEMS.map((i) => i.id);
  const expected = Array.from({ length: 48 }, (_, n) => n + 1);
  const missing = expected.filter((n) => !ids.includes(n));
  const dupes = ids.filter((n, k) => ids.indexOf(n) !== k);
  if (missing.length || dupes.length) {
    throw new Error(
      `the 48-point list is not covered exactly once: ${missing.length} missing `
      + `(${missing.join(', ') || 'none'}), ${dupes.length} duplicated `
      + `(${dupes.join(', ') || 'none'})`,
    );
  }

  // 2. The bands are quoted from §11 and must tile the whole list. A miscopied range would
  //    otherwise split the count silently.
  const covered = [];
  D.BANDS.forEach((b) => {
    if (b.to < b.from) throw new Error(`band "${b.label}" runs backwards: ${b.from}-${b.to}`);
    for (let n = b.from; n <= b.to; n += 1) covered.push(n);
  });
  const tiled = covered.slice().sort((a, b) => a - b);
  if (tiled.length !== 48 || tiled.some((n, k) => n !== k + 1)) {
    throw new Error(`the nine bands do not tile 1-48: they cover ${tiled.length} values`);
  }

  // 3. Every column DOC 09 requires, filled on every row. `todo` is handled by check 4 and
  //    `blocker` is a boolean, so neither is measured for emptiness here.
  const freeText = D.COLUMNS.map((c) => c.key).filter((k) => !['todo', 'blocker'].includes(k));
  D.ITEMS.forEach((i) => {
    freeText.forEach((k) => {
      if (i[k] == null || String(i[k]).trim() === '') {
        throw new Error(`item ${i.id} leaves the DOC 09 column "${k}" empty`);
      }
    });
    if (typeof i.blocker !== 'boolean') {
      throw new Error(`item ${i.id} does not answer "launch blocker?" with a boolean`);
    }
    if (!D.STATUSES[i.status]) {
      throw new Error(`item ${i.id} carries unknown status "${i.status}"`);
    }
  });

  // 4. THE COVERAGE GAP, IN BOTH DIRECTIONS. An untracked requirement is the finding this
  //    matrix exists to produce, and a blank cell is exactly how it would be lost. Declaring
  //    one that is actually ticketed is the same error mirrored, so both sides are asserted.
  const bare = D.ITEMS.filter((i) => !i.todo.length).map((i) => i.id).sort((a, b) => a - b);
  const declared = D.NO_TICKET.map((n) => n.id).concat(D.SEQUENCED).sort((a, b) => a - b);
  if (bare.join(',') !== declared.join(',')) {
    throw new Error(
      `rows with no Basecamp todo are [${bare.join(', ')}] but the declared list is `
      + `[${declared.join(', ')}] — every one must be explained, and nothing may be explained `
      + 'that is actually covered',
    );
  }
  D.NO_TICKET.forEach((n) => {
    if (!n.why || !n.why.trim()) throw new Error(`item ${n.id} is called uncovered with no reason`);
  });

  // 5. THE LOAD-BEARING ONE. "Satisfied" is the claim that would change what Ali does next, so
  //    it is the claim that may not be made without naming where it was found. Same rule as
  //    L0.3, for the same reason: this ticket's first method got three P0s wrong.
  const unevidenced = D.ITEMS.filter(
    (i) => ['SATISFIED', 'PARTIAL'].includes(i.status)
      && (i.files === '—' || !i.files.trim())
      && (i.ev === '—' || !i.ev.trim()),
  );
  if (unevidenced.length) {
    throw new Error(
      'status claimed with neither repo files nor evidence named: '
      + unevidenced.map((i) => i.id).join(', '),
    );
  }

  // 6. A row that cannot be assessed has to name what WOULD settle it, in a field of its own,
  //    or "not assessable" becomes a place to put anything inconvenient. The first version of
  //    this check grepped the notes prose for words like "blocked" and "hardware", which is a
  //    hand-written word list pretending to be a contract: it passed rows that happened to use
  //    the right vocabulary and failed one that said exactly the right thing in other words.
  //    An explicit field is checkable; prose is not. The inverse is asserted too, so the field
  //    cannot quietly spread to rows where it would mean nothing.
  const vagueBlocks = D.ITEMS.filter(
    (i) => i.status === 'BLOCKED' && (!i.settledBy || !i.settledBy.trim()),
  );
  if (vagueBlocks.length) {
    throw new Error(
      'rows marked not assessable with no settledBy naming what would settle them: '
      + vagueBlocks.map((i) => i.id).join(', '),
    );
  }
  const strayBlocks = D.ITEMS.filter((i) => i.status !== 'BLOCKED' && i.settledBy);
  if (strayBlocks.length) {
    throw new Error(
      'settledBy is only meaningful on a row that cannot be assessed, but it is set on: '
      + strayBlocks.map((i) => i.id).join(', '),
    );
  }

  return true;
}

function statusPill(key) {
  const s = D.STATUSES[key];
  return `<span class="pill" style="color:${s.color};background:${s.bg};border-color:${s.color}">`
    + `${esc(s.label)}</span>`;
}

function build() {
  const rows = D.BANDS.map((b) => {
    const items = D.ITEMS.filter((i) => i.id >= b.from && i.id <= b.to);
    const head = `<tr class="band"><td colspan="6"><strong>${esc(b.label)}</strong> `
      + `&nbsp;items ${b.from}&ndash;${b.to}</td></tr>`;
    const body = items.map((i) => `
      <tr>
        <td class="num">${i.id}</td>
        <td class="req">${esc(i.req)}</td>
        <td class="who">${esc(i.owner)}<br><span class="todo">${
          i.todo.length ? esc(i.todo.join(', ')) : '<em>no ticket</em>'
        }</span></td>
        <td class="ev"><div class="files">${esc(i.files)}</div>
            <div class="proof">${esc(i.ev)}</div></td>
        <td class="st">${statusPill(i.status)}${
          i.blocker ? '<div class="blk">launch blocker</div>' : ''
        }</td>
        <td class="notes">${esc(i.notes)}${
          i.settledBy ? `<div class="settled"><strong>Settled by:</strong> `
            + `${esc(i.settledBy)}</div>` : ''
        }</td>
      </tr>`).join('');
    return head + body;
  }).join('');

  const legend = Object.keys(D.STATUSES).map((k) => {
    const s = D.STATUSES[k];
    return `<li>${statusPill(k)} ${esc(s.blurb)}</li>`;
  }).join('');

  const gaps = D.NO_TICKET.map((n) => {
    const it = D.ITEMS.find((i) => i.id === n.id);
    return `<li><strong>${n.id}. ${esc(it.req)}</strong><br>${esc(n.why)}</li>`;
  }).join('');

  const css = `${baseCss()}
    table.m { width:100%; border-collapse:collapse; font-size:8.2pt; }
    table.m td { border-bottom:1px solid #e4e4e7; padding:5px 6px; vertical-align:top; }
    tr.band td { background:#f4f4f5; border-bottom:1px solid #d4d4d8; font-size:8.6pt;
      padding:6px; }
    td.num { width:22px; text-align:right; color:#71717a; font-variant-numeric:tabular-nums; }
    td.req { width:168px; }
    td.who { width:74px; font-size:7.6pt; }
    span.todo { color:#52525b; }
    td.ev { width:178px; font-size:7.2pt; }
    .files { font-family:ui-monospace,Menlo,Consolas,monospace; color:#3f3f46; }
    .proof { color:#52525b; margin-top:2px; }
    td.st { width:74px; }
    td.notes { font-size:7.6pt; color:#3f3f46; }
    .pill { display:inline-block; border:1px solid; border-radius:9px; padding:1px 6px;
      font-size:7pt; font-weight:600; white-space:nowrap; }
    .blk { color:#b3261e; font-size:6.8pt; font-weight:600; margin-top:3px; }
    .settled { margin-top:3px; color:#1d4ed8; font-size:7.2pt; }
    ul.legend { list-style:none; padding:0; font-size:8.4pt; }
    ul.legend li { margin-bottom:4px; }
    ul.gaps li { margin-bottom:7px; font-size:8.6pt; }
    .lede { font-size:9.4pt; color:#3f3f46; }
  `;

  const body = `
    <h1>The 48-point definition of done</h1>
    <p class="sub">${esc(D.META.ticket)} criterion 1 &middot; ${esc(D.META.doc)} &middot; `
      + `${esc(D.META.date)} &middot; session ${esc(D.META.session)}</p>

    <p class="lede"><strong>&ldquo;Colaberry Live is not complete merely because broadcast code
    exists.&rdquo;</strong> &mdash; the opening line of the list this matrix walks,
    ${esc(D.META.source)}.</p>

    <p class="lede">${D.TOTALS.satisfied} of 48 conditions are satisfied with named evidence.
    ${D.TOTALS.by.PARTIAL} are partial, ${D.TOTALS.by.NOT} are not met, and
    ${D.TOTALS.by.BLOCKED} cannot be settled by reading this repository or that board.
    ${D.TOTALS.blockers} are launch blockers. <strong>${D.TOTALS.noTicket} have no Basecamp
    ticket at all.</strong></p>

    <h2>What each status is allowed to mean</h2>
    <ul class="legend">${legend}</ul>

    <h2>Requirements with no ticket</h2>
    <p class="lede">Measured against all 61 todos on project ${esc(D.META.project)}, done and
    open &mdash; not only the 39 that are open. A board cannot show this about itself.</p>
    <ul class="gaps">${gaps}</ul>

    <h2>The matrix</h2>
    <table class="m">${rows}</table>

    <h2>How to re-derive this</h2>
    <p class="lede">The requirement column is verbatim from ${esc(D.META.source)}. Status rests
    on artifacts in the tree at a named commit, never on commit messages mentioning a ticket
    &mdash; that method is what made this ticket&rsquo;s first pass undercount three shipped
    P0s. Board status is from ${esc(D.META.boardRead)}.</p>
  `;

  return htmlDoc({ title: 'L0.4 — The 48-point definition of done', css, body });
}

function markdown() {
  const L = [];
  L.push('# Colaberry Live — Traceability Matrix (DOC 09)');
  L.push('');
  L.push('> **"Colaberry Live is not complete merely because broadcast code exists."**');
  L.push('');
  L.push(`Generated from \`scripts/artifacts/tickets/l04DodData.js\`. **Do not hand-edit** — `
    + 'rebuild with `node scripts/artifacts/buildL04DodArtifacts.js`.');
  L.push('');
  L.push(`Requirement axis: ${D.META.source}. Board status: ${D.META.boardRead}.`);
  L.push(`Produced for ${D.META.ticket} criterion 1 on ${D.META.date}, session ${D.META.session}.`);
  L.push('');
  L.push('## Where the program stands');
  L.push('');
  L.push(`| Status | Count | Means |`);
  L.push('|---|---|---|');
  Object.keys(D.STATUSES).forEach((k) => {
    L.push(`| ${D.STATUSES[k].label} | ${D.TOTALS.by[k]} | ${cell(D.STATUSES[k].blurb)} |`);
  });
  L.push('');
  L.push(`**${D.TOTALS.satisfied} of 48 satisfied.** ${D.TOTALS.blockers} conditions are launch `
    + `blockers. ${D.TOTALS.by.BLOCKED} cannot be assessed from the repository or the board, so `
    + `the honest denominator for anything this session can move is ${D.TOTALS.assessable}.`);
  L.push('');
  L.push('A partial is not counted as progress toward a yes. It means part of the condition is');
  L.push('met and the row says which part is not.');
  L.push('');
  L.push('## By band');
  L.push('');
  L.push('| Band | Items | Satisfied | Partial |');
  L.push('|---|---|---|---|');
  D.BANDS.forEach((b) => {
    const t = D.TOTALS.byBand[b.key];
    L.push(`| ${cell(b.label)} | ${b.from}–${b.to} | ${t.satisfied} | ${t.partial} |`);
  });
  L.push('');
  L.push('## Requirements with no Basecamp ticket');
  L.push('');
  L.push('Measured against all 61 todos on the board, done and open — not only the 39 open ones.');
  L.push('A board cannot surface this about itself; it is only visible by walking the requirement');
  L.push('list and asking what covers each item. This is the inverse of the L0.3 finding: there');
  L.push('the board overstated what was left, here it understates what is in scope.');
  L.push('');
  D.NO_TICKET.forEach((n) => {
    const it = D.ITEMS.find((i) => i.id === n.id);
    L.push(`- **${n.id}. ${cell(it.req)}**`);
    L.push(`  ${cell(n.why)}`);
  });
  L.push('');
  L.push(`Item 47 also has no ticket and is **not** counted as a gap: it is downstream of an `
    + 'airing that has not happened, so a ticket now would have nothing to do.');
  L.push('');
  L.push('## The matrix');
  L.push('');
  D.BANDS.forEach((b) => {
    const items = D.ITEMS.filter((i) => i.id >= b.from && i.id <= b.to);
    L.push(`### ${b.label} (${b.from}–${b.to})`);
    L.push('');
    L.push('| # | Requirement | Owner | Todo | Repo files | Evidence | Status | Blocker | Notes |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    items.forEach((i) => {
      const notes = i.settledBy
        ? `${i.notes} **Settled by:** ${i.settledBy}`
        : i.notes;
      L.push(`| ${i.id} | ${cell(i.req)} | ${cell(i.owner)} | `
        + `${i.todo.length ? cell(i.todo.join(', ')) : '*none*'} | ${cell(i.files)} | `
        + `${cell(i.ev)} | ${D.STATUSES[i.status].label} | ${i.blocker ? 'yes' : 'no'} | `
        + `${cell(notes)} |`);
    });
    L.push('');
  });
  L.push('## How status was decided');
  L.push('');
  L.push('A condition is **satisfied** only when the row names where that was found — a file, a');
  L.push('commit, a test, or the board read. Commit-message scanning is explicitly not trusted:');
  L.push("this ticket's first pass walked `git log origin/main --merges` and reported that 33 of");
  L.push('39 open tickets had no merged code, when three shipped P0s had landed as direct');
  L.push('commits and one of them names no ticket in its subject at all. Module existence at a');
  L.push('named commit replaced it.');
  L.push('');
  L.push('Where a condition demands something no amount of code can supply — installed hardware,');
  L.push('an external account, a live airing — the row says **not assessable** and names what');
  L.push('would settle it, rather than being scored on how complete the code around it is.');
  L.push('');
  return `${L.join('\n')}\n`;
}

module.exports = { selfCheck, build, markdown };
