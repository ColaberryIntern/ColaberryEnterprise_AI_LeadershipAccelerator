import React, { useCallback, useEffect, useState } from 'react';
import portalApi from '../../../utils/portalApi';

/**
 * Presentation demos: the staff-approved presentation showcases a learner is allowed to see (kept from the original gallery,
 * now one section of the rebuilt Showcase room, C138). The audience rule (`canView`) is server-side; this is a renderer.
 *
 * WORK IN PROGRESS and EXTERNAL WORK carry their labels on the card, not in a tooltip: a visitor must never mistake an
 * unfinished thing for a finished one, nor work built elsewhere for work we watched being built.
 *
 * The section shows only when there is something to show, or when the read failed (an error is never presented as empty).
 */
export interface DemoCard {
  id: string;
  title: string;
  summary: string;
  authorName: string;
  audience: 'cohort' | 'community' | 'public';
  workInProgress?: boolean;
  external?: { url: string; badge: string; note: string } | null;
  tags?: string[];
}

type Load = { phase: 'loading' } | { phase: 'ready'; items: DemoCard[] } | { phase: 'error' };

export default function PresentationDemos(): React.ReactElement | null {
  const [state, setState] = useState<Load>({ phase: 'loading' });
  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const r = await portalApi.get('/api/portal/showcases');
      setState({ phase: 'ready', items: Array.isArray(r.data?.items) ? (r.data.items as DemoCard[]) : [] });
    } catch {
      setState({ phase: 'error' });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state.phase === 'loading' || (state.phase === 'ready' && state.items.length === 0)) return null;
  return (
    <section className="mw-section sc-demos" aria-labelledby="sc-demos-h" data-testid="sc-demos">
      <h2 id="sc-demos-h" className="mw-section-h">Presentation demos <span>· approved by staff</span></h2>
      {state.phase === 'error' ? (
        <div data-testid="sc-demos-error">
          <p role="alert" className="cp-muted">We could not load the presentation demos just now. This does not mean there are none.</p>
          <button type="button" className="cp-btn" onClick={() => void load()}>Try again</button>
        </div>
      ) : (
        <ul className="mw-grid">
          {state.items.map((item) => (
            <li key={item.id} className="cp-card sc-demo" data-testid={`sc-card-${item.id}`}>
              <h3 className="sc-demo-t">{item.title}</h3>
              <p className="mw-card-meta">{item.authorName}</p>
              {item.workInProgress && <p className="sc-wip" data-testid={`sc-wip-${item.id}`}>Work in progress</p>}
              <p className="sc-demo-s">{item.summary}</p>
              {item.external && (
                <p className="sc-demo-x" data-testid={`sc-external-${item.id}`}><strong>{item.external.badge}</strong><span className="cp-muted">: {item.external.note}</span></p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
