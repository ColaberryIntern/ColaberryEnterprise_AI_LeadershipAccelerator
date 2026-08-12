import { ACTION_STATE_TRANSITIONS, ActionStatus } from '../../types/inboxCase';

// Validates InboxCaseAction status transitions, mirroring caseStateMachine.ts
// for the same reason: every status write goes through assertActionTransition()
// so an invalid transition (e.g. approving an already-REJECTED action) is a
// 409 with an audit trail entry, never a silent overwrite.

export class InvalidActionTransitionError extends Error {
  error_class = 'InvalidActionTransitionError';
  constructor(public from: ActionStatus, public to: ActionStatus) {
    super(`Cannot transition action from ${from} to ${to}`);
    this.name = 'InvalidActionTransitionError';
  }
}

export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  if (from === to) return false;
  return ACTION_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertActionTransition(from: ActionStatus, to: ActionStatus): void {
  if (!canTransitionAction(from, to)) {
    throw new InvalidActionTransitionError(from, to);
  }
}
