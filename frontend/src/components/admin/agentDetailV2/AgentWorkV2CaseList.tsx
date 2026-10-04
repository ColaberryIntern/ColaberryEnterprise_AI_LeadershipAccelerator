import React from 'react';
import { AgentDetailTicket } from '../../../services/agentDetailApi';
import { adv2PillClass } from './adv2PillTone';
import { getTicketStatusLabel, getTicketStatusTone } from '../../../utils/ticketTypeMeta';
import { BUCKETS } from './AgentWorkV2';

// Agent Detail redesign, Track A1 (2026-09-21) — the left column of Work's
// new list+detail split. One real row per filtered ticket, reusing the
// exact same real fields AgentWorkTab.tsx's own flat list already showed
// (title, bucket, due date) — a re-layout, not new data.
//
// Agent Detail polish round 2 (2026-09-29) — Ali, live: "need more coloring
// for the statuses." The bucket pill alone collapsed most rows to the same
// gray 'open' tone (the common catch-all bucket) regardless of a ticket's
// real status. Added the real status pill alongside it (not replacing it —
// bucket answers "why is this actionable," status answers "where is it in
// its real lifecycle," both genuinely useful) — reusing the same
// getTicketStatusTone()/getTicketStatusLabel() helper already proven
// correct in AgentWorkV2CaseDetail.tsx.

export function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Agent Detail polish round 4 (2026-09-30) — Ali, live: "next commitment should show relative
// time as well. 6 hours ... 2 days etc... after the date." Appends to formatDueDate()'s existing
// absolute date, never replaces it. timeAgo() (shell/trust.ts) cannot be reused here — its
// Math.max(0, ...) clamp makes every future timestamp read "just now," which is wrong, not just
// imprecise, for a due date that hasn't arrived yet. Modeled on overviewFormat.ts's expiryPhrase()
// shape (never render a naive negative count) but takes a real ISO date string, not a
// pre-computed day count.
export function relativeDueSuffix(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;

  const diffMs = d.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) {
    const overdueHours = Math.abs(diffHours);
    if (overdueHours < 24) {
      const h = Math.max(1, Math.round(overdueHours));
      return `${h} hour${h === 1 ? '' : 's'} overdue`;
    }
    const days = Math.round(overdueHours / 24);
    return `${days} day${days === 1 ? '' : 's'} overdue`;
  }
  if (diffHours < 1) return 'due within the hour';
  if (diffHours < 24) {
    const h = Math.round(diffHours);
    return `in ${h} hour${h === 1 ? '' : 's'}`;
  }
  const days = Math.round(diffHours / 24);
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** `formatDueDate()` plus its relative-time suffix, ready to render — e.g. "Oct 1, 2026 (in 2
 * days)" or just "No due date" when there's nothing to add a suffix to. */
export function formatDueDateWithRelative(dueDate: string | null): string {
  const absolute = formatDueDate(dueDate);
  const suffix = relativeDueSuffix(dueDate);
  return suffix ? `${absolute} (${suffix})` : absolute;
}

interface Props {
  tickets: AgentDetailTicket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function AgentWorkV2CaseList({ tickets, selectedId, onSelect }: Props) {
  return (
    <div>
      {tickets.map((t) => {
        const bucketMeta = BUCKETS.find((b) => b.key === t.status_bucket)!;
        return (
          <button
            key={t.id}
            className={`adv2-case-row${t.id === selectedId ? ' adv2-active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="adv2-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.ticket_number !== null ? `#${t.ticket_number}` : 'Case'}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <span className={adv2PillClass(bucketMeta.tone)}>{bucketMeta.label}</span>
                <span className={`${adv2PillClass(getTicketStatusTone(t.status))} adv2-pill-outline`}>{getTicketStatusLabel(t.status)}</span>
              </span>
            </div>
            <strong style={{ display: 'block', margin: '6px 0 2px' }}>{t.title}</strong>
            <small className="adv2-muted">Next commitment: {formatDueDateWithRelative(t.due_date)}</small>
          </button>
        );
      })}
    </div>
  );
}
