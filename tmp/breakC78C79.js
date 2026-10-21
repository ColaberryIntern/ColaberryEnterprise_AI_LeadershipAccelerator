/**
 * Break each certification guard on C7.8/C7.9 and confirm it fires.
 *
 * These documents go to an enterprise buyer, so they can be wrong in two directions and
 * both matter. Overstating costs a customer later; understating costs the deal now. The
 * module guarded only the first until the page was found claiming "no certifications"
 * while a funded SOC 2 and ISO 27001 implementation was running. Both directions are
 * broken here.
 *
 * Mutating the live exports rather than rewriting source: a harness that edits files
 * false-passes on its own syntax errors. A syntax error or a no-op edit is a FAILURE.
 */
const path = require('path');

const DATA = path.join(__dirname, '..', 'scripts', 'artifacts', 'tickets', 'c78c79Data.js');

let pass = 0;
let fail = 0;

function check(name, threw, shouldThrow = true) {
  if (threw && /HARNESS BUG|Unexpected token|is not a function|Cannot read/.test(threw)) {
    fail += 1;
    console.log(`  BROKEN  ${name}\n            -> ${threw}`);
    return;
  }
  if (!!threw === shouldThrow) {
    pass += 1;
    console.log(`  ${shouldThrow ? 'FIRES ' : 'QUIET '}  ${name}`
      + (threw ? `\n            -> ${threw.slice(0, 140)}` : ''));
  } else {
    fail += 1;
    console.log(`  ${shouldThrow ? 'SILENT' : 'FALSE+'}  ${name}   <-- wrong behaviour`);
  }
}

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

const soc2 = (M) => M.FAQ.find((f) => /do you have soc 2/i.test(f.q));

console.log('C7.8/C7.9 certification guards\n');

/* ── UNDERSTATEMENT: the failure that prompted this ───────────────────────── */

check('assertProgramIsNotOmitted, the program is dropped from the SOC 2 answer and POSITION',
  withMutation(
    (M) => {
      const f = soc2(M);
      const a = f.a;
      const p = M.POSITION;
      f.a = 'No report and no auditor engaged. We hold nothing.';
      M.POSITION = 'We are a small team with a real audit trail and no certifications.';
      return () => { f.a = a; M.POSITION = p; };
    },
    (M) => M.assertProgramIsNotOmitted(),
  ));

// POSITION is a module-level const, so reassigning the export does NOT change what the
// guard reads. Three tests here silently tested nothing before the guards took an
// injectable prose argument. Where POSITION matters, the prose is passed in.
check('assertProgramIsNotOmitted, the program is named with no start date',
  withMutation(
    () => () => {},
    (M) => M.assertProgramIsNotOmitted(
      'No report and no auditor engaged. A SOC 2 Type II and ISO 27001 implementation is '
      + 'under way. No Type II observation window has a start date.'),
  ));

check('assertProgramIsNotOmitted, the program is named without saying no auditor is engaged',
  withMutation(
    (M) => {
      const f = soc2(M);
      const a = f.a;
      const p = M.POSITION;
      f.a = 'A SOC 2 Type II and ISO 27001 implementation has run since July 2026. '
        + 'No Type II observation window has a start date.';
      M.POSITION = 'A small team with a real audit trail.';
      return () => { f.a = a; M.POSITION = p; };
    },
    (M) => M.assertProgramIsNotOmitted(),
  ));

check('assertProgramIsNotOmitted, the program is named without the observation window limit',
  withMutation(
    (M) => {
      const f = soc2(M);
      const a = f.a;
      const p = M.POSITION;
      f.a = 'No report and no auditor engaged. A SOC 2 Type II and ISO 27001 '
        + 'implementation has run since July 2026.';
      M.POSITION = 'A small team with a real audit trail.';
      return () => { f.a = a; M.POSITION = p; };
    },
    (M) => M.assertProgramIsNotOmitted(),
  ));

check('assertProgramIsNotOmitted, the copy promises a certification date',
  withMutation(
    (M) => {
      const f = soc2(M);
      const a = f.a;
      f.a = `${a} We expect to be certified by March 2027.`;
      return () => { f.a = a; };
    },
    (M) => M.assertProgramIsNotOmitted(),
  ));

/* ── OVERSTATEMENT: still guarded, and the denial must survive ────────────── */

check('assertNoUnheldCertificationImplied, the copy says we are SOC 2 compliant',
  withMutation(
    () => () => {},
    (M) => M.assertNoUnheldCertificationImplied(
      'We are SOC 2 compliant and ready for enterprise procurement.'),
  ));

check('assertNoUnheldCertificationImplied, the copy says we are ISO 27001 certified',
  withMutation(
    () => () => {},
    (M) => M.assertNoUnheldCertificationImplied(
      'Colaberry is ISO 27001 certified as of this year.'),
  ));

// Naming a standard in order to DENY holding it is the whole job of this document, so the
// guard must not fire on a bare mention. This is the false-positive that would make the
// page unwritable.
check('assertNoUnheldCertificationImplied, a plain denial is not an implication',
  withMutation(
    () => () => {},
    (M) => M.assertNoUnheldCertificationImplied(
      'We are not SOC 2 certified and hold no ISO 27001 certificate. SOC 2 Type II '
      + 'readiness work is under way.'),
  ), false);

check('assertNoUnheldCertificationImplied, the SOC 2 answer stops denying the report',
  withMutation(
    (M) => {
      const f = soc2(M);
      const a = f.a;
      f.a = 'A SOC 2 Type II and ISO 27001 implementation has run since July 2026.';
      return () => { f.a = a; };
    },
    (M) => M.assertNoUnheldCertificationImplied(),
  ));

/* ── the table and the panel may not contradict each other ───────────────── */

check('assertTableAgreesWithProgram, the table still says no audit is in progress',
  withMutation(
    (M) => {
      const row = M.HOLD_NOTHING.find((c) => /soc 2/i.test(c.name));
      const before = row.state;
      row.state = 'NOT HELD. No report, no audit in progress, no auditor engaged.';
      return () => { row.state = before; };
    },
    (M) => M.assertTableAgreesWithProgram(),
  ));

check('assertTableAgreesWithProgram, the same contradiction reworded',
  withMutation(
    (M) => {
      const row = M.HOLD_NOTHING.find((c) => /soc 2/i.test(c.name));
      const before = row.state;
      row.state = 'NOT HELD. There is no SOC 2 audit currently in progress.';
      return () => { row.state = before; };
    },
    (M) => M.assertTableAgreesWithProgram(),
  ));

check('assertTableAgreesWithProgram, the table claims SOC 2 is held',
  withMutation(
    (M) => {
      const row = M.HOLD_NOTHING.find((c) => /soc 2/i.test(c.name));
      const before = row.state;
      row.state = 'HELD since July 2026.';
      return () => { row.state = before; };
    },
    (M) => M.assertTableAgreesWithProgram(),
  ));

/* ── the quiet cases ──────────────────────────────────────────────────────── */

check('assertProgramIsNotOmitted, unmodified copy',
  withMutation(() => () => {}, (M) => M.assertProgramIsNotOmitted()), false);
check('assertNoUnheldCertificationImplied, unmodified copy',
  withMutation(() => () => {}, (M) => M.assertNoUnheldCertificationImplied()), false);
check('assertEveryCriticalGapIsDisclosed, unmodified copy',
  withMutation(() => () => {}, (M) => M.assertEveryCriticalGapIsDisclosed()), false);
check('assertCopyIsClean, unmodified copy',
  withMutation(() => () => {}, (M) => M.assertCopyIsClean()), false);
check('assertTableAgreesWithProgram, unmodified table',
  withMutation(() => () => {}, (M) => M.assertTableAgreesWithProgram()), false);

console.log(`\n${pass} correct, ${fail} wrong`);
process.exit(fail ? 1 : 0);
