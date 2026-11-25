import React from 'react';
import { StatusBadge } from '../shell';
import type { TimelineEntry } from '../../../services/voiceStudioApi';
import { centralTime } from './studioLoad';

const ACTOR: Record<TimelineEntry['actorType'], string> = { human: 'Person', ai: 'AI', deterministic_service: 'System', carrier: 'Carrier' };
const TONE: Record<TimelineEntry['verdict'], 'success' | 'danger' | 'warning' | 'neutral'> = { allowed: 'success', denied: 'danger', approval_required: 'warning', observed: 'neutral' };

/** The read-only trust timeline of one call: who acted, what they did and what policy decided. */
export default function TrustTimeline({ entries }: { entries: TimelineEntry[] }): React.ReactElement {
  if (entries.length === 0) return <p className="text-muted small mb-0">Nothing has been recorded for this call.</p>;
  return (
    <ol className="list-unstyled d-grid gap-2 mb-0" data-testid="timeline">
      {entries.map((e) => (
        <li key={`${e.sourceId}-${e.action}-${e.at}`} className="border rounded p-2 small" data-verdict={e.verdict}>
          <div className="d-flex flex-wrap justify-content-between gap-2">
            <span><strong>{ACTOR[e.actorType]}</strong> <span className="text-muted">{e.actor}</span></span>
            <StatusBadge label={e.verdict.replace('_', ' ')} tone={TONE[e.verdict]} />
          </div>
          <div>{e.detail}</div>
          <div className="text-muted">{centralTime(e.at)}</div>
        </li>
      ))}
    </ol>
  );
}
