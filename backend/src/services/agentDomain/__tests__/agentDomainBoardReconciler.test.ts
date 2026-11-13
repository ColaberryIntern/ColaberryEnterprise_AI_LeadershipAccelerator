/**
 * The board reconciler, and above all what it refuses.
 *
 * This module exists to delete 964 rows from seven real interns' project boards. The tests that
 * matter most here are not the ones proving it deletes — they are the ones proving it does not,
 * the moment a row carries somebody's work.
 */

import {
  changedFields,
  describePlan,
  describePreserved,
  isUntouched,
  partitionUpdate,
  planBoardReconcile,
  type ExistingStoryRow,
} from '../agentDomainBoardReconciler';
import { planProvision } from '../agentDomainProvisionPlan';
import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';

const DOMAIN = 'platform';

/** A live row that matches the plan exactly — the state after a successful migration. */
function rowFromPlan(s: ReturnType<typeof planProvision>['stories'][number]): ExistingStoryRow {
  return {
    id: s.id,
    story_id: s.story_id,
    story_kind: s.kind,
    status: 'not_started',
    verified_at: null,
    title: s.title,
    narrative: s.narrative,
    build: s.build,
    release_key: s.release_key,
    autonomy_stage: s.autonomy_stage,
    acceptance: s.acceptance.length ? [...s.acceptance] : [],
  };
}

/** A row the generator no longer emits — one of the 964 per-rung behaviour stories. */
function strayRow(storyId: string, over: Partial<ExistingStoryRow> = {}): ExistingStoryRow {
  return {
    id: `stray-${storyId}`,
    story_id: storyId,
    story_kind: 'release_behaviour',
    status: 'not_started',
    verified_at: null,
    title: 'Orchestration health watch · R5',
    narrative: 'Orchestration health watch · R5',
    build: 'prompt',
    release_key: 'autonomy:R5',
    autonomy_stage: 'autonomy:R5',
    acceptance: ['judged somehow'],
    ...over,
  };
}

const matchingBoard = () => planProvision(DOMAIN).stories.map(rowFromPlan);

/**
 * A row somebody has ADDED CONTENT TO since it was generated.
 *
 * This helper is the fix for the gap that let a data-destroying migration pass a full
 * test suite. Every other fixture here is built from the plan by `rowFromPlan`, so
 * stored content could never differ from planned content, and the case that actually
 * existed in production -- a row carrying authored acceptance the generator does not
 * emit -- was unrepresentable. The first dry run against production found 683 such
 * acceptance lines on 513 rows, 100 of them already signed off.
 *
 * Default values mirror a real curriculum row:
 *   acceptance ["Swati names the approver and states what happens to the old cards on a re-publish."]
 *   planned acceptance []
 */
function authoredRow(
  over: Partial<ExistingStoryRow> = {},
): { row: ExistingStoryRow; planned: ReturnType<typeof planProvision>['stories'][number] } {
  // Must be a story the plan gives NO acceptance, or the case under test does not arise.
  const planned = planProvision(DOMAIN).stories.find((s) => s.acceptance.length === 0);
  if (!planned) throw new Error('fixture needs a planned story with no acceptance; none found');
  return {
    planned,
    row: {
      ...rowFromPlan(planned),
      acceptance: ['Swati names the approver and states what happens to the old cards on a re-publish.'],
      ...over,
    },
  };
}

// ───────────────────────────── 1. the refusals ─────────────────────────────

describe('it will not delete work somebody has done', () => {
  it.each([
    ['in_progress', 'status_not_untouched'],
    ['blocked', 'status_not_untouched'],
    ['complete', 'status_not_untouched'],
  ])('refuses to delete a stray row whose status is %s', (status, reason) => {
    const plan = planBoardReconcile(DOMAIN, [...matchingBoard(), strayRow('x.R5', { status })]);
    expect(plan.to_delete).toHaveLength(0);
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0].reason).toBe(reason);
    expect(plan.refusals[0].story_id).toBe('x.R5');
  });

  it('refuses to delete a row that was verified, even if its status still reads not_started', () => {
    // verified_at is the stronger signal: somebody signed it off. A status that disagrees with it
    // is a reason to stop, not a reason to prefer the status.
    const plan = planBoardReconcile(DOMAIN, [
      ...matchingBoard(), strayRow('x.R5', { verified_at: '2026-11-01T00:00:00Z' }),
    ]);
    expect(plan.to_delete).toHaveLength(0);
    expect(plan.refusals[0].reason).toBe('verified');
  });

  it('a refusal does not quietly let the OTHER deletions through', () => {
    // The runner aborts a domain that has any refusal. This asserts the plan gives it the whole
    // picture rather than a partially-filtered one it might apply by mistake.
    const plan = planBoardReconcile(DOMAIN, [
      ...matchingBoard(), strayRow('a.R5'), strayRow('b.R5', { status: 'in_progress' }),
    ]);
    expect(plan.refusals).toHaveLength(1);
    expect(plan.to_delete.map((r) => r.story_id)).toEqual(['a.R5']);
    expect(describePlan(plan)).toContain('REFUSED');
  });

  it('isUntouched is the single definition both the plan and the SQL guard use', () => {
    expect(isUntouched(strayRow('a'))).toBe(true);
    expect(isUntouched(strayRow('a', { status: 'in_progress' }))).toBe(false);
    expect(isUntouched(strayRow('a', { verified_at: new Date() }))).toBe(false);
  });
});

// ────────── 1b. it will not destroy content somebody authored ──────────
//
// These are the tests whose absence let a data-destroying migration pass twelve green
// CI checks. Each one fails against the pre-fix reconciler.

describe('an update may add content, never destroy it', () => {
  it('does NOT erase authored acceptance just because the plan carries none', () => {
    const { row, planned } = authoredRow();
    const changed = changedFields(row, planned);
    expect(changed).toContain('acceptance'); // the drift is real...

    const { write, preserved } = partitionUpdate(row, planned, changed);
    expect(write).not.toContain('acceptance'); // ...but it must not be written
    expect(preserved.map((p) => p.field)).toEqual(['acceptance']);
    expect(preserved[0].reason).toBe('plan_has_nothing');
  });

  it('drops the row from to_update entirely when acceptance was its only difference', () => {
    // Otherwise the runner issues an UPDATE with no columns and reports work it did not do.
    const { row } = authoredRow();
    const board = matchingBoard().map((r) => (r.id === row.id ? row : r));
    const plan = planBoardReconcile(DOMAIN, board);

    expect(plan.to_update.find((u) => u.id === row.id)).toBeUndefined();
    expect(plan.preserved).toHaveLength(1);
    expect(plan.preserved[0].field).toBe('acceptance');
    expect(plan.noop).toBe(true);
    // A no-op that preserved something must not read like a no-op that found nothing.
    expect(describePlan(plan)).toContain('preserved');
    expect(describePreserved(plan)).toEqual(['1 x acceptance (plan_has_nothing)']);
  });

  it('still writes the fields that are safe on a row whose acceptance is preserved', () => {
    // A preserved acceptance must not make the whole row untouchable. The narrative here
    // is a truncation of the planned one, so extending it loses nothing.
    const planned = planProvision(DOMAIN).stories.find((s) => s.acceptance.length === 0)!;
    const { row } = authoredRow({ narrative: planned.narrative.slice(25) });
    const changed = changedFields(row, planned);
    const { write, preserved } = partitionUpdate(row, planned, changed);

    expect(write).toEqual(['narrative']);
    expect(write).not.toContain('acceptance');
    expect(preserved.map((p) => p.field)).toEqual(['acceptance']);
  });

  it('writes a prose change that EXTENDS the stored text, which is the relabel', () => {
    // The IN FLIGHT / CANDIDATE relabel prepends to the existing body. That is additive
    // and is the entire point of the migration, so it must not be preserved away.
    const { planned } = authoredRow();
    const stored = { ...rowFromPlan(planned), narrative: planned.narrative.slice(20) };
    const changed = changedFields(stored, planned);
    expect(changed).toContain('narrative');
    expect(partitionUpdate(stored, planned, changed).write).toContain('narrative');
  });

  it('REFUSES a prose change that replaces the stored text instead of extending it', () => {
    // The real case: an admissions research row carrying a hand-written finding, which
    // the generic template body does not contain. 487 characters would have been lost.
    const { planned } = authoredRow();
    const stored = {
      ...rowFromPlan(planned),
      narrative: `${planned.narrative}\n\nA role-name collision, not an ownership question.`,
    };
    const changed = changedFields(stored, planned);
    const { write, preserved } = partitionUpdate(stored, planned, changed);

    expect(write).not.toContain('narrative');
    expect(preserved[0].reason).toBe('would_discard_edits');
    expect(preserved[0].detail).toContain('chars stored');
  });

  it('guards edited prose regardless of status, because status does not record an edit', () => {
    // `status` says whether the task was worked, not whether its text was changed. The
    // admissions row was `complete`, but a `not_started` row can carry an edit too.
    const { planned } = authoredRow();
    for (const status of ['not_started', 'in_progress', 'complete']) {
      const stored = {
        ...rowFromPlan(planned), status,
        narrative: `${planned.narrative}\n\nsomebody's own note`,
      };
      const { write } = partitionUpdate(stored, planned, changedFields(stored, planned));
      expect(write).not.toContain('narrative');
    }
  });

  it('POSITIVE CONTROL: a blank stored value IS overwritten', () => {
    // Proves the guard keys on "would this lose something", not on "did anything differ".
    // Without this, a reconciler that never writes anything would pass every test above.
    const { planned } = authoredRow();
    const empty = { ...rowFromPlan(planned), narrative: '', acceptance: [] };
    const { write, preserved } = partitionUpdate(empty, planned, changedFields(empty, planned));

    expect(write).toContain('narrative');
    expect(preserved).toHaveLength(0);
  });
});

// ───────────────────────── 2. the three outcomes ─────────────────────────

describe('it makes the board match the plan', () => {
  it('deletes exactly the rows the generator no longer emits', () => {
    const plan = planBoardReconcile(DOMAIN, [
      ...matchingBoard(), strayRow('a.R5'), strayRow('b.R2'),
    ]);
    expect(plan.to_delete.map((r) => r.story_id).sort()).toEqual(['a.R5', 'b.R2']);
    expect(plan.to_insert).toHaveLength(0);
    expect(plan.to_update).toHaveLength(0);
  });

  it('inserts the whole plan onto an empty board, including the four ladder stories', () => {
    const plan = planBoardReconcile(DOMAIN, []);
    const expected = planProvision(DOMAIN).stories;
    expect(plan.to_insert).toHaveLength(expected.length);
    expect(plan.to_insert.filter((s) => s.kind === 'capability_ladder')).toHaveLength(4);
    expect(plan.to_delete).toHaveLength(0);
  });

  it('updates a row whose body drifted, naming only the fields that differ', () => {
    // The stored body is a TRUNCATION of the planned one, so the planned body still
    // contains it. That is the additive shape of the real relabel, and the only shape
    // this reconciler will write -- a replacement is preserved instead, which the
    // "an update may add content" block covers.
    const board = matchingBoard();
    board[0] = { ...board[0], narrative: board[0].narrative!.slice(30) };
    const plan = planBoardReconcile(DOMAIN, board);
    expect(plan.to_update).toHaveLength(1);
    expect(plan.to_update[0].changed).toEqual(['narrative']);
    expect(plan.to_update[0].write).toEqual(['narrative']);
    expect(plan.preserved).toHaveLength(0);
  });

  it('does NOT treat a changed position as drift', () => {
    // Position is assigned by enumeration order, so one story added upstream would otherwise mark
    // every row below it as drifted and rewrite the entire board for nothing.
    expect(changedFields(rowFromPlan(planProvision(DOMAIN).stories[3]),
      { ...planProvision(DOMAIN).stories[3], position: 999 })).toEqual([]);
  });

  it('treats acceptance as changed only when the values really differ', () => {
    const s = planProvision(DOMAIN).stories.find((x) => x.acceptance.length > 0)!;
    expect(changedFields(rowFromPlan(s), s)).toEqual([]);
    expect(changedFields({ ...rowFromPlan(s), acceptance: ['something else'] }, s))
      .toEqual(['acceptance']);
    expect(changedFields({ ...rowFromPlan(s), acceptance: null }, s)).toEqual(['acceptance']);
  });
});

// ───────────────────────── 3. safe to run twice ─────────────────────────

describe('running it again writes nothing', () => {
  it('a board that already matches the plan is a no-op', () => {
    const plan = planBoardReconcile(DOMAIN, matchingBoard());
    expect(plan.noop).toBe(true);
    expect([plan.to_delete.length, plan.to_insert.length, plan.to_update.length]).toEqual([0, 0, 0]);
    expect(describePlan(plan)).toContain('already matches');
  });

  it('applying the plan to an empty board, then re-planning, converges to a no-op', () => {
    // The real idempotency question: run 1 inserts everything, run 2 must find nothing to do.
    // This works only because every id is derived from (domain, story_id) rather than generated.
    const first = planBoardReconcile(DOMAIN, []);
    const afterFirstRun = first.to_insert.map(rowFromPlan);
    expect(planBoardReconcile(DOMAIN, afterFirstRun).noop).toBe(true);
  });

  it('POSITIVE CONTROL: a board one row short is NOT a no-op', () => {
    // Proves the convergence test above measures something, rather than passing because the
    // reconciler returns empty plans for everything.
    const short = matchingBoard().slice(1);
    const plan = planBoardReconcile(DOMAIN, short);
    expect(plan.noop).toBe(false);
    expect(plan.to_insert).toHaveLength(1);
  });
});

// ───────────────────── 4. the blast radius, across all ten ─────────────────────

describe('the migration this was written for', () => {
  it('inserts 40 ladder stories across the ten domains and no more', () => {
    let ladder = 0;
    for (const d of AGENT_DOMAIN_KEYS) {
      ladder += planBoardReconcile(d, []).to_insert
        .filter((s) => s.kind === 'capability_ladder').length;
    }
    expect(ladder).toBe(40);
  });

  it('deletes every per-rung behaviour row it is shown, on every domain', () => {
    // Production holds 964 of these across the ten boards, all `not_started`. The count itself is
    // a property of the live data rather than of this module, so what is asserted here is the
    // rule: a `release_behaviour` row is never in the plan any more, so it is always a deletion.
    for (const d of AGENT_DOMAIN_KEYS) {
      const plan = planBoardReconcile(d, [...planProvision(d).stories.map(rowFromPlan),
        strayRow('one.autonomy:R5'), strayRow('two.autonomy:R2')]);
      expect(plan.to_delete).toHaveLength(2);
      expect(plan.refusals).toHaveLength(0);
      expect(plan.to_insert).toHaveLength(0);
    }
  });

  it('every domain plans cleanly from empty, so no domain is silently skipped', () => {
    for (const d of AGENT_DOMAIN_KEYS) {
      const plan = planBoardReconcile(d, []);
      expect(plan.to_insert.length).toBeGreaterThan(0);
      expect(plan.refusals).toHaveLength(0);
      expect(plan.domain_key).toBe(d);
    }
  });
});
