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
  isUntouched,
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
    const board = matchingBoard();
    board[0] = { ...board[0], narrative: 'the old title-only body' };
    const plan = planBoardReconcile(DOMAIN, board);
    expect(plan.to_update).toHaveLength(1);
    expect(plan.to_update[0].changed).toEqual(['narrative']);
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
