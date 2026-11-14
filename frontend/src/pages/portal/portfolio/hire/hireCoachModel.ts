import type { CoachEvent, VideoCoaching } from '../../../../services/hireStudioApi';

/**
 * What the live coaching overlay shows at second `t` of playback. Pure, so the overlay is just
 * a picture of this and the arithmetic is tested on its own.
 */
export interface LiveReadout {
  /** Pace over the 10 s around now, or null before there is any. */
  wpm: number | null;
  paceBand: 'slow' | 'good' | 'fast' | null;
  fillers: number;
  hedges: number;
  longPauses: number;
  /** A filler or hedge said within the last 1.2 s: the flash on screen. */
  flash: CoachEvent | null;
  /** Inside a pause of half a second or more. */
  pausing: boolean;
  /** Voice level now, 0..1, from the real audio. */
  energy: number;
}

/** Microsoft Speaker Coach's band, the same one the backend scores against. */
export const PACE = { lo: 100, hi: 165 } as const;
const FLASH_S = 1.2;

export function liveAt(c: VideoCoaching, t: number): LiveReadout {
  const events = c.events ?? [];
  const pace = c.pace ?? [];
  let wpm: number | null = null;
  for (const p of pace) { if (p.t - 2.5 <= t) wpm = p.wpm; else break; }
  const said = events.filter((e) => e.t <= t);
  const flash = [...said].reverse().find((e) => e.kind !== 'pause' && t - e.t <= FLASH_S) ?? null;
  const pausing = events.some((e) => e.kind === 'pause' && e.t <= t && t < e.t + (e.dur ?? 0));
  const energy = c.voice?.energy?.[Math.floor(t * 2)] ?? 0;
  return {
    wpm,
    paceBand: wpm === null ? null : wpm < PACE.lo ? 'slow' : wpm > PACE.hi ? 'fast' : 'good',
    fillers: said.filter((e) => e.kind === 'filler').length,
    hedges: said.filter((e) => e.kind === 'hedge').length,
    longPauses: said.filter((e) => e.kind === 'pause' && e.label === 'long').length,
    flash,
    pausing,
    energy,
  };
}

/** Marks for the scrubber: fillers, hedges and long pauses only (short pauses are normal speech). */
export function marks(c: VideoCoaching): CoachEvent[] {
  return (c.events ?? []).filter((e) => e.kind !== 'pause' || e.label === 'long');
}

/** Coaching new enough for the live view. An older record (notes only) keeps the plain player. */
export const hasLive = (c: VideoCoaching | null): c is VideoCoaching & { version: 2; events: CoachEvent[] } =>
  Boolean(c && c.version === 2 && c.events);

export const scoreTone = (s: number): 'good' | 'ok' | 'low' => (s >= 80 ? 'good' : s >= 50 ? 'ok' : 'low');

export const LEVEL_TEXT = { strong: 'Strong', ok: 'Good', work_on: 'Work on this' } as const;
