/**
 * L7.2 — the build pipeline may not clear a re-approval requirement a person set.
 *
 * The ticket names "stale approvals" as one of the things to attack. This is the one that was
 * real.
 *
 * `needs_reapproval` is one of the four LIFECYCLE_CONDITIONS, and it is the only one that is a
 * governance decision rather than a description of the work. `lifecycleStages.ts` states its
 * purpose in its own words: work authorized against a revision that has since changed materially
 * "must mark it needs_reapproval rather than let it proceed on stale evidence".
 *
 * `autoAdvance` used to end its UPDATE with `SET stage = :to, condition = NULL`, unconditionally.
 * So the sequence below erased the requirement with nothing recording that it ever existed:
 *
 *   1. A project is returned across an approval boundary. `crossesApprovalBoundary` marks it
 *      `needs_reapproval`; say it now sits at `plan_ready`.
 *   2. A build event fires `measureReadinessOnBuildEvent` -> `autoAdvance`.
 *   3. `plan_ready -> building` is a legitimate WORK_HOP, so `mayAutoAdvance` allows it. It is
 *      supposed to: the structural refusal is about approval HOPS, and this is not one.
 *   4. The UPDATE advanced the stage and set `condition = NULL`.
 *
 * Nothing in step 3 was wrong, which is why the existing `lifecycleAutoAdvance.test.ts` is green
 * and stays green: it tests `mayAutoAdvance`, a pure function that never sees the condition
 * column. The hole was in the write, so the test has to be on the write.
 *
 * ## Why these tests mock the database rather than use the integration suite
 *
 * CI has no DATABASE_URL, so an integration test here would skip and prove nothing. What needs
 * proving is the SQL this function sends and how it reads the result back, and both are visible
 * from a mocked `query`. The guard clause itself is asserted as a string for the same reason
 * `projectLifecycleRoutes.test.ts` asserts on route source: a clause that silently stops being
 * emitted is the failure mode, and only a direct assertion on the statement catches it.
 *
 * ## Which test catches what, measured
 *
 * The fix is two mechanisms, and they are tested separately because either can be removed while
 * the other still works. Both mutations were run before committing.
 *
 *   A. Guard neutered - `condition IS DISTINCT FROM 'needs_reapproval'` replaced by `1 = 1`.
 *      ONE failure: "emits the needs_reapproval guard on the UPDATE". The behavioural tests do
 *      NOT fail, and that is correct rather than a weakness: they drive a mocked `query`, so no
 *      assertion they make can depend on what the real WHERE clause filters. Nothing but a
 *      direct assertion on the statement can catch this mutation, which is the argument for
 *      keeping it. "does NOT use <>" also survives, as it must: it guards one specific wrong
 *      implementation, not the clause's absence.
 *
 *   B. Diagnosis disabled - `rows[0]?.condition === 'needs_reapproval'` replaced by `false`.
 *      ONE failure: "refuses with needs_reapproval when the guarded UPDATE matches no row". This
 *      is the pre-fix behaviour exactly, since the old code answered every zero-row write with
 *      `stage_moved`. So this test, and only this test, pins the reporting half.
 *
 * Neither mutation is caught by the POSITIVE CONTROL, which is why it is not doing this job: it
 * exists to catch the opposite error, a guard that refuses the normal unconditioned advance.
 */
const mockQuery = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Imported after the mock, so the module binds the mocked sequelize.
import { autoAdvance } from '../lifecycleAutoAdvance';
import { ADVANCE, type LifecycleStage } from '../lifecycleStages';
import { readinessFor } from '../lifecycleReadiness';
import { completeEvidence } from './evidenceFixture';
import type { StageReadiness } from '../lifecycleReadiness';

/** Satisfied readiness for the forward hop out of `from`. */
function satisfiedOut(from: LifecycleStage): StageReadiness {
  const to = ADVANCE[from] as LifecycleStage;
  return { ...readinessFor(to, completeEvidence()), satisfied: true, blocking: [] };
}

/**
 * `plan_ready -> building` is a work hop, so every refusal below comes from the write, not the
 * decision. The act must be the permission `building` is made of, which STAGE_PERMISSION gives as
 * `story.execute`; anything else is refused by `mayAutoAdvance` as `act_does_not_match` and the
 * write is never reached. The POSITIVE CONTROL below is what proves these tests get that far.
 */
const FROM: LifecycleStage = 'plan_ready';

const call = () => autoAdvance({
  lifecycleStateId: 'state-1',
  from: FROM,
  performedAct: 'story.execute',
  readiness: satisfiedOut(FROM),
});

/** Sequelize returns [rows, rowCount] for an UPDATE on Postgres. */
const updateResult = (rowCount: number) => [[], rowCount];

beforeEach(() => {
  mockQuery.mockReset();
});

describe('L7.2 a pending re-approval stops the pipeline instead of being cleared by it', () => {
  it('refuses with needs_reapproval when the guarded UPDATE matches no row', () => {
    mockQuery
      .mockResolvedValueOnce(updateResult(0))
      .mockResolvedValueOnce([{ stage: FROM, condition: 'needs_reapproval' }]);

    return call().then((decision) => {
      expect(decision.allowed).toBe(false);
      expect(decision.refusal).toBe('needs_reapproval');
      // The message has to send a reader to a person, not to a race that did not happen.
      expect(decision.message).toContain('re-approve');
    });
  });

  it('reports stage_moved, not needs_reapproval, when the row moved for any other reason', () => {
    // Same zero-row outcome, different cause. Conflating the two would be its own defect.
    mockQuery
      .mockResolvedValueOnce(updateResult(0))
      .mockResolvedValueOnce([{ stage: 'building', condition: null }]);

    return call().then((decision) => {
      expect(decision.allowed).toBe(false);
      expect(decision.refusal).toBe('stage_moved');
    });
  });

  it('survives the row having been deleted between the write and the diagnosis', () => {
    // The diagnostic SELECT can legitimately find nothing. It must not throw on rows[0].
    mockQuery
      .mockResolvedValueOnce(updateResult(0))
      .mockResolvedValueOnce([]);

    return call().then((decision) => {
      expect(decision.allowed).toBe(false);
      expect(decision.refusal).toBe('stage_moved');
    });
  });

  it('POSITIVE CONTROL advances an unconditioned project, and asks nothing further', () => {
    // Without this the suite would pass just as well if the guard refused everything, which is
    // the inversion that would break every normal advance in production.
    mockQuery.mockResolvedValueOnce(updateResult(1));

    return call().then((decision) => {
      expect(decision.allowed).toBe(true);
      expect(decision.to).toBe('building');
      // One statement only: a successful advance must not pay for the diagnostic SELECT.
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});

describe('L7.2 the guard is in the statement, and is NULL-safe', () => {
  const sqlOf = (n: number) => String(mockQuery.mock.calls[n][0]);

  it('emits the needs_reapproval guard on the UPDATE', () => {
    mockQuery.mockResolvedValueOnce(updateResult(1));
    return call().then(() => {
      expect(sqlOf(0)).toContain('UPDATE project_lifecycle_states');
      expect(sqlOf(0)).toContain("condition IS DISTINCT FROM 'needs_reapproval'");
    });
  });

  it('does NOT use <>, which would refuse every project whose condition is NULL', () => {
    // `NULL <> 'needs_reapproval'` evaluates to NULL, not true, so a `<>` guard would match no
    // unconditioned row at all and silently stop the pipeline everywhere. This is the specific
    // wrong version of this fix, pinned so it cannot be reintroduced by tidying.
    mockQuery.mockResolvedValueOnce(updateResult(1));
    return call().then(() => {
      expect(sqlOf(0)).not.toContain("condition <> 'needs_reapproval'");
      expect(sqlOf(0)).not.toContain('condition != ');
    });
  });

  it('still clears the other three conditions on a successful advance', () => {
    // `blocked`, `failed` and `awaiting_input` all describe a situation that progressing work
    // resolves. The fix must not have turned the pipeline into something that leaves them set.
    mockQuery.mockResolvedValueOnce(updateResult(1));
    return call().then(() => {
      expect(sqlOf(0)).toContain('condition = NULL');
      expect(sqlOf(0)).toContain('condition_reason = NULL');
    });
  });
});
