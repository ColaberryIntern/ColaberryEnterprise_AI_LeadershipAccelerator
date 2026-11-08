/**
 * Batch placement wiring tripwire (C10.13).
 *
 * The placement RULE is tested in batchPlacementService.test.ts. This file tests something
 * a behavioural test cannot: that every writer which marks an enrollment paid actually asks
 * the rule, and that the one writer deliberately left alone cannot undo it.
 *
 * ── WHY A SOURCE SCAN AND NOT FIVE MORE UNIT TESTS ──────────────────────────────────
 * The payment writers mark a row paid in three different syntaxes - an object literal
 * (`reconcilePayment`), property assignment plus `.save()` (`markEnrollmentPaid`), and raw
 * SQL (`paymentSyncService`) - and every one of them lives behind a PaySimple client, a
 * subscription graph or a sweep that needs a database. That is why they sit on
 * jest.ci.config.ts's exclusion list, and why T206's first pass MISSED a writer: a guard
 * that only sees `.update({...})` cannot see the other two. The same bypass class applies
 * here, so the population is derived from source rather than from a list someone maintains.
 *
 * ── WHY COMMENTS ARE STRIPPED FIRST ────────────────────────────────────────────────
 * Not optional. The C10.13 comments in these files quote the thing they changed - the word
 * `cohort_id` appears in prose in every file below - so a scan over raw source would match
 * its own explanation and report a wired writer as unwired, or worse, report the
 * deliberately-untouched writer as a `cohort_id` writer. That exact trap produced a wrong
 * verification during C10.14 (tsc preserves comments, so a grep over `dist/` matched the
 * tombstones). The stripper is proved below with a planted violation in each direction.
 */

import fs from 'fs';
import path from 'path';
// Imported for its TYPE as much as its behaviour: the call below is what fails to compile
// if `isBatchCohort`'s parameter is ever narrowed again.
import { isBatchCohort } from '../../services/batch/batchCohort';

const SRC = path.resolve(__dirname, '..', '..');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ');

function code(rel: string): string {
  return stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8'));
}

/**
 * Every writer that marks an enrollment paid and therefore has to place it.
 *
 * `appPaymentReconcileService` is NOT here, and that is a claim this file checks rather
 * than an omission: it activates through `activateByRef`, which reaches `grantMembership`,
 * so it is covered transitively.
 */
const WIRED_WRITERS: Record<string, string> = {
  'services/subscriptionService.ts':
    'grantMembership - the shared seam for self-serve activation and comped grants',
  'services/enrollmentService.ts':
    'markEnrollmentPaid - the legacy PaySimple webhook path',
  'services/paymentReconciliationService.ts':
    'reconcilePayment - the PaySimple reconciliation sweep',
  'services/paymentSyncService.ts':
    'the raw-SQL payment sync, the one writer no activation path covers',
};

const CALLS_RESOLVER = /resolvePaidBatchPlacement\s*\(/;

describe('every paid-status writer asks the placement rule', () => {
  for (const [rel, why] of Object.entries(WIRED_WRITERS)) {
    it(`${rel} calls the resolver (${why})`, () => {
      expect(CALLS_RESOLVER.test(code(rel))).toBe(true);
    });
  }

  it('imports it from the one module that defines it, never a second copy', () => {
    for (const rel of Object.keys(WIRED_WRITERS)) {
      expect(code(rel)).toMatch(/from '\.\/batch\/batchPlacementService'/);
    }
  });

  /** Non-vacuity: a scan that matched nothing would pass every assertion above. */
  it('checked four writers, and the count is stated so an empty scan cannot pass', () => {
    expect(Object.keys(WIRED_WRITERS).length).toBe(4);
    for (const rel of Object.keys(WIRED_WRITERS)) {
      expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
      expect(code(rel).length).toBeGreaterThan(500);
    }
  });
});

describe('the writer deliberately left alone cannot undo a placement', () => {
  /**
   * THE CLAIM THIS CHECKS. `appPaymentReconcileService` is not wired because it activates
   * through `activateByRef`, and its own fallback `UPDATE enrollments` - the one that runs
   * when activation threw - does not write `cohort_id`. If someone adds `cohort_id` to that
   * statement, the fallback would start overwriting a placement the happy path had already
   * made, and this test is what says so. Asserting it beats trusting the comment that
   * says it.
   */
  it('appPaymentReconcileService writes no cohort_id in any syntax', () => {
    const src = code('services/appPaymentReconcileService.ts');
    expect(src).toContain('activateByRef');
    expect(/cohort_id\s*[:=]/.test(src)).toBe(false);
  });
});

describe('the one definition of a batch', () => {
  /** Three readers needed "what counts as a batch", so it lives in one pure module and
   *  the rooms copy that C10.14 wrote now re-exports from it. A second declaration
   *  reappearing is the drift this ladder keeps being bitten by. */
  it('is declared once, in batchCohort.ts', () => {
    const declarations = ['services/batch/batchCohort.ts', 'services/communityRooms/cohortRoomService.ts']
      .filter((rel) => /export\s+const\s+BATCH_COHORT_TYPE\s*=/.test(code(rel)));
    expect(declarations).toEqual(['services/batch/batchCohort.ts']);
  });

  it('is still exported from the rooms module, so C10.14 callers are unbroken', () => {
    expect(code('services/communityRooms/cohortRoomService.ts'))
      .toMatch(/export\s*\{\s*BATCH_COHORT_TYPE\s*,\s*isBatchCohort\s*\}/);
  });

  /** isBatchCohort takes the WHOLE row shape. `Pick<BatchCohortRow, 'cohort_type'>` compiled
   *  here and broke C10.14's callers two directories away: an object literal carrying `id`
   *  and `name` fails TypeScript's excess-property check against a one-field type, which is
   *  how both a test and a raw SQL row hand a cohort in. Narrowing a published signature is
   *  a breaking contract change even when the body never moves. */
  it('takes a whole cohort row, so a literal with id and name still type-checks', () => {
    expect(code('services/batch/batchCohort.ts'))
      .toMatch(/export function isBatchCohort\(cohort: BatchCohortRow\)/);
    expect(isBatchCohort({ id: 'c1', name: 'Cohort - December 2026', cohort_type: null })).toBe(true);
  });
});

describe('placement does not drag the model layer into its callers', () => {
  /** `paymentSyncService` marks rows paid in raw SQL and imports no models on purpose. A
   *  static `import { Cohort } from '../../models'` in the placement leaf put the whole
   *  Sequelize graph into its import chain and its entire suite stopped loading --
   *  `Cohort.init` threw "Cannot read properties of undefined (reading 'define')" before a
   *  test ran. The symptom was two modules from the cause, so it is pinned at the cause. */
  it('imports the models for their types only, and loads them inside the call', () => {
    const src = code('services/batch/batchPlacementService.ts');
    expect(src).toMatch(/import type \{ Cohort \} from '\.\.\/\.\.\/models'/);
    expect(src).not.toMatch(/^import \{[^}]*\} from '\.\.\/\.\.\/models'/m);
    expect(src).toMatch(/await import\('\.\.\/\.\.\/models'\)/);
  });
});

describe('the scheduled rollover is registered and described', () => {
  /** An `instrumentCronJob` name with no `ai_agents` seed row tracks its run_count and
   *  error_count against nothing, so it is invisible to every health surface. The cron
   *  registry ratchet enforces this globally; this states it for THIS job, next to the
   *  job, where someone changing the schedule will see it. */
  it('fires on the same schedule the seed row advertises', () => {
    const scheduler = code('services/schedulerService.ts');
    const seed = code('services/agentRegistrySeed.ts');
    expect(scheduler).toContain("instrumentCronJob('BatchRollover'");
    expect(scheduler).toMatch(/'10 0 \* \* \*'/);
    expect(seed).toContain("agent_name: 'BatchRollover'");
    expect(seed).toMatch(/schedule: '10 0 \* \* \*'/);
  });

  it('is gated by a kill switch, because it mutates a cohorts row unattended', () => {
    expect(code('services/schedulerService.ts')).toContain('env.batchRolloverEnabled');
    expect(code('config/env.ts')).toContain('BATCH_ROLLOVER_ENABLED');
  });
});

describe('the stripper itself', () => {
  /** Both controls, because the two failure directions are opposite: a stripper that cuts
   *  too little reports prose as code, and one that cuts too much reports real code as
   *  absent. Each has been a live defect in this repo. */
  it('does not count a mention in a comment, and still counts real code', () => {
    const sample = [
      '// resolvePaidBatchPlacement( is named here in prose only',
      '/* and cohort_id = :x appears in this block comment */',
      'const kept = 1;',
    ].join('\n');
    const out = stripComments(sample);
    expect(CALLS_RESOLVER.test(out)).toBe(false);
    expect(/cohort_id\s*[:=]/.test(out)).toBe(false);
    expect(out).toContain('const kept = 1;');

    const real = stripComments('await resolvePaidBatchPlacement({ currentCohortId: null });');
    expect(CALLS_RESOLVER.test(real)).toBe(true);
  });

  /** Self-test: the pattern CAN fail, so a green suite means something. */
  it('reports an unwired writer when one is planted', () => {
    const unwired = stripComments('await fresh.update({ payment_status: "paid" });');
    expect(CALLS_RESOLVER.test(unwired)).toBe(false);
  });

  it('would catch a cohort_id write added to the untouched writer', () => {
    const planted = stripComments("`UPDATE enrollments SET cohort_id = :c WHERE id = :id`");
    expect(/cohort_id\s*[:=]/.test(planted)).toBe(true);
  });
});
