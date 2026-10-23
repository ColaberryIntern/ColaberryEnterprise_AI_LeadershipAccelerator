/**
 * The entrance gate setting (WP-7, the prototype's SETTINGS.intro, A1.23): "First visit each day" (default), "Every time", or
 * "Never — go straight in". A per-browser convenience, so localStorage.
 *
 * MIGRATION. Before WP-7 the only choice besides daily was "Skip the gate", stored as GATE_SEEN_KEY = 'always' (which meant
 * NEVER show it: the opposite of the prototype's 'always'). The choice now has its own key; an old 'always' with no choice saved
 * reads as 'never', so nobody's gate starts appearing again. GATE_SEEN_KEY keeps only the Central day the gate was last passed.
 */
export type Entrance = 'daily' | 'always' | 'never';
export const ENTRANCE_KEY = 'colaberry.campus.entrance';
export const GATE_SEEN_KEY = 'colaberry.campus.gate.seen';
export const ENTRANCE_LABEL: Record<Entrance, string> = { daily: 'First visit each day', always: 'Every time', never: 'Never — go straight in' };

/** Today's date in Central time, YYYY-MM-DD (the portal's day boundary). */
export function centralDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function readEntrance(): Entrance {
  try {
    const v = window.localStorage.getItem(ENTRANCE_KEY);
    if (v === 'daily' || v === 'always' || v === 'never') return v;
    return window.localStorage.getItem(GATE_SEEN_KEY) === 'always' ? 'never' : 'daily';
  } catch {
    return 'daily';
  }
}

export function writeEntrance(v: Entrance): void {
  try {
    window.localStorage.setItem(ENTRANCE_KEY, v);
    if (window.localStorage.getItem(GATE_SEEN_KEY) === 'always') window.localStorage.removeItem(GATE_SEEN_KEY); // the old sentinel is now the choice above
  } catch { /* no storage: the choice lasts this visit */ }
}

/** Should the gate be skipped now? No storage at all: skip (a welcome, never a wall). */
export function gateSeen(now: Date): boolean {
  try {
    const e = readEntrance();
    if (e === 'never') return true;
    if (e === 'always') return false;
    return window.localStorage.getItem(GATE_SEEN_KEY) === centralDay(now);
  } catch {
    return true;
  }
}

export function markGateSeen(now: Date): void {
  try {
    // An old "Skip the gate" sentinel IS the choice until a new one is made (writeEntrance clears it); overwriting it with a date
    // would quietly turn "never" back into "daily".
    if (window.localStorage.getItem(GATE_SEEN_KEY) === 'always') return;
    window.localStorage.setItem(GATE_SEEN_KEY, centralDay(now));
  } catch { /* no storage */ }
}
