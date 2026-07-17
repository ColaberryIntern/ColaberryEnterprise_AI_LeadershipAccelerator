import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { runtimeApi, RtOpen, Readiness, PromptEval, CardComment } from './runtimeApi';
import VideoEmbed, { WatchBeatPayload } from '../../../components/timeline/VideoEmbed';
import { lessonDoc } from '../../../components/timeline/CardDetailBody';
import { parseVideoUrl, videoThumbnail } from '../../../utils/videoEmbed';
import { runtimeCss } from './runtimeKit';
import SurveyForm from './SurveyForm';

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
  const mentorEnd = useRef<HTMLDivElement>(null);

  // cohort comments (media cards) — newest first
  const [comments, setComments] = useState<CardComment[]>([]);
  const [commentInput, setCommentInput] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [open, rd] = await Promise.all([runtimeApi.open(cardId), runtimeApi.readiness().catch(() => null)]);
        setData(open); setReadiness(rd); setCompleted(open.progress.status === 'completed'); setWatch(null);
        setMsgs([{ role: 'assistant', content: `I'm your AI Mentor for "${open.card.week_title || open.card.content?.title || open.card.title}". Ask me anything, or hit a shortcut below — I'll coach, not hand you answers.`, kind: 'intro' }]);
        // Every card type has a cohort comment thread in its workspace.
        runtimeApi.comments(cardId).then((r) => setComments(r.comments)).catch(() => { /* comments are optional */ });
      } catch { setError('Could not open this activity.'); }
    })();
  }, [cardId]);

  useEffect(() => { mentorEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const card = data?.card;
  const band = card?.render_band || 'overview';
  const isVideo = VIDEO_BANDS.includes(band);
  const isLab = band === 'promptlab';
  const isSurvey = band === 'survey';   // captured via the interactive SurveyForm
  const isReflect = ['reflection', 'question'].includes(band);
  // The generated lesson title (e.g. "Overview — Claude Code Foundations + Workspace")
  // beats the card's raw title everywhere the student sees it.
  const displayTitle = card?.week_title || card?.content?.title || card?.title || '';
  // Watch gate: report play heartbeats while not yet completed; the "Mark complete"
  // button stays disabled until the server confirms the 75% threshold is met.
  const onWatchBeat: ((beat: WatchBeatPayload) => void) | undefined = card && !completed
    ? (beat) => { runtimeApi.watch(card.id, beat).then(setWatch).catch(() => { /* best-effort */ }); }
    : undefined;
  const watchGated = isVideo && watch?.required_pct != null && !watch?.met;

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
    } catch (e: any) { setError(e?.response?.data?.error || 'Completion failed.'); } finally { setBusy(''); }
  };

  if (error) return <div className="rt"><style>{runtimeCss}</style><div className="rt-mid" style={{ padding: 40 }}>{error} <button className="rt-btn" onClick={() => navigate('/portal/classroom')}>← Classroom</button></div></div>;
  if (!card) return <div className="rt"><style>{runtimeCss}</style><div className="rt-mid" style={{ padding: 40 }}>Loading your workspace…</div></div>;

  const emp = readiness?.employment; const cert = readiness?.certification; const jr = readiness?.journey; const evd = readiness?.evidence;

  return (
    <div className="rt">
      <style>{runtimeCss}</style>
      <header className="rt-top">
        <button className="rt-back" onClick={() => navigate('/portal/classroom')} aria-label="Back to Classroom"><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <div><div className="rt-kick">{card.student_label}{card.estimated_time ? ` · ${card.estimated_time} min` : ''}</div><div className="rt-title">{displayTitle}</div></div>
        <span className={`rt-pill ${completed ? 'done' : ''}`} style={{ marginLeft: 'auto' }}>{completed ? '✓ Completed' : 'In progress'}</span>
      </header>

      <div className="rt-body">
        {/* CENTER — activity */}
        <main className="rt-mid">
          {/* Hero — the type's picture with the lesson title ON the image (video bands keep their player). */}
          {!isVideo && card.type_thumbnail && (
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

          {/* Weekly feedback survey — the interactive, captured-and-stored form. */}
          {isSurvey && (
            <div>
              {card.content?.summary && <p style={{ marginTop: 0 }}>{card.content.summary}</p>}
              <SurveyForm cardId={card.id} completed={completed} busy={busy === 'complete'} onSubmit={complete} />
            </div>
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
          {!isVideo && !isLab && !isReflect && !isSurvey && (
            <div className="rt-card">
              {card.content?.summary && <p>{card.content.summary}</p>}
              {card.content?.body_html
                ? <iframe title="Lesson" sandbox="" srcDoc={lessonDoc(card.content.body_html)} style={{ width: '100%', border: 0, minHeight: 420, background: '#fff', borderRadius: 8 }} />
                : card.description ? <p>{card.description}</p> : <p className="rt-muted">Work through this activity, then complete it below.</p>}
            </div>
          )}

          {artifact && <div className="rt-artifact"><div className="rt-lab">Portfolio artifact created</div><b>{artifact.title}</b><p className="rt-muted">{artifact.summary}</p></div>}

          {/* Surveys complete via their own "Save & mark complete" (answers must be
              stored first), so the generic completion bar is hidden for them. */}
          {!isSurvey && (
            <div className="rt-complete">
              {completed ? <span className="rt-pill done">✓ Completed — evidence generated</span>
                : <button
                    className="rt-btn cta"
                    disabled={busy === 'complete' || watchGated}
                    title={watchGated ? `Reach ${watch?.required_pct}% watched to collect your points` : undefined}
                    onClick={complete}
                  >
                    {busy === 'complete' ? 'Generating evidence…'
                      : watchGated ? `Keep watching · ${watch?.watched_pct ?? 0}/${watch?.required_pct}%`
                      : card.evidence_required ? 'Complete & generate evidence' : 'Mark complete'}
                  </button>}
            </div>
          )}

          {/* COHORT COMMENTS — every card type has a thread, newest first */}
          <section className="rt-comments">
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
        </main>

        {/* RIGHT — AI Mentor */}
        <aside className="rt-mentor">
          <div className="rt-mentor-h"><span className="rt-dot" /> AI Mentor</div>
          <div className="rt-thread">
            {msgs.map((m, i) => <div key={i} className={`rt-msg ${m.role}`}>{m.content}</div>)}
            <div ref={mentorEnd} />
          </div>
          <div className="rt-modes">
            {(['hint', 'explain', 'review'] as const).map((mo) => <button key={mo} className="rt-chip" disabled={busy === 'mentor'} onClick={() => ask(mo, mo === 'review' ? (isLab ? prompt : reflectionText) || 'Review my work.' : `Give me a ${mo}.`)}>{mo}</button>)}
          </div>
          <div className="rt-ask">
            <input className="rt-in" value={mentorInput} onChange={(e) => setMentorInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && mentorInput.trim() && ask('ask', mentorInput)} placeholder="Ask your mentor…" />
            <button className="rt-btn pri" disabled={busy === 'mentor' || !mentorInput.trim()} onClick={() => ask('ask', mentorInput)}>Send</button>
          </div>
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
