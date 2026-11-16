import { useCallback, useEffect, useRef, useState } from 'react';
import { patchSessionApi, startSessionApi, type PrepRecap, type PrepSessionView, type StoredPlan } from './careerPrepApi';
import * as M from './logic/sessionMachine';

/**
 * Career Prep v27 (CP4.3): one timed session, the pure machine (sessionMachine) kept in step with the server.
 * Start asks the server (which resumes today's open session, so a reload continues where it was: done
 * segments stay done, and a session left paused is resumed on the server too). Every move is sent with the
 * real active seconds; the server only lets them grow. A failed sync never stops the timer: the next update
 * carries the latest numbers again. When the session finishes or is ended, the server's recap (CP4.5) is
 * handed to `onOver`.
 *
 * The machine's state is mirrored in a ref so each move is computed ONCE, outside React's state updater,
 * and its request is sent once (an updater may run twice in StrictMode).
 */
type Action = 'segment_done' | 'pause' | 'resume' | 'finish' | 'end';
export interface SessionApi {
  session: PrepSessionView | null; state: M.SessionState; now: number; error: string | null; recap: PrepRecap | null;
  start: () => Promise<void>; next: () => void; pause: () => void; resume: () => void; end: () => void;
}

export function useSession(plan: StoredPlan | null, onOver: (s: PrepSessionView, recap: PrepRecap | null) => void): SessionApi {
  const [session, setSession] = useState<PrepSessionView | null>(null);
  const [state, setStateRaw] = useState<M.SessionState>(M.idle());
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [recap, setRecap] = useState<PrepRecap | null>(null);
  const over = useRef(onOver);
  over.current = onOver;
  const st = useRef(state);
  const ses = useRef(session);
  const setState = (s: M.SessionState) => { st.current = s; setStateRaw(s); };

  useEffect(() => { if (state.status !== 'running') return undefined; const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, [state.status]);

  const sync = useCallback(async (s: M.SessionState, action: Action, segmentIndex?: number): Promise<void> => {
    const current = ses.current;
    if (!current) return;
    try {
      const r = await patchSessionApi(current.id, { action, secondsActive: M.activeSeconds(s, Date.now()), ...(segmentIndex !== undefined ? { segmentIndex } : {}) });
      ses.current = r.session; setSession(r.session); setError(null);
      if (r.session.status === 'finished' || r.session.status === 'ended') { setRecap(r.recap ?? null); over.current(r.session, r.recap ?? null); }
    } catch { setError('Could not save your progress just now. Keep going; it will save on the next step.'); }
  }, []);

  const start = useCallback(async () => {
    if (!plan) return;
    try {
      const { session: s } = await startSessionApi(plan.id);
      ses.current = s; setSession(s); setRecap(null);
      const done = s.segments.map((x, i) => (x.state === 'done' ? i : -1)).filter((i) => i >= 0);
      const first = done.length ? Math.max(...done) + 1 : 0;
      if (first >= s.segments.length) { setState({ ...M.idle(), status: 'finished', done, activeMs: s.secondsActive * 1000 }); return; }
      // One clock reading for both the deadline and the display, so the ring opens on the full part (2:00, not 2:01).
      const t = Date.now();
      setNow(t);
      const begun = M.start(M.idle(), s.segments.slice(first).map((x) => ({ title: x.title, minutes: x.minutes })), t);
      setState({ ...begun, index: first, done, activeMs: s.secondsActive * 1000 });
      if (s.status === 'paused') await sync(st.current, 'resume');
    } catch { setError('Could not start the session. Try again.'); }
  }, [plan, sync]);

  const move = useCallback((step: (s: M.SessionState, t: number) => M.SessionState, action: Action) => {
    const t = Date.now();
    const before = st.current;
    const n = step(before, t);
    setNow(t);
    setState(n);
    // segment_done carries the part's index; after the last part the session is then finished (the server ignores changes after finish).
    if (action !== 'segment_done') { void sync(n, action); return; }
    void sync(n, 'segment_done', before.index).then(() => (n.status === 'finished' ? sync(n, 'finish') : undefined));
  }, [sync]);

  const segs = () => (ses.current?.segments ?? []).map((x) => ({ title: x.title, minutes: x.minutes }));
  return {
    session, state, now, error, recap, start,
    next: () => move((s, t) => M.next(s, segs(), t), 'segment_done'),
    pause: () => move(M.pause, 'pause'),
    resume: () => move(M.resume, 'resume'),
    end: () => move(M.end, 'end'),
  };
}
