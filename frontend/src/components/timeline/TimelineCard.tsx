import React from 'react';
import { parseVideoUrl, videoThumbnail } from '../../utils/videoEmbed';

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
  video?: { url: string; presenter: string | null; poster: string | null; title?: string | null } | null;
  image?: string | null;   // the item's OWN image (blog cover, testimonial still) — overrides the generic type visual
  content?: { summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;
  course?: { name: string | null; url: string | null } | null;   // Skills Course (skills_jar): class name + link
  capabilities?: string[];   // the type's Parts — gate optional render sections (empty ⇒ show all, backward-compatible)
  type_thumbnail_url?: string | null;   // the type's banner — the card's DEFAULT image (own media poster overrides it)
}

export type Kind = 'video' | 'skilljar' | 'lab' | 'test' | 'reading' | 'survey' | 'event' | 'milestone';

export interface Visual { kind: Kind; color: string; }

// render_band -> Design E visual kind + accent colour (Colaberry palette).
// EXPORTED as the format contract: every render_band the backend type registry
// (backend/src/services/timeline/typeRegistry.ts) can emit MUST be a key here, or
// the card silently falls back to the generic 'reading' visual — which would make
// the Experience Studio demo and the real Classroom timeline event both lose the
// type's intended format. curriculumFormatContract.test.ts enforces that.
export const BAND: Record<string, Visual> = {
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
export const visualFor = (band: string): Visual => BAND[band] || { kind: 'reading', color: '#367895' };

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
  onComplete?: (card: TimelineFeedCard) => Promise<void> | void;
  likes?: number;
  liked?: boolean;
}

const TimelineCard: React.FC<Props> = ({ card, onOpen, onLike, likes = 0, liked = false }) => {
  const v = visualFor(card.render_band);
  const done = card.status === 'completed';
  const locked = card.status === 'locked';
  const isSkillsJar = v.kind === 'skilljar';
  const pts = totalPoints(card.points);
  const metaLine = [card.estimated_time ? `${card.estimated_time} min` : null, card.difficulty].filter(Boolean).join(' · ');
  const shortTitle = card.title.replace(/^[^·]*· /, '');

  // Poster background precedence: the item's OWN image wins — an explicit card
  // image (blog cover), the video's saved poster, or a thumbnail derived from
  // the video URL (YouTube). Otherwise the curriculum type's AI banner is the
  // default image for every card; the Design-E gradient remains the last-resort
  // fallback. Darkened so the overlay text stays legible.
  // Playable = a real video/audio source is attached. Only playable cards get
  // the ▶ affordance; everything else shows an "Open" pill (right-panel intent).
  const playable = !!parseVideoUrl(card.video?.url);
  const ownImage =
    (card.image && card.image.trim()) ||
    card.video?.poster ||
    videoThumbnail(parseVideoUrl(card.video?.url));
  const posterUrl = ownImage || card.type_thumbnail_url || null;
  const posterStyle: React.CSSProperties = posterUrl
    ? {
        backgroundImage: `linear-gradient(135deg,rgba(46,106,134,.5),rgba(20,24,27,.66)), url(${posterUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: KIND_GRADIENT[v.kind] };

  // ONE uniform 16:9 tile for EVERY card. The bottom-right ▶ opens the detail
  // drawer (pop-out from the right) where the full assignment lives — the video
  // plays there, content/quiz/reflection render there, the SkillsJar course +
  // certificate upload happen there. Same size, same open-from-the-right action
  // on every card in the feed.
  const metaText = isSkillsJar
    ? 'External course · certificate required'
    : metaLine || (v.kind === 'video' ? 'video' : '');

  // Skills Course (skills_jar) adds a second action beside ▶: "Open" jumps
  // straight to the external course/assignment link, while ▶ still opens the
  // right panel (course details + certificate upload). Open falls back to the
  // panel when no link is attached, so neither button is ever dead. Because that
  // needs two buttons, the skills_jar tile is a <div> (nesting a button in the
  // whole-tile <button> would be invalid) — every other card keeps the uniform
  // single-button tile.
  const course = card.course || null;
  const openCourseLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked) return;
    if (course?.url) window.open(course.url, '_blank', 'noopener,noreferrer');
    else onOpen?.(card);
  };

  // The big watermark icon only decorates gradient tiles — real artwork
  // (own poster or type banner) doesn't need it and reads cleaner without.
  const watermark = posterUrl ? null : (
    <svg viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', width: 132, height: 132, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: '#fff', opacity: 0.16 }}><Icon kind={v.kind} /></svg>
  );

  const media = isSkillsJar ? (
    <div className="mthumb skilljar" style={posterStyle}>
      {watermark}
      <span className="mt-chip"><span className="sw" style={{ background: v.color }} />{card.student_label}</span>
      <span className="mt-meta"><b>{shortTitle}</b><span>{metaText}</span></span>
      <div className="mt-actions" onClick={(e) => e.stopPropagation()}>
        {/* Not a playable medium — the circle opens the right panel (details), so
            it carries an open-panel chevron, not a ▶ (▶ is reserved for playback). */}
        <button type="button" className="mt-play" onClick={() => !locked && onOpen?.(card)} aria-label={`Course details: ${card.title}`}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="mt-openbtn" onClick={openCourseLink} aria-label={course?.url ? 'Open the course link' : 'Open course details'}>
          Open <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className={`mthumb${done ? ' done' : ''}${card.type === 'testimonial' ? ' testimonial' : ''}`} style={posterStyle} onClick={() => !locked && onOpen?.(card)} aria-label={`Open ${card.title}`}>
      {watermark}
      {card.type === 'testimonial' && <span className="mt-ribbon">Testimonial</span>}
      {card.type === 'podcast' && <span className="mt-ribbon">Podcast</span>}
      <span className="mt-chip"><span className="sw" style={{ background: v.color }} />{card.student_label}</span>
      <span className="mt-meta"><b>{card.video?.title || shortTitle}</b><span>{metaText}</span></span>
      {done
        ? <span className="mt-open"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
        : playable
          ? <span className="mt-open"><svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
          : <span className="mt-openpill">Open <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>}
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
