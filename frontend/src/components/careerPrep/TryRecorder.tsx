import React, { useEffect, useRef, useState } from 'react';
import { useTryRecorder } from './useTryRecorder';
import { deleteAnswerApi, saveAnswerApi, type AttemptView } from './careerPrepApi';
import { deliveryScore, elapsedClock, headline, whatToFix, whereWell, type AttemptResultView } from './logic/tryFeedback';

/**
 * Career Prep v27 (CP4.4, shot L3-5): record one answer on camera and show its score (the logic is useTryRecorder,
 * the words are logic/tryFeedback). The frame is dark 16:9: the student's initials while idle; while recording, a
 * LIVE mirrored self-view of the camera with a red dot and the elapsed time. After scoring: "Scored in N seconds",
 * ONE number (Delivery; content is not scored in Release 1), a one-line headline, "Where you did well" and "What to
 * fix next" side by side, and every metric with its published target and source under "See the numbers".
 */
function LiveView({ stream }: { stream: MediaStream }): React.ReactElement {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    // A browser without a real MediaStream (an old engine, a test double) keeps the frame dark rather than throwing.
    try { v.srcObject = stream; } catch { /* no self-view */ }
    return () => { try { v.srcObject = null; } catch { /* already detached */ } };
  }, [stream]);
  return <video ref={ref} className="cp-cam-video" autoPlay muted playsInline aria-label="Your camera, live" data-testid="cp-selfview" />;
}

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (since === null) return undefined;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, (now - since) / 1000);
}

type SaveState = 'off' | 'busy' | 'saved' | 'gone' | 'deleted';
const initialSave = (a: AttemptView): SaveState => (a.recording === 'saved' ? 'saved' : a.recording === 'gone' ? 'gone' : 'off');
const status = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

/**
 * R1.1 (Ali: "They have to check something to save and can easily delete"): an UNCHECKED box. Ticking it keeps this
 * answer's recording on the student's profile (Hire studio, Video, "Saved practice answers"); unticking deletes the kept
 * copy. Unsaved recordings are deleted an hour after scoring, so after that the box says the recording is gone.
 */
export function SaveAnswerBox({ attempt, question }: { attempt: AttemptView; question: string }): React.ReactElement {
  const [state, setState] = useState<SaveState>(initialSave(attempt));
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = async (on: boolean) => {
    setProblem(null);
    const was = state;
    setState('busy');
    try {
      if (on) { await saveAnswerApi(attempt.id, question); setState('saved'); } else { await deleteAnswerApi(attempt.id); setState('deleted'); }
    } catch (e) {
      if (on && status(e) === 410) { setState('gone'); return; }
      setState(was);
      setProblem(on ? 'Could not save this answer. Try again.' : 'Could not delete this answer. Try again.');
    }
  };
  const disabled = state === 'busy' || state === 'gone' || state === 'deleted';
  return (
    <div className="cp-save" data-testid="cp-save" data-state={state}>
      <label className="cp-save-box">
        <input type="checkbox" checked={state === 'saved'} disabled={disabled} onChange={(e) => { void toggle(e.target.checked); }} data-testid="cp-save-check" />
        <span>Save this answer to my profile</span>
      </label>
      <small className="cp-faint" aria-live="polite" data-testid="cp-save-note">
        {state === 'saved' && 'Saved. Only you can see it, in Portfolio, Hire, Video. Untick to delete it.'}
        {state === 'busy' && 'One moment...'}
        {state === 'off' && 'Not saved: this recording is deleted within an hour.'}
        {state === 'gone' && 'This recording is gone: unsaved answers are deleted an hour after scoring.'}
        {state === 'deleted' && 'Deleted. The recording is gone.'}
      </small>
      {problem && <p role="alert" className="cp-form-problem">{problem}</p>}
    </div>
  );
}

function Result({ r, scoredIn, onAgain, attempt, question }: { r: AttemptResultView; scoredIn: number | null; onAgain: () => void; attempt: AttemptView; question: string }): React.ReactElement {
  const score = deliveryScore(r);
  const well = whereWell(r);
  const fix = whatToFix(r);
  return (
    <div className="cp-try-result" data-testid="cp-try-result">
      {scoredIn !== null && <span className="cp-pill ok" data-testid="cp-scored-in">Scored in {scoredIn} {scoredIn === 1 ? 'second' : 'seconds'}</span>}
      <div className="cp-score" style={{ marginTop: 8 }}>
        {score !== null && <span><span className="cp-score-big" data-testid="cp-delivery">{score}</span><span className="cp-score-k">Delivery</span></span>}
        <span><b>{headline(r)}</b><span className="cp-muted" style={{ fontSize: '.86rem' }}>Pace, filler words and repetition. What you said is not scored yet.</span></span>
      </div>
      <div className="cp-fb" style={{ marginTop: 10 }}>
        <div className="is-well" data-testid="cp-fb-well"><b>Where you did well</b>
          {well.length ? <ul>{well.map((w) => <li key={w}>{w}</li>)}</ul> : <p>No delivery number reached its target this time.</p>}</div>
        <div className="is-fix" data-testid="cp-fb-fix"><b>What to fix next</b>
          {fix.length ? <ul>{fix.map((f) => <li key={f}>{f}</li>)}</ul> : <p>Nothing to fix in your delivery this time.</p>}</div>
      </div>
      <details className="cp-numbers">
        <summary>See the numbers</summary>
        <ul>{r.scores.map((s) => <li key={s.key}><b>{s.label}</b>: {s.value} (target {s.target}) · <small>{s.source}</small></li>)}</ul>
        {r.notes.length > 0 && <ul>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </details>
      <SaveAnswerBox attempt={attempt} question={question} />
      <div className="cp-form-actions" style={{ marginTop: 8 }}><button type="button" className="cp-ghost sm" onClick={onAgain}>Try again</button></div>
    </div>
  );
}

export function TryRecorder({ sessionId, segmentIndex, prompt, initials }: { sessionId: string; segmentIndex: number; prompt: string; initials?: string }): React.ReactElement {
  const r = useTryRecorder(sessionId, segmentIndex);
  const busy = r.phase === 'uploading' || r.phase === 'scoring';
  const elapsed = useElapsed(r.phase === 'recording' ? r.recordingSince : null);
  return (
    <div className="cp-try" data-testid="cp-try">
      <p className="cp-try-q"><b>Question:</b> {prompt}</p>
      <div className="cp-cam" data-testid="cp-cam" data-state={r.phase}>
        {r.phase === 'recording' && r.stream ? <LiveView stream={r.stream} /> : (
          <span className="cp-av lg me" aria-hidden="true">{initials || <i className="ri-user-3-line" />}</span>
        )}
        {r.phase === 'recording' && <span className="cp-rec" data-testid="cp-rec"><i aria-hidden="true" />Recording {elapsedClock(elapsed)}</span>}
        {busy && <span className="cp-cam-status" aria-live="polite">{r.phase === 'uploading' ? 'Uploading your answer...' : 'Scoring your answer...'}</span>}
      </div>
      <p className="cp-try-privacy cp-faint" data-testid="cp-privacy">Your recording is deleted after scoring unless you choose to save it to your profile.</p>
      <div className="cp-form-actions">
        {r.phase === 'ready' && <button type="button" className="cp-send" onClick={r.record} data-testid="cp-record"><i className="ri-record-circle-line" aria-hidden="true" />Record</button>}
        {r.phase === 'recording' && <button type="button" className="cp-send" onClick={r.stop} data-testid="cp-stop"><i className="ri-stop-fill" aria-hidden="true" />Stop, and score it</button>}
        {r.phase === 'unsent' && <button type="button" className="cp-send" onClick={r.resend} data-testid="cp-resend">Send again</button>}
        {(r.phase === 'failed' || r.phase === 'unsent') && <button type="button" className="cp-ghost" onClick={r.reset} data-testid="cp-rerecord">Record again</button>}
      </div>
      {r.phase === 'done' && r.attempt?.result && <Result r={r.attempt.result} scoredIn={r.scoredIn} onAgain={r.reset} attempt={r.attempt} question={prompt} />}
      {r.problem && <p role="alert" className="cp-form-problem">{r.problem}</p>}
    </div>
  );
}
