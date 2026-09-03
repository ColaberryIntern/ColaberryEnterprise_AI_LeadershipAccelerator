import { AgentDetail } from '../services/agentDetailApi';

// AI Workforce Management, Checkpoint A (2026-09-01) — the 8-state
// operational vocabulary from the Command Center redesign, derived ENTIRELY
// from fields the detail payload already carries. No new backend field, no
// fabricated "currently executing" signal.
//
// "Working" is deliberately narrow: it only fires from two real signals —
// AiAgent.status === 'running' (the raw cron/job-runner state), or
// live_status === 'online' (a real <=90s presence heartbeat, which only
// resolves for the subset of agents with a linked AdminUser -> Enrollment ->
// CommunityMember chain — see agentDetailService.ts). There is no field in
// this codebase today proving "an LLM call is in flight right now" for an
// event-driven agent outside that presence chain, so this function never
// claims Working from anything weaker than those two signals — an agent
// without them correctly falls through to Idle/Unknown instead.

export type OperationalState =
  | 'working'
  | 'waiting'
  | 'needs_approval'
  | 'blocked'
  | 'idle'
  | 'paused'
  | 'offline'
  | 'unknown';

export interface OperationalStateResult {
  state: OperationalState;
  label: string;
  /** Which real field(s) this call was decided from — surfaced in the UI so
   * "why does it say Idle" is always answerable, never a black box. */
  reason: string;
}

const LABEL: Record<OperationalState, string> = {
  working: 'Working',
  waiting: 'Waiting',
  needs_approval: 'Needs Approval',
  blocked: 'Blocked',
  idle: 'Idle',
  paused: 'Paused',
  offline: 'Offline',
  unknown: 'Unknown',
};

const IDLE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — see agentAttentionRequired.ts for the same window used elsewhere

export function deriveOperationalState(
  detail: Pick<AgentDetail, 'agent' | 'live_status' | 'trust_contract'>,
  pendingApprovalCount: number,
  now: number = Date.now(),
): OperationalStateResult {
  const { agent, live_status, trust_contract } = detail;

  if (!agent.enabled) {
    return { state: 'paused', label: LABEL.paused, reason: 'agent.enabled is false' };
  }
  if (trust_contract.status === 'error') {
    return { state: 'blocked', label: LABEL.blocked, reason: 'trust_contract.status is "error"' };
  }
  if (pendingApprovalCount > 0) {
    return {
      state: 'needs_approval',
      label: LABEL.needs_approval,
      reason: `${pendingApprovalCount} item${pendingApprovalCount === 1 ? '' : 's'} pending in the manager inbox`,
    };
  }
  if (trust_contract.status === 'running') {
    return { state: 'working', label: LABEL.working, reason: 'trust_contract.status is "running"' };
  }
  if (live_status === 'online') {
    return { state: 'working', label: LABEL.working, reason: 'live_status is "online" (real-time presence)' };
  }
  if (live_status === 'away') {
    return { state: 'waiting', label: LABEL.waiting, reason: 'live_status is "away"' };
  }
  if (live_status === 'offline') {
    return { state: 'offline', label: LABEL.offline, reason: 'live_status is "offline"' };
  }

  // live_status is 'unknown' from here on (no presence chain) — fall back to
  // real ticket-touch recency rather than guessing.
  const lastActivity = trust_contract.last_activity_at ? new Date(trust_contract.last_activity_at).getTime() : null;
  if (lastActivity !== null && !Number.isNaN(lastActivity) && now - lastActivity <= IDLE_WINDOW_MS) {
    return { state: 'idle', label: LABEL.idle, reason: 'ticket activity within the last 24h, no presence chain' };
  }
  return { state: 'unknown', label: LABEL.unknown, reason: 'no presence chain and no recent ticket activity to derive a state from' };
}
