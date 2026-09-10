import { PendingApproveConfirmation, PendingRejectConfirmation } from '../models/AgentManagerConversation';
import { ManagerInboxItemView, getManagerInboxItems } from './managerInboxService';
import { approveProposedAction, rejectProposedAction } from './agentApprovalService';

/**
 * managerApprovalDecisionIntentService — Reese Agentic AI Employee mission,
 * Capability 8's APPROVE and REJECT slices of the manager-intent classifier.
 * Fifth and sixth intents to ride the generic `pending_intent_confirmation`
 * column, kept in one file (rather than split like the first four) because
 * they share the one genuinely new piece: resolving WHICH pending
 * `ProposedAgentAction` the manager means, since that never appears in the
 * manager's own message text the way a goal target or a task title does.
 *
 * Reuses managerInboxService.getManagerInboxItems() (the same per-agent
 * pending-proposal lookup the Manager Inbox UI's own approve/reject buttons
 * read) and agentApprovalService.approveProposedAction()/
 * rejectProposedAction() (the same real executor the global admin routes
 * and the Manager Inbox routes both already call) — never a second,
 * drifting read or write path.
 *
 * Deliberately conservative: proceeds only when EXACTLY ONE proposal is
 * pending for this agent. Zero or more-than-one is real, honest ambiguity —
 * resolvePendingApprovalTarget() surfaces which case it is rather than the
 * caller guessing, and the caller sends the manager to the Manager Inbox UI
 * to pick the right one when there's more than one.
 */

const APPROVE_TRIGGER_PHRASES = [
  'approve it', 'approve that', 'approve this', 'approve the proposal',
  'go ahead and approve', 'please approve', 'yes, approve',
];
const REJECT_TRIGGER_PHRASES = [
  'reject it', 'reject that', 'reject this', 'reject the proposal',
  'deny it', 'deny that', 'turn it down', 'please reject',
];

export interface DetectedApprovalDecisionIntent {
  matched: true;
}

export type ResolvedApprovalTarget = ManagerInboxItemView | 'none' | 'ambiguous';

/** Pure, deterministic. Returns null unless a real approve-trigger phrase
 * appears — no guessing at which proposal, that's resolvePendingApprovalTarget()'s job. */
export function detectApproveIntent(messageText: string): DetectedApprovalDecisionIntent | null {
  const lower = messageText.toLowerCase();
  return APPROVE_TRIGGER_PHRASES.some((p) => lower.includes(p)) ? { matched: true } : null;
}

export function detectRejectIntent(messageText: string): DetectedApprovalDecisionIntent | null {
  const lower = messageText.toLowerCase();
  return REJECT_TRIGGER_PHRASES.some((p) => lower.includes(p)) ? { matched: true } : null;
}

/** The one DB read this intent family needs before it can even offer a
 * confirmation card. 'none' and 'ambiguous' are real, honest outcomes — a
 * caller must handle both WITHOUT ever falling back to a guess. */
export async function resolvePendingApprovalTarget(agentId: string): Promise<ResolvedApprovalTarget> {
  const items = await getManagerInboxItems(agentId);
  if (!items || items.length === 0) return 'none';
  if (items.length > 1) return 'ambiguous';
  return items[0];
}

export function buildApproveConfirmationCardText(target: ManagerInboxItemView): string {
  const appliesNote = target.targetTable === 'scheduled_emails' ? ' and apply the change' : '';
  return (
    `I understood: you want to approve the pending proposal — "${target.reason}" (${target.actionType}).\n\n` +
    `Here's what I'd do: mark it approved${appliesNote}.\n\n` +
    `Reply "confirm" to approve it, or tell me if you meant something else.`
  );
}

export function buildRejectConfirmationCardText(target: ManagerInboxItemView): string {
  return (
    `I understood: you want to reject the pending proposal — "${target.reason}" (${target.actionType}).\n\n` +
    `Here's what I'd do: mark it rejected. Nothing changes.\n\n` +
    `Reply "confirm" to reject it, or tell me if you meant something else.`
  );
}

export function toPendingApproveConfirmation(target: ManagerInboxItemView): PendingApproveConfirmation {
  return { intentType: 'APPROVE', proposalId: target.id, reason: target.reason, detectedAt: new Date().toISOString() };
}

export function toPendingRejectConfirmation(target: ManagerInboxItemView): PendingRejectConfirmation {
  return { intentType: 'REJECT', proposalId: target.id, reason: target.reason, detectedAt: new Date().toISOString() };
}

/** Executes a confirmed approval for real. Reuses agentApprovalService.approveProposedAction()
 * wholesale. The proposal may have stopped being pending between the two
 * turns (someone else acted on it via the Manager Inbox UI in the
 * meantime) — that's surfaced honestly, never silently re-approved or
 * silently ignored. */
export async function applyConfirmedApprove(pending: PendingApproveConfirmation, confirmedByEmail: string): Promise<{ summary: string }> {
  const result = await approveProposedAction(pending.proposalId, confirmedByEmail, null);
  if (result.outcome !== 'approved') {
    return { summary: `I couldn't approve that — it's no longer pending (${result.outcome}). Check the Manager Inbox for the latest state.` };
  }
  return { summary: `Done. Approved: "${pending.reason}".${result.applied ? ' The change has been applied.' : ''}` };
}

export async function applyConfirmedReject(pending: PendingRejectConfirmation, confirmedByEmail: string): Promise<{ summary: string }> {
  const result = await rejectProposedAction(pending.proposalId, confirmedByEmail, null);
  if (result.outcome !== 'rejected') {
    return { summary: `I couldn't reject that — it's no longer pending (${result.outcome}). Check the Manager Inbox for the latest state.` };
  }
  return { summary: `Done. Rejected: "${pending.reason}".` };
}
