import React from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from '../shell/trust';
import { fmtCentralDateTime } from '../../../utils/centralTime';
import { getTicketTypeLabel, getTicketTypeTone, getTicketStatusLabel, getTicketStatusTone } from '../../../utils/ticketTypeMeta';
import { adv2PillClass } from './adv2PillTone';
import type { AgentDetailTicket, AgentDetailTicketTypeBreakdown } from '../../../services/agentDetailApi';

// Agent Detail V2, Ticket activity (2026-09-11) — extracted from
// AgentOverviewV2MainColumn.tsx to stay under this repo's file-size
// guidance once every real field from the deleted AgentTicketActivityTable.tsx
// was restored: the ticket_breakdown summary, the real description ("Why"
// — Ali: "what triggers them... why they triggered"), priority, the
// absolute CST timestamp (Ali: "Format the time everywhere you see it to
// cst"), and a real link to the ticket. The mockup's own "Recent tickets"
// treatment was a much thinner list; "same content" wins over the mockup's
// exact density here — nothing that shipped for an explicit past request
// gets quietly dropped.

interface Props {
  tickets: AgentDetailTicket[];
  ticketBreakdown: AgentDetailTicketTypeBreakdown[];
  openTicketCount: number;
}

export default function AgentOverviewV2Tickets({ tickets, ticketBreakdown, openTicketCount }: Props) {
  return (
    <section className="adv2-card" id="tickets">
      <h2>Ticket activity <span className="adv2-hint">{openTicketCount} open</span></h2>

      {ticketBreakdown.length > 0 && (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--adv2-rule)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ticketBreakdown.map((b) => (
            <span key={b.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className={adv2PillClass(getTicketTypeTone(b.type))}>{getTicketTypeLabel(b.type)}: {b.count}</span>
              {b.by_signal.length > 0 && (
                <span className="adv2-muted" style={{ fontSize: 12.5 }}>
                  ({b.by_signal.map((s) => `${s.signal_type}: ${s.count}`).join(', ')})
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {tickets.length === 0 ? (
        <p className="adv2-muted" style={{ padding: '16px 18px', margin: 0 }}>No ticket activity yet.</p>
      ) : (
        tickets.map((t) => (
          <div key={t.id} style={{ padding: '14px 18px', borderTop: '1px solid var(--adv2-rule)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <Link className="adv2-link" to={`/admin/tickets?open=${t.id}`}>
                {t.ticket_number ? `#${t.ticket_number} ` : ''}{t.title}
              </Link>
              <span style={{ fontSize: 12.5, color: 'var(--adv2-ink-3)' }}>
                {t.updated_at ? fmtCentralDateTime(t.updated_at) : '—'} · {timeAgo(t.updated_at)}
              </span>
            </div>
            <p className="adv2-muted" style={{ fontSize: 13, margin: '4px 0 0' }} data-testid="ticket-why">{t.description || '—'}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={adv2PillClass(getTicketStatusTone(t.status))}>{getTicketStatusLabel(t.status)}</span>
              <span className={adv2PillClass(getTicketTypeTone(t.type))}>{getTicketTypeLabel(t.type)}</span>
              <span className="adv2-muted" style={{ fontSize: 12.5 }}>Priority: {t.priority}</span>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
