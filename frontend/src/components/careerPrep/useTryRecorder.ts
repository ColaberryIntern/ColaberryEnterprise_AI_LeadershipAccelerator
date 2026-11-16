import { useEffect, useRef, useState } from 'react';
import { fetchAttemptApi, uploadAttemptApi, type AttemptView } from './careerPrepApi';

/**
 * Career Prep v27 (CP4.4): the recording logic behind TryRecorder. The camera is asked for only when the
 * student presses Record. Each recording gets one client key; "Send again" after a dropped connection
 * re-sends the SAME recording with the SAME key, so the server treats it as one attempt (never scored
 * twice). The score is polled every 3 s, at most 40 times. Only the audio's words and timing are scored.
 */
export type RecPhase = 'ready' | 'recording' | 'uploading' | 'scoring' | 'done' | 'failed' | 'unsent';
export interface TryRecorderApi { phase: RecPhase; attempt: AttemptView | null; problem: string | null; record: () => void; stop: () => void; resend: () => void; reset: () => void }
const POLL_MS = 3000;
const MAX_POLLS = 40;
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2, 10)}`);

export function useTryRecorder(sessionId: string, segmentIndex: number): TryRecorderApi {
  const [phase, setPhase] = useState<RecPhase>('ready');
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const unsent = useRef<{ blob: Blob; key: string } | null>(null);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const settle = (a: AttemptView) => { setAttempt(a); setPhase(a.status === 'done' ? 'done' : 'failed'); };
  const poll = async (id: string, n = 0): Promise<void> => {
    const a = await fetchAttemptApi(sessionId, id).catch(() => null);
    if (a && a.status !== 'pending') { settle(a); return; }
    if (n >= MAX_POLLS) { setPhase('failed'); setProblem('Scoring is taking too long. Record again in a moment.'); return; }
    await new Promise((r) => setTimeout(r, POLL_MS));
    await poll(id, n + 1);
  };
  const send = async (take: { blob: Blob; key: string }) => {
    setPhase('uploading'); setProblem(null); unsent.current = take;
    try {
      const a = await uploadAttemptApi(sessionId, segmentIndex, take.key, take.blob);
      unsent.current = null;
      if (a.status !== 'pending') { settle(a); return; }
      setPhase('scoring');
      await poll(a.id);
    } catch { setPhase('unsent'); setProblem('The recording did not upload. Check your connection, then send it again.'); }
  };
  const record = async () => {
    setProblem(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream.current);
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { stream.current?.getTracks().forEach((t) => t.stop()); void send({ blob: new Blob(chunks, { type: 'video/webm' }), key: newKey() }); };
      rec.current = r;
      r.start();
      setPhase('recording');
    } catch { setProblem('Allow the camera and microphone for this site, then press Record again.'); }
  };
  return {
    phase, attempt, problem,
    record: () => { void record(); },
    stop: () => rec.current?.stop(),
    resend: () => { if (unsent.current) void send(unsent.current); },
    reset: () => { unsent.current = null; setAttempt(null); setProblem(null); setPhase('ready'); },
  };
}
