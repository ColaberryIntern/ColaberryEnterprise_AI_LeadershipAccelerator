import { AgentDetail, AgentDetailTicket } from '../services/agentDetailApi';
import { ManagerInboxItem } from '../services/managerInboxApi';

// AI Workforce Management, Checkpoint A (2026-09-01) — Command Center's
// "Attention Required" panel. Every item here is derived from a field the
// detail/inbox payloads already carry, cited in `evidence`, never a
// generated narrative. Goal-at-risk and report-delivery-failure items are
// deliberately NOT included yet — Command Center doesn't fetch AgentGoal or
// AgentReportRun in this checkpoint, and inventing an item from data this
// component never loaded would violate the same "never fabricate" rule this
// whole page is built around. Add those once Checkpoint D wires Goals/Reports
// into this tab.

export type AttentionSeverity = 'high' | 'medium' | 'info' | 'none';

export interface AttentionItem {
  severity: AttentionSeverity;
  title: string;
  body: string;
  evidence: string;
}

const RECENT_OUTCOME_STATUS = 'done';

function deriveShadowModeItem(detail: AgentDetail): AttentionItem | null {
  const { total, enforced_count, block } = detail.authorization_summary;
  if (total === 0) return null;

  if (enforced_count === 0) {
    const blockNote = block > 0
      ? ` ${block} of those had a policy verdict of "would block" and were allowed through anyway.`
      : '';
    return {
      severity: block > 0 ? 'high' : 'info',
      title: 'Authorization is running in shadow mode',
      body: `All ${total} authorization checks in the last ${detail.authorization_summary.window_days} days were evaluated but none were actually enforced.${blockNote}`,
      evidence: `authorization_summary: total=${total}, enforced_count=0, block=${block}`,
    };
  }
  if (enforced_count < total) {
    return {
      severity: 'info',
      title: 'Authorization enforcement is partial',
      body: `${enforced_count} of ${total} authorization checks in the last ${detail.authorization_summary.window_days} days were under real enforcement; the rest were shadow-only.`,
      evidence: `authorization_summary: total=${total}, enforced_count=${enforced_count}`,
    };
  }
  return null;
}

function derivePendingApprovalsItem(items: ManagerInboxItem[]): AttentionItem | null {
  if (items.length === 0) return null;
  return {
    severity: 'medium',
    title: `${items.length} approval${items.length === 1 ? '' : 's'} waiting for review`,
    body: items.length === 1
      ? `"${items[0].reason}" needs a decision.`
      : `${items.length} proposed actions need a decision, oldest first.`,
    evidence: `ProposedAgentAction rows with status='pending' for this agent (via GET /api/admin/agents/:id/inbox)`,
  };
}

function deriveErrorStateItem(detail: AgentDetail): AttentionItem | null {
  if (detail.trust_contract.status !== 'error') return null;
  return {
    severity: 'high',
    title: 'Agent is in an error state',
    body: detail.trust_contract.last_error || 'The last run failed. No error message was recorded.',
    evidence: `trust_contract.status='error'${detail.trust_contract.last_error_at ? `, last_error_at=${detail.trust_contract.last_error_at}` : ''}`,
  };
}

export function deriveAttentionItems(detail: AgentDetail, inboxItems: ManagerInboxItem[]): AttentionItem[] {
  const items = [
    deriveErrorStateItem(detail),
    derivePendingApprovalsItem(inboxItems),
    deriveShadowModeItem(detail),
  ].filter((item): item is AttentionItem => item !== null);

  if (items.length === 0) {
    items.push({
      severity: 'none',
      title: 'No manager action required right now',
      body: 'No pending approvals, no error state, and authorization checks (if any) are fully enforced.',
      evidence: 'Derived from trust_contract.status, the manager inbox, and authorization_summary',
    });
  }
  return items;
}

/** The most recent VERIFIED outcome — a closed ("done") ticket, never just
 * the most recent ticket regardless of status. `null` when this agent has no
 * done ticket in its (capped, most-recent-first) ticket list — an honest
 * absence, not inferred from unrelated activity. */
export function deriveRecentOutcome(detail: AgentDetail): AgentDetailTicket | null {
  return detail.tickets.find((t) => t.status === RECENT_OUTCOME_STATUS) || null;
}
