import React from 'react';
import VideoEmbed from './VideoEmbed';
import { parseVideoUrl } from '../../utils/videoEmbed';

/**
 * TimelineCard — the universal card of the Timeline Engine, in Colaberry
 * Design E. One presentational component renders every curriculum type; the
 * card's `render_band` picks the icon + colour, `student_label` names it, and
 * `points` drives the XP badge. Shared primitive owned by the Classroom tab.
 */

export interface TimelineFeedCard {
  id: string;
  type: string;
  student_label: string;
  render_band: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  week: number | null;
  bucket: string;
  order: number;
  difficulty: string;
  estimated_time: number | null;
  points: { learning?: number; builder?: number; community?: number };
  competencies: unknown;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  quiz_score: number | null;
  completed_at: string | null;
  video?: { url: string; presenter: string | null; poster: string | null } | null;
  content?: { summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;
}

type Kind = 'video' | 'skilljar' | 'lab' | 'test' | 'reading' | 'survey' | 'event' | 'milestone';

interface Visual { kind: Kind; color: string; }

// render_band -> Design E visual kind + accent colour (Colaberry palette).
const BAND: Record<string, Visual> = {
  media: { kind: 'video', color: '#367895' },
  live_class: { kind: 'video', color: '#FB2832' },
  video_feedback: { kind: 'video', color: '#E8920C' },
  event: { kind: 'event', color: '#FB2832' },
  overview: { kind: 'reading', color: '#2E6A86' },
  deepdive: { kind: 'reading', color: '#2E6A86' },
  reading: { kind: 'reading', color: '#2E6A86' },
  question: { kind: 'reading', color: '#367895' },
  announcement: { kind: 'reading', color: '#367895' },
  discussion: { kind: 'reading', color: '#367895' },
  community: { kind: 'reading', color: '#367895' },
  study: { kind: 'reading', color: '#367895' },
  warmup: { kind: 'survey', color: '#E8920C' },
  survey: { kind: 'survey', color: '#E8920C' },
  reflection: { kind: 'survey', color: '#E8920C' },
  quiz: { kind: 'test', color: '#5BA63C' },
  exam: { kind: 'test', color: '#5BA63C' },
  evaluation: { kind: 'test', color: '#5BA63C' },
  promptlab: { kind: 'lab', color: '#FB2832' },
  task: { kind: 'lab', color: '#FB2832' },
  artifact: { kind: 'lab', color: '#FB2832' },
  presentation: { kind: 'lab', color: '#FB2832' },
  demo: { kind: 'lab', color: '#FB2832' },
  interview: { kind: 'lab', color: '#FB2832' },
  build_story: { kind: 'lab', color: '#5BA63C' },
  github: { kind: 'lab', color: '#5BA63C' },
  skills_jar: { kind: 'skilljar', color: '#E8920C' },
  milestone: { kind: 'milestone', color: '#5BA63C' },
  achievement: { kind: 'milestone', color: '#5BA63C' },
  badge: { kind: 'milestone', color: '#5BA63C' },
  streak: { kind: 'milestone', color: '#E8920C' },
};
const visualFor = (band: string): Visual => BAND[band] || { kind: 'reading', color: '#367895' };

const KIND_GRADIENT: Record<Kind, string> = {
  video: 'linear-gradient(135deg,#367895,#2E6A86)',
  skilljar: 'linear-gradient(135deg,#367895,#2E6A86)',
  lab: 'linear-gradient(135deg,#367895,#5BA63C)',
  test: 'linear-gradient(135deg,#5BA63C,#367895)',
  reading: 'linear-gradient(135deg,#2E6A86,#367895)',
  survey: 'linear-gradient(135deg,#E8920C,#FB2832)',
  event: 'linear-gradient(135deg,#FB2832,#C20E1E)',
  milestone: 'linear-gradient(135deg,#5BA63C,#3C7A26)',
};

// small header-tile icon per kind
const Icon: React.FC<{ kind: Kind }> = ({ kind }) => {
  switch (kind) {
    case 'video': return <path d="M8 5v14l11-7z" fill="currentColor" />;
    case 'skilljar': return <><path d="M12 3l9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" stroke="currentColor" strokeWidth="2" /></>;
    case 'lab': return <path d="M9 3h6M8 8h8v12H8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />;
    case 'test': return <><path d="M9 11l3 3 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M21 12v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="2" /></>;
    case 'reading': return <path d="M4 5h7v15H4zM13 5h7v15h-7z" stroke="currentColor" strokeWidth="2" />;
    case 'survey': return <path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" fill="currentColor" />;
    case 'event': return <><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>;
    case 'milestone': return <path d="M6 21V4M6 5h11l-2 3 2 3H6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />;
    default: return <path d="M4 5h7v15H4z" stroke="currentColor" strokeWidth="2" />;
  }
};

const StatePip: React.FC<{ status: TimelineFeedCard['status'] }> = ({ status }) => {
  if (status === 'completed') return <span className="pip done"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>Completed</span>;
  if (status === 'locked') return <span className="pip lock"><svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>Locked</span>;
  return <span className="pip up"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /></svg>Not started</span>;
};

function totalPoints(p: TimelineFeedCard['points']): number {
  return (p.learning || 0) + (p.builder || 0) + (p.community || 0);
}

interface Props {
  card: TimelineFeedCard;
  onOpen?: (card: TimelineFeedCard) => void;
  onLike?: (card: TimelineFeedCard) => void;
  likes?: number;
  liked?: boolean;
}

const TimelineCard: React.FC<Props> = ({ card, onOpen, onLike, likes = 0, liked = false }) => {
  const v = visualFor(card.render_band);
  const done = card.status === 'completed';
  const locked = card.status === 'locked';
  const pts = totalPoints(card.points);
  const metaLine = [card.estimated_time ? `${card.estimated_time} min` : null, card.difficulty].filter(Boolean).join(' · ');
  const shortTitle = card.title.replace(/^[^·]*· /, '');

  const videoSource = card.video?.url ? parseVideoUrl(card.video.url) : null;

  const media = v.kind === 'video' && videoSource ? (
    // Plays right here in the feed — press ▶ and watch in-app. "Open" is for the detail panel.
    <div className="fc-video" onClick={(e) => e.stopPropagation()}>
      <VideoEmbed source={videoSource} title={shortTitle} poster={card.video?.poster || null} />
    </div>
  ) : v.kind === 'video' ? (
    // Video card with no link attached yet — poster opens the detail panel.
    <button type="button" className="vframe" onClick={() => !locked && onOpen?.(card)} aria-label={`Open ${card.title}`}>
      <span className="poster" style={{ background: KIND_GRADIENT.video }} />
      <span className="vgrad" />
      <span className="vmeta"><b>{shortTitle}</b><span>video</span></span>
      <span className="vplay"><svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
    </button>
  ) : (
    <button type="button" className={`mthumb${done ? ' done' : ''}`} style={{ background: KIND_GRADIENT[v.kind] }} onClick={() => !locked && onOpen?.(card)} aria-label={`Open ${card.title}`}>
      <svg viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', width: 132, height: 132, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: '#fff', opacity: 0.16 }}><Icon kind={v.kind} /></svg>
      <span className="mt-chip"><span className="sw" style={{ background: v.color }} />{card.student_label}</span>
      <span className="mt-meta"><b>{shortTitle}</b><span>{metaLine}</span></span>
      <span className="mt-open">{done
        ? <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
        : <svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}</span>
    </button>
  );

  return (
    <div className="tl-card fcard">
      <div className="fc-head">
        <span className="ico" style={{ background: v.color }}><svg viewBox="0 0 24 24" fill="none"><Icon kind={v.kind} /></svg></span>
        <div style={{ minWidth: 0 }}>
          <div className="ttl">{card.title}</div>
          <div className="sub">
            <span className={`tl-chip ${v.kind === 'skilljar' || v.kind === 'survey' ? 'cert' : 'learning'}`} style={{ padding: '2px 9px' }}><span className="sw" />{card.student_label}</span>
            {pts > 0 && <span className={`tl-ptbadge${done ? ' earned' : ''}`}>+{pts} pts</span>}
          </div>
        </div>
        <span className="st-ic"><StatePip status={card.status} /></span>
      </div>
      <div className="fc-body">
        {card.description && <p>{card.description}</p>}
        {media}
      </div>
      <div className="fc-foot">
        <button type="button" className={`like${liked ? ' liked' : ''}`} onClick={() => onLike?.(card)}>
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'}><path d="M12 21s-7-4.5-9.5-9C.8 8.5 2.5 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.5 0 5.2 3.5 3.5 7C19 16.5 12 21 12 21z" stroke="currentColor" strokeWidth="2" /></svg> {likes}
        </button>
        <button type="button" className="cmt"><svg viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Comment</button>
        <span className="spacer" />
        {done
          ? <span className="pip done" style={{ fontSize: 13 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed · +{pts} pts</span>
          : locked
            ? <span className="pip lock" style={{ fontSize: 13 }}>Unlocks later</span>
            : <button type="button" className={`fc-cta ${v.kind === 'lab' ? 'cherry' : 'berry'}`} onClick={() => onOpen?.(card)}>
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> {v.kind === 'lab' ? 'Start' : 'Open'}
              </button>}
      </div>
    </div>
  );
};

export default TimelineCard;
