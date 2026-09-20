import { ApprovalRequest } from '../../models';
import { initiateDm } from '../reese/reeseInitiateDmService';

// Real-enforcement scoping, Phase 1 (2026-09-20) — the piece that was missing
// entirely before this: nothing anywhere replayed a held action once approved.
// Called from approveApprovalRequest() ONLY (never from
// bulkApproveApprovalRequests(), which already delegates every id through
// that same function — wiring both, as an earlier draft of this plan did,
// would fire the real send TWICE per bulk-approved row; caught by an
// independent plan-audit before any code shipped).
//
// IDEMPOTENCY (the load-bearing part, per CLAUDE.md's own non-negotiable
// rule): a single call site alone doesn't protect against a retried request.
// The conditional update below — `WHERE replayed_at IS NULL` — is what
// actually decides whether a real send fires. A second call against an
// already-replayed row (a retry, a future second call site, a race) is a
// real, provable no-op, not just structurally unlikely.
//
// Only knows how to replay what's real today (reese_autonomous_outreach) —
// an unrecognized action type gets an honest, disclosed non-result, never a
// guess at what to send.

export type ReplayOutcome =
  | 'replayed'
  | 'already_replayed'
  | 'no_prepared_action'
  | 'unrecognized_action_type';

export interface ReplayResult {
  replayed: boolean;
  reason: ReplayOutcome;
}

export async function replayApprovedAction(row: InstanceType<typeof ApprovalRequest>): Promise<ReplayResult> {
  const [claimedCount] = await ApprovalRequest.update(
    { replayed_at: new Date() },
    { where: { id: row.id, replayed_at: null } as any },
  );
  if (claimedCount === 0) {
    return { replayed: false, reason: 'already_replayed' };
  }

  if (row.action !== 'reese_autonomous_outreach') {
    return { replayed: false, reason: 'unrecognized_action_type' };
  }

  const prepared = row.prepared_action as { studentEnrollmentId?: string; content?: string } | null;
  if (!prepared?.studentEnrollmentId || !prepared?.content) {
    return { replayed: false, reason: 'no_prepared_action' };
  }

  await initiateDm(prepared.studentEnrollmentId, prepared.content);
  return { replayed: true, reason: 'replayed' };
}
