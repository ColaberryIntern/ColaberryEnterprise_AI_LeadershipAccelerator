import { useEffect, useRef, useState } from 'react';
import { fetchAttemptApi, fetchReadAloudLineApi, uploadAttemptApi, type AttemptView, type ReadAloudLine } from './careerPrepApi';
import { failedText } from './logic/tryFeedback';

/**
 * Career Prep v27, CP5.8 (Ali 2026-11-21, option B): the read-aloud warm-up's recording logic. AUDIO ONLY: the camera is
 * never asked for. Record arms the microphone and shows the line (a level meter proves the mic hears you); the student
 * gets up to 15 seconds of silent prep, then taps Go and reads; Stop (or the 60-second cap) sends it. Nothing is
 * recorded or uploaded before Go. The score is polled every 3 s, at most 40 times, like a Try answer; the server deletes
 * the recording once it is scored. A failed attempt says why (failedText), e.g. an unclear recording.
 */
export type ReadPhase = 'idle' | 'armed' | 'reading' | 'uploading' | 'scoring' | 'done' | 'failed';
export interface ReadAloudApi {
  phase: ReadPhase; line: ReadAloudLine | null; prepLeft: number; level: number; attempt: AttemptView | null; problem: string | null;
  arm: () => void; go: () => void; stop: () => void; reset: () => void;
}
export const PREP_SECONDS = 15;
const MAX_READ_MS = 60_000;
const POLL_MS = 3000;
const MAX_POLLS = 40;
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2, 10)}`);

/** 0 to 1 loudness from the mic, read about 10 times a second; stays 0 if the browser has no audio analyser. */
function useMicLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!stream || !Ctx || !stream.getAudioTracks().length) { setLevel(0); return undefined; }
    const ctx = new Ctx();
    const an = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const id = window.setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    }, 100);
    return () => { window.clearInterval(id); void ctx.close().catch(() => undefined); };
  }, [stream]);
  return level;
}

/** Upload one reading (with its line id) and poll for the score. Polling stops when the part or the room is left. */
function useSendReading(sessionId: string, segmentIndex: number) {
  const [phase, setPhase] = useState<ReadPhase>('idle');
  const gone = useRef(false);
  useEffect(() => { gone.current = false; return () => { gone.current = true; }; }, []);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const settle = (a: AttemptView) => { setAttempt(a); if (a.status === 'done') setPhase('done'); else { setProblem(failedText(a.errorClass)); setPhase('failed'); } };
  const poll = async (id: string, n = 0): Promise<void> => {
    if (gone.current) return;
    const a = await fetchAttemptApi(sessionId, id).catch(() => null);
    if (gone.current) return;
    if (a && a.status !== 'pending') { settle(a); return; }
    if (n >= MAX_POLLS) { setPhase('failed'); setProblem('Scoring is taking too long. Try again in a moment.'); return; }
    await new Promise((r) => setTimeout(r, POLL_MS));
    await poll(id, n + 1);
  };
  const send = async (blob: Blob, lineId: string) => {
    setPhase('uploading');
    try {
      const a = await uploadAttemptApi(sessionId, segmentIndex, newKey(), blob, undefined, lineId);
      if (a.status !== 'pending') { settle(a); return; }
      setPhase('scoring');
      await poll(a.id);
    } catch { setPhase('failed'); setProblem('The recording did not upload. Check your connection, then try again.'); }
  };
  return { phase, setPhase, attempt, setAttempt, problem, setProblem, send };
}

/**
 * Arms the microphone for one reading: the line first, THEN the microphone, so a failed line fetch never leaves a live mic,
 * and each failure says what went wrong. ONE request at a time: a second Record (a double click) while the first is still
 * loading is a no-op. NOTHING SURVIVES UNMOUNT: leaving the part or the room while the line is loading means the mic is
 * never asked for, and a mic granted after unmount is stopped at once instead of being kept.
 */
function useArm(onProblem: (p: string | null) => void, onArmed: () => void) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [line, setLine] = useState<ReadAloudLine | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);
  const arm = async () => {
    if (stream || pending.current) return;
    pending.current = true;
    onProblem(null);
    try {
      let l: ReadAloudLine;
      try { l = await fetchReadAloudLineApi(); } catch { if (alive.current) onProblem('Could not load the line to read. Check your connection, then press Record again.'); return; }
      if (!alive.current) return;
      let m: MediaStream;
      try { m = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); } catch { if (alive.current) onProblem('Allow the microphone for this site, then press Record again.'); return; }
      if (!alive.current) { m.getTracks().forEach((t) => t.stop()); return; }
      setLine(l); setStream(m); onArmed();
    } finally { pending.current = false; }
  };
  return { stream, setStream, line, setLine, alive, arm };
}

export function useReadAloud(sessionId: string, segmentIndex: number): ReadAloudApi {
  const s = useSendReading(sessionId, segmentIndex);
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const a = useArm(s.setProblem, () => { setPrepLeft(PREP_SECONDS); s.setPhase('armed'); });
  const rec = useRef<MediaRecorder | null>(null);
  const cap = useRef<number | undefined>(undefined);
  const level = useMicLevel(a.stream);
  const release = () => { a.stream?.getTracks().forEach((t) => t.stop()); a.setStream(null); window.clearTimeout(cap.current); };
  // Leaving mid-reading stops the recorder; its onstop sees the hook is gone and sends nothing.
  useEffect(() => () => { window.clearTimeout(cap.current); const r = rec.current; if (r && r.state === 'recording') r.stop(); }, []);
  useEffect(() => {
    if (s.phase !== 'armed' || prepLeft <= 0) return undefined;
    const id = window.setTimeout(() => setPrepLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [s.phase, prepLeft]);
  const go = () => {
    const line = a.line;
    if (!a.stream || !line) return;
    const chunks: Blob[] = [];
    let r: MediaRecorder;
    try { r = new MediaRecorder(a.stream); } catch {
      // A browser that cannot record this stream: say so and let go of the microphone.
      release(); s.setProblem('This browser could not record. Try another browser, then press Record again.'); s.setPhase('failed'); return;
    }
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => { release(); if (a.alive.current) void s.send(new Blob(chunks, { type: 'audio/webm' }), line.id); };
    rec.current = r;
    r.start();
    cap.current = window.setTimeout(() => r.state !== 'inactive' && r.stop(), MAX_READ_MS);
    s.setPhase('reading');
  };
  return {
    phase: s.phase, line: a.line, prepLeft, level, attempt: s.attempt, problem: s.problem,
    arm: () => { void a.arm(); }, go, stop: () => rec.current?.stop(),
    reset: () => { release(); s.setAttempt(null); s.setProblem(null); a.setLine(null); s.setPhase('idle'); },
  };
}
