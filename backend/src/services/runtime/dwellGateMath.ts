/**
 * dwellGateMath — pure logic for the generic "N continuous seconds in the drawer"
 * completion gate applied to passive-content curriculum types (intel breakdowns,
 * reflections, discussions, …) that have points but no other criteria.
 *
 * Same continuous-dwell shape as the blog read gate, but the required threshold is
 * a PARAMETER (per-type, ≥120s) rather than a constant: dwell accumulates clamped
 * beat deltas; if the gap since the last beat exceeds RESET_GAP_S the student left,
 * so the window RESTARTS; satisfied_at latches sticky once the required seconds are
 * cleared. Pure + time-injected so it is fully unit-testable.
 */

export interface DwellState {
  dwell_s: number;
  last_beat_at: string | null;
  satisfied_at: string | null;
}

export interface DwellBeat { delta_s: number; }

export const RESET_GAP_S = 90;            // no beat for this long ⇒ they left ⇒ restart
export const MAX_DELTA_PER_BEAT_S = 90;   // clamp a single beat (survives hidden-tab throttling)

const EMPTY: DwellState = { dwell_s: 0, last_beat_at: null, satisfied_at: null };

/** Fold one beat into the dwell state at `nowIso`, latching satisfied at `requiredS`. */
export function accumulateDwell(prev: DwellState | null | undefined, beat: DwellBeat, nowIso: string, requiredS: number): DwellState {
  const p: DwellState = prev && typeof prev === 'object' ? { ...EMPTY, ...prev } : EMPTY;
  const now = new Date(nowIso).getTime();
  const delta = Math.min(Math.max(Number(beat?.delta_s) || 0, 0), MAX_DELTA_PER_BEAT_S);
  const lastMs = p.last_beat_at ? new Date(p.last_beat_at).getTime() : null;
  const gap = lastMs != null ? (now - lastMs) / 1000 : Infinity;
  const base = lastMs == null || gap > RESET_GAP_S ? 0 : p.dwell_s;   // left → restart the window
  const dwell_s = base + delta;
  const satisfied_at = p.satisfied_at || (dwell_s >= requiredS ? nowIso : null);
  return { dwell_s, last_beat_at: nowIso, satisfied_at };
}

/** Verdict against a per-type required threshold (met is sticky once satisfied). */
export function meetsDwell(state: DwellState | null | undefined, requiredS: number): { met: boolean; dwell_s: number; required_s: number } {
  const dwell = Math.max(0, state?.dwell_s ?? 0);
  const met = !!state?.satisfied_at || dwell >= requiredS;
  return { met, dwell_s: Math.min(requiredS, Math.round(dwell)), required_s: requiredS };
}
