import React, { useEffect, useRef } from 'react';
import { PREP_SECONDS, useReadAloud } from './useReadAloud';
import './readAloud.css';

/**
 * Career Prep v27, CP5.8 (Ali 2026-11-21, option B): the Warm up part, scored. Record turns on the microphone only (no
 * camera) and shows the line; the student reads it silently (up to 15 seconds), taps Go, reads it aloud, and taps Stop.
 * The result shows the three parts (pace, smoothness, completeness) as bars and the one score that goes into Pace and
 * clarity, weighted like a recorded answer. Filler words, accent and pronunciation are never scored, and the recording
 * is deleted once scored.
 */
function Bar({ label, score, value }: { label: string; score: number; value: string }): React.ReactElement {
  return (
    <li className="cp-ra-row" data-testid={`cp-ra-part-${label.toLowerCase()}`}>
      <span className="cp-ra-name">{label}</span>
      <span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${score}%` }} /></span>
      <b className="cp-ra-v">{score}</b>
      <small className="cp-muted">{value}</small>
    </li>
  );
}

export function ReadAloud({ sessionId, segmentIndex }: { sessionId: string; segmentIndex: number }): React.ReactElement {
  const r = useReadAloud(sessionId, segmentIndex);
  const result = r.attempt?.result;
  // Keyboard and screen-reader users land on Go as soon as the line is shown.
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (r.phase === 'armed') goRef.current?.focus(); }, [r.phase]);
  return (
    <div className="cp-ra" data-testid="cp-readaloud" data-phase={r.phase}>
      <p className="cp-ra-how"><b>Out loud, no camera.</b> Tap Record, read the line to yourself, then tap Go and read it aloud. It scores your pace, smoothness and whether every word was said.</p>
      {r.line && r.phase !== 'done' && <blockquote className="cp-ra-line" data-testid="cp-ra-line">{r.line.text}</blockquote>}
      {r.phase === 'idle' && <button type="button" className="cp-send" data-testid="cp-ra-record" onClick={r.arm}>Record</button>}
      {r.phase === 'armed' && (
        <div className="cp-ra-armed">
          <span className="cp-ra-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.level * 100)} data-testid="cp-ra-level">
            <span style={{ width: `${Math.round(r.level * 100)}%` }} />
          </span>
          <span className="cp-muted" data-testid="cp-ra-prep">{r.prepLeft > 0 ? `Read it to yourself: ${r.prepLeft} of ${PREP_SECONDS} seconds` : 'Ready when you are'}</span>
          <button type="button" className="cp-send" data-testid="cp-ra-go" ref={goRef} onClick={r.go}>Go</button>
        </div>
      )}
      {r.phase === 'reading' && <p><span className="cp-ra-dot" aria-hidden="true" /> Reading aloud <button type="button" className="cp-ghost" data-testid="cp-ra-stop" onClick={r.stop}>Stop</button></p>}
      {(r.phase === 'uploading' || r.phase === 'scoring') && <p className="cp-muted" data-testid="cp-ra-scoring" aria-live="polite">Scoring your read...</p>}
      {r.phase === 'done' && result?.readAloud && (
        <div className="cp-ra-result" data-testid="cp-ra-result" aria-live="polite">
          <p className="cp-ra-score"><b data-testid="cp-ra-score">{result.readAloud.score}</b> <span>Read-aloud score, added to Pace and clarity</span></p>
          <ul className="cp-ra-bars">{result.scores.map((s) => <Bar key={s.key} label={s.label} score={s.score} value={s.value} />)}</ul>
          <p className="cp-muted cp-small">Filler words, accent and pronunciation are never scored. The recording is deleted once scored.</p>
          <button type="button" className="cp-ghost" data-testid="cp-ra-again" onClick={r.reset}>Read another line</button>
        </div>
      )}
      {r.problem && <p role="alert" className="cp-form-problem" data-testid="cp-ra-problem">{r.problem}{r.phase === 'failed' && <> <button type="button" className="cp-ghost" onClick={r.reset}>Try again</button></>}</p>}
    </div>
  );
}
