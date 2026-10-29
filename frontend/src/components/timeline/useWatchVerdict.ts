/**
 * useWatchVerdict — the watch gate's state from the moment a card opens, not
 * from the first playback heartbeat.
 *
 * Before this, the drawer and workspace learned the requirement only from a beat
 * response, so a freshly opened video showed an ENABLED Mark complete; clicking it
 * hit the server's 422 (2026-10-29, Ali: "it should dim it out until they have
 * watched enough"). Now the verdict is fetched on open, and `null` means "still
 * checking", which the button treats as not-yet-met.
 *
 * Fail-open on a fetch error: an unreachable status endpoint must not trap the
 * student. The server re-checks on completion regardless.
 */
import { useEffect, useRef, useState } from 'react';

export interface WatchVerdict { watched_pct: number; required_pct: number | null; met: boolean; }

export const WATCH_FAIL_OPEN: WatchVerdict = { watched_pct: 0, required_pct: null, met: true };

/** True while the button must stay dimmed: still checking, or below the bar. */
export function isWatchBlocked(watch: WatchVerdict | null): boolean {
  return watch == null || (watch.required_pct != null && !watch.met);
}

/** Button copy for a watch-gated completion, or null when it is open to click. */
export function watchGateLabel(watch: WatchVerdict | null, verb = 'Keep watching'): string | null {
  if (watch == null) return 'Checking your progress…';
  if (watch.required_pct != null && !watch.met) return `${verb} · ${watch.watched_pct}/${watch.required_pct}%`;
  return null;
}

/**
 * Holds the verdict for `key` (a card id or ambient media ref). `load` fetches
 * it on open; `null` key = not watch-gated here, nothing is fetched. Beats feed
 * fresher verdicts in through the returned setter.
 */
export function useWatchVerdict(key: string | null, load: () => Promise<WatchVerdict>) {
  const [watch, setWatch] = useState<WatchVerdict | null>(null);
  // `load` is a fresh closure every render; hold the latest in a ref so the
  // fetch re-runs only when the key changes, not on every render.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    setWatch(null);
    if (!key) return;
    let alive = true;
    loadRef.current().then((v) => { if (alive) setWatch(v); }).catch(() => { if (alive) setWatch(WATCH_FAIL_OPEN); });
    return () => { alive = false; };
  }, [key]);
  return [watch, setWatch] as const;
}
