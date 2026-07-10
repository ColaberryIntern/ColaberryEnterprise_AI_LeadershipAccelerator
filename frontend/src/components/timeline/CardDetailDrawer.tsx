import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TimelineFeedCard } from './TimelineCard';
import VideoEmbed from './VideoEmbed';
import { parseVideoUrl } from '../../utils/videoEmbed';

/**
 * CardDetailDrawer — the right-slide panel that opens when a student clicks a
 * card. It previews the item (type, title, presenter, duration, points,
 * description) and — for video cards — plays it in-app. Completion is explicit
 * (or automatic when a direct-file video ends), so opening a card no longer
 * silently marks it done.
 */

interface Props {
  card: TimelineFeedCard | null;
  onClose: () => void;
  onComplete: (card: TimelineFeedCard) => Promise<void> | void;
}

function totalPoints(p: TimelineFeedCard['points']): number {
  return (p.learning || 0) + (p.builder || 0) + (p.community || 0);
}

const CardDetailDrawer: React.FC<Props> = ({ card, onClose, onComplete }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, onClose]);

  const complete = useCallback(async () => {
    if (!card) return;
    await onComplete(card);
  }, [card, onComplete]);

  if (!card) return null;

  const source = parseVideoUrl(card.video?.url);
  const isVideo = ['media', 'live_class', 'video_feedback'].includes(card.render_band);
  const done = card.status === 'completed';
  const pts = totalPoints(card.points);
  const presenter = card.video?.presenter || null;
  const duration = card.estimated_time ? `${card.estimated_time} min` : null;

  return (
    <div className="tld-scrim" onClick={onClose}>
      <aside className="tld-panel" role="dialog" aria-modal="true" aria-label={card.title} onClick={(e) => e.stopPropagation()}>
        <div className="tld-head">
          <div className="tld-crumbs">{card.student_label}{card.week != null ? ` · Week ${card.week}` : ''}</div>
          <button type="button" className="tld-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="tld-body">
          <div className="tld-chiprow">
            <span className="tl-chip learning"><span className="sw" />{card.student_label}</span>
            {pts > 0 && <span className={`tl-ptbadge${done ? ' earned' : ''}`}>+{pts} pts</span>}
            {done && <span className="pip done" style={{ fontSize: 13 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed</span>}
          </div>

          <h2 className="tld-title">{card.title}</h2>

          <div className="tld-meta">
            {presenter && <span><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{presenter}</span>}
            {duration && <span><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{duration}</span>}
            <span className="tld-diff">{card.difficulty}</span>
          </div>

          {isVideo && (
            <div className="tld-player">
              <VideoEmbed source={source} title={card.title} poster={card.video?.poster || null} onEnded={done ? undefined : complete} />
            </div>
          )}

          {card.description && <p className="tld-desc">{card.description}</p>}

          {isVideo && (
            <div className="tld-note">
              {source
                ? 'Watch the video, then mark it complete to earn your points.'
                : 'No video link is attached to this card yet. An admin can add one from Orchestration → Timeline.'}
            </div>
          )}
        </div>

        <div className="tld-foot">
          {done
            ? <span className="pip done" style={{ fontSize: 14 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed · +{pts} pts earned</span>
            : (
              <>
                <button type="button" className="tl-btn ghost" onClick={onClose}>Close</button>
                <button type="button" className="tl-btn primary" onClick={() => navigate(`/portal/runtime/${card.id}`)}>Enter workspace →</button>
              </>
            )}
        </div>
      </aside>
    </div>
  );
};

export default CardDetailDrawer;
