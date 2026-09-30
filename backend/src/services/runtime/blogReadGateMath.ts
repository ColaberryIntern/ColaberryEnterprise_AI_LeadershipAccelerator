/**
 * blogReadGateMath — pure logic for the blog "2 continuous minutes" read gate.
 *
 * Blogs are external links (no in-app body to instrument), so "reading" is
 * measured as continuous drawer-open dwell: the client sends periodic beats
 * carrying the wall-clock delta since the last beat. Unlike the video watch
 * ratchet (which only ever increases), this gate is CONTINUOUS — if the gap
 * since the last beat exceeds RESET_GAP_S the student left, so the 2-minute
 * window RESETS and they start over. Once satisfied, though, it stays satisfied
 * (the credit is earned and does not decay).
 *
 * Pure + dependency-free (time is injected) so it is fully unit-testable; the
 * service is the thin I/O shell that persists ReadState to blog_post_views.
 */

export interface ReadState {
  dwell_s: number;              // seconds in the CURRENT continuous window
  last_beat_at: string | null;  // ISO of the most recent beat (for gap detection)
  satisfied_at: string | null;  // ISO when the 2-minute bar was first cleared (sticky)
}

export interface ReadBeat { delta_s: number; }

export const REQUIRED_READ_S = 120;       // 2 minutes
export const RESET_GAP_S = 90;            // no beat for this long ⇒ they left ⇒ restart the window
export const MAX_DELTA_PER_BEAT_S = 90;   // clamp a single beat (survives background-tab throttling ~60s)

const EMPTY: ReadState = { dwell_s: 0, last_beat_at: null, satisfied_at: null };

/**
 * Fold one beat into the read state at time `nowIso`. If the gap since the last
 * beat exceeds RESET_GAP_S (or there was no prior beat) the continuous window
 * restarts from this beat; otherwise the clamped delta accumulates. satisfied_at
 * latches the first moment dwell crosses the 2-minute line and never clears.
 */
export function accumulateRead(prev: ReadState | null | undefined, beat: ReadBeat, nowIso: string): ReadState {
  const p: ReadState = prev && typeof prev === 'object' ? { ...EMPTY, ...prev } : EMPTY;
  const now = new Date(nowIso).getTime();
  const delta = Math.min(Math.max(Number(beat?.delta_s) || 0, 0), MAX_DELTA_PER_BEAT_S);
  const lastMs = p.last_beat_at ? new Date(p.last_beat_at).getTime() : null;
  const gap = lastMs != null ? (now - lastMs) / 1000 : Infinity;
  const base = lastMs == null || gap > RESET_GAP_S ? 0 : p.dwell_s;  // left → restart the window
  const dwell_s = base + delta;
  const satisfied_at = p.satisfied_at || (dwell_s >= REQUIRED_READ_S ? nowIso : null);
  return { dwell_s, last_beat_at: nowIso, satisfied_at };
}

/** Verdict for the current state: met (sticky once satisfied), progress, target. */
export function meetsReadRequirement(state: ReadState | null | undefined): { met: boolean; read_s: number; required_s: number } {
  const dwell = Math.max(0, state?.dwell_s ?? 0);
  const met = !!state?.satisfied_at || dwell >= REQUIRED_READ_S;
  return { met, read_s: Math.min(REQUIRED_READ_S, Math.round(dwell)), required_s: REQUIRED_READ_S };
}
