import React, { useEffect, useState } from 'react';
import { AgentDetailTicket } from '../../../services/agentDetailApi';
import { getTicketStatusLabel, getTicketStatusTone } from '../../../utils/ticketTypeMeta';
import { adv2PillClass } from './adv2PillTone';
import { timeAgo } from '../shell/trust';
import { formatDueDateWithRelative } from './AgentWorkV2CaseList';
import { getTicketSummary, TicketSummary } from '../../../services/ticketSummaryApi';
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
// Agent Detail polish round 2 (2026-09-29) — Ali, live: "I'd like to see
// the stages in a ticket kinda like the screenshot... I need to know when
// the next commitment is so I can see when the ticket will be checked on
// the next time. Every ticket should have that." AgentWorkV2Stepper.tsx
// resolves the tension with the note directly above it (honest, real-status
// version — confirmed via AskUserQuestion, not the mockup's fabricated
// stages).
//
// Agent Detail polish round 4 (2026-09-30) — Ali, live: "when I click on
// Explain this decision, the results doesn't tell me anything beneficial."
// The agent-wide Decision Journal (formerly the destination of this button)
// has no real ticket linkage anywhere in its backing data — AiEvent has no
// ticket_id column, and ProposedAgentAction.target_table is never 'tickets'
// in any real write path (confirmed this round, see execution-contract.md).
// "Explain this decision" now fetches and shows this exact ticket's real
// Outcome/Proof/Human-action summary inline instead — the same real,
// already-proven-in-production endpoint StoryTab.tsx (the ticket board's
// own default detail tab) already uses, reused here rather than duplicated.
// "Discuss with Reese" now pre-fills a real, ticket-specific draft message
// via the new onDraftTalk callback (never auto-sent — confirmed with Ali via
// AskUserQuestion) before switching tabs via the existing onNavigate('talk').
// "Next commitment" now also shows a real relative-time suffix
// (formatDueDateWithRelative), not just the absolute date.

interface Props {
  ticket: AgentDetailTicket;
  onNavigate: (tab: TabKey) => void;
  onDraftTalk: (ticket: AgentDetailTicket) => void;
}

export default function AgentWorkV2CaseDetail({ ticket, onNavigate, onDraftTalk }: Props) {
  const [explainOpen, setExplainOpen] = useState(false);
  const [summaryByTicketId, setSummaryByTicketId] = useState<Record<string, TicketSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // A different case selected — never carry a stale "explain" panel over to
  // a ticket it doesn't belong to.
  useEffect(() => {
    setExplainOpen(false);
    setSummaryError(null);
  }, [ticket.id]);

  const handleToggleExplain = async () => {
    if (explainOpen) {
      setExplainOpen(false);
      return;
    }
    setExplainOpen(true);
    if (summaryByTicketId[ticket.id]) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const summary = await getTicketSummary(ticket.id);
      setSummaryByTicketId((prev) => ({ ...prev, [ticket.id]: summary }));
    } catch {
      setSummaryError('Summary unavailable right now — try reopening this ticket.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const summary = summaryByTicketId[ticket.id];

  return (
    <div className="adv2-card" style={{ padding: 19 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="adv2-eyebrow">
            {ticket.ticket_number !== null ? `Case #${ticket.ticket_number}` : 'Case'}
          </div>
          <h3 style={{ fontSize: 19, margin: '6px 0 0' }}>{ticket.title}</h3>
        </div>
        <span className={`${adv2PillClass(getTicketStatusTone(ticket.status))} adv2-pill-outline`}>{getTicketStatusLabel(ticket.status)}</span>
      </div>

      <AgentWorkV2Stepper status={ticket.status} />

      <p className="adv2-muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
        Next commitment: <strong style={{ color: 'var(--adv2-ink)' }}>{formatDueDateWithRelative(ticket.due_date)}</strong>
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
        <button className="adv2-btn" onClick={handleToggleExplain}>{explainOpen ? 'Hide explanation' : 'Explain this decision'}</button>
        <button className="adv2-btn" onClick={() => { onDraftTalk(ticket); onNavigate('talk'); }}>Discuss with Reese</button>
        <a className="adv2-btn" style={{ textDecoration: 'none' }} href={`/admin/tickets?open=${ticket.id}`} target="_blank" rel="noopener noreferrer">Open ticket ↗</a>
      </div>

      {explainOpen && (
        <div className="adv2-callout" style={{ marginTop: 14 }}>
          {summaryLoading && <p className="adv2-muted" style={{ margin: 0 }}>Loading…</p>}
          {!summaryLoading && summaryError && <p style={{ margin: 0, color: 'var(--adv2-warn)' }}>{summaryError}</p>}
          {!summaryLoading && !summaryError && summary && (
            <dl className="adv2-rows" style={{ margin: 0 }}>
              <dt>Outcome</dt>
              <dd>{summary.outcome}</dd>
              <dt>Proof</dt>
              <dd>{summary.proof}</dd>
              <dt>Human action</dt>
              <dd>{summary.humanAction}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
