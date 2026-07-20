import React, { useRef, useState } from 'react';
import { parseVideoUrl, videoThumbnail, isAudioUrl } from '../../utils/videoEmbed';
import VideoEmbed from './VideoEmbed';
import CardComments from './CardComments';
import { toTitleCase } from '../../utils/titleCase';

/**
 * TimelineCard — the universal card of the Timeline Engine, in Colaberry
 * Design E. One presentational component renders every curriculum type; the
 * card's `render_band` picks the icon + colour, `student_label` names it, and
 * `points` drives the XP badge. Shared primitive owned by the Classroom tab.
 *
 * Interaction contract: ▶ on a playable card plays the video INLINE, right in
 * the tile (FB-style, no panel). The "Open" button is the ONLY way to pull up
 * the right-side detail panel.
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
  lock_reason?: string | null;   // when status='locked', why (e.g. "Finish the Learn tasks first")
  quiz_score: number | null;
  completed_at: string | null;
  video?: { url: string; presenter: string | null; poster: string | null; title?: string | null } | null;
  image?: string | null;   // the item's OWN image (blog cover, testimonial still) — overrides the generic type visual
  content?: { title?: string; summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;   // title = the generated lesson title ("Overview — {week topic}"), display beats the raw card title
  course?: { name: string | null; url: string | null; completion?: 'certificate' | 'progress'; sections?: string } | null;   // Skills Course (skills_jar): class name + link + completion mode
  blog?: { url: string; title?: string | null; excerpt?: string | null; thumbnail?: string | null } | null;   // Blog post (blog type): fixed or auto-matched
  capabilities?: string[];   // the type's Parts — gate optional render sections (empty ⇒ show all, backward-compatible)
  type_thumbnail?: string | null;   // the type's Experience Studio thumbnail (AI banner) — the card's DEFAULT image; own media art overrides it
  week_title?: string | null;   // the week's SECTION title from the Blueprint — the Overview card's display title (no week number)
}

export type Kind = 'video' | 'skilljar' | 'lab' | 'test' | 'reading' | 'survey' | 'event' | 'milestone' | 'setuplab';

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
  warmup: { kind: 'reading', color: '#2E6A86' },
  intel: { kind: 'reading', color: '#2E6A86' },   // Intelligence Pipeline types (news/research/tools/…)
  survey: { kind: 'survey', color: '#E8920C' },
  reflection: { kind: 'survey', color: '#E8920C' },
  quiz: { kind: 'test', color: '#5BA63C' },
  exam: { kind: 'test', color: '#5BA63C' },
  evaluation: { kind: 'test', color: '#5BA63C' },
  promptlab: { kind: 'lab', color: '#FB2832' },
  prompt_catalog: { kind: 'lab', color: '#D97757' },   // Prompt Lab — Claude Code practice-prompt catalog
  build_artifacts: { kind: 'lab', color: '#D97757' },   // Build Artifact(s) Lab — Claude Code build station
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
  setup_lab: { kind: 'setuplab', color: '#D97757' },   // Claude Code enablement lab (dark, get-unblocked)
};
export const visualFor = (band: string): Visual => BAND[band] || { kind: 'reading', color: '#367895' };

// Curriculum types that run IN Claude Code — the tile shows a "Claude Code" corner
// strip so a student knows they'll need Claude Code open to complete the activity.
export const CLAUDE_CODE_TYPES = new Set(['setup_lab', 'prompt_lab', 'implementation_task', 'artifact_submission', 'github_sync']);

const KIND_GRADIENT: Record<Kind, string> = {
  video: 'linear-gradient(135deg,#367895,#2E6A86)',
  skilljar: 'linear-gradient(135deg,#367895,#2E6A86)',
  lab: 'linear-gradient(135deg,#367895,#5BA63C)',
  test: 'linear-gradient(135deg,#5BA63C,#367895)',
  reading: 'linear-gradient(135deg,#2E6A86,#367895)',
  survey: 'linear-gradient(135deg,#E8920C,#FB2832)',
  event: 'linear-gradient(135deg,#FB2832,#C20E1E)',
  milestone: 'linear-gradient(135deg,#5BA63C,#3C7A26)',
  setuplab: 'linear-gradient(135deg,#22334f,#0c1322)',
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
    case 'setuplab': return <><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>;
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
  /** Comment button: jump straight into the card's workspace (where the cohort comments live). */
  onComments?: (card: TimelineFeedCard) => void;
  /** Workspace shortcut: open the card's full runtime workspace (video + AI Mentor + comments). */
  onWorkspace?: (card: TimelineFeedCard) => void;
  /** Compact mode: drop the tall media tile + description, keep the header and the
      social footer (likes / comments). Used for completed cards folded into the
      "Completed" section so finished work stops eating vertical space but the
      cohort can still like and comment on it. */
  compact?: boolean;
  likes?: number;
  liked?: boolean;
}

const TimelineCard: React.FC<Props> = ({ card, onOpen, onLike, onComplete, onWorkspace, compact = false, likes = 0, liked = false }) => {
  const v = visualFor(card.render_band);
  // Podcast with a direct audio episode: clicking the tile plays it RIGHT HERE —
  // and while playing, clicking the artwork toggles pause/play (the bar has the
  // native controls too).
  const podcastAudio = card.type === 'podcast' && card.video?.url && isAudioUrl(card.video.url) ? card.video.url : null;
  const [playingInline, setPlayingInline] = useState(false);
  const inlineAudioRef = useRef<HTMLAudioElement | null>(null);
  const toggleInline = () => {
    if (locked) return;
    if (!playingInline) { setPlayingInline(true); return; }
    const a = inlineAudioRef.current;
    if (a) { if (a.paused) { void a.play(); } else { a.pause(); } }
  };
  const done = card.status === 'completed';
  const locked = card.status === 'locked';
  const isSkillsJar = v.kind === 'skilljar';
  const pts = totalPoints(card.points);
  const metaLine = [card.estimated_time ? `${card.estimated_time} min` : null, card.difficulty].filter(Boolean).join(' · ');
  // Media/external cards keep their authored title casing; curriculum content
  // titles are Title-Cased for display.
  const externalTitle = v.kind === 'video' || isSkillsJar || ['testimonial', 'blog', 'podcast', 'announcement'].includes(card.type);
  const tc = (s: string) => (externalTitle ? s : toTitleCase(s));
  const shortTitle = tc((card.week_title || card.content?.title || card.title).replace(/^[^·]*· /, ''));

  // Poster background precedence: a card's OWN art wins — an explicit card
  // image (blog cover), the video's saved poster (incl. podcast episode art /
  // picked testimonial), a thumbnail DERIVED from the video URL (YouTube — so a
  // plain video card shows ITS video's image, never the generic banner), or a
  // blog card's post thumbnail; otherwise EVERY card defaults to its curriculum
  // type's AI banner (the Experience Studio thumbnail); the Design-E gradient
  // is the last-resort fallback. Darkened so the overlay text stays legible.
  // Playable = a real video/audio source is attached. Only playable cards get
  // the ▶ affordance — and ▶ plays INLINE in the tile (never opens the panel);
  // everything else shows an "Open" pill (right-panel intent).
  const source = parseVideoUrl(card.video?.url);
  const playable = !!source;
  const [showComments, setShowComments] = useState(false);
  const ownPoster =
    (card.image && card.image.trim()) ||
    card.video?.poster ||
    videoThumbnail(source) ||
    (card.type === 'blog' && card.blog?.thumbnail) || null;
  const posterUrl = ownPoster || card.type_thumbnail || null;
  const posterStyle: React.CSSProperties = posterUrl
    ? {
        backgroundImage: `linear-gradient(135deg,rgba(46,106,134,.5),rgba(20,24,27,.66)), url(${posterUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: KIND_GRADIENT[v.kind] };

  // ONE uniform 16:9 tile for EVERY card. Playable cards play INLINE on click
  // (the tile swaps to the live player — FB-style, no panel). The footer "Open"
  // button (and the Open pill on non-playable tiles) is the ONLY way to pull up
  // the right-side detail panel, where content/quiz/reflection render and the
  // SkillsJar course + certificate upload happen.
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
    // Clicking the tile opens the right panel (course details + certificate upload);
    // the chevron jumps straight to the external course. No separate "Open" overlay —
    // the footer "Open" button already opens the panel.
    <div
      className="mthumb skilljar" style={posterStyle}
      role="button" tabIndex={0}
      onClick={() => !locked && onOpen?.(card)}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !locked) { e.preventDefault(); onOpen?.(card); } }}
      aria-label={`Open ${card.title}`}
    >
      {watermark}
      <span className="mt-chip"><span className="sw" style={{ background: v.color }} />{card.student_label}</span>
      <span className="mt-meta"><b>{shortTitle}</b><span>{metaText}</span></span>
      <div className="mt-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mt-play" onClick={openCourseLink} aria-label={course?.url ? 'Go to the course' : 'Open course details'}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  ) : playable && !podcastAudio && playingInline ? (
    // The tile IS the player now (in-feed playback, no panel) — video embeds
    // (YouTube/Vimeo/…) and direct files. Ending playback auto-completes.
    // Direct audio episodes use the dedicated podcast tile below instead.
    <div className={`mthumb playing${card.type === 'testimonial' ? ' testimonial' : ''}`}>
      <VideoEmbed
        source={source}
        title={card.video?.title || shortTitle}
        poster={ownPoster || posterUrl}
        autoplay
        badge={card.type === 'testimonial' ? 'Testimonial' : card.type === 'podcast' ? 'Podcast' : null}
        onEnded={() => { setPlayingInline(false); if (!done) onComplete?.(card); }}
      />
    </div>
  ) : podcastAudio ? (
    // Podcast tile with a direct audio episode: clicking the artwork starts the
    // episode playing INLINE (the footer "Open" still opens the drawer, which
    // never autoplays). Two interactive elements ⇒ a <div> tile like skills_jar.
    <div
      className={`mthumb${done ? ' done' : ''}`} style={posterStyle} role="button" tabIndex={0}
      onClick={toggleInline}
      onKeyDown={(e) => {
        // Only claim Enter/Space BEFORE playback starts — once the player is up,
        // the native <audio> keyboard controls (space = pause) must win.
        if (!playingInline && (e.key === 'Enter' || e.key === ' ') && !locked) { e.preventDefault(); setPlayingInline(true); }
      }}
      aria-label={playingInline ? `Pause ${card.video?.title || card.title}` : `Play ${card.video?.title || card.title}`}
    >
      {watermark}
      <span className="mt-ribbon">Podcast</span>
      <span className="mt-chip"><span className="sw" style={{ background: v.color }} />{card.student_label}</span>
      {!playingInline && <span className="mt-meta"><b>{card.video?.title || shortTitle}</b><span>{metaText}</span></span>}
      {playingInline ? (
        // The control bar must own ALL its pointer/keyboard events — nothing may
        // bubble to the tile (which toggles playback) or steal the native controls.
        <span
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', left: 10, right: 10, bottom: 10, zIndex: 5, display: 'block' }}
        >
          <audio
            ref={inlineAudioRef}
            style={{ width: '100%' }} src={podcastAudio} controls autoPlay
            onEnded={() => { setPlayingInline(false); if (!done) onComplete?.(card); }}
          />
        </span>
      ) : (
        <span className="mt-open">{done
          ? <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          : <svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}</span>
      )}
    </div>
  ) : (
    <button
      type="button"
      className={`mthumb${done ? ' done' : ''}${card.type === 'testimonial' ? ' testimonial' : ''}${card.type === 'blog' ? ' blog' : ''}`}
      style={posterStyle}
      onClick={() => !locked && (playable ? setPlayingInline(true) : onOpen?.(card))}
      aria-label={playable ? `Play ${card.video?.title || card.title}` : `Open ${card.title}`}
    >
      {watermark}
      {CLAUDE_CODE_TYPES.has(card.type) && <span className="mt-ribbon" style={{ background: 'linear-gradient(90deg,#D97757,#C4633A)' }}>Claude Code</span>}
      {card.type === 'testimonial' && <span className="mt-ribbon">Testimonial</span>}
      {card.type === 'podcast' && <span className="mt-ribbon">Podcast</span>}
      {card.type === 'blog' && <span className="mt-ribbon blue">Blog</span>}
      <span className="mt-chip"><span className="sw" style={{ background: v.color }} />{card.student_label}</span>
      <span className="mt-meta"><b>{card.video?.title || card.blog?.title || shortTitle}</b><span>{metaText}</span></span>
      {/* Corner affordance: ✓ when done, ▶ when the card can play inline. A
          NON-playable tile shows nothing here — the single "Open" lives in the
          footer, so a card never carries two Open buttons. */}
      {done
        ? <span className="mt-open"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
        : playable
          ? <span className="mt-open"><svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
          : null}
    </button>
  );

  return (
    <div className={`tl-card fcard${locked ? ' locked' : ''}${compact ? ' compact' : ''}`}>
      <div className="fc-head">
        <span className="ico" style={{ background: v.color }}><svg viewBox="0 0 24 24" fill="none"><Icon kind={v.kind} /></svg></span>
        <div style={{ minWidth: 0 }}>
          <div className="ttl">{tc(card.week_title || card.content?.title || card.title)}</div>
          <div className="sub">
            <span className={`tl-chip ${v.kind === 'skilljar' || v.kind === 'survey' ? 'cert' : 'learning'}`} style={{ padding: '2px 9px' }}><span className="sw" />{card.student_label}</span>
            {pts > 0 && <span className={`tl-ptbadge${done ? ' earned' : ''}`}>+{pts} pts</span>}
          </div>
        </div>
        <span className="st-ic"><StatePip status={card.status} /></span>
      </div>
      {/* Compact completed card reads like a regular (smaller) feed post: keep the
          text, drop the big 16:9 media tile. The body is skipped entirely only
          when a compact card has no description to show. */}
      {(!compact || card.description) && (
      <div className="fc-body">
        {card.description && <p>{card.description}</p>}
        {/* Locked: a big lock over the tile, dimmed, and an overlay that swallows
            every pointer/keyboard interaction so nothing opens or plays. */}
        {!compact && (
        <div className="fc-media-wrap">
          {media}
          {locked && (
            <div className="fc-lock" role="note" aria-label={`Locked${card.lock_reason ? ` — complete ${card.lock_reason} first` : ''}`}>
              <span className="fc-lock-ic"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="15.5" r="1.5" fill="currentColor" /></svg></span>
              <span className="fc-lock-txt">Locked</span>
              {card.lock_reason && <span className="fc-lock-sub">Complete {card.lock_reason} to unlock</span>}
            </div>
          )}
        </div>
        )}
      </div>
      )}
      <div className="fc-foot">
        <button type="button" className={`like${liked ? ' liked' : ''}`} disabled={locked} onClick={() => !locked && onLike?.(card)}>
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'}><path d="M12 21s-7-4.5-9.5-9C.8 8.5 2.5 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.5 0 5.2 3.5 3.5 7C19 16.5 12 21 12 21z" stroke="currentColor" strokeWidth="2" /></svg> {likes}
        </button>
        {/* Comment opens the class thread RIGHT HERE in the feed (the workspace
            shows the same thread beside the AI Mentor). Disabled while locked. */}
        <button type="button" className={`cmt${showComments ? ' liked' : ''}`} disabled={locked} onClick={() => !locked && setShowComments((s) => !s)}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Comment
        </button>
        {/* Quick shortcut into the full workspace (video + AI Mentor + comments). */}
        {onWorkspace && !locked && (
          <button type="button" className="cmt" onClick={() => onWorkspace(card)}>
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 20h8M12 17v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> Workspace
          </button>
        )}
        <span className="spacer" />
        {done
          ? <span className="pip done" style={{ fontSize: 13 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed · +{pts} pts</span>
          : locked
            ? <span className="pip lock" style={{ fontSize: 13 }} title={card.lock_reason || undefined}>{card.lock_reason || 'Unlocks later'}</span>
            : <button type="button" className={`fc-cta ${v.kind === 'lab' ? 'cherry' : 'berry'}`} onClick={() => { setPlayingInline(false); onOpen?.(card); }}>
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> {v.kind === 'lab' ? 'Start' : 'Open'}
              </button>}
      </div>
      {/* The class thread — toggled by the Comment button, shared with the workspace. Never for locked cards. */}
      {showComments && !locked && <div style={{ padding: '0 18px 14px' }}><CardComments cardId={card.id} /></div>}
    </div>
  );
};

export default TimelineCard;
