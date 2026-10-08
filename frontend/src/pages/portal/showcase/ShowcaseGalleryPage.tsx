import React, { useCallback, useEffect, useMemo, useState } from 'react';
import portalApi from '../../../utils/portalApi';

/**
 * "What We're Building" — the gallery of showcases a learner is allowed to see.
 *
 * THE FILTERING IS NOT HERE. This page renders what the server returned, and the
 * server has already applied `canView` per row. A gallery that fetched everything and
 * hid the private ones in the browser would be one `view-source` away from leaking
 * them, and the search endpoint would still have them in its index. Audience is
 * enforced server-side on every surface; this is a renderer.
 *
 * WORK IN PROGRESS IS LABELLED AS SUCH. A showcase published mid-build is useful —
 * seeing a half-finished thing is how people learn what building looks like — but a
 * visitor must never mistake it for a finished piece, and a student must never feel
 * their unfinished work was passed off as done.
 *
 * EXTERNAL WORK CARRIES ITS BADGE IN THE CARD, not in a tooltip. A gallery that
 * presents work built elsewhere identically to work we watched being built is quietly
 * lending it our credibility.
 *
 * FOUR STATES. An empty gallery and a failed fetch say different things: one invites
 * you to be the first, the other asks you to try again.
 */

export interface ShowcaseCard {
  id: string;
  title: string;
  summary: string;
  authorName: string;
  audience: 'cohort' | 'community' | 'public';
  /** True when the author marked it still in progress. */
  workInProgress?: boolean;
  /** Present only for work built outside the programme. */
  external?: { url: string; badge: string; note: string } | null;
  tags?: string[];
}

type Load =
  | { phase: 'loading' }
  | { phase: 'ready'; items: ShowcaseCard[] }
  | { phase: 'error' };

const ShowcaseGalleryPage: React.FC = () => {
  const [state, setState] = useState<Load>({ phase: 'loading' });
  const [query, setQuery] = useState('');
  const [showWip, setShowWip] = useState(true);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const r = await portalApi.get('/api/portal/showcases');
      const items = Array.isArray(r.data?.items) ? (r.data.items as ShowcaseCard[]) : [];
      setState({ phase: 'ready', items });
    } catch {
      setState({ phase: 'error' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    if (state.phase !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return state.items.filter((i) => {
      if (!showWip && i.workInProgress) return false;
      if (!q) return true;
      return [i.title, i.summary, i.authorName, ...(i.tags || [])]
        .filter(Boolean).some((f) => String(f).toLowerCase().includes(q));
    });
  }, [state, query, showWip]);

  return (
    <main className="rt" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px 72px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.6rem' }}>What we&rsquo;re building</h1>
      <p className="rt-muted" style={{ marginTop: 0 }}>
        Demos from across the programme. You see what each author chose to share with you.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '20px 0' }}>
        <label htmlFor="sc-q" className="rt-muted" style={{ fontSize: 13 }}>Search</label>
        <input
          id="sc-q"
          className="rt-in"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Project, person, or topic"
          style={{ flex: 1, minWidth: 220, padding: 8 }}
        />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={showWip} onChange={(e) => setShowWip(e.target.checked)} data-testid="sc-wip-toggle" />
          Include work in progress
        </label>
      </div>

      {state.phase === 'loading' && (
        <p role="status" className="rt-muted" data-testid="sc-loading">Loading the gallery&hellip;</p>
      )}

      {state.phase === 'error' && (
        <div data-testid="sc-error">
          <p role="alert" style={{ color: 'var(--cherry-deep, #C20E1E)' }}>
            We could not load the gallery just now. This does not mean it is empty.
          </p>
          <button type="button" className="rt-btn" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {state.phase === 'ready' && visible.length === 0 && (
        <p role="status" className="rt-muted" data-testid="sc-empty">
          {state.items.length === 0
            ? 'Nothing has been shared with you yet. When someone publishes a demo you can see, it will appear here.'
            : 'Nothing matches that search.'}
        </p>
      )}

      {state.phase === 'ready' && visible.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }} data-testid="sc-grid">
          {visible.map((item) => (
            <li key={item.id} className="rt-card" style={{ padding: 16 }} data-testid={`sc-card-${item.id}`}>
              <h2 style={{ fontSize: '1.05rem', margin: '0 0 6px' }}>{item.title}</h2>
              <p className="rt-muted" style={{ fontSize: 13, margin: '0 0 8px' }}>{item.authorName}</p>

              {/* Stated on the card, not in a tooltip: a visitor must never mistake an
                  unfinished thing for a finished one, and the author must never feel
                  their half-built work was passed off as done. */}
              {item.workInProgress && (
                <p data-testid={`sc-wip-${item.id}`} style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600 }}>
                  Work in progress
                </p>
              )}

              <p style={{ margin: '0 0 10px', fontSize: 14 }}>{item.summary}</p>

              {item.external && (
                <p data-testid={`sc-external-${item.id}`} style={{ margin: 0, fontSize: 12 }}>
                  <strong>{item.external.badge}</strong>
                  <span className="rt-muted"> — {item.external.note}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

export default ShowcaseGalleryPage;
