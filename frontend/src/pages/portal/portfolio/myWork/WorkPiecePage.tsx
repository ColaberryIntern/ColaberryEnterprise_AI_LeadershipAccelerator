import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PortalShell from '../../today/PortalShell';
import { PaywallScreen } from '../../../../components/paywall/PageGate';
import { GATED_FEATURES } from '../../../../components/paywall/gatedFeatures';
import { fetchMyWork, fetchMyWorkPiece, myWorkSource, type MyWorkPiece, type WorkItem } from '../../../../services/myWorkApi';
import { GROUP_STYLE, neighbors, shortDate, skillLabel, weekKey } from './myWorkModel';
import { loadOrder } from './workOrder';
import PieceViewer from './PieceViewer';
import FeatureCard from './FeatureCard';
import '../PortfolioPage.css';
import './MyWork.css';

/**
 * The work page (C128): one of the learner's own pieces, in the viewer its kind needs (PieceViewer, shared with the public work
 * page since C130). The side panel says what it is, who can see it, and carries the Feature switch (C130). Another learner's id
 * answers 404 from the server, shown as "not found", the same as a deleted piece.
 */
type Ui = 'loading' | 'missing' | 'error' | 'gated' | 'loaded';

const WorkPiecePage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [ui, setUi] = useState<Ui>('loading');
  const [piece, setPiece] = useState<MyWorkPiece | null>(null);
  const [list, setList] = useState<WorkItem[]>([]);

  useEffect(() => {
    let live = true;
    setUi('loading');
    fetchMyWorkPiece(id)
      .then((p) => { if (live) { setPiece(p); setUi('loaded'); } })
      .catch((err: { response?: { status?: number } }) => {
        if (!live) return;
        const s = err?.response?.status;
        setUi(s === 402 ? 'gated' : s === 404 || s === 400 ? 'missing' : 'error');
      });
    // The list is for Previous / Next and "Same week" only; the page works without it.
    fetchMyWork().then((l) => { if (live) setList(l); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [id]);

  const order = useMemo(() => {
    const saved = loadOrder();
    return saved && saved.includes(id) ? saved : list.map((x) => x.id);
  }, [list, id]);
  const nav = neighbors(order, id);
  const sameWeek = useMemo(() => (piece ? list.filter((x) => x.id !== piece.id && weekKey(x.createdAt) === weekKey(piece.createdAt)).slice(0, 4) : []), [list, piece]);

  if (ui === 'gated') return <PortalShell><PaywallScreen copy={GATED_FEATURES.portfolio} /></PortalShell>;

  const back = <Link to="/portal/portfolio/work" className="cp-link">‹ My work</Link>;
  if (ui === 'loading') return <PortalShell><div className="crumb">{back}</div><div className="cp-skeleton" role="status" aria-live="polite">Opening this piece...</div></PortalShell>;
  if (ui === 'missing' || ui === 'error' || !piece) {
    return (
      <PortalShell>
        <div className="crumb">{back}</div>
        <div className="cp-error" role="alert">
          <h2>{ui === 'missing' ? 'We could not find this piece' : 'We couldn\'t open this piece'}</h2>
          <p>{ui === 'missing' ? 'It may have been removed, or the link is not to one of your pieces.' : 'Nothing was lost. This was a problem reading it.'}</p>
          <Link className="cp-btn cp-btn-primary" to="/portal/portfolio/work">Back to My work</Link>
        </div>
      </PortalShell>
    );
  }

  const s = GROUP_STYLE[piece.group];
  return (
    <PortalShell>
      <div className="te-page-h mw-piece-h">
        <div className="crumb">{back} · {s.one}</div>
        <div className="mw-piece-title">
          <span className="mw-badge lg" style={{ background: s.color }}><i className={`ri-${s.icon}`} aria-hidden="true" />{s.one}</span>
          <div>
            <h1>{piece.title || 'Untitled piece'}</h1>
            <div className="sub">From <b>{piece.from}</b> · {shortDate(piece.createdAt)}</div>
          </div>
        </div>
        <nav className="mw-prevnext" aria-label="Previous and next piece">
          {nav.prev ? <Link className="cp-btn" to={`/portal/portfolio/work/${encodeURIComponent(nav.prev)}`}>‹ Previous</Link> : <span className="cp-btn is-off" aria-disabled="true">‹ Previous</span>}
          {nav.next ? <Link className="cp-btn" to={`/portal/portfolio/work/${encodeURIComponent(nav.next)}`}>Next ›</Link> : <span className="cp-btn is-off" aria-disabled="true">Next ›</span>}
        </nav>
      </div>
      <div className="mw-piece">
        <div className="mw-piece-main"><PieceViewer piece={piece} source={myWorkSource} /></div>
        <aside className="mw-piece-side">
          <div className="cp-card">
            <h2>About this piece</h2>
            <dl className="mw-about">
              <dt>Kind</dt><dd>{s.one}</dd>
              <dt>From</dt><dd>{piece.from}</dd>
              {piece.week !== null && (<><dt>Program week</dt><dd>Week {piece.week}</dd></>)}
              {piece.project && (<><dt>Project</dt><dd>{piece.project}</dd></>)}
              <dt>Skills it shows</dt>
              <dd>{piece.skills.length ? <span className="mw-tags">{piece.skills.map((sk) => <span key={sk} className="mw-tag">{skillLabel(sk)}</span>)}</span> : 'None tagged'}</dd>
              <dt>Status</dt><dd>{piece.state}</dd>
            </dl>
          </div>
          <FeatureCard key={piece.id} id={piece.id} initial={piece.feature ?? { featured: false, onPublicPage: false }} initialShare={piece.share ?? { shared: false }} />
          {sameWeek.length > 0 && (
            <div className="cp-card">
              <h2>Same week</h2>
              <ul className="mw-mini">
                {sameWeek.map((x) => (
                  <li key={x.id}>
                    <Link to={`/portal/portfolio/work/${encodeURIComponent(x.id)}`}>
                      <span className="mw-dot" style={{ background: GROUP_STYLE[x.group].color }} aria-hidden="true" />{x.title || 'Untitled piece'}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </PortalShell>
  );
};

export default WorkPiecePage;
