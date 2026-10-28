/**
 * projectFreshness — "is the project on this screen the server's answer, or a
 * copy saved on this device?"
 *
 * ── THE DAY THIS EXISTS FOR ─────────────────────────────────────────────────
 *
 * ProjectWorkspacePage pulls the project from the server on mount, and that
 * pull fails SOFT: on any error the page keeps rendering the copy already in
 * localStorage. The intent is right — a student offline mid-build should lose
 * the refresh, not the workspace — but the fallback was SILENT, and stale work
 * and current work look identical on screen. So the page could serve a snapshot
 * from days ago with nothing saying so, and the natural next move (hard
 * refresh) does nothing at all, because the store outlives a refresh.
 *
 * On 2026-10-21 that cost Mihret and Quincy an evening between them. See
 * `adoptServerContent` in projectHydrate for the content-staleness defect that
 * produced their specific symptom; this module covers the other half — the case
 * where the server genuinely could not be reached, or was reached and its
 * answer could not be stored.
 *
 * ── WHAT COUNTS AS CONFIRMED ────────────────────────────────────────────────
 *
 * "Confirmed" means the sync layer reached the server AND the resulting copy
 * landed on this device. Two different failures break that, and the student
 * needs different words for each:
 *
 *   pull_failed         we could not reach the server at all
 *   cache_write_failed  we reached it, got a newer copy, and this device had no
 *                       room to store it — so the screen is showing the older
 *                       one and the next reload will show it again
 *
 * The timestamp is persisted by `projectsStore` (which owns storage scoping);
 * the stale SIGNAL is per-session and lives here, because a stale condition is
 * a fact about this page load, not about the cache.
 *
 * A 404 is neither. When the projects API is flag-gated off there is no server
 * to be stale against, and `projectSync` deliberately does not report one — so
 * nothing here ever fires and the banner never appears. Saying "we could not
 * reach the server" when the feature is simply switched off would be a lie this
 * module invented.
 */
import { markProjectsConfirmed, projectsConfirmedAt } from './projectsStore';

export type StaleReason = 'pull_failed' | 'cache_write_failed';

export type CopyState = {
  /** True when this device is knowingly showing something other than the server's answer. */
  stale: boolean;
  /** Why, when stale. Null when the copy is confirmed. */
  reason: StaleReason | null;
  /** HTTP status behind a `pull_failed`, when there was one. */
  status?: number;
  /** Epoch ms this copy was last confirmed against the server; null if never. */
  confirmedAt: number | null;
};

let reason: StaleReason | null = null;
let status: number | undefined;

type Listener = (state: CopyState) => void;
const listeners = new Set<Listener>();

/** The current state, read fresh — the timestamp lives in storage, not in a variable. */
export function copyState(): CopyState {
  return { stale: reason !== null, reason, status, confirmedAt: projectsConfirmedAt() };
}

function notify(): void {
  const state = copyState();
  listeners.forEach((fn) => {
    try { fn(state); } catch { /* a listener must never break the sync that reported */ }
  });
}

/**
 * Subscribe to freshness changes. Fires immediately with the current state, so
 * a banner mounting AFTER the pull has already failed still learns about it —
 * the workspace page's pull starts on mount and can resolve before a child
 * banner's effect runs, and a listener that only hears future events would miss
 * exactly the case it exists for.
 *
 * Returns an unsubscribe function.
 */
export function onCopyState(fn: Listener): () => void {
  listeners.add(fn);
  try { fn(copyState()); } catch { /* as above */ }
  return () => { listeners.delete(fn); };
}

/**
 * The server answered and its answer is now stored. Clears any stale signal.
 *
 * DECLINES when the outstanding problem is a failed cache write. Reaching the
 * server does not heal a device with no room to store the reply: the screen is
 * still showing the older copy, so stamping it "confirmed just now" would
 * replace a visible wrong answer with an invisible one — exactly the defect
 * this module exists to remove.
 */
export function markConfirmed(at: number = Date.now()): void {
  if (reason === 'cache_write_failed') return;
  markProjectsConfirmed(at);
  reason = null;
  status = undefined;
  notify();
}

/**
 * Report whether a backend-authoritative write landed on this device.
 *
 * A success CLEARS a standing cache-write failure, because a write that landed
 * is the only real evidence that the device has room again. Without this, one
 * quota failure early in a page session would keep the banner up for the rest
 * of it even after the pressure passed.
 */
export function markStored(ok: boolean): void {
  if (!ok) { markStale('cache_write_failed'); return; }
  if (reason === 'cache_write_failed') {
    reason = null;
    status = undefined;
    notify();
  }
}

/** This device is showing something other than the server's answer, and why. */
export function markStale(next: StaleReason, httpStatus?: number): void {
  reason = next;
  status = httpStatus;
  notify();
}

/** Test seam: forget the session's stale signal. Does not touch the stored stamp. */
export function resetCopyState(): void {
  reason = null;
  status = undefined;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How old this copy is, in words a student can act on.
 *
 * Returns null when there is no stamp, because "we have never confirmed this
 * copy on this device" is a different sentence from "this copy is 0 minutes
 * old", and the caller writes that one itself. Deliberately coarse: the useful
 * question is "is this today's work or last week's", and a precise duration
 * would imply a precision the stamp does not have.
 */
export function describeCopyAge(confirmedAt: number | null, now: number = Date.now()): string | null {
  if (confirmedAt === null) return null;
  const ms = now - confirmedAt;
  // A stamp in the future means a clock moved, not that the copy is fresher
  // than possible. Treat it as "just now" rather than printing a negative age.
  if (ms < 2 * MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} minutes ago`;
  if (ms < 2 * HOUR) return 'an hour ago';
  if (ms < DAY) return `${Math.floor(ms / HOUR)} hours ago`;
  if (ms < 2 * DAY) return 'yesterday';
  return `${Math.floor(ms / DAY)} days ago`;
}
