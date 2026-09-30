import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncState } from './AsyncPanel';

/**
 * useExplorerData — one fetch, with the three states kept genuinely separate.
 *
 * Pairs with `AsyncPanel`, which renders them. The split matters: a hook that
 * collapses "failed" into "no data" makes the distinction impossible to draw
 * downstream no matter how carefully the panel is written.
 *
 * ── WHY THERE IS A `key` INSTEAD OF A DEPENDENCY ARRAY ──────────────────────
 *
 * The obvious signature is `(fetcher, deps)` with `[...deps, nonce]` in the
 * effect — and it needs an `eslint-disable react-hooks/exhaustive-deps` to
 * silence the spread.
 *
 * **That disable comment is the exact defect that broke `main` on 2026-08-15.**
 * CI's own config records it: a `.ts` file (not `.tsx`) carrying an
 * `eslint-disable` for `react-hooks/exhaustive-deps` — a rule CRA does not
 * register for `.ts` — makes the comment itself an ESLint error, `CI=true`
 * promotes it to a failed build, and `tsc` says nothing. Main was unbuildable
 * for hours with every check green. I wrote that comment into this file, in this
 * extension, before catching it.
 *
 * So the signature takes a **stable string key** describing what is being
 * fetched, and the fetcher lives in a ref. The effect then depends on
 * `[key, nonce]` — two plain values, exhaustively — and no suppression is
 * needed anywhere. Removing the reason for the comment is a better fix than
 * renaming the file to make the comment legal.
 *
 * ── STALE RESPONSES ARE DISCARDED ───────────────────────────────────────────
 *
 * Every tab is filterable, so changing a filter twice quickly puts two requests
 * in flight. Without a guard the slower one lands last and the table shows
 * results for a filter that is no longer selected — a wrong answer that looks
 * entirely correct. The sequence counter drops anything that is not newest.
 */
export function useExplorerData<T>(
  fetcher: () => Promise<T>,
  /** Changes whenever the request should be re-issued (filters, ids, windows). */
  key: string,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ loading: true, error: null, data: null });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);
  const mounted = useRef(true);

  // The fetcher is a fresh closure every render; holding it in a ref keeps the
  // effect's dependencies honest without capturing a stale one.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const seq = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetcherRef
      .current()
      .then((data) => {
        if (!mounted.current || seq !== latest.current) return;
        setState({ loading: false, error: null, data });
      })
      .catch((err: unknown) => {
        if (!mounted.current || seq !== latest.current) return;
        // Normalised to an Error so the panel always has something to show.
        // The server's own message is preferred: a generic "request failed"
        // would hide a 400's field-level detail, which is the useful part.
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          (err as Error)?.message ||
          'Request failed';
        setState({ loading: false, error: new Error(message), data: null });
      });
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, reload };
}
