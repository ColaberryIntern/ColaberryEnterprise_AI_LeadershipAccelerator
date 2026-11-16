/**
 * Career Prep v27 (CP4.3): the timed session as a PURE state machine (kit P4.5).
 *
 *   idle -> running(segment i) <-> paused -> ... -> finished | ended
 *
 * Time is reconciled from timestamps, never from counting ticks: a running segment stores its deadline
 * (epoch ms), a paused one stores the milliseconds it had left. So a hidden tab, a sleeping laptop or a
 * slow render always shows the right time when it looks again, and "minutes active" is the sum of real
 * running time. Every function returns a new state; same input, same output.
 */
export interface SegmentSpec { title: string; minutes: number }
export type Status = 'idle' | 'running' | 'paused' | 'finished' | 'ended';
export interface SessionState {
  status: Status;
  index: number;
  /** Running: when the current segment's time runs out (epoch ms). */
  deadline: number | null;
  /** Paused: milliseconds the current segment still had. */
  remaining: number | null;
  /** Milliseconds actually spent running, across all segments. */
  activeMs: number;
  /** Running: when the current running stretch began (epoch ms), for activeMs. */
  since: number | null;
  done: number[];
}

const ms = (s: SegmentSpec) => s.minutes * 60_000;

export const idle = (): SessionState => ({ status: 'idle', index: 0, deadline: null, remaining: null, activeMs: 0, since: null, done: [] });

export function start(s: SessionState, segs: SegmentSpec[], now: number): SessionState {
  if (s.status !== 'idle' || !segs.length) return s;
  return { ...s, status: 'running', index: 0, deadline: now + ms(segs[0]), since: now };
}

export function pause(s: SessionState, now: number): SessionState {
  if (s.status !== 'running' || s.deadline === null || s.since === null) return s;
  return { ...s, status: 'paused', remaining: Math.max(0, s.deadline - now), deadline: null, activeMs: s.activeMs + (now - s.since), since: null };
}

export function resume(s: SessionState, now: number): SessionState {
  if (s.status !== 'paused' || s.remaining === null) return s;
  return { ...s, status: 'running', deadline: now + s.remaining, remaining: null, since: now };
}

/** Move on: mark the current segment done and start the next, or finish after the last. */
export function next(s: SessionState, segs: SegmentSpec[], now: number): SessionState {
  if (s.status !== 'running' && s.status !== 'paused') return s;
  const active = s.status === 'running' && s.since !== null ? s.activeMs + (now - s.since) : s.activeMs;
  const done = s.done.includes(s.index) ? s.done : [...s.done, s.index];
  if (s.index >= segs.length - 1) return { ...s, status: 'finished', done, deadline: null, remaining: null, since: null, activeMs: active };
  const i = s.index + 1;
  return { ...s, status: 'running', index: i, done, deadline: now + ms(segs[i]), remaining: null, since: now, activeMs: active };
}

export function end(s: SessionState, now: number): SessionState {
  if (s.status === 'finished' || s.status === 'ended' || s.status === 'idle') return s;
  const active = s.status === 'running' && s.since !== null ? s.activeMs + (now - s.since) : s.activeMs;
  return { ...s, status: 'ended', deadline: null, remaining: null, since: null, activeMs: active };
}

/** Seconds left in the current segment at `now` (0 when its time is up; it does not advance by itself). */
export function secondsLeft(s: SessionState, now: number): number {
  if (s.status === 'running' && s.deadline !== null) return Math.max(0, Math.ceil((s.deadline - now) / 1000));
  if (s.status === 'paused' && s.remaining !== null) return Math.ceil(s.remaining / 1000);
  return 0;
}

/** Whole seconds actually practiced so far (what the server is told). */
export function activeSeconds(s: SessionState, now: number): number {
  const live = s.status === 'running' && s.since !== null ? now - s.since : 0;
  return Math.floor((s.activeMs + live) / 1000);
}

export const clock = (secs: number): string => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
