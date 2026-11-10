import React, { useEffect, useRef, useState } from 'react';
import portalApi from '../../utils/portalApi';
import { TimelineFeedCard } from './TimelineCard';
import VideoEmbed, { WatchBeatPayload, type WatchBeatMeta } from './VideoEmbed';
import SkillsJarPanel from './SkillsJarPanel';
import { parseVideoUrl, videoThumbnail } from '../../utils/videoEmbed';
import { runtimeApi } from '../../pages/portal/runtime/runtimeApi';
import CardSurveyExperience from './CardSurveyExperience';
import PeerWinsPanel from './PeerWinsPanel';
import CommunityThreadPanel from './CommunityThreadPanel';
import { ambientMediaOf } from './ambientMedia';
import AssessmentPanel from '../../pages/portal/runtime/AssessmentPanel';
import { toTitleCase } from '../../utils/titleCase';
import { useReaderProgress } from './useReaderProgress';
import { useDeepDiveHost } from './useDeepDiveHost';
import { useBlogReadGate } from './useBlogReadGate';
import { useDwellGate, isDwellGatedCard } from './useDwellGate';
import { useWatchVerdict, isWatchBlocked, watchGateLabel } from './useWatchVerdict';
import { useAutoCollectOnWatchMet } from './useAutoCollectOnWatchMet';
import VideoWinCelebration, { type NextLesson } from './VideoWinCelebration';

/** Tiny stable string hash — varies the dwell Collect button placement per card. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
import SetupLabRender from './SetupLabRender';
import PromptCatalogRender from './PromptCatalogRender';
import ClaudeStudioRender from './ClaudeStudioRender';
import ArchitectTimeMachine from './ArchitectTimeMachine';
import BuildArtifactsRender from './BuildArtifactsRender';
import ReflectionReview from './ReflectionReview';

/**
 * CardDetailBody — the SINGLE source of truth for "what the student sees" for a
 * card. Rendered by the student drawer (CardDetailDrawer), the Experience Studio
 * preview, and the Timeline editor preview — so those can never diverge again.
 *
 * The lesson content is admin-populated and expires after 30 days; the first
 * student to open a card past that window regenerates it once (server-side,
 * class-wide). `preview` (admin contexts) disables the live-only calls
 * (content refresh, auto-complete, Enter-workspace nav).
 */

export function totalPoints(p: TimelineFeedCard['points']): number {
  return (p.learning || 0) + (p.builder || 0) + (p.community || 0);
}

import { lessonDoc, readerDoc, READER_SANDBOX } from './cardDocs';
export { lessonDoc, blogReaderDoc, readerDoc, READER_SANDBOX, type ReaderOpts } from './cardDocs';

/** C116: `keepOpen` asks the host not to close the drawer, because the learner is still watching (auto-collect at the watch bar). */
export interface CompleteOpts { keepOpen?: boolean }

interface Props {
  card: TimelineFeedCard;
  preview?: boolean;                       // admin: disable live calls + nav
  onComplete?: (opts?: CompleteOpts) => Promise<void> | void; // real drawer: mark complete (also on video end)
  onEnterWorkspace?: () => void;           // real drawer: navigate to the runtime
  onClose?: () => void;                    // real drawer: the header × button
  autoplayVideo?: boolean;                 // drawer contexts: the open click was the play intent — start the video immediately
  firstWinPending?: boolean;               // C117: the learner has no first win yet, so a collect here is it
  next?: NextLesson | null;                // C117: the lesson the celebration offers after an auto-collect
}

const GEN_STEPS = ['Reading this week\'s blueprint…', 'Drafting the sections…', 'Adding examples and key terms…', 'Formatting your reading…'];

/** Animated "producing your reading" state shown full-bleed while an empty Self
 *  Study card generates its content on first open (the server call is in flight). */
const GeneratingReader: React.FC = () => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % GEN_STEPS.length), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ssgen">
      <div className="ssgen-orb"><span /><span /><span /></div>
      <div className="ssgen-title">Producing your Self Study reading…</div>
      <div className="ssgen-step">{GEN_STEPS[i]}</div>
      <div className="ssgen-bar"><i /></div>
      <div className="ssgen-note">This runs once for your whole cohort — the next person to open it sees it instantly.</div>
    </div>
  );
};

const CardDetailBody: React.FC<Props> = ({ card, preview, onComplete, onEnterWorkspace, onClose, autoplayVideo, firstWinPending, next }) => {
  // The admin-populated lesson content is the single source of notes. It expires
  // after 30 days; on open (live only) we ask the server to ensure it's fresh —
  // the first student past 30 days triggers a class-wide regenerate. Until that
  // returns, show whatever the feed already carried.
  const [content, setContent] = useState<TimelineFeedCard['content']>(card.content || null);
  const [generating, setGenerating] = useState(false);
  useEffect(() => { setContent(card.content || null); }, [card.id, card.content]);
  useEffect(() => {
    if (preview) return;
    // Testimonials + podcasts + blogs present the picked item's own description — never AI lesson notes.
    if (card.type === 'testimonial' || card.type === 'podcast' || card.type === 'blog') return;
    const reader = card.render_band === 'warmup';   // Self Study: generates on first open when empty
    // Content-bearing: video bands, anything with content, OR a Self Study reader
    // (an empty reader asks the server to produce the reading now).
    const contentBearing = ['media', 'live_class', 'video_feedback'].includes(card.render_band) || !!card.content || reader;
    if (!contentBearing) return;
    let alive = true;
    if (reader && !card.content) setGenerating(true);   // empty reader → show the producing animation
    portalApi.post(`/api/portal/runtime/cards/${card.id}/content`, {})
      .then((r) => { if (alive && r.data?.content) setContent(r.data.content); })
      .catch(() => { /* keep showing whatever we already had */ })
      .finally(() => { if (alive) setGenerating(false); });
    return () => { alive = false; };
  }, [card.id, card.render_band, card.content, card.type, preview]);

  const source = parseVideoUrl(card.video?.url);
  const isVideo = ['media', 'live_class', 'video_feedback'].includes(card.render_band);
  const isSkillsJar = card.render_band === 'skills_jar';
  const isSurvey = card.render_band === 'survey';   // bespoke live survey experience
  const isAssessment = card.render_band === 'quiz' || card.render_band === 'evaluation';   // interactive Knowledge Check / Evaluation
  const isReader = card.render_band === 'warmup';   // Self Study: immersive reader (sticky nav + scrollspy + progress)
  // Deep Dive Command Center: a self-contained HTML artifact rendered in a sandboxed
  // iframe. `blog` shares the 'deepdive' band, so gate on type to not hijack it.
  const isDeepDive = card.render_band === 'deepdive' && card.type === 'deep_dive';
  const isSetupLab = card.render_band === 'setup_lab';   // Claude Code enablement lab: dark native panel + Copy button
  const isClaudeStudio = card.render_band === 'claude_studio';   // Claude Studio: four-stage Claude.ai loop + submission (bespoke renderer)
  const isPromptCatalog = card.render_band === 'prompt_catalog';   // Prompt Lab: practice-prompt catalog (categories + reveal + copy)
  const isArchitectMindset = card.render_band === 'architect_mindset';   // The Architect Time Machine: cinematic decision simulation (bespoke renderer)
  const isBuildArtifacts = card.render_band === 'build_artifacts';   // Build Artifact(s) Lab: pick artifact + project, build station
  const isPeerWins = card.render_band === 'peer_wins';   // Community Discussion → Cohort Wins grid (post a win + cheer classmates)
  // A Today-feed community POST, not a curriculum card: `card.id` is the feed ref
  // (`community:<uuid>`), which no card-scoped endpoint can resolve. It opens its
  // own discussion thread, and the card-scoped footer actions stay off.
  const isCommunityPost = !!card.community_post_id;
  const isReflection = card.render_band === 'reflection';   // Week in Review: per-student recap + strategic-signal capture (bespoke renderer)
  const blog = card.type === 'blog' ? card.blog || null : null;   // fixed or auto-matched post
  // Media/external cards carry their own authored title casing; only curriculum
  // content titles get Title-Cased for display.
  const externalTitle = isVideo || isSkillsJar || ['testimonial', 'blog', 'podcast', 'announcement'].includes(card.type);
  // C116: collected at the watch bar while the drawer stays open. C117: what the celebration says (first win or not).
  const [autoWin, setAutoWin] = useState<{ firstWin: boolean } | null>(null);
  useEffect(() => { setAutoWin(null); }, [card.id]);
  const done = card.status === 'completed' || !!autoWin;
  const pts = totalPoints(card.points);
  const presenter = card.video?.presenter || null;
  const duration = card.estimated_time ? `${card.estimated_time} min` : null;

  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [copyGateMet, setCopyGateMet] = useState(false);   // Claude Code labs (drawer): reveal completion once the prompt(s) are copied — phone users complete here
  useEffect(() => { setGateMsg(null); }, [card.id]);
  const live = !preview && !done;
  // Ambient podcast/testimonial items (ref `podcast:<id>`) have no card row, so
  // their beats go to the ambient media gate rather than the card watch gate —
  // same verdict shape, same 75% bar, different key. See ambientMedia.ts.
  const ambientMedia = ambientMediaOf(card);
  // Server-truth watch gate (video/testimonial/podcast), fetched the moment the
  // drawer opens so Collect starts DIMMED (null = still checking), then refreshed
  // by each heartbeat. Ambient items may already have crossed 75% on the tile's
  // inline player. The server enforces regardless.
  const watchKey = live && (ambientMedia || (isVideo && source)) ? (ambientMedia ? `${ambientMedia.kind}:${ambientMedia.id}` : card.id) : null;
  const [watch, setWatch] = useWatchVerdict(watchKey, () => (ambientMedia
    ? runtimeApi.mediaVerdict(ambientMedia.kind, ambientMedia.id)
    : runtimeApi.watchVerdict(card.id)));
  // Beat reporting deliberately does NOT stop at completion. `live` still gates
  // the gate UI (a completed card has nothing left to unlock), but tying the
  // heartbeat to it froze watched_pct the instant a student collected their
  // points at the 75% threshold: `done` flipped, this went undefined, and
  // VideoEmbed's tracking effect tears down when onWatchBeat is absent. The
  // student kept watching to 100% and the stored value stayed at 75, so every
  // downstream consumer of "how much was actually watched" (completion
  // analytics, engagement-depth reporting) read a number that was capped at the
  // unlock threshold rather than measured. Preview is still excluded: admin
  // previews must never write progress.
  const reportBeats = !preview;
  const handleWatchBeat = reportBeats
    ? (beat: WatchBeatPayload, meta?: WatchBeatMeta) => {
        const exiting = !!meta?.exiting;   // C119: leaving the page, so the beat goes out as keepalive
        const req = ambientMedia
          ? runtimeApi.mediaWatch(ambientMedia.kind, ambientMedia.id, beat, exiting)
          : runtimeApi.watch(card.id, beat, exiting);
        req.then(setWatch).catch(() => { /* best-effort heartbeat */ });
      }
    : undefined;
  const completeSafely = onComplete
    ? async () => {
        setGateMsg(null);
        try { await onComplete(); if (onClose) window.setTimeout(onClose, 1200); }   // completing takes the student back to the curriculum
        catch (err: any) { setGateMsg(err?.response?.data?.error || 'Not quite yet — keep watching to unlock your points.'); }
      }
    : undefined;
  const gateActive = watch?.required_pct != null;
  const watchLabel = watchGateLabel(watch, 'Collect points');   // null = met → open to click
  // C116: crossing the watch bar while playing collects the points itself (same call as the button below), without closing the
  // drawer, so the learner keeps watching. Same conditions as the button; on failure the button and the message remain.
  useAutoCollectOnWatchMet(watch, live && isVideo && !!source && pts > 0 && !!onComplete, async () => {
    setGateMsg(null);
    const firstWin = !!firstWinPending;   // read before the collect: the host re-reads first_win right after it
    try { await onComplete?.({ keepOpen: true }); setAutoWin({ firstWin }); }
    catch (err: any) { setGateMsg(err?.response?.data?.error || 'Not quite yet — keep watching to unlock your points.'); }
  });

  // Self Study gating: the reader iframe reports per-section read-progress (>=5s dwell
  // each); the Mark Complete button appears only once every section is read. Enforced
  // fresh each open (no persisted completion). Enabled for live reader cards (not preview).
  const readerProg = useReaderProgress(card.id, isReader && !preview);

  // Blog 2-minute read gate: ambient blogs (ref `blog:<id>`) award points once the
  // student has spent ~2 continuous minutes with the post open. Armed by clicking
  // "Read the post"; a heartbeat accrues dwell and the server enforces the bar.
  const blogId = card.type === 'blog' && card.id.startsWith('blog:') ? card.id.slice('blog:'.length) : null;
  const blogGate = useBlogReadGate(live ? blogId : null);
  const blogReadPct = Math.min(100, Math.round(((blogGate.state?.read_s ?? 0) / (blogGate.state?.required_s || 120)) * 100));

  // Generic dwell gate: passive-content types (intel / reflection / discussion /
  // study / Q&A) award points but have no other criteria, so the Collect button
  // only appears after N continuous seconds with the card open (resets if you
  // leave). The button placement is varied per card so it can't be muscle-memory'd.
  const dwellGated = live && isDwellGatedCard(card);
  const dwell = useDwellGate(dwellGated ? card.id : null, dwellGated);
  const dwellPct = Math.min(100, Math.round(((dwell?.dwell_s ?? 0) / (dwell?.required_s || 120)) * 100));
  const dwellAlign = (['flex-start', 'center', 'flex-end'] as const)[Math.abs(hashStr(card.id)) % 3];

  // Deep Dive host bridge: the Field Guide iframe (opaque-origin) can't persist or
  // reach the API, so the host owns read/copy persistence (restored across reopens),
  // the +100-point upload, and the Mark-complete gate (dd.complete folds read+copy+upload).
  const ddIframeRef = useRef<HTMLIFrameElement>(null);
  const dd = useDeepDiveHost(card.id, isDeepDive && !preview && !done, ddIframeRef);

  return (
    <>
      <div className="tld-head">
        <div className="tld-crumbs">{card.student_label}{card.week != null ? ` · Week ${card.week}` : ''}</div>
        {onClose && (
          <button type="button" className="tld-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>

      <div className={`${isReader || isDeepDive ? 'tld-body tld-body--reader' : 'tld-body'}${isSetupLab ? ' tld-body--setuplab' : ''}${isPromptCatalog ? ' tld-body--promptcatalog' : ''}${isClaudeStudio ? ' tld-body--claudestudio' : ''}${isArchitectMindset ? ' tld-body--architect' : ''}${isBuildArtifacts ? ' tld-body--buildartifacts' : ''}`}>
        {isReader ? (
          content?.body_html
            ? <iframe className="tld-lessonframe tld-readerframe" title="Self Study reading" sandbox={READER_SANDBOX} srcDoc={readerDoc(content.body_html, content.title || card.title, { cardId: card.id, doneIds: readerProg.initialDoneIds })} />
            : generating
              ? <GeneratingReader />
              : <div className="tld-note" style={{ margin: 20 }}>This reading has not been added yet.</div>
        ) : isDeepDive ? (
          content?.body_html
            ? <iframe ref={ddIframeRef} className="tld-lessonframe tld-readerframe" title="Field Guide" sandbox="allow-scripts allow-modals" srcDoc={content.body_html} />
            : <div className="tld-note" style={{ margin: 20 }}>This Field Guide has not been added yet.</div>
        ) : isSetupLab ? (
          content && content.body_html
            ? <SetupLabRender bodyHtml={content.body_html} title={content.title || card.title} summary={content.summary} estMin={card.estimated_time} points={pts} difficulty={card.difficulty} variant="drawer" onCopied={() => setCopyGateMet(true)} />
            : generating
              ? <GeneratingReader />
              : <div className="tld-note" style={{ margin: 20 }}>This lab has not been generated yet.</div>
        ) : isPromptCatalog ? (
          content && content.body_html
            ? <PromptCatalogRender bodyHtml={content.body_html} title={content.title || card.title} summary={content.summary} variant="drawer" onAllCopied={() => setCopyGateMet(true)} />
            : generating
              ? <GeneratingReader />
              : <div className="tld-note" style={{ margin: 20 }}>This prompt catalog has not been generated yet.</div>
        ) : isClaudeStudio ? (
          content && content.body_html
            ? <ClaudeStudioRender bodyHtml={content.body_html} title={content.title || card.title} summary={content.summary} estMin={card.estimated_time} points={pts} difficulty={card.difficulty} variant="drawer" cardId={card.id} completed={done} preview={preview} onCopied={() => setCopyGateMet(true)} onSubmitted={completeSafely} />
            : generating
              ? <GeneratingReader />
              : <div className="tld-note" style={{ margin: 20 }}>This studio has not been generated yet.</div>
        ) : isArchitectMindset ? (
          <ArchitectTimeMachine cardId={card.id} variant="drawer" preview={preview} completed={done} onEnterWorkspace={onEnterWorkspace} />
        ) : isBuildArtifacts ? (
          content && content.body_html
            ? <BuildArtifactsRender bodyHtml={content.body_html} title={content.title || card.title} summary={content.summary} variant="drawer" cardId={card.id} completed={done} onComplete={completeSafely} />
            : generating
              ? <GeneratingReader />
              : <div className="tld-note" style={{ margin: 20 }}>This build station has not been generated yet.</div>
        ) : isCommunityPost ? (
          <CommunityThreadPanel postId={card.community_post_id as string} fallbackLabel={card.student_label} preview={preview} variant="drawer" />
        ) : isPeerWins ? (
          <PeerWinsPanel cardId={card.id} preview={preview} />
        ) : isReflection ? (
          <ReflectionReview cardId={card.id} variant="drawer" preview={preview} />
        ) : (<>
        <div className="tld-chiprow">
          <span className="tl-chip learning"><span className="sw" />{card.student_label}</span>
          {pts > 0 && <span className={`tl-ptbadge${done ? ' earned' : ''}`}>+{pts} pts</span>}
          {done && <span className="pip done" style={{ fontSize: 13 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed</span>}
        </div>

        <h2 className="tld-title">{externalTitle
          ? (card.video?.title || card.blog?.title || card.week_title || content?.title || card.title)
          : toTitleCase(card.week_title || content?.title || card.title)}</h2>

        <div className="tld-meta">
          {presenter && <span><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{presenter}</span>}
          {duration && <span><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{duration}</span>}
          <span className="tld-diff">{card.difficulty}</span>
        </div>

        {isVideo && (
          <div className="tld-player">
            {source ? (
              <VideoEmbed
                key={card.id}
                source={source}
                title={card.video?.title || card.title}
                poster={card.video?.poster || videoThumbnail(source) || card.type_thumbnail || null}
                autoplay={autoplayVideo}
                badge={card.type === 'testimonial' ? 'Testimonial' : card.type === 'podcast' ? 'Podcast' : null}
                onEnded={done || preview ? undefined : completeSafely}
                onWatchBeat={handleWatchBeat}
                fallbackDurationS={card.video?.duration_seconds || (card.estimated_time ? card.estimated_time * 60 : null)}
              />
            ) : (card.image || card.type_thumbnail) ? (
              // No clip attached yet — show the card's image (own image, else the
              // type's banner) instead of an empty dashed box; the note below
              // still tells admins where to attach the video.
              <img className="tld-hero" style={{ marginBottom: 0 }} src={(card.image || card.type_thumbnail) as string} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <VideoEmbed source={null} title={card.title} />
            )}
            {live && source && (
              <div className="tlv-watch">
                <div className="tlv-watchbar"><i style={{ width: `${Math.min(100, watch?.watched_pct ?? 0)}%` }} /></div>
                <span className="tlv-watchpct">
                  {gateActive
                    ? (watch?.met
                        ? '✓ Watched — points unlocked'
                        : `Watched ${watch?.watched_pct ?? 0}% · reach ${watch?.required_pct}% to collect your points`)
                    : `Watched ${watch?.watched_pct ?? 0}%`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* The type's Studio thumbnail is NOT repeated at the top of the drawer —
            it already shows on the classroom tile, so a hero here is redundant
            (Ali 2026-07-19). Video/blog keep their own visual below. */}

        {/* Non-video items with their OWN image (blog cover etc.) show it as a hero. */}
        {!isVideo && card.image && (
          <img className="tld-hero" src={card.image} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}

        {isSkillsJar && <SkillsJarPanel card={card} preview={preview} onComplete={onComplete} />}

        {blog && (
          <div className="tld-player">
            {/* Article header — the post thumbnail with the Blog ribbon + title; clicking opens the post. */}
            <a className="tlv-frame tlv-poster tlv-bloglink" href={blog.url} target="_blank" rel="noopener noreferrer" aria-label={`Read: ${blog.title || card.title}`}>
              {blog.thumbnail && <img className="tlv-posterimg" src={blog.thumbnail} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
              <span className="tlv-postergrad" />
              <span className="tlv-ribbon blue">Blog</span>
              <span className="tlv-bigplay"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              {(blog.title || card.title) && <span className="tlv-postertitle">{blog.title || card.title}</span>}
            </a>
          </div>
        )}

        {/* Survey: the bespoke live experience — the student takes it right here
            and submitting completes the assignment. Replaces the read-only body. */}
        {isSurvey && (
          <CardSurveyExperience
            cardId={card.id}
            questions={(content?.questions as string[]) || []}
            openPrompt={content?.reflection || null}
            title={content?.title || card.title}
            preview={preview}
            completed={done}
            onComplete={preview ? undefined : completeSafely}
          />
        )}

        {/* Knowledge Check + Evaluation — the interactive assessment, taken right
            here (real students score + persist; the Studio preview uses sample
            questions). Replaces the read-only lesson/about, like the survey does. */}
        {isAssessment && (
          <AssessmentPanel cardId={card.id} preview={preview} kind={card.render_band === 'evaluation' ? 'evaluation' : 'quiz'} />
        )}

        {!isSurvey && !isAssessment && (
        <div className="tld-about">
          {(isVideo || blog) && <div className="tld-lab">About this {blog ? 'post' : source ? 'video' : 'activity'}</div>}
          {card.description
            ? <p className="tld-desc">{card.description}</p>
            : <p className="tld-desc muted">No description yet.</p>}
          <div className="tld-facts">
            {presenter && <span><b>Presenter</b>{presenter}</span>}
            {duration && <span><b>Length</b>{duration}</span>}
            {pts > 0 && <span><b>Points</b>+{pts} pts</span>}
            {card.difficulty && <span><b>Level</b>{card.difficulty}</span>}
          </div>
        </div>
        )}

        {!isSurvey && !isAssessment && card.type !== 'testimonial' && card.type !== 'blog' && content && (content.summary || content.body_html || (content.questions && content.questions.length > 0) || content.reflection) && (
          <div className="tld-lesson">
            <div className="tld-lab">{isVideo ? 'Lesson notes' : 'Lesson'}</div>
            {content.summary && <p className="tld-desc">{content.summary}</p>}
            {content.body_html && <iframe
              className={isReader ? 'tld-lessonframe tld-readerframe' : 'tld-lessonframe'}
              title="Lesson content"
              // Generic content: allow-same-origin (no scripts) so we can size the
              // frame to its content and avoid a second inner scroll — the drawer
              // is the single scroll. The reader keeps its own scripted scroll.
              // Intel cards (AI News Flash etc.) embed a real source <a href>; without
              // allow-popups the sandbox silently swallows the click (no console error).
              sandbox={isReader ? 'allow-scripts' : card.render_band === 'intel' ? 'allow-same-origin allow-popups' : 'allow-same-origin'}
              srcDoc={isReader ? readerDoc(content.body_html) : lessonDoc(content.body_html)}
              onLoad={isReader ? undefined : (e) => {
                const f = e.currentTarget;
                try {
                  const h = f.contentWindow?.document.body?.scrollHeight;
                  if (h) f.style.height = `${h + 4}px`;
                } catch { /* cross-origin/measure failed — keep the CSS height fallback */ }
              }}
            />}
            {Array.isArray(content.questions) && content.questions.length > 0 && (
              <><div className="tld-sublab">Questions to consider</div>
                <ul className="tld-alist">{content.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>
            )}
            {content.reflection && (
              <><div className="tld-sublab">Reflect</div>
                <p className="tld-desc">{content.reflection}</p></>
            )}
          </div>
        )}

        {isVideo && (
          <div className="tld-note">
            {source
              ? 'Watch the video, then mark it complete to earn your points.'
              : 'No video link is attached to this card yet. An admin can add one from Orchestration → Timeline.'}
          </div>
        )}

        {blog && (
          <div className="tld-note" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a className="tl-btn primary sm" href={blog.url} target="_blank" rel="noopener noreferrer" onClick={() => { if (blogId) blogGate.start(); }}>
              Read the post
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            {blogId
              ? (blogGate.started
                  ? (blogGate.state?.met
                      ? <span style={{ color: '#5BA63C', fontWeight: 600 }}>✓ Read — collect your points below</span>
                      : <span>Keep the post open — {blogGate.state?.read_s ?? 0}s of {blogGate.state?.required_s ?? 120}s read to unlock your points</span>)
                  : <span>Open the post and read for ~2 minutes, then collect your points below.</span>)
              : <span>Read it on the Colaberry blog, then mark this complete to earn your points.</span>}
            {blogId && blogGate.started && !blogGate.state?.met && (
              <div style={{ flexBasis: '100%', height: 6, borderRadius: 3, background: 'rgba(0,0,0,.10)', overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: `${blogReadPct}%`, background: '#367895', transition: 'width .5s ease' }} />
              </div>
            )}
          </div>
        )}
        {card.type === 'blog' && !blog && (
          <div className="tld-note">No blog post is attached to this card yet. It will auto-match once the blog library is loaded.</div>
        )}
        {/* Generic dwell gate: passive-content types must be read for N continuous
            seconds before Collect appears. The button's horizontal placement is
            varied per card (left/center/right) so it can't be muscle-memory'd —
            you have to look for it. */}
        {dwellGated && (
          <div style={{ display: 'flex', justifyContent: dwell?.met ? dwellAlign : 'stretch', marginTop: 6 }}>
            {dwell?.met && completeSafely ? (
              <button type="button" className="tl-btn primary" onClick={completeSafely}>Collect +{pts} pts</button>
            ) : (
              <div className="tld-note" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>Read through it — {dwell?.dwell_s ?? 0}s of {dwell?.required_s ?? 120}s before you can collect your points.</span>
                {completeSafely && <button type="button" className="tl-btn primary" disabled title="Stay with this to collect your points" style={{ marginLeft: 'auto' }}>Collect +{pts} pts</button>}
                <div style={{ flexBasis: '100%', height: 6, borderRadius: 3, background: 'rgba(0,0,0,.10)', overflow: 'hidden' }}>
                  <i style={{ display: 'block', height: '100%', width: `${dwellPct}%`, background: '#367895', transition: 'width .5s ease' }} />
                </div>
              </div>
            )}
          </div>
        )}
        </>)}
      </div>

      <div className="tld-foot">
        {done && autoWin
          ? <VideoWinCelebration pts={pts} firstWin={autoWin.firstWin} next={next} onClose={onClose} />
          : done
          ? <span className="pip done" style={{ fontSize: 14 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed · +{pts} pts earned</span>
          : preview
            ? (onEnterWorkspace
                // Admin "Student view": show the SAME "Enter workspace →" CTA the
                // student gets, in the same footer spot, wired to open the workspace.
                ? <button type="button" className="tl-btn primary" onClick={onEnterWorkspace}>Enter workspace →</button>
                : <span className="tld-note" style={{ padding: '8px 12px' }}>For students, this footer has <b>Close</b> and <b>Enter workspace →</b> (the full activity + AI Mentor).</span>)
            : (
              <>
                {gateMsg && <span className="tld-gatemsg">{gateMsg}</span>}
                {isReader && !readerProg.complete && readerProg.total > 0 && (
                  <span className="tld-gatemsg">{readerProg.done} of {readerProg.total} sections read</span>
                )}
                {isDeepDive && !dd.complete && dd.total > 0 && (
                  <span className="tld-gatemsg">{dd.done} of {dd.total} sections read</span>
                )}
                {isDeepDive && dd.message && <span className="tld-gatemsg">{dd.message}</span>}
                {(isSetupLab || isPromptCatalog) && !copyGateMet && completeSafely && <span className="tld-gatemsg">{isPromptCatalog ? 'Copy all the prompts to complete this lab' : 'Copy the prompt to complete this lab'}</span>}
                {/* The guide's "Choose HTML file" button posts to the host; this hidden
                    input is the real picker the host opens for the +100-point upload. */}
                {isDeepDive && <input ref={dd.fileInputRef} type="file" accept=".html,.htm,text/html" hidden onChange={dd.onFileChange} />}
                {onClose && <button type="button" className="tl-btn ghost" onClick={onClose}>Close</button>}
                {/* Media cards collect points here, gated by the server's watch check.
                    When the gate is active but unmet, the button is disabled with the
                    remaining %; the server enforces the same rule regardless.

                    `pts > 0` keeps this drawer honest with the feed tile, which only
                    offers "Collect +N pts" when totalPoints(card.points) > 0 and shows
                    "Open" otherwise. Synthesized feed cards (testimonial, podcast and
                    community items are built per-request and never stored in
                    timeline_cards) carry no points object at all, so without this test
                    the tile said "Open" and the drawer promised "Collect points" for
                    points that do not exist. Reported by Swati Raman, 2026-08-25. */}
                {isVideo && source && completeSafely && pts > 0 && (
                  <button
                    type="button"
                    className="tl-btn primary"
                    onClick={completeSafely}
                    disabled={isWatchBlocked(watch)}
                    title={watch == null ? 'Checking how much you have watched' : isWatchBlocked(watch) ? `Reach ${watch.required_pct}% watched to collect your points` : undefined}
                  >
                    {watchLabel ?? 'Collect points'}
                  </button>
                )}
                {/* Blog: collect after the 2-minute read gate is met (server enforces). */}
                {blog && blogId && completeSafely && pts > 0 && (
                  <button
                    type="button"
                    className="tl-btn primary"
                    onClick={completeSafely}
                    disabled={!blogGate.state?.met}
                    title={!blogGate.state?.met ? 'Read the post for ~2 minutes to collect your points' : undefined}
                  >
                    {blogGate.state?.met ? `Collect +${pts} pts` : `Read to collect · ${blogGate.state?.read_s ?? 0}/${blogGate.state?.required_s ?? 120}s`}
                  </button>
                )}
                {/* Survey completes in-body via its own Submit; the workspace link
                    stays as a quiet secondary, not the primary CTA. */}
                {/* Architect Time Machine renders its own "Enter the Time Machine" CTA in-panel (drawer variant). */}
                {/* A community post has no workspace and nothing to complete — both
                    actions address a card id it does not have. The thread is the
                    whole destination, so the drawer closes on Close alone. */}
                {onEnterWorkspace && !isArchitectMindset && !isCommunityPost && <button type="button" className={`tl-btn ${(isVideo && source) || isSurvey || isReader || isDeepDive || isPeerWins || isReflection || !!blog || dwellGated ? 'ghost' : 'primary'}`} onClick={onEnterWorkspace}>Enter workspace →</button>}
                {/* Peer Wins: posting is optional, so completion stays a plain Mark
                    complete here (and in the workspace bar) — never gated on posting. */}
                {isPeerWins && !isCommunityPost && completeSafely && (
                  <button type="button" className="tl-btn primary" onClick={completeSafely}>Mark complete</button>
                )}
                {/* Gated completions show the button DIMMED until the requirement is met
                    (never hidden, never clickable early): Self Study = every section read
                    (>=5s each), Deep Dive = the guide's steps, labs = prompt(s) copied. */}
                {isReader && completeSafely && (
                  <button type="button" className="ss-complete-btn" disabled={!readerProg.complete} title={readerProg.complete ? undefined : 'Read every section to finish'} onClick={completeSafely}>Mark complete</button>
                )}
                {isDeepDive && completeSafely && (
                  <button type="button" className="ss-complete-btn" disabled={!dd.complete} title={dd.complete ? undefined : 'Finish the steps in the guide to complete'} onClick={completeSafely}>Mark complete</button>
                )}
                {(isSetupLab || isPromptCatalog) && completeSafely && (
                  <button type="button" className="ss-complete-btn" disabled={!copyGateMet} title={copyGateMet ? undefined : 'Copy the prompt to complete this lab'} onClick={completeSafely}>Complete &amp; generate evidence</button>
                )}
              </>
            )}
      </div>
    </>
  );
};

export default CardDetailBody;
