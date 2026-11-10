/**
 * L11.4, the one-pager: what the maintenance runbook guarantees, and the five things in this
 * codebase that are not what they look like.
 *
 * WHAT THIS PAGE IS FOR. The runbook answers "how do I do X". This page answers the question a
 * reviewer asks before trusting any of it: why would a document written on one day still be
 * safe to follow on another?
 *
 * The answer is the one mechanism worth putting on a cover page. A runbook's failure mode is
 * not being wrong about an opinion, it is telling a future session to open a file that is not
 * there. That session has no chat history by definition - it cannot tell a renamed module from
 * its own mistake, and the cheapest outcome is that it stops trusting the document. So every
 * path the runbook names is stat'ed on every build, and every environment variable it documents
 * must be referenced somewhere in the backend source.
 *
 * The traps earn the other half of the page because they are the part a reader cannot derive.
 * Everything else here can be rediscovered by reading code; "this looks finished and is called
 * by nothing" cannot.
 *
 * Capped at one page by the builder, and the renderer throws rather than spilling onto a
 * second, so a clean exit is the evidence that it is a one-pager.
 */
const D = require('./l114Data');
const { TOKENS, esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

function build() {
  const refs = D.TOTALS.paths + D.TOTALS.procedureFiles;

  /**
   * The composition of what gets checked, not a progress bar. Every segment is a kind of file
   * reference the build stats; none of them is a thing that could be "done" or "not done".
   */
  const bar = stackBar({
    parts: [
      { label: `Code paths (${D.PATHS.length})`, value: D.PATHS.length, color: TOKENS.SEV.ok },
      { label: `Models (${D.MODELS.length})`, value: D.MODELS.length, color: '#4f8f52' },
      { label: `Routes (${D.ROUTES.length})`, value: D.ROUTES.length, color: '#6aa36d' },
      { label: `Test homes (${D.TESTS.length})`, value: D.TESTS.length, color: '#8bb98d' },
      /**
       * SLATE, NOT THE BRAND RED. Drawn in cherry this segment read as an alarm sitting at the
       * end of a green ramp, as though files named inside a procedure were a problem. They are
       * a different KIND of reference, not a worse one, and the only thing the color has to
       * carry here is that difference.
       */
      { label: `Files inside the ${D.TOTALS.procedures} procedures (${D.TOTALS.procedureFiles})`,
        value: D.TOTALS.procedureFiles, color: '#55606b' },
    ],
    width: 1000,
    height: 26,
  });

  const tiles = [
    { n: refs, l: 'file references, every one stat\'ed on every build' },
    { n: D.TOTALS.envs, l: 'env vars, each proven referenced in backend/src' },
    { n: D.TOTALS.failures, l: 'failure symptoms, each with a cause and a fix' },
    { n: D.TOTALS.traps, l: 'things that are not what they look like', bad: true },
    { n: `${D.TOTALS.procedures} / ${D.TOTALS.procedureSteps}`,
      l: 'procedures, in numbered steps' },
  ].map((t) => `<div class="tile${t.bad ? ' bad' : ''}">
      <div class="n">${esc(String(t.n))}</div><div class="l">${esc(t.l)}</div>
    </div>`).join('\n');

  const traps = D.TRAPS.map((t) => `<li>
      <strong>${esc(t.thing)}</strong><br>
      <span class="looks">Looks like:</span> ${esc(t.looks)}<br>
      <span class="is">Is:</span> ${esc(t.is)}
    </li>`).join('\n');

  const failures = D.FAILURES.map((f) => `<li>
      <strong>${esc(f.symptom)}</strong> &mdash; ${esc(f.cause)}
    </li>`).join('\n');

  const body = `
<h1>DOC 14 &mdash; a runbook's failure mode is a path that is not there</h1>
<p class="sub">L11.4 &middot; ${esc(D.META.built)} &middot; written for a session with no chat
history &middot; generated from <code>l114Data.js</code> and <code>l114Sections.js</code></p>

<div class="tiles">${tiles}</div>

<div class="bar">${bar}</div>

<div class="cols">
  <div>
    <h2>The ${D.TOTALS.traps} things that are not what they look like</h2>
    <ul class="traps">${traps}</ul>
  </div>
  <div>
    <h2>Why every path is checked</h2>
    <p class="gapbox">A future session <strong>cannot tell a renamed module from its own
    mistake</strong>. Send it to a file that is not there and the cheapest outcome is that it
    stops trusting the whole document. So all ${refs} references are stat'ed on every build and
    each of the ${D.TOTALS.envs} documented env vars must be referenced in
    <code>backend/src</code>.</p>
    <p class="sub">State claims are dated rather than asserted, because an airing is an event
    git cannot show. Checked ${esc(D.META.stateCheckedOn)}: absence of a commit is not proof an
    airing did not happen, so the document says what was checked, not what is true.</p>

    <h2>What breaks, and the cause to check first</h2>
    <ul class="fails">${failures}</ul>
  </div>
</div>
`;

  return htmlDoc({
    title: 'Colaberry Live — developer and AI maintenance runbook',
    css: `${baseCss()}
      .tiles { display: flex; gap: 10px; margin: 14px 0 10px; }
      .tile { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 9px 11px;
        background: ${TOKENS.BG_ALT}; }
      .tile .n { font-size: 21px; font-weight: 700; color: ${TOKENS.INK}; line-height: 1.1; }
      .tile .l { font-size: 9.5px; color: ${TOKENS.MUTED}; margin-top: 3px; line-height: 1.3; }
      .tile.bad .n { color: ${TOKENS.SEV.bad}; }
      .bar { margin: 6px 0 14px; }
      .cols { display: flex; gap: 22px; }
      .cols > div { flex: 1; }
      h2 { font-size: 12px; margin: 10px 0 6px; }
      .sub { color: ${TOKENS.MUTED}; font-size: 9.5px; line-height: 1.4; }
      ul.traps { margin: 0; padding-left: 15px; font-size: 9.3px; line-height: 1.4; }
      ul.traps li { margin-bottom: 6px; }
      ul.fails { margin: 0; padding-left: 15px; font-size: 9.3px; line-height: 1.45; }
      .looks { color: ${TOKENS.MUTED}; font-weight: 700; }
      .is { color: ${TOKENS.SEV.bad}; font-weight: 700; }
      .gapbox { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.bad};
        padding-left: 9px; margin: 4px 0 6px; }`,
    body,
  });
}

/**
 * The guards defend two things: the counts a reader would quote, and the two statements that
 * make the counts worth quoting - that the references are checked, and that the state claims
 * are dated rather than asserted.
 */
function selfCheck() {
  const html = build();
  const fail = (msg) => { throw new Error(`l114Visual: ${msg}`); };

  // 1. The reference total against the lists it is drawn from. The headline tile is this number.
  const parts = D.PATHS.length + D.MODELS.length + D.ROUTES.length + D.TESTS.length;
  if (parts !== D.TOTALS.paths) {
    fail(`the path total says ${D.TOTALS.paths} and the four lists hold ${parts}.`);
  }

  // 2. The procedure-file tally against the steps. Same rule, one level down.
  const pf = D.PROCEDURES.reduce((n, p) => n + p.steps.reduce((m, s) => m + s.files.length, 0), 0);
  if (pf !== D.TOTALS.procedureFiles) {
    fail(`the procedure-file tally says ${D.TOTALS.procedureFiles} and the steps hold ${pf}.`);
  }

  // 3. Every trap must be on the page. The traps are the only part of this document a reader
  //    cannot rediscover by reading code, so a dropped one is a silent loss.
  if (D.TRAPS.length !== D.TOTALS.traps) {
    fail(`the tile says ${D.TOTALS.traps} traps and the data holds ${D.TRAPS.length}.`);
  }
  for (const t of D.TRAPS) {
    if (!html.includes(esc(t.thing))) fail(`trap "${t.thing}" does not appear on the page.`);
  }

  // 4. Every failure symptom must be on the page, with the cause beside it. A symptom list
  //    missing an entry is worse than no list: it reads as exhaustive.
  if (D.FAILURES.length !== D.TOTALS.failures) {
    fail(`the tile says ${D.TOTALS.failures} failures and the data holds ${D.FAILURES.length}.`);
  }
  for (const f of D.FAILURES) {
    if (!html.includes(esc(f.symptom))) {
      fail(`failure "${f.symptom}" does not appear on the page.`);
    }
    if (!html.includes(esc(f.cause))) {
      fail(`failure "${f.symptom}" appears without its cause, which is the only part that `
        + 'tells a reader where to look.');
    }
  }

  // 5. The reason the references are checked must be stated. Without it the tile is a boast
  //    about a number rather than a claim a reviewer can test.
  // The phrase is pinned in the explanation, not the tile caption: the tile states the number,
  // the explanation states the mechanism, and it is the mechanism a reviewer tests.
  if (!/references are stat'ed on every build/.test(html)) {
    fail('the page no longer says the references are stat\'ed on every build, which is the one '
      + 'mechanism that makes a runbook safe to follow on a later day.');
  }

  // 6. The dated state claim must survive. The runbook deliberately says what was CHECKED
  //    rather than what is true, and that distinction is one edit from being lost.
  if (!html.includes(esc(D.META.stateCheckedOn))
    || !/absence of a commit is not proof/i.test(html)) {
    fail('the page no longer carries the dated state claim and its caveat. "An airing is an '
      + 'event git cannot show" is the reason the date is there at all.');
  }

  // 7. The uncalled-capability trap must still be present and still say a number of units
  //    shipped that way. It is the single most expensive thing a new reader can fail to know.
  const uncalled = D.TRAPS.find((t) => /never called/i.test(t.is));
  if (!uncalled || !/\bFOUR\b/.test(uncalled.is)) {
    fail('the trap about a capability that is exported, tested and called by nothing is gone, '
      + 'or no longer names how many shipped that way.');
  }

  return {
    refs: D.TOTALS.paths + D.TOTALS.procedureFiles,
    envs: D.TOTALS.envs,
    failures: D.TOTALS.failures,
    traps: D.TOTALS.traps,
    procedures: D.TOTALS.procedures,
  };
}

module.exports = { build, selfCheck };
