import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import { PaywallScreen } from '../../../components/paywall/PageGate';
import { GATED_FEATURES } from '../../../components/paywall/gatedFeatures';
import { fetchShowcasePiece, showcaseSource, type ShowcasePiece } from '../../../services/showcaseApi';
import PieceViewer from '../portfolio/myWork/PieceViewer';
import { GROUP_STYLE, shortDate, skillLabel } from '../portfolio/myWork/myWorkModel';
import '../portfolio/PortfolioPage.css';
import '../portfolio/myWork/MyWork.css';
import './Showcase.css';

/**
 * A shared piece, read-only (C138): what a classmate in the same cohort sees. The viewer is the same one the owner and the
 * public page use (PieceViewer), worded about the owner ("public" audience: "What they said about it", no owner-only links).
 * Never the owner's private status or leftover data; the server does not send them.
 *
 * Every reason a piece cannot be opened (another cohort, no longer shared, deleted, made up) comes back as the same 404, and
 * this page says the same neutral thing for all of them.
 */
type Ui = 'loading' | 'missing' | 'error' | 'gated' | 'loaded';

const ShowcasePiecePage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [ui, setUi] = useState<Ui>('loading');
  const [piece, setPiece] = useState<ShowcasePiece | null>(null);

  useEffect(() => {
    let live = true;
    setUi('loading');
    fetchShowcasePiece(id)
      .then((p) => { if (live) { setPiece(p); setUi('loaded'); } })
      .catch((err: { response?: { status?: number } }) => {
        if (!live) return;
        const s = err?.response?.status;
        setUi(s === 402 ? 'gated' : s === 404 || s === 400 ? 'missing' : 'error');
      });
    return () => { live = false; };
  }, [id]);

  if (ui === 'gated') return <PortalShell><PaywallScreen copy={GATED_FEATURES.portfolio} /></PortalShell>;
  const back = <Link to="/portal/showcase" className="cp-link">‹ Showcase</Link>;
  if (ui === 'loading') return <PortalShell><div className="crumb">{back}</div><div className="cp-skeleton" role="status" aria-live="polite">Opening this piece...</div></PortalShell>;
  if (ui !== 'loaded' || !piece) {
    return (
      <PortalShell>
        <div className="crumb">{back}</div>
        <div className="cp-error" role="alert" data-testid="sc-piece-missing">
          <h2>{ui === 'missing' ? 'This piece is not shared with you' : 'We couldn\'t open this piece'}</h2>
          <p>{ui === 'missing' ? 'It may no longer be shared, or the link is not to a piece shared with your cohort.' : 'This was a problem reading it. Try again in a moment.'}</p>
          <Link className="cp-btn cp-btn-primary" to="/portal/showcase">Back to the Showcase</Link>
        </div>
      </PortalShell>
    );
  }

  const s = GROUP_STYLE[piece.group] ?? GROUP_STYLE.file;
  const who = piece.mine ? 'You' : piece.author;
  return (
    <PortalShell>
      <div className="te-page-h mw-piece-h">
        <div className="crumb">{back} · {s.one}</div>
        <div className="mw-piece-title">
          <span className="mw-badge lg" style={{ background: s.color }}><i className={`ri-${s.icon}`} aria-hidden="true" />{s.one}</span>
          <div>
            <h1>{piece.title || 'Untitled piece'}</h1>
            <div className="sub">Shared by <b>{who}</b> · From {piece.from} · {shortDate(piece.createdAt)}</div>
          </div>
        </div>
      </div>
      <div className="mw-piece">
        <div className="mw-piece-main"><PieceViewer piece={piece} source={showcaseSource} audience="public" /></div>
        <aside className="mw-piece-side">
          <div className="cp-card">
            <h2>About this piece</h2>
            <dl className="mw-about">
              <dt>Shared by</dt><dd data-testid="sc-piece-author">{who}</dd>
              <dt>Kind</dt><dd>{s.one}</dd>
              <dt>From</dt><dd>{piece.from}</dd>
              {piece.week !== null && (<><dt>Program week</dt><dd>Week {piece.week}</dd></>)}
              {piece.project && (<><dt>Project</dt><dd>{piece.project}</dd></>)}
              <dt>Skills it shows</dt>
              <dd>{piece.skills.length ? <span className="mw-tags">{piece.skills.map((sk) => <span key={sk} className="mw-tag">{skillLabel(sk)}</span>)}</span> : 'None tagged'}</dd>
            </dl>
            <p className="cp-muted">Shared with your cohort. {piece.mine ? 'You can stop sharing it from its page in My work.' : 'Only your cohort can see it.'}</p>
            {piece.mine && <Link className="cp-link" to={`/portal/portfolio/work/${encodeURIComponent(piece.id)}`}>Open it in My work</Link>}
          </div>
        </aside>
      </div>
    </PortalShell>
  );
};

export default ShowcasePiecePage;
