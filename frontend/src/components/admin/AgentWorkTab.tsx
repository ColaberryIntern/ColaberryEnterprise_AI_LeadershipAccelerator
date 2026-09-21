import React, { useMemo, useState } from 'react';
import { AgentDetail, AgentDetailTicket, AgentDetailTicketStatusBucket } from '../../services/agentDetailApi';
import { SectionCard, StatusBadge } from './shell';
import type { Tone } from './shell/StatusBadge';
import { timeAgo } from './shell/trust';

// Dashboard redesign, Slice 2a (2026-09-19) — the Work half of the former
// combined "Work & Decisions" tab (Decisions now lives on its own tab, see
// AgentWorkDecisionsTab.tsx, unchanged). Reads detail.tickets — already
// loaded with the page, no new fetch. The mockup's own "Waiting on Ali/
// staff/student" 3-way filter has no real backing field anywhere in this
// codebase (checked Ticket.ts, ticketService.ts, TicketActivity.ts,
// ticketOrchestrator.ts) and is deliberately NOT reconstructed here — see
// this run's execution-contract.md "Slice 2a scope" section. These 4
// buckets are honestly derivable from real fields (status/due_date/latest-
// activity-actor), computed server-side by ticketStatusBucket.ts.

interface Props {
  detail: AgentDetail;
}

const BUCKETS: Array<{ key: AgentDetailTicketStatusBucket; label: string; tone: Tone }> = [
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
  { key: 'ready_to_verify', label: 'Ready to verify', tone: 'info' },
  { key: 'needs_reply', label: 'Needs a reply', tone: 'warning' },
  { key: 'open', label: 'Open', tone: 'neutral' },
];

const EMPTY_STATE_LABEL: Record<AgentDetailTicketStatusBucket, string> = {
  overdue: 'No tickets are overdue right now.',
  ready_to_verify: 'No tickets are waiting to be verified right now.',
  needs_reply: 'No tickets are waiting on a reply right now.',
  open: 'No open tickets right now.',
};

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TicketDetail({ ticket }: { ticket: AgentDetailTicket }) {
  return (
    <div className="p-3 border-top small">
      <dl className="row mb-0">
        <dt className="col-sm-3">Description</dt>
        <dd className="col-sm-9">{ticket.description || 'No description recorded.'}</dd>
        <dt className="col-sm-3">Priority</dt>
        <dd className="col-sm-9">{ticket.priority}</dd>
        <dt className="col-sm-3">Type</dt>
        <dd className="col-sm-9">{ticket.type}</dd>
        <dt className="col-sm-3">Created</dt>
        <dd className="col-sm-9">{timeAgo(ticket.created_at)}</dd>
        <dt className="col-sm-3">Last updated</dt>
        <dd className="col-sm-9">{timeAgo(ticket.updated_at)}</dd>
      </dl>
    </div>
  );
}

export default function AgentWorkTab({ detail }: Props) {
  const [activeBucket, setActiveBucket] = useState<AgentDetailTicketStatusBucket>('overdue');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // A closed ticket (status_bucket: null — done/cancelled) fits none of
  // the 4 real action buckets and is excluded from this action-focused
  // view entirely, rather than mislabeled as "open" or any other bucket.
  const actionable = useMemo(() => detail.tickets.filter((t) => t.status_bucket !== null), [detail.tickets]);

  const counts = useMemo(() => {
    const c: Record<AgentDetailTicketStatusBucket, number> = { overdue: 0, ready_to_verify: 0, needs_reply: 0, open: 0 };
    for (const t of actionable) c[t.status_bucket as AgentDetailTicketStatusBucket] += 1;
    return c;
  }, [actionable]);

  const filtered = useMemo(
    () => actionable.filter((t) => t.status_bucket === activeBucket),
    [actionable, activeBucket],
  );

  return (
    <SectionCard
      title="Work"
      icon="list-check-2"
      subtitle="Real tickets this agent owns or was assigned, filtered by what actually needs attention."
      padded={false}
    >
      <div className="d-flex gap-2 flex-wrap p-3 pb-2">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`btn btn-sm ${activeBucket === b.key ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => { setActiveBucket(b.key); setExpandedId(null); }}
          >
            {b.label} <span className="badge bg-light text-dark ms-1">{counts[b.key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-muted small text-center py-4 mb-0">{EMPTY_STATE_LABEL[activeBucket]}</p>
      )}

      {filtered.length > 0 && (
        <ul className="list-unstyled mb-0">
          {filtered.map((t, i) => {
            const bucketMeta = BUCKETS.find((b) => b.key === t.status_bucket)!;
            return (
              <li key={t.id} className={i < filtered.length - 1 ? 'border-bottom' : ''}>
                <button
                  type="button"
                  className="btn w-100 text-start p-3 d-flex align-items-start justify-content-between gap-2 flex-wrap"
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <StatusBadge label={bucketMeta.label} tone={bucketMeta.tone} />
                      {t.ticket_number !== null && <span className="text-muted small">#{t.ticket_number}</span>}
                    </div>
                    <strong>{t.title}</strong>
                  </div>
                  <div className="text-muted small text-end">
                    <div>{t.status}</div>
                    <div>{formatDueDate(t.due_date)}</div>
                  </div>
                </button>
                {expandedId === t.id && <TicketDetail ticket={t} />}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
