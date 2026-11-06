/**
 * agentState — PURE mapping from the live review-run state + open-need count to the agent panel's header label (T16).
 * No React, no I/O — table-testable (the plan's "state mapping from run status").
 */
export type AgentHeaderState = 'Building' | 'Judging' | 'Revising' | 'Reading ZIP' | 'Waiting on you' | 'Idle';

/**
 * While a cycle is RUNNING the header shows its phase (read from the run's last message): outlining/drafting →
 * Building, judging → Judging, revising → Revising, reading the ZIP → Reading ZIP. With no running cycle, an open
 * need (or a blocked run) means the agent is Waiting on you; otherwise Idle.
 */
export function agentHeaderState(input: { runStatus?: string | null; lastMessage?: string | null; needsCount?: number }): AgentHeaderState {
  const status = String(input?.runStatus || '');
  const msg = String(input?.lastMessage || '').toLowerCase();
  if (status === 'running') {
    if (/revis/.test(msg)) return 'Revising';
    if (/judg|passed the checks|scoring/.test(msg)) return 'Judging';
    if (/\bzip\b|reading/.test(msg)) return 'Reading ZIP';
    if (/outlin|drafting|building/.test(msg)) return 'Building';
    return 'Building';
  }
  if (status === 'blocked' || (input?.needsCount ?? 0) > 0) return 'Waiting on you';
  return 'Idle';
}
