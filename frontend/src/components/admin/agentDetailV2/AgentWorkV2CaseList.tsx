import React from 'react';
import { AgentDetailTicket } from '../../../services/agentDetailApi';
import { adv2PillClass } from './adv2PillTone';
import { BUCKETS } from './AgentWorkV2';

// Agent Detail redesign, Track A1 (2026-09-21) — the left column of Work's
// new list+detail split. One real row per filtered ticket, reusing the
// exact same real fields AgentWorkTab.tsx's own flat list already showed
// (title, bucket, due date) — a re-layout, not new data.

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return 'No due date';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
              <span className={adv2PillClass(bucketMeta.tone)}>{bucketMeta.label}</span>
            </div>
            <strong style={{ display: 'block', margin: '6px 0 2px' }}>{t.title}</strong>
            <small className="adv2-muted">{formatDueDate(t.due_date)}</small>
          </button>
        );
      })}
    </div>
  );
}
