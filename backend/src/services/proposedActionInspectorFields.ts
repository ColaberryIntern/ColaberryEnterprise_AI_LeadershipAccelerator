// Dashboard redesign, Slice 2c (2026-09-20) — the mockup's 4-panel decision
// inspector, built honestly. Only 4 real ProposedAgentAction action_types
// and 2 real target_tables exist in production today (confirmed by
// grepping every real createProposal() call site) — these 3 functions
// classify exactly those, with an explicit, honest fallback for anything
// not yet real rather than a fabricated guess.
//
// Reversibility is the one field that needed real DB grounding, not just a
// static lookup: ScheduledEmail.status has 6 real values (`pending`,
// `processing`, `sent`, `failed`, `cancelled`, `paused` —
// ScheduledEmail.ts's own column comment), and a paused email is still
// genuinely unsent (`paused` only ever transitions FROM `pending`, per
// campaignService.ts's pauseCampaign()). Labeling it "already sent" would
// have been a fabricated claim about a routine admin action (plan-audit
// cycle 1 caught exactly this). This module stays pure — the live
// ScheduledEmail read that produces `targetStatus` happens in
// managerInboxService.ts, not here.

export function describeBlastRadius(targetTable: string): string {
  if (targetTable === 'scheduled_emails') return '1 recipient';
  if (targetTable === 'proposed_agent_actions') {
    return 'No downstream effect (nothing executes automatically on approval)';
  }
  return 'Not known for this proposal type';
}

export function describeReversibility(targetTable: string, targetStatus: string | null): string {
  if (targetTable === 'scheduled_emails') {
    if (targetStatus === null) return 'Not known for this proposal type';
    if (targetStatus === 'pending' || targetStatus === 'paused') {
      return 'Reversible — this email has not sent yet';
    }
    if (targetStatus === 'processing') {
      return 'Not reversible — this email is actively being sent right now';
    }
    // 'sent' | 'failed' | 'cancelled', or any future value not enumerated
    // above — the honest default is "already decided," never "reversible."
    return "Not reversible — this email's outcome is already decided (sent, failed to send, or cancelled)";
  }
  if (targetTable === 'proposed_agent_actions') {
    return "N/A — nothing to reverse; approving only changes this proposal's own status.";
  }
  return 'Not known for this proposal type';
}

function fieldOrFallback(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '(not recorded)';
}

export function describeExpectedResult(
  actionType: string,
  proposedChanges: Record<string, any>,
  beforeState: Record<string, any>,
): string {
  if (actionType === 'subject_rewrite') {
    return `Subject changes from '${fieldOrFallback(beforeState?.subject)}' to '${fieldOrFallback(proposedChanges?.subject)}'.`;
  }
  if (actionType === 'body_rewrite') {
    return `Body changes from '${fieldOrFallback(beforeState?.body)}' to '${fieldOrFallback(proposedChanges?.body)}'.`;
  }
  if (actionType === 'propose_instruction_enhancement') {
    return `Proposed instruction: '${fieldOrFallback(proposedChanges?.ai_instructions)}'.`;
  }
  if (actionType === 'propose_content_idea') {
    return `Proposed content idea: '${fieldOrFallback(proposedChanges?.content_idea)}'.`;
  }
  return 'No structured summary available for this proposal type.';
}
