import React, { useMemo, useState } from 'react';
import { AgentDetail, AgentDetailTicketStatusBucket } from '../../../services/agentDetailApi';
import type { Tone } from '../shell/StatusBadge';
import AgentWorkV2CaseList from './AgentWorkV2CaseList';
import AgentWorkV2CaseDetail from './AgentWorkV2CaseDetail';
import type { TabKey } from './AgentDetailV2Header';

// Agent Detail redesign, Track A1 (2026-09-21) — replaces AgentWorkTab.tsx's
// flat expand-in-place list with a real list+detail split, matching the
// mockup's own `.worklayout` shape. Keeps the SAME 4 real buckets
// (overdue/ready_to_verify/needs_reply/open, computed server-side by
// ticketStatusBucket.ts) — NOT the mockup's fictional "waiting on
// Ali/staff/student" 3-way split, which has no real backing anywhere in
// this codebase (Ticket.ts/ticketService.ts/TicketActivity.ts/
// ticketOrchestrator.ts all checked, confirmed empty — see this run's own
// execution-contract.md). No 5-step narrative ladder either, for the same
// reason — the real ticket `status` is shown plainly instead
// (AgentWorkV2CaseDetail.tsx).

interface Props {
  detail: AgentDetail;
  onNavigate: (tab: TabKey) => void;
}

export const BUCKETS: Array<{ key: AgentDetailTicketStatusBucket; label: string; tone: Tone }> = [
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
  { key: 'ready_to_verify', label: 'Ready to verify', tone: 'info' },
  { key: 'needs_reply', label: 'Needs a reply', tone: 'warning' },
  { key: 'open', label: 'Open', tone: 'neutral' },
];

export const EMPTY_STATE_LABEL: Record<AgentDetailTicketStatusBucket, string> = {
  overdue: 'No tickets are overdue right now.',
  ready_to_verify: 'No tickets are waiting to be verified right now.',
  needs_reply: 'No tickets are waiting on a reply right now.',
  open: 'No open tickets right now.',
};

export default function AgentWorkV2({ detail, onNavigate }: Props) {
  const [activeBucket, setActiveBucket] = useState<AgentDetailTicketStatusBucket>('overdue');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A closed ticket (status_bucket: null — done/cancelled) fits none of
  // the 4 real action buckets and is excluded from this action-focused
  // view entirely, rather than mislabeled as "open" or any other bucket —
  // same real derivation AgentWorkTab.tsx already established.
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

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="adv2-card">
      <h2>
        Work
        <span className="adv2-hint">Real tickets this agent owns or was assigned, filtered by what actually needs attention.</span>
      </h2>
      <div style={{ padding: '13px 19px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            className={`adv2-btn${activeBucket === b.key ? ' adv2-active' : ''}`}
            style={activeBucket === b.key ? { background: 'var(--adv2-ink)', color: '#fff', borderColor: 'var(--adv2-ink)' } : undefined}
            onClick={() => { setActiveBucket(b.key); setSelectedId(null); }}
          >
            {b.label} · {counts[b.key]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="adv2-muted" style={{ textAlign: 'center', padding: '32px 0' }}>{EMPTY_STATE_LABEL[activeBucket]}</p>
      ) : (
        <div className="adv2-worklayout" style={{ padding: 19 }}>
          <AgentWorkV2CaseList tickets={filtered} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          {selected && <AgentWorkV2CaseDetail ticket={selected} onNavigate={onNavigate} />}
        </div>
      )}
    </div>
  );
}
