import { useCallback, useEffect, useRef, useState } from 'react';
import { patchSessionApi, startSessionApi, type PrepSessionView, type StoredPlan } from './careerPrepApi';
import * as M from './logic/sessionMachine';

/**
 * Career Prep v27 (CP4.3): one timed session, the pure machine (sessionMachine) kept in step with the server.
 * Start asks the server (which resumes today's open session, so a reload continues where it was: done
 * segments stay done). Every move is sent with the real active seconds; the server only lets them grow. A
 * failed sync never stops the timer: the next update carries the latest numbers again.
 */
export interface SessionApi {
  session: PrepSessionView | null; state: M.SessionState; now: number; error: string | null;
  start: () => Promise<void>; next: () => void; pause: () => void; resume: () => void; end: () => void;
}

export function useSession(plan: StoredPlan | null, onFinished: (s: PrepSessionView) => void): SessionApi {
  const [session, setSession] = useState<PrepSessionView | null>(null);
  const [state, setState] = useState<M.SessionState>(M.idle());
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(onFinished);
  finished.current = onFinished;
  const segs = (session?.segments ?? []).map((s) => ({ title: s.title, minutes: s.minutes }));

  useEffect(() => { if (state.status !== 'running') return undefined; const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, [state.status]);

  const sync = useCallback((s: M.SessionState, action: 'segment_done' | 'pause' | 'resume' | 'finish' | 'end', segmentIndex?: number): Promise<void> => {
    if (!session) return Promise.resolve();
    return patchSessionApi(session.id, { action, secondsActive: M.activeSeconds(s, Date.now()), ...(segmentIndex !== undefined ? { segmentIndex } : {}) })
      .then((v) => { setSession(v); setError(null); if (v.status === 'finished') finished.current(v); })
      .catch(() => setError('Could not save your progress just now. Keep going; it will save on the next step.'));
  }, [session]);

  const start = useCallback(async () => {
    if (!plan) return;
    try {
      const { session: s } = await startSessionApi(plan.id);
      setSession(s);
      const done = s.segments.map((x, i) => (x.state === 'done' ? i : -1)).filter((i) => i >= 0);
      const first = done.length ? Math.max(...done) + 1 : 0;
      const specs = s.segments.map((x) => ({ title: x.title, minutes: x.minutes }));
      if (first >= specs.length) { setState({ ...M.idle(), status: 'finished', done, activeMs: s.secondsActive * 1000 }); return; }
      // One clock reading for both the deadline and the display, so the ring opens on the full part (2:00, not 2:01).
      const t = Date.now();
      setNow(t);
      const begun = M.start(M.idle(), specs.slice(first), t);
      setState({ ...begun, index: first, done, activeMs: s.secondsActive * 1000 });
    } catch { setError('Could not start the session. Try again.'); }
  }, [plan]);

  // The segment is marked done first, then (after the last one) the session is finished: the server ignores changes after finish.
  const next = useCallback(() => setState((s) => {
    const t = Date.now();
    setNow(t);
    const n = M.next(s, segs, t);
    void sync(n, 'segment_done', s.index).then(() => (n.status === 'finished' ? sync(n, 'finish') : undefined));
    return n;
  }), [segs, sync]);
  const pause = useCallback(() => setState((s) => { const n = M.pause(s, Date.now()); void sync(n, 'pause'); return n; }), [sync]);
  const resume = useCallback(() => setState((s) => { const n = M.resume(s, Date.now()); void sync(n, 'resume'); return n; }), [sync]);
  const end = useCallback(() => setState((s) => { const n = M.end(s, Date.now()); void sync(n, 'end'); return n; }), [sync]);
  return { session, state, now, error, start, next, pause, resume, end };
}
