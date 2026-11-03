/**
 * The L0.3 register: all 39 open tickets, what blocks each, and the evidence behind every
 * claim that something is already built.
 *
 * The one-pager is the answer; this is the working. It exists so that "ten tickets are already
 * done" is checkable rather than asserted — every such row names the module and the commit it
 * was found at, and a reader who doubts a row can run the same two commands.
 *
 * THE SELF-CHECK RUNS BEFORE ANY ROW RENDERS, and the load-bearing assertion is the last one:
 * a ticket classified `shipped` MUST carry evidence. That is the exact failure this document
 * could otherwise commit — telling Ali work is finished on the strength of a classification
 * somebody typed. Making it structurally impossible is worth more than a careful author.
 */
const D = require('./l03Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

/** The board's own open counts per group, read from Basecamp on 2026-11-02. */
const BOARD_COUNTS = [3, 2, 3, 2, 4, 2, 4, 4, 8, 7];

function selfCheck() {
  const boardTotal = BOARD_COUNTS.reduce((a, b) => a + b, 0);
  if (D.TICKETS.length !== boardTotal) {
    throw new Error(
      `register holds ${D.TICKETS.length} tickets, the board reported ${boardTotal} open`,
    );
  }

  BOARD_COUNTS.forEach((expected, gi) => {
    const got = D.TICKETS.filter((t) => t.g === gi).length;
    if (got !== expected) {
      throw new Error(
        `group ${gi} "${D.GROUPS[gi]}": register holds ${got}, the board reported ${expected}`,
      );
    }
  });

  const classes = Object.keys(D.CLASSES);
  D.TICKETS.forEach((t) => {
    if (!classes.includes(t.cls)) {
      throw new Error(`${t.id} has unknown classification "${t.cls}"`);
    }
    if (!t.why || !t.why.trim()) throw new Error(`${t.id} has no progress judgment`);
    if (!t.acLeft || !t.acLeft.trim()) throw new Error(`${t.id} does not say what is left`);
  });

  const summed = classes.reduce((a, k) => a + D.TOTALS.by[k], 0);
  if (summed !== D.TOTALS.open) {
    throw new Error(`class counts sum to ${summed}, totals claim ${D.TOTALS.open} open`);
  }

  // THE LOAD-BEARING ONE. "Already built" is the claim that would change Ali's decisions, so
  // it is the claim that may not be made without naming where it was found.
  const bare = D.TICKETS.filter((t) => t.cls === 'shipped' && !t.ev);
  if (bare.length) {
    throw new Error(
      `classified as built with no evidence: ${bare.map((t) => t.id).join(', ')}`,
    );
  }

  const ids = D.TICKETS.map((t) => t.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`duplicate tickets in the register: ${dupes.join(', ')}`);
}

const CSS = `${baseCss()}
  body { font-size: 9.2pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 8pt; }
  th { background: var(--bg-alt); text-align: left; padding: 4px 6px; font-size: 7.2pt;
       text-transform: uppercase; letter-spacing: .05em; color: var(--muted);
       border-bottom: 1.5px solid var(--border); }
  td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--border); }
  tr.grphead td { background: var(--cherry-bg); font-weight: 700; font-size: 7.6pt;
                  text-transform: uppercase; letter-spacing: .06em; color: var(--cherry-deep); }
  .tk { font-weight: 700; white-space: nowrap; }
  .pill { display: inline-block; padding: 1px 5px; border-radius: 7px; font-size: 6.6pt;
          font-weight: 700; white-space: nowrap; }
  .ev { font-family: Consolas, monospace; font-size: 6.9pt; color: var(--muted);
        word-break: break-word; }
  .none { color: var(--muted); font-style: italic; }
  .gap { border-left: 3px solid var(--border); padding: 2px 0 2px 9px; margin: 0 0 9px; }
  .gap.bad { border-left-color: #b3261e; }
  .gap.watch { border-left-color: #b26a00; }
  .gap b { display: block; }
  .lead { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
          padding: 8px 12px; margin: 0 0 14px; }
  ol.cuts > li { margin-bottom: 7px; }
  .foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid var(--border);
          color: var(--muted); font-size: 7.2pt; }
`;

function pill(cls) {
  const c = D.CLASSES[cls];
  return `<span class="pill" style="background:${c.bg};color:${c.color}">${esc(c.label)}</span>`;
}

function rows() {
  return D.GROUPS.map((g, gi) => {
    const list = D.TICKETS.filter((t) => t.g === gi);
    const head = `<tr class="grphead"><td colspan="5">${esc(g)} — ${list.length} open</td></tr>`;
    const body = list.map((t) => `
      <tr>
        <td class="tk">${esc(t.id)}${t.p ? ` <span class="pill" style="background:#fdf3f2;`
          + `color:#b3261e">${esc(t.p)}</span>` : ''}</td>
        <td>${pill(t.cls)}</td>
        <td>${esc(t.why)}</td>
        <td>${esc(t.acLeft)}</td>
        <td>${t.ev ? `<span class="ev">${esc(t.ev)}</span>`
          : '<span class="none">nothing found</span>'}</td>
      </tr>`).join('');
    return head + body;
  }).join('');
}

function build() {
  selfCheck();
  const T = D.TOTALS;

  const body = `
<h1>Colaberry Live — launch-risk review</h1>
<p style="color:var(--muted);margin:0 0 12px">
  Ticket ${esc(D.META.ticket)} (todo ${esc(D.META.todo)}) &middot; due ${esc(D.META.due)} &middot;
  reviewed ${esc(D.META.date)} &middot; session ${esc(D.META.session)}
</p>

<div class="lead">
  <b>${T.builtNotMarked} of ${T.open} open tickets already hold finished work.</b>
  Another ${T.airingGated} are waiting on one live airing rather than on engineering,
  ${T.by.owner} are waiting on a named person's account access or hardware,
  ${T.by.writable} are documents nobody has written, and ${T.by.decision} is parked on a
  decision. Every ticket on this board is past its due date, so that fact classifies nothing;
  what follows classifies each one by what is actually in its way.
</div>

<h2>1. How this was judged</h2>
<p>
  The second acceptance criterion asks for judgments based on progress rather than on the date
  having passed, so the date is recorded in each row and then ignored as a signal. A ticket is
  called <b>built</b> only where the artifacts its own acceptance criteria name were found in
  the working tree at a commit, and the evidence column records which. Where a criterion
  demands something no code can supply — a real airing, a studio photograph, a screenshot from
  a physical phone — the ticket is classified by that requirement however complete the code is,
  and the column on the right names the criterion still standing.
</p>
<p>
  <b>Commit messages were deliberately not trusted as evidence.</b> Scanning them produced a
  false negative on three P0 tickets: the provider health loop landed in a commit titled
  <code>Bind the recording, publish the replay, and stop signing a dead input</code>, which
  names no ticket. Module existence at a named commit is the evidence used instead.
</p>

<h2>2. What this review changes about L0.4</h2>
<p>
  L0.4's traceability matrix merged on 2 November and <b>undercounted the drift it was written
  to find</b>, because its scan walked merge commits only. The health loop
  (<code>cf603349</code>) and the occurrence input binding (<code>a72546fb</code>) both landed
  as direct commits on main, so a merge-only walk cannot see them, and both tickets read as
  having no code behind them. That is a defect in method rather than a difference of opinion,
  and it is reported here because it changes a number Ali has already been given.
</p>

<h2>3. The register</h2>
<table>
  <thead><tr>
    <th style="width:9%">Ticket</th><th style="width:12%">Blocked by</th>
    <th style="width:30%">Why, on progress</th><th style="width:24%">Criterion still standing</th>
    <th style="width:25%">Evidence</th>
  </tr></thead>
  <tbody>${rows()}</tbody>
</table>

<h2>4. Risks that are not any one ticket</h2>
${D.GAPS.map((g) => `<div class="gap ${g.sev}"><b>${esc(g.h)}</b>${esc(g.d)}</div>`).join('')}

<h2>5. The cut list, in priority order</h2>
<p>
  Cheapest cut first, where cheapest means least depended upon by the launch path. The rule
  applied: nothing is proposed for cutting if a launch test names it as a dependency.
</p>
<ol class="cuts">
${D.CUTS.map((c) => `<li><b>${esc(c.what)}</b> (${esc(c.saves)})<br>${esc(c.why)}</li>`).join('')}
</ol>

<h2>6. What must not be cut</h2>
<ul>
${D.KEEP.map((k) => `<li><b>${esc(k.what)}</b> — ${esc(k.why)}</li>`).join('')}
</ul>

<h2>7. Proposed, not applied</h2>
<p>
  <b>Nothing here closes a ticket or sets a review state.</b> The project's rule is that a
  session works a ticket to a review state and stops, and Ali closes it after validating the
  artifact. The ${T.builtNotMarked} tickets marked <i>built, not marked</i> are a
  recommendation to look, not a claim the box may be ticked — and several of them still carry
  evidence criteria of their own (mutation records, EXPLAIN output, real-device screenshots)
  that only Ali can confirm were produced to his standard. The review states this session would
  propose, if asked, are recorded in the pull request rather than written to the board.
</p>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.date)}
  &middot; session ${esc(D.META.session)} &middot; board read live from Basecamp project
  ${esc(D.META.project)} inside the production backend container &middot; ${T.withEvidence} of
  ${T.open} rows carry module-and-commit evidence &middot; the register is asserted against the
  board's own per-group counts before this document renders
</div>`;

  return htmlDoc({ title: 'L0.3 launch-risk review, register', css: CSS, body });
}

module.exports = { build, selfCheck };
