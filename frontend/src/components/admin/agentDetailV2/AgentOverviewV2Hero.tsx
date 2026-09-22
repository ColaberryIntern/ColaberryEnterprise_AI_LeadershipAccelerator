import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { timeAgo } from '../shell/trust';
import type { TabKey } from './AgentDetailV2Header';

// Dashboard redesign, Slice 2b (2026-09-19) — the mockup's Overview hero
// sentence. DISCOVER found it buildable with zero new backend fields: reuses
// real employee_facts (Reese-only, same as every other employee_facts
// field).
//
// Honesty constraint (load-bearing, not stylistic): employee_facts.work_state
// is typed with 4 values but the backend only ever computes 2 —
// 'idle'/'working_on_ticket'. 'blocked'/'waiting_on_person' are dead code,
// never assigned anywhere. This component deliberately has no copy branch
// for either — rendering nothing for an unrecognized state is honest;
// inventing "Reese is blocked" language for a state nothing can detect
// would not be.
//
// Agent Detail redesign, Track A1 (2026-09-21) — ported from Bootstrap
// SectionCard into the mockup's own dark gradient `.adv2-hero` two-panel
// shape (sentence + CTA on the left, "next commitment" on the right). The
// 4-tile metrics row that used to live in this file moved to
// AgentOverviewV2Metrics.tsx (same file-per-concern split as every other
// Overview section). The "next commitment" panel has no single real
// backing field (disclosed, execution-contract.md Assumption 1) — built
// as a small, honest, frontend-only derivation: the actionable ticket with
// the soonest real due_date, using its own real title/status_bucket label.
// Omitted entirely when no actionable ticket has a due date, matching the
// hero sentence's own established null-state discipline just above.

const BUCKET_LABEL: Record<string, string> = {
  overdue: 'Overdue', ready_to_verify: 'Ready to verify', needs_reply: 'Needs a reply', open: 'Open',
};

interface Props {
  detail: AgentDetail;
  onNavigate: (tab: TabKey) => void;
}

function heroSentence(facts: NonNullable<AgentDetail['employee_facts']>, agentName: string): string | null {
  let base: string;
  if (facts.work_state === 'idle') {
    base = `${agentName} is currently idle.`;
  } else if (facts.work_state === 'working_on_ticket') {
    base = facts.work_state_detail
      ? `${agentName} is currently working on tickets, with ${facts.work_state_detail}.`
      : `${agentName} is currently working on tickets.`;
  } else {
    // 'blocked' / 'waiting_on_person' — typed but never computed today.
    // No fabricated copy for a state this codebase cannot actually detect.
    return null;
  }
  if (facts.last_meaningful_action) {
    base += ` Last real action: ${facts.last_meaningful_action.description}, ${timeAgo(facts.last_meaningful_action.at)}.`;
  }
  return base;
}

/** The soonest-due actionable ticket, or null if none has a real due date. */
function nextCommitment(detail: AgentDetail) {
  const withDueDate = detail.tickets.filter((t) => t.status_bucket !== null && t.due_date);
  if (withDueDate.length === 0) return null;
  return withDueDate.reduce((soonest, t) => (new Date(t.due_date!) < new Date(soonest.due_date!) ? t : soonest));
}

export default function AgentOverviewV2Hero({ detail, onNavigate }: Props) {
  const agentName = detail.identity?.display_name || detail.agent.agent_name;
  const sentence = detail.employee_facts ? heroSentence(detail.employee_facts, agentName) : null;
  const commitment = nextCommitment(detail);

  return (
    <div className="adv2-hero">
      <div>
        <div className="adv2-eyebrow">Your employee's briefing</div>
        {sentence && <h2>{sentence}</h2>}
        <button className="adv2-btn" onClick={() => onNavigate('talk')}>Ask me about today's work →</button>
      </div>
      {commitment && (
        <div className="adv2-hero-next">
          <div className="adv2-eyebrow">My next commitment</div>
          <strong>{commitment.title}</strong>
          <span>
            {commitment.due_date && new Date(commitment.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' · '}
            {BUCKET_LABEL[commitment.status_bucket ?? ''] ?? commitment.status_bucket}
          </span>
          <div style={{ marginTop: 16 }}>
            <button className="adv2-btn" style={{ fontSize: 12.5, padding: '3px 10px' }} onClick={() => onNavigate('work')}>
              Inspect the case →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
