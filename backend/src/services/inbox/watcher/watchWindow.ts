import fs from 'fs';
import path from 'path';

/**
 * The 30-hour self-expiry for the student-unblock inbox watcher.
 *
 * ── WHY A STORED TIMESTAMP AND NOT A CRON ENTRY ─────────────────────────────
 *
 * "It runs for 30 hours" is only true if something mechanically stops it. A
 * cron entry that a human has to remember to delete is not that thing: Ali is
 * away, and the failure mode of forgetting is an autonomous mailer answering
 * students indefinitely with nobody watching.
 *
 * So the window is a FILE. The first run writes `watch-window.json` with the
 * start instant and a precomputed `expires_at`, and every subsequent cycle —
 * including the first cycle after a restart, a redeploy, or a crash loop —
 * reads that file back and refuses to act once the instant has passed. The
 * process does not hold the deadline in memory, because a restarted process
 * with an in-memory deadline is a fresh 30 hours.
 *
 * `expires_at` is persisted rather than recomputed from `started_at` on each
 * read for the same reason: if someone edits WATCH_WINDOW_HOURS and redeploys,
 * a live window must not silently get longer. The stored instant is the
 * contract; the constant only decides where a NEW window's instant lands.
 *
 * ── FAIL-CLOSED ─────────────────────────────────────────────────────────────
 *
 * Every ambiguity resolves to EXPIRED, never to ACTIVE:
 *   - the state file is missing on a non-creating read  -> expired
 *   - the JSON is unparseable or the fields are missing -> expired
 *   - `expires_at` is not a valid date                  -> expired
 *   - `started_at` is in the future (clock went back)   -> expired
 *
 * A watcher that stops when it cannot prove it is inside its window is an
 * inconvenience. A watcher that keeps sending because it could not read its own
 * clock is the 2026-07-14 incident again.
 */

export const WATCH_WINDOW_HOURS = 30;

/**
 * Ceiling on a NEW window. A week is already a long time for something that
 * answers students without anybody watching; the cap exists so that a stray
 * `720` reads as an error rather than arming it until next month.
 */
export const MAX_WINDOW_HOURS = 168;

/**
 * How long a NEW window should run.
 *
 * The constant above is the default; this makes it settable so that reopening a
 * watch for a different span is a visible value in the crontab line rather than
 * a hand-edited state file.
 *
 * This changes only where a new window's `expires_at` LANDS. It cannot touch a
 * window that is already open: `openWindow` returns an existing file unchanged,
 * so raising this and restarting does not extend a live watch. That separation
 * is the whole reason `expires_at` is persisted rather than recomputed.
 *
 * Rejects rather than defaults, for the reason every other resolver in this
 * subsystem does: silently falling back to 30 after a typo produces a window of
 * a length nobody chose.
 */
export function resolveWindowHours(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WATCH_WINDOW_HOURS;
  if (raw === undefined || raw === '') return WATCH_WINDOW_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `WATCH_WINDOW_HOURS="${raw}" must be a positive number of hours. A zero or negative ` +
      'window expires before its first tick, which looks identical to a watcher that never ran.',
    );
  }
  if (n > MAX_WINDOW_HOURS) {
    throw new Error(
      `WATCH_WINDOW_HOURS="${raw}" exceeds the ${MAX_WINDOW_HOURS}-hour ceiling. A watch longer ` +
      'than a week is a standing service, and should be built as one rather than opened as a window.',
    );
  }
  return n;
}

export const WATCH_WINDOW_FILENAME = 'watch-window.json';

export interface WatchWindowState {
  run_id: string;
  started_at: string;
  expires_at: string;
  duration_hours: number;
}

export type WindowVerdict =
  | { active: true; state: WatchWindowState; remainingMs: number }
  | { active: false; reason: WindowExpiredReason; state?: WatchWindowState };

export type WindowExpiredReason =
  | 'window_elapsed'
  | 'no_window_file'
  | 'unreadable_window_file'
  | 'malformed_window_file'
  | 'start_in_future';

export function windowPath(stateDir: string): string {
  return path.join(stateDir, WATCH_WINDOW_FILENAME);
}

/**
 * Create the window if it does not exist, otherwise return the existing one
 * UNCHANGED. Re-running the watcher must never extend its own deadline, so
 * this deliberately has no "refresh" branch.
 */
export function openWindow(
  stateDir: string,
  opts: { now: Date; runId: string; hours?: number },
): WatchWindowState {
  const file = windowPath(stateDir);
  if (fs.existsSync(file)) {
    const existing = readWindow(stateDir);
    if (!existing) {
      throw new Error(
        `Window file ${file} exists but is unreadable or malformed. Refusing to overwrite it: ` +
        'a fresh file would restart the 30 hours. Inspect it, and delete it by hand only if ' +
        'you intend to begin a genuinely new watch window.',
      );
    }
    return existing;
  }

  const hours = opts.hours ?? WATCH_WINDOW_HOURS;
  const started = opts.now;
  const state: WatchWindowState = {
    run_id: opts.runId,
    started_at: started.toISOString(),
    expires_at: new Date(started.getTime() + hours * 3_600_000).toISOString(),
    duration_hours: hours,
  };

  fs.mkdirSync(stateDir, { recursive: true });
  // wx: if two watcher processes start at once, exactly one writes the window
  // and the loser re-reads the winner's file rather than clobbering it.
  try {
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
  } catch (err: any) {
    if (err?.code === 'EEXIST') {
      const raced = readWindow(stateDir);
      if (raced) return raced;
    }
    throw err;
  }
  return state;
}

/** Read the persisted window. Returns null for missing, unreadable or malformed. */
export function readWindow(stateDir: string): WatchWindowState | null {
  let raw: string;
  try {
    raw = fs.readFileSync(windowPath(stateDir), 'utf8');
  } catch {
    return null;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.run_id !== 'string' ||
    typeof parsed.started_at !== 'string' ||
    typeof parsed.expires_at !== 'string' ||
    typeof parsed.duration_hours !== 'number'
  ) {
    return null;
  }
  return parsed as WatchWindowState;
}

/**
 * The check every cycle runs. Pure given a state object, so each fail-closed
 * branch is unit-testable without touching a disk.
 */
export function evaluateWindow(state: WatchWindowState | null, now: Date): WindowVerdict {
  if (!state) return { active: false, reason: 'no_window_file' };

  const started = Date.parse(state.started_at);
  const expires = Date.parse(state.expires_at);
  if (!Number.isFinite(started) || !Number.isFinite(expires)) {
    return { active: false, reason: 'malformed_window_file', state };
  }
  if (started > now.getTime()) {
    return { active: false, reason: 'start_in_future', state };
  }
  // `>=` not `>`: the instant the deadline is reached, the window is over.
  if (now.getTime() >= expires) {
    return { active: false, reason: 'window_elapsed', state };
  }
  return { active: true, state, remainingMs: expires - now.getTime() };
}

/** Disk-backed convenience wrapper: read the file, then evaluate it. */
export function checkWindow(stateDir: string, now: Date): WindowVerdict {
  let exists: boolean;
  try {
    exists = fs.existsSync(windowPath(stateDir));
  } catch {
    return { active: false, reason: 'unreadable_window_file' };
  }
  if (!exists) return { active: false, reason: 'no_window_file' };
  const state = readWindow(stateDir);
  // Both resolve to expired, but they need different humans: a missing file is
  // a first run, a present-but-unreadable one is corruption somebody has to
  // look at. Collapsing them into 'no_window_file' would hide the second.
  if (!state) return { active: false, reason: 'malformed_window_file' };
  return evaluateWindow(state, now);
}
