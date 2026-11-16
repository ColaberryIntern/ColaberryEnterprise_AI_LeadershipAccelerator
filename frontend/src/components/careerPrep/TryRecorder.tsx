import React from 'react';
import { useTryRecorder } from './useTryRecorder';

/**
 * Career Prep v27 (CP4.4): record one answer on camera and show its score when it is ready (the logic is
 * useTryRecorder). Each score shows its value, its target and where it came from; the coaching notes follow.
 */
export function TryRecorder({ sessionId, segmentIndex, prompt }: { sessionId: string; segmentIndex: number; prompt: string }): React.ReactElement {
  const r = useTryRecorder(sessionId, segmentIndex);
  const busy = r.phase === 'uploading' || r.phase === 'scoring';
  return (
    <div className="cp-try" data-testid="cp-try">
      <p className="cp-try-q"><b>Question:</b> {prompt}</p>
      {r.phase === 'ready' && <button type="button" className="cp-send" onClick={r.record} data-testid="cp-record">● Record</button>}
      {r.phase === 'recording' && <button type="button" className="cp-send" onClick={r.stop} data-testid="cp-stop">■ Stop</button>}
      {busy && <p aria-live="polite">{r.phase === 'uploading' ? 'Uploading your answer...' : 'Scoring your answer...'}</p>}
      {r.phase === 'done' && r.attempt?.result && (
        <div className="cp-try-result" data-testid="cp-try-result">
          <ul className="cp-list">{r.attempt.result.scores.map((s) => <li key={s.key}><b>{s.label}</b>: {s.value} (target {s.target}) · <small>{s.source}</small></li>)}</ul>
          <ul className="cp-list">{r.attempt.result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" className="cp-chip" onClick={r.reset}>Try again</button>
        </div>
      )}
      {r.phase === 'unsent' && <button type="button" className="cp-send" onClick={r.resend} data-testid="cp-resend">Send again</button>}
      {(r.phase === 'failed' || r.phase === 'unsent') && <button type="button" className="cp-chip" onClick={r.reset} data-testid="cp-rerecord">Record again</button>}
      {r.problem && <p role="alert" className="cp-form-problem">{r.problem}</p>}
    </div>
  );
}
