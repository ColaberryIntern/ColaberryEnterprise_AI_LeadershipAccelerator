import React from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, StatusBadge } from './shell';
import { timeAgo } from './shell/trust';
import { fmtCentralDateTime } from '../../utils/centralTime';
import { getTicketTypeLabel, getTicketTypeTone, getTicketStatusLabel, getTicketStatusTone } from '../../utils/ticketTypeMeta';
import type { AgentDetailTicket, AgentDetailTicketTypeBreakdown } from '../../services/agentDetailApi';

// Extracted from AgentDetailPage.tsx (2026-08-26) to keep that page under
// CLAUDE.md's 500-line hard ceiling. Extended, not just moved: a "Why"
// column and a ticket-breakdown summary — Ali, live: "what triggers them,
// what they are looking for, why they triggered... which task is creating
// the most tickets." Both are grounded in real, already-written data
// (ticket.description, ticket.type, metadata.signal_type) — never a
// fabricated "reason" field.

interface AgentTicketActivityTableProps {
  tickets: AgentDetailTicket[];
  ticketBreakdown: AgentDetailTicketTypeBreakdown[];
}

export default function AgentTicketActivityTable({ tickets, ticketBreakdown }: AgentTicketActivityTableProps) {
  return (
    <SectionCard title="Ticket activity" icon="ticket-2-line" subtitle="Every ProofDesk ticket assigned to this agent — real, linked, followable to closure." padded={false}>
      {ticketBreakdown.length > 0 && (
        <div className="d-flex flex-wrap gap-2 px-3 pt-3">
          {ticketBreakdown.map((b) => (
            <span key={b.type} className="d-inline-flex align-items-center gap-1">
              <StatusBadge label={`${getTicketTypeLabel(b.type)}: ${b.count}`} tone={getTicketTypeTone(b.type)} />
              {b.by_signal.length > 0 && (
                <span className="text-muted small">
                  ({b.by_signal.map((s) => `${s.signal_type}: ${s.count}`).join(', ')})
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="table-responsive">
        <table className="table table-hover mb-0">
          <thead className="table-light">
            <tr>
              <th>Ticket</th>
              <th>Why</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Type</th>
              <th>Updated</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted text-center py-3">No ticket activity yet.</td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/admin/tickets?open=${t.id}`}>
                      {t.ticket_number ? `#${t.ticket_number}` : ''} {t.title}
                    </Link>
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    {t.description ? (
                      <span
                        className="text-muted small d-inline-block text-truncate"
                        style={{ maxWidth: 280, verticalAlign: 'bottom' }}
                        title={t.description}
                      >
                        {t.description}
                      </span>
                    ) : (
                      <span className="text-muted small">—</span>
                    )}
                  </td>
                  <td><StatusBadge label={getTicketStatusLabel(t.status)} tone={getTicketStatusTone(t.status)} /></td>
                  <td>{t.priority}</td>
                  <td><StatusBadge label={getTicketTypeLabel(t.type)} tone={getTicketTypeTone(t.type)} /></td>
                  <td>{t.updated_at ? fmtCentralDateTime(t.updated_at) : '—'}</td>
                  <td>{timeAgo(t.updated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
