import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { runtimeApi, RtOpen, Readiness, PromptEval, CardComment, BlogReaderContent } from './runtimeApi';
import VideoEmbed, { WatchBeatPayload } from '../../../components/timeline/VideoEmbed';
import AssessmentPanel from './AssessmentPanel';
import { lessonDoc, readerDoc, blogReaderDoc } from '../../../components/timeline/CardDetailBody';
import { parseVideoUrl, videoThumbnail } from '../../../utils/videoEmbed';
import { runtimeCss } from './runtimeKit';
import CardSurveyExperience from '../../../components/timeline/CardSurveyExperience';
import PeerWinsPanel from '../../../components/timeline/PeerWinsPanel';
import SkillsJarPanel from '../../../components/timeline/SkillsJarPanel';
import { toTitleCase } from '../../../utils/titleCase';
import { useReaderProgress } from '../../../components/timeline/useReaderProgress';
import { useBlogReadGate } from '../../../components/timeline/useBlogReadGate';
import { useDeepDiveHost } from '../../../components/timeline/useDeepDiveHost';
import SetupLabRender from '../../../components/timeline/SetupLabRender';
import PromptCatalogRender from '../../../components/timeline/PromptCatalogRender';
import ArchitectTimeMachine from '../../../components/timeline/ArchitectTimeMachine';
import BuildArtifactsRender from '../../../components/timeline/BuildArtifactsRender';

/**
 * RuntimeWorkspace — the Learning Runtime Intelligence student OS. Opens a
 * published Timeline card and runs it: an activity center (video / prompt lab /
 * reflection), a live AI Mentor (coach, never answers), and a bottom Evidence &
 * Readiness bar (Employment + Certification + Architect Journey). Completing an
 * activity runs the whole loop — progression, auto portfolio artifact, readiness
 * — with no admin work. Route: /portal/runtime/:cardId.
 */

type Msg = { role: 'user' | 'assistant'; content: string; kind?: string };
const VIDEO_BANDS = ['media', 'live_class', 'video_feedback'];

const RuntimeWorkspace: React.FC = () => {
  const { cardId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Return to WHERE THE STUDENT CAME FROM. The opener (CardDetailDrawer) stamps
  // `state.from` with its pathname, so entering the workspace from the Timeline
  // sends you back to the Timeline and from the Classroom back to the Classroom.
  // Falls back to the Classroom on a deep link / direct load (no origin state).
  const backTo = ((location.state as { from?: string } | null)?.from) || '/portal/classroom';
  const backLabel = backTo.includes('/today') ? 'Back to Timeline' : 'Back to Classroom';
  const goBack = useCallback(() => navigate(backTo), [navigate, backTo]);
  // Carry over the portal's light/dark setting: the workspace renders its own
  // chrome (not PortalShell), so read 'te-theme' and stamp data-theme on the .rt
  // root (drives runtimeCss) and on <html> (drives :root-scoped child components
  // + a direct page load that never rendered PortalShell).
  const theme = React.useMemo<'light' | 'dark'>(() => {
    try { return localStorage.getItem('te-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }, []);
  useEffect(() => {
    try { document.documentElement.setAttribute('data-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const [data, setData] = useState<RtOpen | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // activity state
  const [prompt, setPrompt] = useState('');
  const [evalResult, setEvalResult] = useState<PromptEval | null>(null);
  const [reflectionQs, setReflectionQs] = useState<string[]>([]);
  const [reflectionText, setReflectionText] = useState('');
  const [artifact, setArtifact] = useState<any>(null);
  const [completed, setCompleted] = useState(false);
  // Server-truth watch state for the 75% gate (video/testimonial/podcast).
  const [watch, setWatch] = useState<{ watched_pct: number; required_pct: number | null; met: boolean } | null>(null);
  // In-workspace blog reader payload (fetched + sanitized server-side).
  const [blogReader, setBlogReader] = useState<BlogReaderContent | null>(null);

  // mentor
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mentorInput, setMentorInput] = useState('');
  const [nudge, setNudge] = useState<string | null>(null);   // proactive struggle nudge — the mentor offers help first
  const mentorEnd = useRef<HTMLDivElement>(null);

  // cohort comments (media cards) — newest first
  const [comments, setComments] = useState<CardComment[]>([]);
  const [commentInput, setCommentInput] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [open, rd] = await Promise.all([runtimeApi.open(cardId), runtimeApi.readiness().catch(() => null)]);
        setData(open); setReadiness(rd); setCompleted(open.progress.status === 'completed'); setWatch(null); setNudge(null);
        setMsgs([{ role: 'assistant', content: `I'm Cory, your mentor for "${open.card.week_title || open.card.content?.title || open.card.title}". Ask me anything, or hit a shortcut below — I'll coach, not hand you answers.`, kind: 'intro' }]);
        // Every card type has a cohort comment thread in its workspace.
        runtimeApi.comments(cardId).then((r) => setComments(r.comments)).catch(() => { /* comments are optional */ });
        // Proactive nudge — if the student looks stuck on this card, the mentor offers help first.
        runtimeApi.nudge(cardId).then((n) => setNudge(n.message)).catch(() => { /* nudge is optional */ });
      } catch { setError('Could not open this activity.'); }
    })();
  }, [cardId]);

  useEffect(() => { mentorEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const card = data?.card;
  const band = card?.render_band || 'overview';
  const isVideo = VIDEO_BANDS.includes(band);
  const isLab = band === 'promptlab';
  const isSurvey = band === 'survey';   // captured via the interactive SurveyForm
  const isAssessment = band === 'quiz' || band === 'evaluation';   // Knowledge Check + Evaluation, self-contained
  const isReflect = ['reflection', 'question'].includes(band);
  const isSkillsJar = band === 'skills_jar';   // Anthropic Skills Course — external course + certificate upload
  // The generated lesson title (e.g. "Overview — Claude Code Foundations + Workspace")
  // beats the card's raw title everywhere the student sees it. Curriculum titles
  // are Title-Cased for display; media/external keep their authored casing.
  const externalTitle = isVideo || band === 'skills_jar' || ['testimonial', 'blog', 'podcast', 'announcement'].includes(card?.type || '');
  const rawTitle = card?.week_title || card?.content?.title || card?.title || '';
  const displayTitle = externalTitle ? rawTitle : toTitleCase(rawTitle);
  // Watch gate: report play heartbeats while not yet completed; the "Mark complete"
  // button stays disabled until the server confirms the 75% threshold is met.
  const onWatchBeat: ((beat: WatchBeatPayload) => void) | undefined = card && !completed
    ? (beat) => { runtimeApi.watch(card.id, beat).then(setWatch).catch(() => { /* best-effort */ }); }
    : undefined;
  const watchGated = isVideo && watch?.required_pct != null && !watch?.met;
  // Self Study reading: same per-section read-gate as the drawer — Mark complete only
  // unlocks once every section has been read (>=5s each), via the reader's postMessages.
  const isReader = band === 'warmup' && !!card?.content?.body_html;
  const readerProg = useReaderProgress(cardId, isReader && !completed);
  // Ambient blog: read the post INSIDE the workspace (its live page sends
  // X-Frame-Options: DENY, so we render the server-sanitized article), gated by the same
  // 2-minute read gate the drawer uses — auto-armed on open since reading starts here.
  const isBlog = card?.type === 'blog' && !!card?.blog?.url;
  const blogId = isBlog && cardId.startsWith('blog:') ? cardId.slice('blog:'.length) : null;
  const blogGate = useBlogReadGate(!completed ? blogId : null, true);
  const blogReadPct = Math.min(100, Math.round(((blogGate.state?.read_s ?? 0) / (blogGate.state?.required_s || 120)) * 100));
  // Deep Dive Field Guide: renders its own self-contained HTML in an allow-scripts iframe
  // (same as the drawer's deepdive arm). The host bridge owns read/copy persistence
  // (restored across drawer↔workspace), the +100-point upload, and the gate — dd.complete
  // folds read all sections + copy the prompt + (Week 1+) upload.
  const isDeepDive = band === 'deepdive' && card?.type === 'deep_dive' && !!card?.content?.body_html;
  const ddIframeRef = useRef<HTMLIFrameElement>(null);
  const dd = useDeepDiveHost(cardId, isDeepDive && !completed, ddIframeRef);
  const ddComplete = dd.complete;
  // Setup Lab (Claude Code enablement): dark native panel + Copy button, filling the
  // center as a single scroll (its own renderer, not the generic lessonDoc iframe).
  const isSetupLab = band === 'setup_lab' && !!card?.content?.body_html;
  const isPromptCatalog = band === 'prompt_catalog' && !!card?.content?.body_html;   // Prompt Lab: practice-prompt catalog
  const isArchitectMindset = band === 'architect_mindset';   // The Architect Time Machine: full cinematic experience (self-contained, completes internally)
  const isBuildArtifacts = band === 'build_artifacts' && !!card?.content?.body_html;   // Build Artifact(s) Lab: build station
  const isPeerWins = band === 'peer_wins';   // Community Discussion → Cohort Wins grid (post a win + cheer classmates)
  const [labCopied, setLabCopied] = useState(false);   // Setup Lab: reveal completion only after the prompt is copied
  const [allPromptsCopied, setAllPromptsCopied] = useState(false);   // Prompt Lab: reveal completion only after ALL prompts are copied
  // Layout: any content card whose body renders in an iframe — the Self Study reader OR a
  // generic lesson — FILLS the center as the single scroll (no dueling scrollbars). Video/
  // lab/reflect/survey/assessment keep the normal scrolling center. Comments always go to
  // the right rail. This is the single-scroll workstation layout applied to every type.
  const isLesson = !isVideo && !isLab && !isReflect && !isSurvey && !isAssessment && !isReader && !isDeepDive && !isSetupLab && !isPromptCatalog && !isBuildArtifacts && !isPeerWins && !!card?.content?.body_html;
  const fill = isReader || isLesson || isDeepDive;

  // Load the post's article for the in-workspace reader (fail-soft: ok:false → link).
  useEffect(() => {
    if (!isBlog || !blogId) { setBlogReader(null); return; }
    let alive = true;
    setBlogReader(null);
    runtimeApi.blogReader(blogId)
      .then((c) => { if (alive) setBlogReader(c); })
      .catch(() => { if (alive) setBlogReader({ ok: false, title: null, body_html: null, excerpt: null, author: null, featured_image: null, source_url: null }); });
    return () => { alive = false; };
  }, [isBlog, blogId]);

  const ask = useCallback(async (mode: string, message: string) => {
    if (!card) return;
    setMsgs((m) => [...m, { role: 'user', content: message || `(${mode})` }]);
    setBusy('mentor'); setMentorInput('');
    try {
      const history = msgs.filter((m) => m.kind !== 'intro').map((m) => ({ role: m.role, content: m.content }));
      const r = await runtimeApi.mentor(card.id, mode, message, history);
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply, kind: r.kind }]);
    } catch { setMsgs((m) => [...m, { role: 'assistant', content: 'I had trouble reaching you — try again.', kind: 'error' }]); } finally { setBusy(''); }
  }, [card, msgs]);

  const postComment = async () => {
    const body = commentInput.trim();
    if (!card || !body) return;
    setBusy('comment');
    try {
      const r = await runtimeApi.comment(card.id, body);
      setComments((c) => [r.comment, ...c]);   // newest first
      setCommentInput('');
    } catch { /* keep the draft in the input */ } finally { setBusy(''); }
  };

  const runLab = async () => {
    if (!card || !prompt.trim()) return; setBusy('lab');
    try { setEvalResult(await runtimeApi.promptLab(card.id, prompt)); } catch { setError('Evaluation failed.'); } finally { setBusy(''); }
  };
  const loadReflection = async () => {
    if (!card) return; setBusy('reflect');
    try { setReflectionQs((await runtimeApi.reflection(card.id)).questions); } catch { /* ignore */ } finally { setBusy(''); }
  };
  const complete = async () => {
    if (!card) return; setBusy('complete');
    try {
      const work = isLab ? `${prompt}\n\n${evalResult ? 'Eval: ' + evalResult.score + '/100' : ''}` : reflectionText;
      const r = await runtimeApi.complete(card.id, work, reflectionText);
      setArtifact(r.artifact); setReadiness(r.readiness); setCompleted(true);
      setMsgs((m) => [...m, { role: 'assistant', content: r.artifact ? `Nice — I turned your work into a portfolio artifact: "${r.artifact.title}". Your readiness just updated below.` : 'Completed — your progress and readiness updated below.', kind: 'complete' }]);
      // Deep Dive: on completion, return the student to the Classroom right where they
      // left off (it restores their week + scroll) — now with this card marked complete.
      // Completing any assignment returns the student to the curriculum (Classroom),
      // right where they left off — the Deep Dive already did this; now it's universal.
      setTimeout(goBack, 1200);
    } catch (e: any) { setError(e?.response?.data?.error || 'Completion failed.'); } finally { setBusy(''); }
  };
  // Ambient blogs collect via the read gate (not the generic complete): the server
  // re-checks the 2-minute read before awarding, and it's idempotent per blog.
  const collectBlogPts = async () => {
    if (!blogId) return; setBusy('complete');
    try {
      await runtimeApi.blogCollect(blogId);
      setCompleted(true);
      setMsgs((m) => [...m, { role: 'assistant', content: 'Nice — points collected. Taking you back to your timeline.', kind: 'complete' }]);
      setTimeout(goBack, 1200);
    } catch (e: any) { setError(e?.response?.data?.error || 'Keep reading a little longer to collect your points.'); } finally { setBusy(''); }
  };

  if (error) return <div className="rt" data-theme={theme}><style>{runtimeCss}</style><div className="rt-mid" style={{ padding: 40 }}>{error} <button className="rt-btn" onClick={goBack}>← {backTo.includes('/today') ? 'Timeline' : 'Classroom'}</button></div></div>;
  if (!card) return <div className="rt" data-theme={theme}><style>{runtimeCss}</style><div className="rt-mid" style={{ padding: 40 }}>Loading your workspace…</div></div>;

  const emp = readiness?.employment; const cert = readiness?.certification; const jr = readiness?.journey; const evd = readiness?.evidence;

  // Complete gate + comments are shared so Self Study can host them in the reader foot /
  // right rail (single-scroll layout) while every other card keeps them in the center.
  const completeLabel = busy === 'complete' ? 'Generating evidence…'
    : watchGated ? `Keep watching · ${watch?.watched_pct ?? 0}/${watch?.required_pct}%`
    : card.evidence_required ? 'Complete & generate evidence' : 'Mark complete';
  const completeGate = completed
    ? <span className="rt-pill done">✓ Completed — evidence generated</span>
    : isReader && !readerProg.complete
      ? <span className="rt-muted">{readerProg.total > 0 ? `${readerProg.done} of ${readerProg.total} sections read — read all to finish` : 'Read the material to finish'}</span>
      : isDeepDive && !ddComplete
        ? <span className="rt-muted">Finish the steps in the guide to complete{dd.total > 0 ? ` — ${dd.done} of ${dd.total} sections read` : ''}</span>
        : <button className={fill ? 'ss-complete-btn' : 'rt-btn cta'} disabled={busy === 'complete' || watchGated} title={watchGated ? `Reach ${watch?.required_pct}% watched to collect your points` : undefined} onClick={complete}>{completeLabel}</button>;
  // Blog: collect appears only after the 2-minute read gate is met (server re-enforces).
  const blogCompleteGate = completed
    ? <span className="rt-pill done">✓ Completed — points collected</span>
    : !blogGate.state?.met
      ? <span className="rt-muted" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          Read the post — {blogGate.state?.read_s ?? 0}s of {blogGate.state?.required_s ?? 120}s to collect your points
          <span style={{ flexBasis: '100%', height: 6, borderRadius: 3, background: 'rgba(0,0,0,.12)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${blogReadPct}%`, background: '#367895', transition: 'width .5s ease' }} /></span>
        </span>
      : <button className="rt-btn cta" disabled={busy === 'complete'} onClick={collectBlogPts}>Collect +{card.points?.learning ?? 10} pts</button>;
  // Comments always render in the right rail now (every card type), so the center is a
  // single, clean scroll.
  const commentsBlock = (
    <section className="rt-comments rt-comments--rail">
      <div className="rt-lab">Comments</div>
      <div className="rt-cpost">
        <input className="rt-in" value={commentInput} onChange={(e) => setCommentInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commentInput.trim() && postComment()} placeholder="Share a thought with your cohort…" />
        <button className="rt-btn pri" disabled={busy === 'comment' || !commentInput.trim()} onClick={postComment}>Post</button>
      </div>
      {comments.length === 0
        ? <p className="rt-muted" style={{ margin: '8px 2px' }}>No comments yet — be the first.</p>
        : comments.map((cm) => (
            <div key={cm.id} className="rt-comment">
              <div className="rt-cwho"><b>{cm.mine ? 'You' : cm.author}</b><span>{new Date(cm.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
              <p>{cm.body}</p>
            </div>
          ))}
    </section>
  );

  return (
    <div className="rt" data-theme={theme}>
      <style>{runtimeCss}</style>
      <header className="rt-top">
        <button className="rt-back" onClick={goBack} aria-label={backLabel} title={backLabel}><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <div><div className="rt-kick">{card.student_label}{card.estimated_time ? ` · ${card.estimated_time} min` : ''}</div><div className="rt-title">{displayTitle}</div></div>
        <span className={`rt-pill ${completed ? 'done' : ''}`} style={{ marginLeft: 'auto' }}>{completed ? '✓ Completed' : 'In progress'}</span>
      </header>

      <div className="rt-body">
        {/* CENTER — activity */}
        <main className={`rt-mid${fill || isBlog || isSetupLab || isPromptCatalog || isArchitectMindset || isBuildArtifacts ? ' rt-mid--reader' : ''}`}>
          {/* Hero — the type's picture with the lesson title ON the image. Video bands keep
              their player; fill (reader/lesson) content fills the panel, so skip the hero. */}
          {!isVideo && !isSkillsJar && !fill && !isBlog && !isSetupLab && !isPromptCatalog && !isArchitectMindset && !isBuildArtifacts && card.type_thumbnail && (
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
              <img src={card.type_thumbnail} alt="" style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,25,29,0) 42%, rgba(4,25,29,.74) 100%)' }} />
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, color: '#fff', fontWeight: 800, fontSize: 20, lineHeight: 1.25, textShadow: '0 1px 3px rgba(0,0,0,.45)' }}>{displayTitle}</div>
            </div>
          )}

          {isVideo && (
            <>
              <VideoEmbed
                source={parseVideoUrl(card.video?.url)}
                title={card.video?.title || card.title}
                poster={card.video?.poster || videoThumbnail(parseVideoUrl(card.video?.url))}
                badge={card.type === 'testimonial' ? 'Testimonial' : card.type === 'podcast' ? 'Podcast' : null}
                onWatchBeat={onWatchBeat}
                fallbackDurationS={card.estimated_time ? card.estimated_time * 60 : null}
              />
              {!completed && card.video?.url && (
                <div className="tlv-watch">
                  <div className="tlv-watchbar"><i style={{ width: `${Math.min(100, watch?.watched_pct ?? 0)}%` }} /></div>
                  <span className="tlv-watchpct">
                    {watch?.required_pct != null
                      ? (watch.met ? '✓ Watched — points unlocked' : `Watched ${watch?.watched_pct ?? 0}% · reach ${watch.required_pct}% to collect your points`)
                      : `Watched ${watch?.watched_pct ?? 0}%`}
                  </span>
                </div>
              )}
            </>
          )}

          {isLab && (
            <div>
              <div className="rt-lab">Your prompt</div>
              <textarea className="rt-in mono" style={{ minHeight: 150 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Write your prompt. The mentor won't hand you the answer — draft, run, iterate." />
              <div className="rt-row"><button className="rt-btn pri" disabled={busy === 'lab' || !prompt.trim()} onClick={runLab}>{busy === 'lab' ? 'Evaluating…' : '▶ Run & evaluate'}</button>{evalResult && <button className="rt-btn" onClick={() => setPrompt(evalResult.better_prompt)}>Use improved version</button>}</div>
              {evalResult && (
                <div className="rt-card">
                  <div className="rt-scores"><div><b>{evalResult.score}</b><span>craft</span></div><div><b>{evalResult.architect_score}</b><span>architect</span></div></div>
                  {evalResult.strengths.length > 0 && <><div className="rt-lab">Strengths</div><ul className="rt-list ok">{evalResult.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
                  {evalResult.gaps.length > 0 && <><div className="rt-lab">Gaps</div><ul className="rt-list warn">{evalResult.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
                  {evalResult.suggestions.length > 0 && <><div className="rt-lab">Suggestions</div><ul className="rt-list">{evalResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
                </div>
              )}
            </div>
          )}

          {/* Weekly feedback survey — the bespoke live experience (same component
              the right-side drawer uses), captured + stored on submit. */}
          {isSurvey && (
            <CardSurveyExperience
              cardId={card.id}
              questions={card.content?.questions || []}
              openPrompt={card.content?.reflection || null}
              title={displayTitle}
              completed={completed}
              onComplete={complete}
            />
          )}

          {/* Peer Wins — the Cohort Wins grid (post a win + cheer classmates). Self-
              contained + self-styled, like the survey. Completion is the normal Mark
              complete bar below (posting is optional, never gates completion). */}
          {isPeerWins && (
            <PeerWinsPanel cardId={card.id} />
          )}

          {isReflect && (
            <div>
              {reflectionQs.length === 0 ? <button className="rt-btn pri" disabled={busy === 'reflect'} onClick={loadReflection}>{busy === 'reflect' ? 'Thinking…' : '✦ Get my reflection prompts'}</button>
                : <><div className="rt-lab">Reflect</div><ul className="rt-list">{reflectionQs.map((q, i) => <li key={i}>{q}</li>)}</ul></>}
              <textarea className="rt-in" style={{ minHeight: 140, marginTop: 12 }} value={reflectionText} onChange={(e) => setReflectionText(e.target.value)} placeholder="Write your reflection…" />
            </div>
          )}

          {/* The workspace OPENS with the saved lesson (same content as the card drawer),
              so the student reads it here and asks the Mentor about it. */}
          {/* Knowledge Check (quiz) + Evaluation — self-contained assessment flow,
              handles its own scoring, 75% gate, and completion. */}
          {isAssessment && (
            <AssessmentPanel cardId={card.id} onCompleted={(r) => { if (r) { setReadiness(r); setCompleted(true); } }} />
          )}

          {/* Blog: the post's article, fetched + sanitized server-side, rendered IN a
              sandboxed frame so the student never leaves the system (the training site
              refuses to be iframed). Fills the center as the single scroll; the read
              gate + collect live in the slim foot. Falls back to the external link. */}
          {isBlog && (
            <div className="rt-readerwrap">
              {blogReader === null ? (
                <div className="rt-muted" style={{ padding: 40 }}>Loading the post…</div>
              ) : blogReader.ok && blogReader.body_html ? (
                <iframe
                  className="rt-readerframe"
                  title="Blog post"
                  sandbox="allow-scripts allow-popups"
                  srcDoc={blogReaderDoc(blogReader.body_html, blogReader.title || card.blog?.title || displayTitle, { featuredImage: blogReader.featured_image, author: blogReader.author, sourceUrl: blogReader.source_url })}
                />
              ) : (
                <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
                  <p className="rt-muted" style={{ margin: 0 }}>We couldn't load this post inside the workspace.</p>
                  {card.blog?.url && <a className="rt-btn pri" href={card.blog.url} target="_blank" rel="noopener noreferrer">Read on the training site ↗</a>}
                </div>
              )}
              <div className="rt-readerfoot">{blogCompleteGate}</div>
            </div>
          )}

          {/* Content-in-iframe cards (the Self Study immersive reader OR a generic lesson)
              FILL the center as the single scroll, with the complete gate in a slim foot —
              so there are never dueling scrollbars. The reader runs scripts (sticky nav +
              read-gate); a plain lesson stays inert (sandbox=""). */}
          {fill && (
            <div className="rt-readerwrap">
              <iframe
                ref={isDeepDive ? ddIframeRef : undefined}
                className="rt-readerframe"
                title={isReader ? 'Self Study reading' : isDeepDive ? 'Field Guide' : 'Lesson'}
                sandbox={isReader ? 'allow-scripts' : isDeepDive ? 'allow-scripts allow-modals' : ''}
                srcDoc={isReader
                  ? readerDoc(card.content?.body_html || '', card.content?.title || card.title, { cardId: card.id, doneIds: readerProg.initialDoneIds })
                  : isDeepDive
                    ? (card.content?.body_html || '')
                    : lessonDoc(card.content?.body_html || '')}
              />
              <div className="rt-readerfoot">
                {isDeepDive && dd.message && <span className="rt-muted" style={{ marginRight: 'auto' }}>{dd.message}</span>}
                {isDeepDive && <input ref={dd.fileInputRef} type="file" accept=".html,.htm,text/html" hidden onChange={dd.onFileChange} />}
                {completeGate}
              </div>
            </div>
          )}
          {/* Setup Lab (Claude Code enablement) — dark native panel with per-<pre> Copy
              buttons, filling the center as a single scroll; the complete gate sits in the
              same slim foot as the reader/lesson fill cards. */}
          {isSetupLab && (
            <div className="rt-readerwrap">
              <SetupLabRender bodyHtml={card.content?.body_html || ''} title={displayTitle} summary={card.content?.summary} estMin={card.estimated_time} variant="workspace" onCopied={() => setLabCopied(true)} />
              <div className="rt-readerfoot">
                {!completed && !labCopied && <span className="rt-muted">Copy the prompt, run it in Claude Code, then complete this lab on the right →</span>}
              </div>
            </div>
          )}
          {/* Prompt Lab — the practice-prompt catalog (categories + reveal + copy),
              filling the center as a single scroll; standard completion in the foot. */}
          {isPromptCatalog && (
            <div className="rt-readerwrap">
              <PromptCatalogRender bodyHtml={card.content?.body_html || ''} title={displayTitle} summary={card.content?.summary} variant="workspace" onAllCopied={() => setAllPromptsCopied(true)} />
              <div className="rt-readerfoot">
                {!completed && !allPromptsCopied && <span className="rt-muted">Copy all the prompts, build them in Claude Code, then complete on the right →</span>}
              </div>
            </div>
          )}
          {/* The Architect Time Machine — the full cinematic experience fills the center
              as a single scroll; it drives its own state machine, evaluation, and the
              14-gate backend completion (setCompleted + readiness on finish). The AI
              Mentor rail, comments, and readiness bar stay in the workspace chrome. */}
          {isArchitectMindset && (
            <ArchitectTimeMachine
              cardId={card.id}
              variant="workspace"
              completed={completed}
              onCompleted={(rd) => { if (rd) setReadiness(rd); setCompleted(true); }}
            />
          )}
          {/* Build Artifact(s) Lab — the build station (pick artifact + project); fills
              the center; completion (points on first build) reveals on the right after a copy. */}
          {isBuildArtifacts && (
            <div className="rt-readerwrap">
              <BuildArtifactsRender bodyHtml={card.content?.body_html || ''} title={displayTitle} summary={card.content?.summary} variant="workspace" cardId={cardId} completed={completed} onComplete={complete} />
            </div>
          )}
          {/* Anthropic Skills Course — the external-course panel + certificate upload
              (same component as the drawer), so the workspace actually carries the course. */}
          {isSkillsJar && (
            // Wrap in .tl-de so the SkillsJarPanel picks up the Design-E palette +
            // its tld-jar* styling (defined in timeline.css, scoped under .tl-de) —
            // otherwise it renders unstyled (a giant raw icon). The workspace column
            // is wider than the drawer, so it reads as the same panel, widened.
            <div className="tl-de">
              <SkillsJarPanel
                card={{ ...(card as any), status: completed ? 'completed' : (data?.progress.status || 'available') } as any}
                onComplete={complete}
              />
            </div>
          )}
          {/* Fallback for a non-media card with no body yet — just its description. */}
          {!isVideo && !isLab && !isReflect && !isSurvey && !isAssessment && !isSkillsJar && !fill && !isSetupLab && !isPromptCatalog && !isArchitectMindset && !isBuildArtifacts && !isPeerWins && (
            <div className="rt-card">
              {card.content?.summary && <p>{card.content.summary}</p>}
              {card.description ? <p>{card.description}</p> : <p className="rt-muted">Work through this activity, then complete it below.</p>}
            </div>
          )}

          {artifact && <div className="rt-artifact"><div className="rt-lab">Portfolio artifact created</div><b>{artifact.title}</b><p className="rt-muted">{artifact.summary}</p></div>}

          {/* Surveys + assessments complete via their own flow; fill cards host the gate in
              their foot. Everything else gets the completion bar here in the center. */}
          {!isSurvey && !isAssessment && !isSkillsJar && !fill && !isSetupLab && !isPromptCatalog && !isArchitectMindset && !isBuildArtifacts && (
            <div className="rt-complete">{completeGate}</div>
          )}
        </main>

        {/* RIGHT — AI Mentor */}
        <aside className="rt-mentor">
          <div className="rt-mentor-h"><span className="rt-dot" /> Cory</div>
          {isSetupLab && (labCopied || completed) && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
              {!completed && <div className="rt-lab" style={{ marginBottom: 8 }}>Finished in Claude Code?</div>}
              {completeGate}
            </div>
          )}
          {isPromptCatalog && (allPromptsCopied || completed) && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
              {!completed && <div className="rt-lab" style={{ marginBottom: 8 }}>Built one in Claude Code?</div>}
              {completeGate}
            </div>
          )}
          <div className="rt-thread">
            {msgs.map((m, i) => <div key={i} className={`rt-msg ${m.role}`}>{m.content}</div>)}
            <div ref={mentorEnd} />
          </div>
          {nudge && (
            <div className="rt-nudge">
              <div className="rt-nudge-msg">{nudge}</div>
              <div className="rt-nudge-actions">
                <button className="rt-btn pri" disabled={busy === 'mentor'} onClick={() => { setNudge(null); ask('ask', 'Yes — walk me through the next step, one at a time.'); }}>Yes, walk me through it</button>
                <button className="rt-btn" onClick={() => setNudge(null)}>Not now</button>
              </div>
            </div>
          )}
          <div className="rt-modes">
            {(['hint', 'explain', 'review'] as const).map((mo) => <button key={mo} className="rt-chip" disabled={busy === 'mentor'} onClick={() => ask(mo, mo === 'review' ? (isLab ? prompt : reflectionText) || 'Review my work.' : `Give me a ${mo}.`)}>{mo}</button>)}
          </div>
          <div className="rt-ask">
            <input className="rt-in" value={mentorInput} onChange={(e) => setMentorInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && mentorInput.trim() && ask('ask', mentorInput)} placeholder="Ask your mentor…" />
            <button className="rt-btn pri" disabled={busy === 'mentor' || !mentorInput.trim()} onClick={() => ask('ask', mentorInput)}>Send</button>
          </div>
          {/* Cohort comments live in the rail for every card type, so the center is a
              single clean scroll (no comments stacked under a tall activity). */}
          {commentsBlock}
        </aside>
      </div>

      {/* BOTTOM — Evidence & Readiness */}
      <footer className="rt-bar">
        {emp && <div className="rt-stat"><span className="l">Employment</span><span className="v">{emp.overall}<small>/100 · {emp.band}</small></span></div>}
        {cert && <div className="rt-stat"><span className="l">Cert pass prob.</span><span className="v">{Math.round(cert.pass_probability * 100)}%</span></div>}
        {jr && <div className="rt-stat"><span className="l">Architect stage</span><span className="v sm">{jr.focus_stage}</span></div>}
        {evd && <div className="rt-stat"><span className="l">GitHub</span><span className="v">{evd.github.commits}<small> commits</small></span></div>}
        {evd && <div className="rt-stat"><span className="l">Portfolio</span><span className="v">{evd.portfolio.entries}</span></div>}
        {readiness && <div className="rt-stat"><span className="l">Builder XP</span><span className="v">{readiness.progression.xp.builder}</span></div>}
        {emp && emp.employer_gaps[0] && <div className="rt-gap">Employers still want: <b>{emp.employer_gaps[0].need}</b></div>}
      </footer>
    </div>
  );
};

export default RuntimeWorkspace;
