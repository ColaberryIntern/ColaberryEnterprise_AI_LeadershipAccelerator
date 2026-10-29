import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { runtimeApi, RtOpen, Readiness, PromptEval } from './runtimeApi';
import { emitPointsEarned } from '../../../services/pointsFx';
import { RuntimeHero, RuntimeVideo, PromptLabPanel, RuntimeReadinessStats } from './runtimeActivityPanels';
import RuntimeBlogPanel from './RuntimeBlogPanel';
import type { WatchBeatPayload } from '../../../components/timeline/VideoEmbed';
import AssessmentPanel from './AssessmentPanel';
import RuntimeFillReader from './RuntimeFillReader';
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
import ClaudeStudioRender from '../../../components/timeline/ClaudeStudioRender';
import ArchitectTimeMachine from '../../../components/timeline/ArchitectTimeMachine';
import BuildArtifactsRender from '../../../components/timeline/BuildArtifactsRender';
import ReflectionReview from '../../../components/timeline/ReflectionReview';
import { useAgentAttachments } from '../../../components/portal/AgentAttachments';
import MentorRail, { type MentorMsg } from '../../../components/portal/workspace/MentorRail';
import RuntimeComments from './RuntimeComments';
import { useCampus } from '../../../components/campus/CampusContext';
import WorkstationShell, { returnToOf, type WorkstationOrigin } from '../../../components/campus/workstation/WorkstationShell';
import LessonNotebook from '../../../components/campus/workstation/LessonNotebook';
import { planBench, workstationBuilding, workstationPlace } from '../../../components/campus/workstation/workstationModel';

/**
 * RuntimeWorkspace — the Learning Runtime Intelligence student OS. Opens a
 * published Timeline card and runs it: an activity center (video / prompt lab /
 * reflection), a live AI Mentor (coach, never answers), and a bottom Evidence &
 * Readiness bar (Employment + Certification + Architect Journey). Completing an
 * activity runs the whole loop — progression, auto portfolio artifact, readiness
 * — with no admin work. Route: /portal/runtime/:cardId.
 */

type Msg = MentorMsg & { kind?: string };
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

  // mentor
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mentorInput, setMentorInput] = useState('');
  const [nudge, setNudge] = useState<string | null>(null);   // proactive struggle nudge — the mentor offers help first
  const mentorEnd = useRef<HTMLDivElement>(null);
  // Screenshots the student hands Cory — drag, paste, or click. Same hook the
  // project workspace and Reese's DMs use, so the gesture is identical everywhere.
  const attach = useAgentAttachments();
  // C19: with the campus on, the same page is drawn as the workstation (the shell only arranges what is built below).
  const campus = useCampus();
  // A screenshot with no caption is a perfectly good message, so Send unlocks
  // on text OR a finished upload — but never while one is still in flight.
  const canSend = (mentorInput.trim().length > 0 || attach.refs().length > 0) && !attach.busy;

  useEffect(() => {
    (async () => {
      try {
        const [open, rd] = await Promise.all([runtimeApi.open(cardId), runtimeApi.readiness().catch(() => null)]);
        setData(open); setReadiness(rd); setCompleted(open.progress.status === 'completed'); setWatch(null); setNudge(null);
        // The screenshot line is in the opening turn rather than a tooltip: a
        // paperclip nobody notices is the same as no paperclip, and this is the
        // one place every student actually reads.
        setMsgs([{ role: 'assistant', content: `I'm Cory, your mentor for "${open.card.week_title || open.card.content?.title || open.card.title}". Ask me anything, or hit a shortcut below — I'll coach, not hand you answers. Stuck on an error? Paste or drag a screenshot straight in and I'll read it.`, kind: 'intro' }]);
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
  const isReflection = band === 'reflection';   // Week in Review — bespoke per-student recap; the generic reflect path below stays for 'question'
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
  // Claude Studio: the four-stage Claude.ai loop. Owns its own submission and
  // completion inline (link + reflection), so like the Build Artifact(s) Lab it
  // fills the center and never routes through the generic complete button.
  const isClaudeStudio = band === 'claude_studio' && !!card?.content?.body_html;
  const isArchitectMindset = band === 'architect_mindset';   // The Architect Time Machine: full cinematic experience (self-contained, completes internally)
  const isBuildArtifacts = band === 'build_artifacts' && !!card?.content?.body_html;   // Build Artifact(s) Lab: build station
  const isPeerWins = band === 'peer_wins';   // Community Discussion → Cohort Wins grid (post a win + cheer classmates)
  const [labCopied, setLabCopied] = useState(false);   // Setup Lab: reveal completion only after the prompt is copied
  const [allPromptsCopied, setAllPromptsCopied] = useState(false);   // Prompt Lab: reveal completion only after ALL prompts are copied
  // Layout: any content card whose body renders in an iframe — the Self Study reader OR a
  // generic lesson — FILLS the center as the single scroll (no dueling scrollbars). Video/
  // lab/reflect/survey/assessment keep the normal scrolling center. Comments always go to
  // the right rail. This is the single-scroll workstation layout applied to every type.
  const isLesson = !isVideo && !isLab && !isReflect && !isSurvey && !isAssessment && !isReader && !isDeepDive && !isSetupLab && !isPromptCatalog && !isClaudeStudio && !isBuildArtifacts && !isPeerWins && !!card?.content?.body_html;
  const fill = isReader || isLesson || isDeepDive;


  const ask = useCallback(async (mode: string, message: string) => {
    if (!card) return;
    // Snapshot the tray BEFORE clearing it, so the sent message keeps its
    // thumbnails and the composer empties immediately.
    const attachments = attach.refs();
    const shown = attach.sentPreviews();
    setMsgs((m) => [...m, { role: 'user', content: message || `(${mode})`, attachments: shown }]);
    setBusy('mentor'); setMentorInput(''); attach.clear(false);
    try {
      const history = msgs.filter((m) => m.kind !== 'intro').map((m) => ({ role: m.role, content: m.content }));
      const r = await runtimeApi.mentor(card.id, mode, message, history, attachments);
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply, kind: r.kind }]);
    } catch { setMsgs((m) => [...m, { role: 'assistant', content: 'I had trouble reaching you — try again.', kind: 'error' }]); } finally { setBusy(''); }
  }, [card, msgs, attach]);

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
      // Points land server-side on completion; say so, or the student never knows they were paid.
      const pts = Number(r.outcome?.points_awarded) || 0;
      emitPointsEarned(pts);
      const ptsLine = pts > 0 ? ` +${pts} points added to your total.` : '';
      setMsgs((m) => [...m, { role: 'assistant', content: (r.artifact ? `Nice — I turned your work into a portfolio artifact: "${r.artifact.title}". Your readiness just updated below.` : 'Completed — your progress and readiness updated below.') + ptsLine, kind: 'complete' }]);
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
      // No `?? 10` here: a card that carries no learning points must not advertise ten
      // of them. When there are none to collect the action is a plain completion.
      : <button className="rt-btn cta" disabled={busy === 'complete'} onClick={collectBlogPts}>{(card.points?.learning ?? 0) > 0 ? `Collect +${card.points?.learning} pts` : 'Mark complete'}</button>;
  // Comments always render in the right rail now (every card type), so the center is a
  // single, clean scroll.
  const commentsBlock = <RuntimeComments cardId={cardId} postId={card.id} />;

  const reader = fill || isBlog || isSetupLab || isPromptCatalog || isClaudeStudio || isArchitectMindset || isBuildArtifacts;
  const pill = <span className={`rt-pill ${completed ? 'done' : ''}`} style={{ marginLeft: 'auto' }}>{completed ? '✓ Completed' : 'In progress'}</span>;

  // CENTER — activity
  const centre = (<>
          {/* Hero — the type's picture with the lesson title ON the image. Video bands keep
              their player; fill (reader/lesson) content fills the panel, so skip the hero. */}
          {!isVideo && !isSkillsJar && !fill && !isBlog && !isSetupLab && !isPromptCatalog && !isClaudeStudio && !isArchitectMindset && !isBuildArtifacts && card.type_thumbnail && <RuntimeHero src={card.type_thumbnail} title={displayTitle} />}

          {isVideo && <RuntimeVideo card={card} completed={completed} watch={watch} onWatchBeat={onWatchBeat} />}

          {isLab && <PromptLabPanel prompt={prompt} onPrompt={setPrompt} busy={busy === 'lab'} onRun={runLab} evalResult={evalResult} />}

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

          {/* Week in Review — the bespoke per-student recap (real completions, scores,
              skill deltas) + strategic-signal capture. Self-contained + self-completing. */}
          {isReflection && (
            <ReflectionReview cardId={card.id} variant="workspace" />
          )}
          {isReflect && !isReflection && (
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
          {isBlog && <RuntimeBlogPanel blogId={blogId} card={card} displayTitle={displayTitle} gate={blogCompleteGate} />}

          {/* Content-in-iframe cards (the Self Study immersive reader OR a generic lesson)
              FILL the center as the single scroll, with the complete gate in a slim foot —
              so there are never dueling scrollbars. The reader runs scripts (sticky nav +
              read-gate); a plain lesson stays inert (sandbox=""), except intel-band cards
              (AI News Flash etc.) which embed a real source <a href> and need allow-popups
              or the click is silently swallowed by the sandbox. */}
          {fill && (
            <RuntimeFillReader card={card} kind={isReader ? 'reader' : isDeepDive ? 'deepdive' : 'lesson'} band={band}
              doneIds={readerProg.initialDoneIds} frameRef={ddIframeRef} dd={dd} gate={completeGate} />
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
          {/* Claude Studio — the four-stage Claude.ai loop (explore → Project → Artifact
              → prove). Fills the center; it owns its own submission form and completes
              server-side on submit, so no generic complete button is offered for it. */}
          {isClaudeStudio && (
            <div className="rt-readerwrap">
              <ClaudeStudioRender bodyHtml={card.content?.body_html || ''} title={displayTitle} summary={card.content?.summary} estMin={card.estimated_time} difficulty={card.difficulty} variant="workspace" cardId={cardId} completed={completed} onSubmitted={complete} />
            </div>
          )}
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
          {!isVideo && !isLab && !isReflect && !isSurvey && !isAssessment && !isSkillsJar && !fill && !isSetupLab && !isPromptCatalog && !isClaudeStudio && !isArchitectMindset && !isBuildArtifacts && !isPeerWins && (
            <div className="rt-card">
              {card.content?.summary && <p>{card.content.summary}</p>}
              {card.description ? <p>{card.description}</p> : <p className="rt-muted">Work through this activity, then complete it below.</p>}
            </div>
          )}

          {artifact && <div className="rt-artifact"><div className="rt-lab">Portfolio artifact created</div><b>{artifact.title}</b><p className="rt-muted">{artifact.summary}</p></div>}

          {/* Surveys + assessments complete via their own flow; fill cards host the gate in
              their foot. Everything else gets the completion bar here in the center. */}
          {!isSurvey && !isAssessment && !isSkillsJar && !fill && !isSetupLab && !isPromptCatalog && !isClaudeStudio && !isArchitectMindset && !isBuildArtifacts && !isReflection && (
            <div className="rt-complete">{completeGate}</div>
          )}
  </>);

  // RIGHT — AI Mentor (MentorRail: the whole rail takes a drop).
  const mentor = (
    <MentorRail
      msgs={msgs}
      busy={busy === 'mentor'}
      attach={attach}
      input={mentorInput}
      onInput={setMentorInput}
      canSend={canSend}
      onAsk={ask}
      shortcut={(mo) => (mo === 'review' ? (isLab ? prompt : reflectionText) || 'Review my work.' : `Give me a ${mo}.`)}
      endRef={mentorEnd}
      subtitle={campus.active ? `Your mentor for ${displayTitle}` : undefined}
      top={<>
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
      </>}
      beforeModes={<>
        {nudge && (
          <div className="rt-nudge">
            <div className="rt-nudge-msg">{nudge}</div>
            <div className="rt-nudge-actions">
              <button className="rt-btn pri" disabled={busy === 'mentor'} onClick={() => { setNudge(null); ask('ask', 'Yes — walk me through the next step, one at a time.'); }}>Yes, walk me through it</button>
              <button className="rt-btn" onClick={() => setNudge(null)}>Not now</button>
            </div>
          </div>
        )}
      </>}
      after={commentsBlock}
    />
  );

  // BOTTOM — Evidence & Readiness
  const stats = <RuntimeReadinessStats readiness={readiness} />;

  if (campus.active) {
    return (
      <WorkstationShell
        theme={theme}
        place={workstationPlace(workstationBuilding(backTo, 'lecture', (location.state as WorkstationOrigin | null)?.at), campus.settings.workplaceNames)}
        returnTo={returnToOf(location.state)}
        cardTitle={displayTitle}
        heading={{ kicker: `${card.student_label || ''}${card.estimated_time ? ` · ${card.estimated_time} min` : ''}`, title: displayTitle }}
        pill={pill}
        bench={planBench(campus.planStops, card.id)}
        left={<LessonNotebook cardId={card.id} />}
        mentor={mentor}
        status={stats}
        mainClass={reader ? 'rt-mid--reader' : undefined}
      >
        {centre}
      </WorkstationShell>
    );
  }

  return (
    <div className="rt" data-theme={theme}>
      <style>{runtimeCss}</style>
      <header className="rt-top">
        <button className="rt-back" onClick={goBack} aria-label={backLabel} title={backLabel}><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <div><div className="rt-kick">{card.student_label}{card.estimated_time ? ` · ${card.estimated_time} min` : ''}</div><div className="rt-title">{displayTitle}</div></div>
        {pill}
      </header>

      <div className="rt-body">
        {/* CENTER — activity */}
        <main className={`rt-mid${reader ? ' rt-mid--reader' : ''}`}>
          {centre}
        </main>

        {mentor}
      </div>

      {/* BOTTOM — Evidence & Readiness */}
      <footer className="rt-bar">
        {stats}
      </footer>
    </div>
  );
};

export default RuntimeWorkspace;
