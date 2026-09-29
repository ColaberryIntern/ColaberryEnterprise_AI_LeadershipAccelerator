import React, { useMemo, useState, useEffect } from 'react';
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
//
// Track C (2026-09-28) — defaulting to 'overdue' meant Work read as empty
// on first load for most agents most of the time (no "All" option existed).
// WorkBucketKey is a LOCAL type, layered on top of the real backend contract
// type AgentDetailTicketStatusBucket — 'all' is a frontend-only pseudo-
// bucket aggregating the 4 real ones; it is never a real per-ticket
// status_bucket value, so the exported contract type itself is never
// widened to include it.

interface Props {
  detail: AgentDetail;
  onNavigate: (tab: TabKey) => void;
}

type WorkBucketKey = AgentDetailTicketStatusBucket | 'all';

export const BUCKETS: Array<{ key: WorkBucketKey; label: string; tone: Tone }> = [
  { key: 'all', label: 'All', tone: 'neutral' },
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
  { key: 'ready_to_verify', label: 'Ready to verify', tone: 'info' },
  { key: 'needs_reply', label: 'Needs a reply', tone: 'warning' },
  { key: 'open', label: 'Open', tone: 'neutral' },
];

export const EMPTY_STATE_LABEL: Record<WorkBucketKey, string> = {
  all: 'No open cases right now.',
  overdue: 'No tickets are overdue right now.',
  ready_to_verify: 'No tickets are waiting to be verified right now.',
  needs_reply: 'No tickets are waiting on a reply right now.',
  open: 'No open tickets right now.',
};

const PAGE_SIZE = 10;

export default function AgentWorkV2({ detail, onNavigate }: Props) {
  const [activeBucket, setActiveBucket] = useState<WorkBucketKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Agent Detail polish round 2 (2026-09-29) — Ali, live: "for the tickets,
  // only show the 1st 10 and allow the user to click to see older
  // tickets." Resets to the default page size whenever the active bucket
  // changes — a filter switch shouldn't silently carry over a stale
  // "show more" state from a different bucket's own ticket count.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeBucket]);

  // A closed ticket (status_bucket: null — done/cancelled) fits none of
  // the 4 real action buckets and is excluded from this action-focused
  // view entirely, rather than mislabeled as "open" or any other bucket —
  // same real derivation AgentWorkTab.tsx already established.
  const actionable = useMemo(() => detail.tickets.filter((t) => t.status_bucket !== null), [detail.tickets]);

  const counts = useMemo(() => {
    const c: Record<WorkBucketKey, number> = { all: actionable.length, overdue: 0, ready_to_verify: 0, needs_reply: 0, open: 0 };
    for (const t of actionable) c[t.status_bucket as AgentDetailTicketStatusBucket] += 1;
    return c;
  }, [actionable]);

  // 'all' is a frontend-only aggregate, never a real per-ticket status_bucket
  // value — compared separately rather than via status_bucket === 'all',
  // which could never match anything real.
  const filtered = useMemo(
    () => (activeBucket === 'all' ? actionable : actionable.filter((t) => t.status_bucket === activeBucket)),
    [actionable, activeBucket],
  );

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;
  const visibleTickets = filtered.slice(0, visibleCount);
  const remainingCount = filtered.length - visibleTickets.length;

  return (
    <div className="adv2-card">
      <h2>
        Work & commitments
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
          <div>
            <AgentWorkV2CaseList tickets={visibleTickets} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            {remainingCount > 0 && (
              <button
                className="adv2-btn"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              >
                Show {remainingCount} older ticket{remainingCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
          {selected && <AgentWorkV2CaseDetail ticket={selected} onNavigate={onNavigate} />}
        </div>
      )}
    </div>
  );
}
