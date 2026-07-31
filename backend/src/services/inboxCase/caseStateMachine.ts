import { CASE_STATE_TRANSITIONS, CaseState } from '../../types/inboxCase';

// Validates InboxCase state transitions against the table in types/inboxCase.ts.
// Every transition in this codebase MUST go through canTransition()/assertTransition()
// rather than writing `case.state = x` directly, so an invalid transition is
// always caught as a 409 with an audit event, never a silent state corruption.

export class InvalidCaseTransitionError extends Error {
  error_class = 'InvalidCaseTransitionError';
  constructor(public from: CaseState, public to: CaseState) {
    super(`Cannot transition case from ${from} to ${to}`);
    this.name = 'InvalidCaseTransitionError';
  }
}

export function canTransition(from: CaseState, to: CaseState): boolean {
  if (from === to) return false;
  return CASE_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: CaseState, to: CaseState): void {
  if (!canTransition(from, to)) {
    throw new InvalidCaseTransitionError(from, to);
  }
}

// Reopen is a special-cased transition: any terminal-ish state (RESOLVED,
// WAITING, DELEGATED) can be reopened, but reopen must always land in
// ASSESSING (never skip straight to READY_TO_PLAN) since new activity means
// the prior assessment is stale by definition.
const REOPENABLE_STATES: CaseState[] = ['RESOLVED', 'WAITING', 'DELEGATED'];

export function canReopen(from: CaseState): boolean {
  return REOPENABLE_STATES.includes(from);
}

export function assertReopen(from: CaseState): void {
  if (!canReopen(from)) {
    throw new InvalidCaseTransitionError(from, 'REOPENED');
  }
}
