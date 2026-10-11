import { ApprovalRequest } from '../../models';
import { initiateDm } from '../reese/reeseInitiateDmService';
import { classifyError } from '../../utils/errorClassifier';

// Real-enforcement scoping, Phase 1 (2026-09-20) — the piece that was missing
// entirely before this: nothing anywhere replayed a held action once approved.
// Called from approveApprovalRequest() ONLY (never from
// bulkApproveApprovalRequests(), which already delegates every id through
// that same function — wiring both, as an earlier draft of this plan did,
// would fire the real send TWICE per bulk-approved row; caught by an
// independent plan-audit before any code shipped).
//
// ── 2026-10-07: THE CLAIM NOW COMES AFTER THE PERFORMABILITY CHECK ──────────
//
// The original order was: claim the row (stamp replayed_at), THEN decide
// whether the action was one this service knows how to perform. Because the
// claim predicate is `WHERE replayed_at IS NULL`, a row that then fell through
// to the unrecognized-action branch was claimed PERMANENTLY and could never be
// retried — recorded as replayed, having done nothing at all.
//
// That is not hypothetical. Measured in production on 2026-10-06/07: 106
// approval_requests rows, every one stamped replayed_at, every one carrying a
// fully prepared payload, and ZERO of them of the one action type this service
// can perform. All five present types (reese_ticket_followup,
// reese_outreach_followup, reese_outreach_escalated, reese_welcome_student,
// reese_welcome_account) took the dropped branch. reese_welcomes honestly
// records those as outcome 'held'; approval_requests claimed they were done.
//
// HOW THE CONCURRENCY PROTECTION SURVIVED THE REORDER. The thing that stops
// two workers double-performing one row is the atomic compare-and-set below —
// a single conditional UPDATE whose `WHERE replayed_at IS NULL` is evaluated
// by Postgres under row lock, so exactly one caller can ever see
// claimedCount === 1. The reorder did NOT replace that with a read-then-write
// race, because what moved ahead of it reads nothing from the database: both
// checks are pure functions of the in-memory `row` already in hand (its
// `action` string and its `prepared_action` payload). They cannot interleave
// with another worker in any way that changes the outcome, and they perform no
// write, so a loser of the race still leaves no trace. The compare-and-set is
// still the sole arbiter of who performs, and it is still the last thing that
// happens before the irreversible send.
//
// The invariant this buys: `replayed_at` is set if and only if this service
// was about to actually perform the action. An action it cannot perform leaves
// the column NULL, so the row stays visible as outstanding work instead of
// being filed as done. auditApprovalReplayDrift.ts reports the rows the old
// order already mis-filed.
//
// Only knows how to replay what's real today (reese_autonomous_outreach) — an
// unrecognized action type gets an honest, disclosed non-result, never a guess
// at what to send. Deliberately NOT a place to add handlers for the five types
// above: every one of those rows was approved by `system:auto_approve_timeout`
// with no human in the loop, so teaching this service to perform them would
// convert a silent hold into a silent send.

export type ReplayOutcome =
  | 'replayed'
  | 'already_replayed'
  | 'no_prepared_action'
  | 'unrecognized_action_type';

export interface ReplayResult {
  replayed: boolean;
  reason: ReplayOutcome;
}

/**
 * The single source of truth for what this service can actually perform.
 * Exported so auditApprovalReplayDrift.ts asks the service what is replayable
 * instead of keeping a second copy of the list that can drift out of step with
 * the code that does the work.
 */
export const REPLAYABLE_ACTIONS = ['reese_autonomous_outreach'] as const;
export type ReplayableAction = (typeof REPLAYABLE_ACTIONS)[number];

export function canReplayAction(action: string): action is ReplayableAction {
  return (REPLAYABLE_ACTIONS as readonly string[]).includes(action);
}

/** The two ways a row can be unperformable before any claim is attempted. */
type UnperformableReason = 'unrecognized_action_type' | 'no_prepared_action';

/**
 * There is no thrown exception in the dropped-row path, but CLAUDE.md's
 * Observability Framework requires a stable `error_class` on anything logged as
 * a failure. Rather than hard-coding a string next to the log line — which lets
 * a second call site invent a different word for the same defect — the defect is
 * materialised as a real Error and handed to classifyError(), the repo's single
 * chokepoint for that vocabulary. `name` carries the canonical ErrorClass member
 * because classifyError() falls back to the error's own name for shapes it has
 * no rule for; a bare `new Error()` would classify as 'Error', which
 * errorClassifier.ts documents as unacceptable.
 *
 * (agentRegistrySeed.ts:3365 faced the same "no exception to classify" problem
 * and chose the opposite route, a hard-coded ErrorClass constant. Both are
 * honest; this one is preferred here because this module hands the class to a
 * logger shared by two branches, and the chokepoint keeps them consistent.)
 */
const REASON_ERROR_NAME: Record<UnperformableReason, string> = {
  // The row's `action` is outside the set this module declares it can perform.
  unrecognized_action_type: 'ContractViolation',
  // The action is known, but its prepared payload cannot be sent as-is.
  no_prepared_action: 'ValidationError',
};

export class UnperformableApprovalRowError extends Error {
  constructor(reason: UnperformableReason, action: string, id: string) {
    super(`approval_requests row ${id}: action "${action}" cannot be replayed (${reason})`);
    this.name = REASON_ERROR_NAME[reason];
  }
}

/**
 * Fail loudly, but never by throwing. A quiet `unrecognized_action_type` return
 * is exactly how 106 rows went unnoticed, so the drop now emits a structured
 * error line naming the action and the row id.
 *
 * It does NOT throw. sweepExpiredApprovalRequests() walks many rows in one
 * pass and one unhandled type must not stop the sweep. approveApprovalRequest()
 * does happen to wrap this call in a try/catch, but relying on that would make
 * this module's resilience a property of a caller's implementation detail
 * rather than of its own contract — a third call site without that catch would
 * silently reintroduce the stall. Returning a non-replayed ReplayResult is the
 * contract; the caller already logs it, and this line makes the drop
 * discoverable even if a future caller does not.
 *
 * The one thing still allowed to throw is initiateDm() itself, deliberately
 * unchanged: a real send that failed must be loud, and the row stays claimed so
 * a retry can never double-send a student.
 */
function logUnperformableRow(
  row: InstanceType<typeof ApprovalRequest>,
  reason: UnperformableReason,
): void {
  const defect = new UnperformableApprovalRowError(reason, row.action, row.id);
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'approvalRequestReplayService',
      event: 'replay_action_unperformable',
      outcome: 'failure',
      error_class: classifyError(defect),
      approval_request_id: row.id,
      action: row.action,
      agent_name: row.agent_name,
      reason,
      replayable_actions: REPLAYABLE_ACTIONS,
      // Says out loud what the old order got wrong, so the line is readable
      // without the git history: the row is NOT claimed and NOT done.
      message: `${defect.message} — replayed_at left NULL, row remains outstanding work`,
    }),
  );
}

export async function replayApprovedAction(row: InstanceType<typeof ApprovalRequest>): Promise<ReplayResult> {
  // ── 1. Performability. Pure reads of the row already in hand: no I/O, no
  // write, nothing claimed. A row this service cannot perform must leave
  // replayed_at NULL so it stays visible as outstanding work.
  if (!canReplayAction(row.action)) {
    logUnperformableRow(row, 'unrecognized_action_type');
    return { replayed: false, reason: 'unrecognized_action_type' };
  }

  const prepared = row.prepared_action as { studentEnrollmentId?: string; content?: string } | null;
  if (!prepared?.studentEnrollmentId || !prepared?.content) {
    logUnperformableRow(row, 'no_prepared_action');
    return { replayed: false, reason: 'no_prepared_action' };
  }

  // ── 2. The claim. Atomic compare-and-set, still the ONLY arbiter of who
  // performs this row, and still the last thing before the send.
  const [claimedCount] = await ApprovalRequest.update(
    { replayed_at: new Date() },
    { where: { id: row.id, replayed_at: null } as any },
  );
  if (claimedCount === 0) {
    return { replayed: false, reason: 'already_replayed' };
  }

  // ── 3. The irreversible side effect, only after winning the claim.
  await initiateDm(prepared.studentEnrollmentId, prepared.content);
  return { replayed: true, reason: 'replayed' };
}
