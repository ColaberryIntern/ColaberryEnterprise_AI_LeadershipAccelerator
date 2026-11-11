import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import portalApi from '../utils/portalApi';
import type { ArtifactSource } from '../services/artifactViewerTypes';
import type { MyWorkPiece } from '../services/myWorkApi';
import PieceViewer from './portal/portfolio/myWork/PieceViewer';
import { GROUP_STYLE } from './portal/portfolio/myWork/myWorkModel';
import '../components/portfolio/portfolio.css';
import './portal/portfolio/PortfolioPage.css';
import './portal/portfolio/myWork/MyWork.css';
import './publicWorkPage.css';

/**
 * PublicWorkPage: /portfolio/:slug/work/:id, one FEATURED piece on a person's public portfolio (C130, phase 3 of the approved C127
 * design). Read-only, no login. The backend serves a piece only when the page is viewable, a reviewer approved it as featured, and
 * its content is unchanged since; anything else is the same 404 as the page itself, and this page says the same neutral thing for
 * all of them (never "private" or "not featured", which would confirm something exists).
 *
 * The viewer is the learner's own (PieceViewer, audience "public"): the same rendering, worded about the owner, no portal links.
 */
type Piece = Omit<MyWorkPiece, 'state' | 'data' | 'kind'>;

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });

/** The public byte source for this piece: no token, the public routes. */
function publicSource(slug: string): ArtifactSource {
  const base = (id: string) => `/api/public/portfolios/${encodeURIComponent(slug)}/work/${encodeURIComponent(id)}`;
  return {
    async file(id, as) { const { data } = await portalApi.get<Blob>(`${base(id)}/file`, { responseType: 'blob' }); return as ? new Blob([data], { type: as }) : data; },
    async preview(id) { const { data } = await portalApi.get<{ html: string }>(`${base(id)}/preview`); return data.html; },
    async xlsx(id) { const { data } = await portalApi.get<Blob>(`${base(id)}/xlsx`, { responseType: 'blob' }); return data; },
  };
}

const PublicWorkPage: React.FC = () => {
  const { slug = '', id = '' } = useParams<{ slug: string; id: string }>();
  const [piece, setPiece] = useState<Piece | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const source = useMemo(() => publicSource(slug), [slug]);

  useEffect(() => {
    let live = true;
    setState('loading');
    portalApi.get<{ piece: Piece }>(`/api/public/portfolios/${encodeURIComponent(slug)}/work/${encodeURIComponent(id)}`)
      .then((res) => { if (live) { setPiece(res.data.piece); setState('ready'); } })
      .catch((e: { response?: { status?: number } }) => { if (live) setState(e?.response?.status === 404 ? 'missing' : 'error'); });
    return () => { live = false; };
  }, [slug, id]);

  const back = <a className="pwk-back" href={`/portfolio/${encodeURIComponent(slug)}`}>‹ Back to the portfolio</a>;
  if (state === 'loading') return <div className="pf pwk"><div className="pwk-in"><p className="pwk-muted">Loading…</p></div></div>;
  if (state !== 'ready' || !piece) {
    return (
      <div className="pf pwk"><div className="pwk-in">
        {state === 'missing' ? (<><h1>Nothing here</h1><p className="pwk-muted">This address does not lead to a piece of work.</p></>)
          : (<><h1>Something went wrong</h1><p className="pwk-muted">Please try again in a moment.</p></>)}
        {back}
      </div></div>
    );
  }
  const s = GROUP_STYLE[piece.group] ?? GROUP_STYLE.file;
  return (
    <div className="pf pwk">
      <div className="pwk-in">
        {back}
        <header className="pwk-h">
          <span className="mw-badge lg" style={{ background: s.color }}>{s.one}</span>
          <div>
            <h1>{piece.title || 'Untitled piece'}</h1>
            <p className="pwk-muted">From {piece.from} · {day(piece.createdAt)}</p>
          </div>
        </header>
        <PieceViewer piece={piece} source={source} audience="public" />
      </div>
    </div>
  );
};

export default PublicWorkPage;
