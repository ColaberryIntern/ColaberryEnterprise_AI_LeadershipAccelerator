import React, { useEffect, useRef, useState } from 'react';
import { fetchAttemptApi, uploadAttemptApi, type AttemptView } from './careerPrepApi';

/**
 * Career Prep v27 (CP4.4): record one answer on camera, upload it, and show its score when it is ready.
 * The camera is asked for only when the student presses Record. The upload carries a client key made once
 * per recording, and "Send again" after a dropped connection re-sends the same recording with the same key,
 * so the server treats it as the same attempt (never scored twice). The score is
 * polled (every 3 s, at most 40 times); a failed scoring offers "Record again". Nothing here reads the face.
 */
type Phase = 'ready' | 'recording' | 'uploading' | 'scoring' | 'done' | 'failed' | 'unsent';
const POLL_MS = 3000;
const MAX_POLLS = 40;
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2, 10)}`);

export function TryRecorder({ sessionId, segmentIndex, prompt }: { sessionId: string; segmentIndex: number; prompt: string }): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('ready');
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const unsent = useRef<{ blob: Blob; key: string } | null>(null);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const poll = async (id: string, n = 0): Promise<void> => {
    const a = await fetchAttemptApi(sessionId, id).catch(() => null);
    if (a && a.status !== 'pending') { setAttempt(a); setPhase(a.status === 'done' ? 'done' : 'failed'); return; }
    if (n >= MAX_POLLS) { setPhase('failed'); setProblem('Scoring is taking too long. Record again in a moment.'); return; }
    await new Promise((r) => setTimeout(r, POLL_MS));
    return poll(id, n + 1);
  };

  const send = async (take: { blob: Blob; key: string }) => {
    setPhase('uploading');
    setProblem(null);
    unsent.current = take;
    try {
      const a = await uploadAttemptApi(sessionId, segmentIndex, take.key, take.blob);
      unsent.current = null;
      if (a.status !== 'pending') { setAttempt(a); setPhase(a.status === 'done' ? 'done' : 'failed'); return; }
      setPhase('scoring');
      await poll(a.id);
    } catch { setPhase('unsent'); setProblem('The recording did not upload. Check your connection, then send it again.'); }
  };

  const record = async () => {
    setProblem(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      chunks.current = [];
      const r = new MediaRecorder(stream.current);
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.current?.getTracks().forEach((t) => t.stop()); void send({ blob: new Blob(chunks.current, { type: 'video/webm' }), key: newKey() }); };
      rec.current = r;
      r.start();
      setPhase('recording');
    } catch { setProblem('Allow the camera and microphone for this site, then press Record again.'); }
  };

  return (
    <div className="cp-try" data-testid="cp-try">
      <p className="cp-try-q"><b>Question:</b> {prompt}</p>
      {phase === 'ready' && <button type="button" className="cp-send" onClick={() => void record()} data-testid="cp-record">● Record</button>}
      {phase === 'recording' && <button type="button" className="cp-send" onClick={() => rec.current?.stop()} data-testid="cp-stop">■ Stop</button>}
      {(phase === 'uploading' || phase === 'scoring') && <p aria-live="polite">{phase === 'uploading' ? 'Uploading your answer...' : 'Scoring your answer...'}</p>}
      {phase === 'done' && attempt?.result && (
        <div className="cp-try-result" data-testid="cp-try-result">
          <ul className="cp-list">{attempt.result.scores.map((s) => <li key={s.key}><b>{s.label}</b>: {s.value} (target {s.target}) · <small>{s.source}</small></li>)}</ul>
          <ul className="cp-list">{attempt.result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" className="cp-chip" onClick={() => { setAttempt(null); setPhase('ready'); }}>Try again</button>
        </div>
      )}
      {phase === 'unsent' && unsent.current && <button type="button" className="cp-send" onClick={() => { if (unsent.current) void send(unsent.current); }} data-testid="cp-resend">Send again</button>}
      {(phase === 'failed' || phase === 'unsent') && <button type="button" className="cp-chip" onClick={() => { unsent.current = null; setProblem(null); setPhase('ready'); }} data-testid="cp-rerecord">Record again</button>}
      {problem && <p role="alert" className="cp-form-problem">{problem}</p>}
    </div>
  );
}
