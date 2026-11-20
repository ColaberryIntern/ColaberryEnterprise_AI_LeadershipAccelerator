import React from 'react';
import { SectionCard } from '../shell';
import { useCompose } from './compose/useCompose';
import { StepApprove, StepCheck, StepStart, STATUS_WORDS } from './compose/ComposeSteps';

/**
 * Compose (design 03, CH6.5): 1. what it is about, 2. check the message (faithful previews, edits,
 * Shorter / Warmer / More detail, earlier drafts), 3. who gets it and when, then approve. Nothing is
 * sent from here: an approved message waits for its time and the sending worker (CH7).
 */
export default function ComposeTab(): React.ReactElement {
  const c = useCompose();
  const m = c.message;
  return (
    <SectionCard title="Compose" icon="quill-pen-line" actions={m ? <span className="ch-status ch-status-info">{STATUS_WORDS[m.status] ?? m.status}</span> : undefined}>
      <div role="status" aria-live="polite">{c.notice && <div className="alert alert-success py-2">{c.notice}</div>}</div>
      {c.error && (
        <div className="alert alert-danger py-2" role="alert">
          {c.error}
          {c.problems.length > 0 && <ul className="mb-0 mt-1">{c.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}
      {/* Design 03: the three steps side by side (stacked on narrow screens). */}
      <div className="ch-compose-grid">
        <StepStart c={c} />
        {m && <StepCheck c={c} />}
        {m && <StepApprove c={c} />}
      </div>
    </SectionCard>
  );
}
