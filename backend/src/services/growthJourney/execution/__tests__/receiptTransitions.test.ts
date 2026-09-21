const ledger = jest.fn(async (..._a: unknown[]) => ({ recorded: true }));
jest.mock('../../ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => ledger(...a) }));

import { OPEN_EXECUTION_STATUSES, type GrowthJourneyExecutionStatus } from '../../../../models/GrowthJourneyExecution';
import {
  assertTransition,
  canTransition,
  INITIAL_STATUS_BY_MODE,
  RECEIPT_TRANSITIONS,
  ReceiptTransitionError,
  recordReceiptTransition,
  TERMINAL_STATUSES,
} from '../receiptTransitions';

/**
 * T508 — the receipt's state machine, exhaustively: every status the model
 * declares is a node, the open statuses are exactly the non-terminal ones,
 * every terminal status has no exit, and every allowed edge is stated.
 */

const ALL: GrowthJourneyExecutionStatus[] = ['pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress', 'completed', 'blocked', 'failed', 'cancelled', 'expired', 'rejected'];

describe('the state machine', () => {
  it('names every status the model declares, and only those', () => {
    expect(Object.keys(RECEIPT_TRANSITIONS).sort()).toEqual(['none', ...ALL].sort());
    for (const targets of Object.values(RECEIPT_TRANSITIONS)) for (const t of targets) expect(ALL).toContain(t);
  });

  it('the open statuses (the partial unique indexes\' WHERE) are exactly the non-terminal ones', () => {
    expect([...OPEN_EXECUTION_STATUSES].sort()).toEqual(ALL.filter((s) => !TERMINAL_STATUSES.includes(s)).sort());
    for (const s of TERMINAL_STATUSES) expect(RECEIPT_TRANSITIONS[s]).toEqual([]);
  });

  it('a receipt is born pending_review (REVIEW) or approved (LIMITED), and from nothing nowhere else', () => {
    expect(INITIAL_STATUS_BY_MODE).toEqual({ review: 'pending_review', limited: 'approved' });
    expect(RECEIPT_TRANSITIONS.none).toEqual(['pending_review', 'approved']);
    for (const s of ALL) expect(canTransition(null, s)).toBe(s === 'pending_review' || s === 'approved');
  });

  it.each([
    ['pending_review', ['approved', 'rejected', 'expired', 'cancelled']],
    ['approved', ['enrolling', 'expired', 'cancelled']],
    ['enrolling', ['enrolled', 'approved', 'cancelled', 'failed']],
    ['enrolled', ['in_progress', 'completed', 'blocked', 'failed', 'cancelled']],
    ['in_progress', ['completed', 'blocked', 'failed', 'cancelled']],
  ] as Array<[GrowthJourneyExecutionStatus, GrowthJourneyExecutionStatus[]]>)('%s moves only to %j', (from, allowed) => {
    for (const to of ALL) expect([from, to, canTransition(from, to)]).toEqual([from, to, allowed.includes(to)]);
  });

  it('the edges the later tasks rely on are present: approve, claim, return by the reconciler, expire, reject, cancel', () => {
    expect(canTransition('pending_review', 'approved')).toBe(true); // T509
    expect(canTransition('approved', 'enrolling')).toBe(true); // T510's claim
    expect(canTransition('enrolling', 'approved')).toBe(true); // T510's hold, T512's return of an enrolment that never happened
    expect(canTransition('enrolling', 'cancelled')).toBe(true); // T510's re-check: a channel closed since approval
    expect(canTransition('approved', 'expired')).toBe(true); // T512's stale approval
    expect(canTransition('pending_review', 'rejected')).toBe(true); // T509
    expect(canTransition('enrolled', 'cancelled')).toBe(true); // rollback
    // And the ones that must NOT exist: nothing skips the claim, nothing revives a terminal row, nothing un-approves.
    expect(canTransition('approved', 'enrolled')).toBe(false);
    expect(canTransition('completed', 'approved')).toBe(false);
    expect(canTransition('approved', 'pending_review')).toBe(false);
  });

  it('assertTransition throws a named error carrying both ends', () => {
    expect(() => assertTransition(null, 'approved')).not.toThrow();
    let caught: unknown;
    try { assertTransition('completed', 'approved'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ReceiptTransitionError);
    expect(caught).toMatchObject({ name: 'ReceiptTransitionError', from: 'completed', to: 'approved' });
  });
});

describe('the ledger row every transition writes', () => {
  beforeEach(() => ledger.mockClear());

  it('is growth_journey.execution.<to> on the receipt, in the scope, with from/to/reason and only the extra ids handed in', async () => {
    const r = await recordReceiptTransition('ex-1', { tenant_id: 't-col', brand_id: 'b-ent' }, null, 'pending_review', 'rollout', { decision_id: 'd-1', proposal_id: 'pa-1', control_ids: ['ctl-1'] });
    expect(r).toEqual({ recorded: true });
    expect(ledger).toHaveBeenCalledTimes(1);
    expect(ledger).toHaveBeenCalledWith('growth_journey.execution.pending_review', 'growth_journey_execution', 'ex-1', { tenant_id: 't-col', brand_id: 'b-ent' }, { from: null, to: 'pending_review', reason: 'rollout', decision_id: 'd-1', proposal_id: 'pa-1', control_ids: ['ctl-1'] }, undefined);
  });

  it('an actor, when named, is the ledger row\'s actor', async () => {
    await recordReceiptTransition('ex-2', { tenant_id: 't-col', brand_id: 'b-ent' }, 'pending_review', 'approved', 'approved_by_admin', {}, 'admin:au-1');
    expect(ledger.mock.calls[0][0]).toBe('growth_journey.execution.approved');
    expect(ledger.mock.calls[0][5]).toBe('admin:au-1');
  });
});
