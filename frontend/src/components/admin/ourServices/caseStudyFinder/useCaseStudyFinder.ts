import { useCallback, useEffect, useRef, useState } from 'react';
import { buildProposal, getFinder, startFinderRun, type BuildResponse, type FinderProposal, type FinderState } from '../../../../services/caseStudyFinderApi';

/** Polls while a run is going; the last completed result stays on screen meanwhile. */
export const POLL_MS = 4000;

export interface FinderHook {
  state: FinderState | null;
  loading: boolean;
  error: string | null;
  running: boolean;
  run: () => Promise<void>;
  build: (p: FinderProposal, acknowledgeOverlaps: boolean) => Promise<BuildResponse | null>;
  busy: string | null;
}

export function useCaseStudyFinder(): FinderHook {
  const [state, setState] = useState<FinderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const load = useCallback(async (): Promise<FinderState | null> => {
    try {
      const s = await getFinder();
      if (alive.current) { setState(s); setError(null); }
      return s;
    } catch {
      if (alive.current) setError('Could not load the Case Study Finder.');
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  const poll = useCallback(async () => {
    const s = await load();
    if (alive.current && s?.run?.status === 'running') timer.current = setTimeout(() => { void poll(); }, POLL_MS);
  }, [load]);

  useEffect(() => {
    alive.current = true;
    void poll();
    return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); };
  }, [poll]);

  const run = useCallback(async () => {
    setError(null);
    try {
      const r = await startFinderRun();
      setState((s) => (s ? { ...s, run: r } : { run: r, result: null, resultAt: null, builds: [] }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void poll(); }, POLL_MS);
    } catch {
      setError('Could not start the Case Study Finder.');
    }
  }, [poll]);

  const build = useCallback(async (p: FinderProposal, ack: boolean): Promise<BuildResponse | null> => {
    setBusy(p.id); setError(null);
    try {
      const res = await buildProposal(p.id, p.pathScope, ack);
      if (res.kind === 'built' || res.kind === 'exists') await load();
      return res;
    } catch {
      setError('Could not prepare the case study build.');
      return null;
    } finally {
      setBusy(null);
    }
  }, [load]);

  return { state, loading, error, running: state?.run?.status === 'running', run, build, busy };
}
