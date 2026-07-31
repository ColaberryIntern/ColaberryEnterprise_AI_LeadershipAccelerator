import { canTransitionAction, assertActionTransition, InvalidActionTransitionError } from '../actionStateMachine';

describe('canTransitionAction — happy paths', () => {
  it.each([
    ['PROPOSED', 'APPROVED'],
    ['PROPOSED', 'REJECTED'],
    ['PROPOSED', 'SKIPPED'],
    ['APPROVED', 'EXECUTING'],
    ['EXECUTING', 'SUCCEEDED'],
    ['EXECUTING', 'FAILED'],
    ['SUCCEEDED', 'VERIFIED'],
    ['FAILED', 'EXECUTING'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionAction(from, to)).toBe(true);
  });
});

describe('canTransitionAction — rejects invalid transitions', () => {
  it.each([
    ['REJECTED', 'APPROVED'],
    ['REJECTED', 'EXECUTING'],
    ['PROPOSED', 'EXECUTING'], // must be approved first
    ['SKIPPED', 'EXECUTING'],
    ['VERIFIED', 'EXECUTING'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransitionAction(from, to)).toBe(false);
    expect(() => assertActionTransition(from, to)).toThrow(InvalidActionTransitionError);
  });

  it('rejects a no-op self-transition', () => {
    expect(canTransitionAction('APPROVED', 'APPROVED')).toBe(false);
  });
});
