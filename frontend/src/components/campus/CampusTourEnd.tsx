import React, { useRef, useState } from 'react';
import ExplorerPath from './ExplorerPath';
import type { ExplorerPathModel } from './campusPath';
import { postTourComplete, TourCompleteAnswer } from './campusApi';

/**
 * The end of the Explorer tour (Colaberry Campus C7). Ali's decision: the learner OPTS IN. Only the "Have admissions reach out to
 * me" click asks the server for a Growth Journey handoff, and the confirmation is shown ONLY when the server says a handoff exists
 * (handoff:true). Every other answer, a network error or a timeout opens the sign-up sheet ("Your path to enrolling", C6) with a
 * line that is true for that answer. Nothing is ever confirmed on the client.
 */
export const END_COPY = {
  created: 'Maya: Done. Someone from admissions will reach out to you.',
  already_open: 'Someone at Colaberry is already following up with you.',
  closed: 'Admissions already followed up on your earlier request. Here is everything enrolling opens.',
  unreachable: "We couldn't reach admissions from here. Here is everything enrolling opens.",
} as const;

type View = { kind: 'idle' } | { kind: 'busy' } | { kind: 'confirmed'; line: string } | { kind: 'sheet'; line: string | null };

export function lineFor(answer: TourCompleteAnswer | null): { confirmed: boolean; line: string } {
  if (answer?.handoff === true && answer.reason === 'created') return { confirmed: true, line: END_COPY.created };
  if (answer?.handoff === true && answer.reason === 'already_open') return { confirmed: true, line: END_COPY.already_open };
  if (answer?.reason === 'closed') return { confirmed: false, line: END_COPY.closed };
  return { confirmed: false, line: END_COPY.unreachable };
}

export default function CampusTourEnd({ pathModel, onNavigate }: { pathModel: ExplorerPathModel; onNavigate: () => void }): React.ReactElement {
  const [view, setView] = useState<View>({ kind: 'idle' });
  const inFlight = useRef(false);

  const optIn = async () => {
    if (inFlight.current) return; // one request, however fast the clicks
    inFlight.current = true;
    setView({ kind: 'busy' });
    let answer: TourCompleteAnswer | null = null;
    try { answer = await postTourComplete(); } catch { answer = null; }
    const { confirmed, line } = lineFor(answer);
    setView(confirmed ? { kind: 'confirmed', line } : { kind: 'sheet', line });
  };

  if (view.kind === 'confirmed') return <p className="cm-tour-done-line" role="status" data-testid="cm-tour-confirmed">{view.line}</p>;
  if (view.kind === 'sheet') {
    return (
      <div data-testid="cm-tour-sheet">
        {view.line && <p className="cm-who-note" role="status" data-testid="cm-tour-line">{view.line}</p>}
        <ExplorerPath model={pathModel} onNavigate={onNavigate} />
      </div>
    );
  }
  return (
    <div className="cm-tour-endopts">
      <p className="cm-tour-what">Want a person from admissions to walk you through enrolling?</p>
      <button type="button" className="cm-btn" onClick={optIn} disabled={view.kind === 'busy'} aria-busy={view.kind === 'busy'} data-testid="cm-tour-optin">
        {view.kind === 'busy' ? 'Asking admissions...' : 'Have admissions reach out to me'}
      </button>
      <button type="button" className="cm-link" onClick={() => setView({ kind: 'sheet', line: null })} disabled={view.kind === 'busy'} data-testid="cm-tour-signup">See what enrolling opens</button>
    </div>
  );
}
