import React from 'react';
import { AgentDetailTicket } from '../../../services/agentDetailApi';
import { getTicketStatusLabel, getTicketStatusTone } from '../../../utils/ticketTypeMeta';
import { adv2PillClass } from './adv2PillTone';
import { timeAgo } from '../shell/trust';
import { formatDueDate } from './AgentWorkV2CaseList';
import AgentWorkV2Stepper from './AgentWorkV2Stepper';
import type { TabKey } from './AgentDetailV2Header';

// Agent Detail redesign, Track A1 (2026-09-21) — the right column of Work's
// new list+detail split. Absorbs AgentWorkTab.tsx's own TicketDetail
// content verbatim (description/priority/type/created/updated). The
// mockup's 5-step narrative ladder (Assess/Plan/Handoff/Verify/Complete) is
// explicitly NOT built here — no real backing field exists anywhere for a
// per-case narrative stage (Ticket.ts's real TicketStatus is a kanban
// workflow state, not a narrative one; relabeling one as the other would
// misrepresent it — see this run's own execution-contract.md). The real
// `status` is shown plainly instead, reusing the exact same
// getTicketStatusLabel/Tone AgentOverviewV2Tickets.tsx already uses.
//
// "Explain this decision" links to the Decisions tab rather than a fake
// per-ticket explanation — getAgentExplainability(agentId) has no
// ticket-scoping parameter (confirmed, agentExplainabilityApi.ts:36).
// "Discuss with Reese" reuses the real onNavigate('talk') handler, same as
// the Hero's own CTA button.
//
// Agent Detail polish round 2 (2026-09-29) — Ali, live: "I'd like to see
// the stages in a ticket kinda like the screenshot... I need to know when
// the next commitment is so I can see when the ticket will be checked on
// the next time. Every ticket should have that." AgentWorkV2Stepper.tsx
// resolves the tension with the note directly above it (honest, real-status
// version — confirmed via AskUserQuestion, not the mockup's fabricated
// stages). "Next commitment" reuses the exact same formatDueDate() already
// shown on every list row, not a new date-format convention.

interface Props {
  ticket: AgentDetailTicket;
  onNavigate: (tab: TabKey) => void;
}

export default function AgentWorkV2CaseDetail({ ticket, onNavigate }: Props) {
  return (
    <div className="adv2-card" style={{ padding: 19 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="adv2-eyebrow">
            {ticket.ticket_number !== null ? `Case #${ticket.ticket_number}` : 'Case'}
          </div>
          <h3 style={{ fontSize: 19, margin: '6px 0 0' }}>{ticket.title}</h3>
        </div>
        <span className={adv2PillClass(getTicketStatusTone(ticket.status))}>{getTicketStatusLabel(ticket.status)}</span>
      </div>

      <AgentWorkV2Stepper status={ticket.status} />

      <p className="adv2-muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
        Next commitment: <strong style={{ color: 'var(--adv2-ink)' }}>{formatDueDate(ticket.due_date)}</strong>
      </p>

      <dl className="adv2-rows" style={{ marginTop: 18 }}>
        <dt>Description</dt>
        <dd>{ticket.description || 'No description recorded.'}</dd>
        <dt>Priority</dt>
        <dd>{ticket.priority}</dd>
        <dt>Type</dt>
        <dd>{ticket.type}</dd>
        <dt>Created</dt>
        <dd>{timeAgo(ticket.created_at)}</dd>
        <dt>Last updated</dt>
        <dd>{timeAgo(ticket.updated_at)}</dd>
      </dl>

      <div className="adv2-actions" style={{ marginTop: 18 }}>
        <button className="adv2-btn" onClick={() => onNavigate('decisions')}>Explain this decision</button>
        <button className="adv2-btn" onClick={() => onNavigate('talk')}>Discuss with Reese</button>
      </div>
    </div>
  );
}
