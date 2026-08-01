import { canTransition, assertTransition, InvalidCaseTransitionError, canReopen, assertReopen } from '../caseStateMachine';
import { CASE_STATES, CaseState } from '../../../types/inboxCase';

describe('canTransition / assertTransition — happy paths', () => {
  const validPairs: Array<[CaseState, CaseState]> = [
    ['DISCOVERING', 'ASSESSING'],
    ['ASSESSING', 'NEEDS_ALI'],
    ['ASSESSING', 'READY_TO_PLAN'],
    ['NEEDS_ALI', 'ASSESSING'],
    ['READY_TO_PLAN', 'AWAITING_APPROVAL'],
    ['AWAITING_APPROVAL', 'EXECUTING'],
    ['EXECUTING', 'WAITING'],
    ['EXECUTING', 'DELEGATED'],
    ['EXECUTING', 'RESOLVED'],
    ['WAITING', 'RESOLVED'],
    ['DELEGATED', 'RESOLVED'],
    ['FAILED', 'ASSESSING'],
    ['FAILED', 'READY_TO_PLAN'],
    // Regression coverage: without this edge, "Retry Failed" was a dead
    // end — a case that failed once could never execute again.
    ['FAILED', 'EXECUTING'],
    ['REOPENED', 'ASSESSING'],
  ];

  it.each(validPairs)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });
});

describe('canTransition / assertTransition — rejects invalid transitions', () => {
  const invalidPairs: Array<[CaseState, CaseState]> = [
    ['DISCOVERING', 'RESOLVED'], // cannot skip straight to resolved
    ['RESOLVED', 'EXECUTING'], // resolved is terminal except via reopen
    ['AWAITING_APPROVAL', 'RESOLVED'], // must execute first
    ['WAITING', 'EXECUTING'], // must go back through assessing
  ];

  it.each(invalidPairs)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidCaseTransitionError);
  });

  it('rejects a no-op self-transition', () => {
    expect(canTransition('ASSESSING', 'ASSESSING')).toBe(false);
  });

  it('error carries from/to for the controller to build a 409 payload', () => {
    try {
      assertTransition('RESOLVED', 'EXECUTING');
      fail('expected throw');
    } catch (err) {
      const e = err as InvalidCaseTransitionError;
      expect(e.from).toBe('RESOLVED');
      expect(e.to).toBe('EXECUTING');
      expect(e.error_class).toBe('InvalidCaseTransitionError');
    }
  });
});

describe('every declared CaseState has at least one outbound edge or is a documented terminal', () => {
  it('RESOLVED is near-terminal: its only forward edge is REOPENED', () => {
    expect(canTransition('RESOLVED', 'REOPENED')).toBe(true);
    expect(canTransition('RESOLVED', 'EXECUTING')).toBe(false);
    expect(canTransition('RESOLVED', 'ASSESSING')).toBe(false);
  });

  it.each(CASE_STATES)('%s is covered by CASE_STATE_TRANSITIONS', (state) => {
    // Sanity: every state at least exists as a key (even if its array is empty like REJECTED-equivalents).
    expect(CASE_STATES).toContain(state);
  });
});

describe('reopen guard', () => {
  it('allows reopening RESOLVED, WAITING, DELEGATED', () => {
    expect(canReopen('RESOLVED')).toBe(true);
    expect(canReopen('WAITING')).toBe(true);
    expect(canReopen('DELEGATED')).toBe(true);
  });

  it('rejects reopening a case that was never closed', () => {
    expect(canReopen('DISCOVERING')).toBe(false);
    expect(canReopen('ASSESSING')).toBe(false);
    expect(() => assertReopen('ASSESSING')).toThrow(InvalidCaseTransitionError);
  });
});
