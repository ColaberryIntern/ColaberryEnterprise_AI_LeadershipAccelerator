import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { SectionCard, StatCard } from '../shell';
import { timeAgo } from '../shell/trust';
import type { TabKey } from './AgentDetailV2Header';

// Dashboard redesign, Slice 2b (2026-09-19) — the mockup's Overview hero +
// 4-tile KPI shape. DISCOVER found both buildable with zero new backend
// fields: the hero sentence reuses real employee_facts (Reese-only, same
// as every other employee_facts field), the 4 tiles reuse real
// ticket_breakdown/open_ticket_count/status_bucket already on AgentDetail.
//
// Honesty constraint (load-bearing, not stylistic): employee_facts.work_state
// is typed with 4 values but the backend only ever computes 2 —
// 'idle'/'working_on_ticket'. 'blocked'/'waiting_on_person' are dead code,
// never assigned anywhere. This component deliberately has no copy branch
// for either — rendering nothing for an unrecognized state is honest;
// inventing "Reese is blocked" language for a state nothing can detect
// would not be.

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

export default function AgentOverviewV2Hero({ detail, onNavigate }: Props) {
  const agentName = detail.identity?.display_name || detail.agent.agent_name;
  const sentence = detail.employee_facts ? heroSentence(detail.employee_facts, agentName) : null;

  // "Total tickets" is a lifetime count (ticket_breakdown, unlimited, includes
  // closed tickets) — a deliberately different semantic from the 3
  // status-filtered tiles beside it, labeled explicitly so it doesn't read
  // as a 4th filtered bucket.
  const totalTickets = detail.ticket_breakdown.reduce((sum, t) => sum + t.count, 0);
  const overdueCount = detail.tickets.filter((t) => t.status_bucket === 'overdue').length;
  const needsReplyCount = detail.tickets.filter((t) => t.status_bucket === 'needs_reply').length;

  return (
    <div className="adv2-wrap" style={{ marginBottom: 20 }}>
      {sentence && (
        <SectionCard>
          <p className="mb-0">{sentence}</p>
        </SectionCard>
      )}
      <div className="row g-3" style={{ marginTop: sentence ? 4 : 0 }}>
        <div className="col-md-3">
          <StatCard label="Total tickets (lifetime)" value={totalTickets} icon="ticket-2-line" tone="neutral" onClick={() => onNavigate('work')} />
        </div>
        <div className="col-md-3">
          <StatCard label="Open" value={detail.open_ticket_count} icon="folder-open-line" tone="info" onClick={() => onNavigate('work')} />
        </div>
        <div className="col-md-3">
          <StatCard label="Overdue" value={overdueCount} icon="alarm-warning-line" tone={overdueCount > 0 ? 'danger' : 'neutral'} onClick={() => onNavigate('work')} />
        </div>
        <div className="col-md-3">
          <StatCard label="Needs a reply" value={needsReplyCount} icon="chat-check-line" tone={needsReplyCount > 0 ? 'warning' : 'neutral'} onClick={() => onNavigate('work')} />
        </div>
      </div>
    </div>
  );
}
