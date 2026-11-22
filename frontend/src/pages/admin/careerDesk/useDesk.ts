import { useCallback, useEffect, useRef, useState } from 'react';
import { loadErrorText, type DeskAnswer } from './careerDeskApi';

/** One desk read: the data, or an honest error (never an empty list in its place), and a reload that ignores stale answers. */
export function useDeskData<T>(load: () => Promise<T>, what: string): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => {
    const mine = ++seq.current;
    loadRef.current().then((d) => { if (mine === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (mine === seq.current) setError(loadErrorText(e, what)); });
  }, [what]);
  useEffect(() => { reload(); return () => { seq.current += 1; }; }, [reload]);
  return { data, error, reload };
}

export interface DeskResult { ok: boolean; text: string; audit: string | null; link?: string | null; code?: string | null }

const CENTRAL_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
/** The audit line under a done action: the server writes one audit row (actor = the signed-in staff member) for every action it runs. */
export const auditLine = (at: Date) => `Saved to the audit log at ${CENTRAL_TIME.format(at)} Central.`;

/**
 * Runs desk actions one at a time: while one is in flight every other click (a double click included) is ignored, so a
 * button can never send twice. `busy` names the action in flight (its buttons show it); `result` is the server's answer.
 */
export function useDeskAction(): { busy: string | null; result: DeskResult | null; run: (key: string, call: () => Promise<DeskAnswer>, after?: (a: DeskAnswer) => void) => Promise<void>; clear: () => void } {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<DeskResult | null>(null);
  const lock = useRef(false);
  const run = useCallback(async (key: string, call: () => Promise<DeskAnswer>, after?: (a: DeskAnswer) => void) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    try {
      const a = await call();
      setResult(a.ok ? { ok: true, text: a.message, audit: auditLine(new Date()), link: a.link, code: a.code } : { ok: false, text: a.message, audit: null });
      after?.(a);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }, []);
  const clear = useCallback(() => setResult(null), []);
  return { busy, result, run, clear };
}
