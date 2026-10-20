/**
 * Deliberately break each C3.5 figure guard and confirm it fires.
 *
 * These guards replaced a blanket ban that was WRONG - it refused OpenAI's real
 * ten-million commitment because the number was absent from this repository. A guard
 * written to correct a previous guard's mistake is exactly the kind that needs proving,
 * so each one is broken here in the specific way the document could plausibly go wrong.
 *
 * Mutating the exported live objects rather than rewriting source: two earlier harnesses
 * in this repo false-passed on syntax errors from their own edits. A syntax error or a
 * no-op edit counts as a FAILURE here, not a pass.
 */
const path = require('path');

const DATA = path.join(__dirname, '..', 'scripts', 'artifacts', 'tickets', 'c35Data.js');

let pass = 0;
let fail = 0;

function check(name, threw, shouldThrow = true) {
  if (threw && /HARNESS BUG|Unexpected token|Invalid or unexpected|is not a function/.test(threw)) {
    fail += 1;
    console.log(`  BROKEN  ${name}\n            -> ${threw}`);
    return;
  }
  if (!!threw === shouldThrow) {
    pass += 1;
    console.log(`  ${shouldThrow ? 'FIRES ' : 'QUIET '}  ${name}`
      + (threw ? `\n            -> ${threw.slice(0, 150)}` : ''));
  } else {
    fail += 1;
    console.log(`  ${shouldThrow ? 'SILENT' : 'FALSE+'}  ${name}   <-- wrong behaviour`);
  }
}

/** Mutate the live module, run, always restore. */
function withMutation(mutate, run) {
  delete require.cache[require.resolve(DATA)];
  const M = require(DATA);
  let undo = null;
  let threw = null;
  try {
    undo = mutate(M);
    if (typeof undo !== 'function') throw new Error('HARNESS BUG: mutation returned no undo');
    try { run(M); } catch (e) { threw = e.message; }
  } catch (e) {
    threw = threw || e.message;
  } finally {
    if (typeof undo === 'function') undo();
    delete require.cache[require.resolve(DATA)];
  }
  return threw;
}

console.log('C3.5 figure guards\n');

/* 1. The exact regression that prompted all of this: the figure is stated, the source is
      gone. This is what "we said it because we remembered it" looks like in data. */
check('assertHeadlineFiguresAreSourced, the 10 million source is removed from EVIDENCE',
  withMutation(
    (M) => {
      const i = M.EVIDENCE.findIndex((e) => e.claim.includes('10 million'));
      if (i < 0) throw new Error('HARNESS BUG: no 10 million evidence row to remove');
      const [row] = M.EVIDENCE.splice(i, 1);
      return () => M.EVIDENCE.splice(i, 0, row);
    },
    (M) => M.assertHeadlineFiguresAreSourced(),
  ));

/* 2. Same for the other figure, so the guard is not accidentally specific to one of them. */
check('assertHeadlineFiguresAreSourced, the 300,000 source is removed from EVIDENCE',
  withMutation(
    (M) => {
      const i = M.EVIDENCE.findIndex((e) => e.claim.includes('300,000'));
      if (i < 0) throw new Error('HARNESS BUG: no 300,000 evidence row to remove');
      const [row] = M.EVIDENCE.splice(i, 1);
      return () => M.EVIDENCE.splice(i, 0, row);
    },
    (M) => M.assertHeadlineFiguresAreSourced(),
  ));

/* 3. The realistic copy mistake: a real number, the wrong people. */
check('assertFiguresAreNotConflated, the deck says "300,000 Americans"',
  withMutation(
    (M) => {
      const s = M.DECK[0];
      const before = s.body;
      s.body = 'A public target of 300,000 Americans by the end of 2026.';
      return () => { s.body = before; };
    },
    (M) => M.assertFiguresAreNotConflated(),
  ));

/* 4. The same mistake in the other direction, in a different part of the bundle, so the
      guard is proven to scan the whole prose rather than one section. */
check('assertFiguresAreNotConflated, the leave-behind says "10 million consultants"',
  withMutation(
    (M) => {
      const before = M.LEAVE_BEHIND.lede;
      M.LEAVE_BEHIND.lede = 'You have committed to 10 million certified consultants.';
      return () => { M.LEAVE_BEHIND.lede = before; };
    },
    (M) => M.assertFiguresAreNotConflated(),
  ));

/* 5. The spelled-out form, because "ten million consultants" reads as natural prose and a
      digit-only guard would wave it through. */
check('assertFiguresAreNotConflated, the FAQ says "ten million consultants"',
  withMutation(
    (M) => {
      const f = M.FAQ[0];
      const before = f.a;
      f.a = 'They aim at ten million certified consultants worldwide.';
      return () => { f.a = before; };
    },
    (M) => M.assertFiguresAreNotConflated(),
  ));

/* 6. The sequencing criterion: a PDF requested with no approval record. */
check('assertNoPdfRequested, a PDF job with no approval record',
  withMutation(
    () => () => {},
    (M) => M.assertNoPdfRequested([{ file: 'X.pdf' }], null),
  ));

/* 7. An approval record missing the sentence that justifies it is not an approval. */
check('assertNoPdfRequested, an approval record with no wording',
  withMutation(
    () => () => {},
    (M) => M.assertNoPdfRequested([{ file: 'X.pdf' }],
      { approvedBy: 'Ali Muwwakkil', on: '2026-10-20' }),
  ));

/* 8. An unsourced number anywhere in the prose. */
check('assertNoUnsourcedFigure, an invented number appears in the deck',
  withMutation(
    (M) => {
      const s = M.DECK[1];
      const before = s.body;
      s.body = 'We have certified 4,719 people against this method.';
      return () => { s.body = before; };
    },
    (M) => M.assertNoUnsourcedFigure(),
  ));

/* 9. A row that exists but carries an empty source reads as cited and is not. */
check('assertHeadlineFiguresAreSourced, the 10 million row is emptied of its source',
  withMutation(
    (M) => {
      const row = M.EVIDENCE.find((e) => e.claim.includes('10 million'));
      if (!row) throw new Error('HARNESS BUG: no 10 million row');
      const before = row.source;
      row.source = '';
      return () => { row.source = before; };
    },
    (M) => M.assertHeadlineFiguresAreSourced(),
  ));

/* ── the quiet cases: the guards must NOT fire on the real content ────────── */

check('assertHeadlineFiguresAreSourced, unmodified bundle',
  withMutation(() => () => {}, (M) => M.assertHeadlineFiguresAreSourced()), false);
check('assertFiguresAreNotConflated, unmodified bundle',
  withMutation(() => () => {}, (M) => M.assertFiguresAreNotConflated()), false);
check('assertNoUnsourcedFigure, unmodified bundle',
  withMutation(() => () => {}, (M) => M.assertNoUnsourcedFigure()), false);
check('assertNoPdfRequested, PDFs with the real approval record',
  withMutation(() => () => {},
    (M) => M.assertNoPdfRequested([{ file: 'X.pdf' }], M.PDF_APPROVAL)), false);
check('assertNoPdfRequested, HTML only and no approval, still fine',
  withMutation(() => () => {},
    (M) => M.assertNoPdfRequested([{ file: 'X.html' }], null)), false);

console.log(`\n${pass} correct, ${fail} wrong`);
process.exit(fail ? 1 : 0);
