import fs from 'fs';
import path from 'path';
import { resolveDryRun } from '../coraAgentService';

/**
 * Poll cadence, the kill switch, and the send-is-opt-in default.
 *
 * ── DRY RUN IS THE DEFAULT, AND THE RULE IS BORROWED, NOT REINVENTED ────────
 *
 * `resolveDryRun` is imported from coraAgentService rather than rewritten. Its
 * rule — sending requires the literal string "false", and unset or anything
 * else stays in shadow — is the fix that was pinned after the 2026-07-14
 * self-reply storm, where a default of "send unless told otherwise" let a stray
 * deploy re-arm live sending. A second copy of that rule here would be a second
 * thing to get wrong, and the two would drift.
 *
 * ── THE KILL SWITCH IS A FILE, BECAUSE ALI IS AWAY ──────────────────────────
 *
 * Stopping the watcher must not require finding a container, reading code, or
 * knowing a process id. It is one `touch`. The file is checked at the top of
 * every cycle AND again immediately before every send, so a kill lands within
 * one message rather than one cycle.
 *
 * The send harness's own `HALT` file stops the watcher too. If something is
 * wrong enough with the campaign to stop the sending, the autonomous responder
 * to that campaign should stop as well, and Ali should not have to know there
 * are two things running.
 *
 * Fail-closed: if the state directory cannot be read, the watcher treats itself
 * as halted. A kill switch that cannot be read is a kill switch that does not
 * work, and continuing to send while unable to see the stop file is exactly the
 * situation nobody can intervene in.
 */

export const WATCHER_HALT_FILENAME = 'WATCHER-HALT';
export const CAMPAIGN_HALT_FILENAME = 'HALT';

export const DEFAULT_POLL_INTERVAL_SECONDS = 300;
export const MIN_POLL_INTERVAL_SECONDS = 30;

export type HaltReason = 'watcher_halt_file' | 'campaign_halt_file' | 'state_dir_unreadable';

export interface HaltVerdict {
  halted: boolean;
  reason?: HaltReason;
  detail?: string;
}

/** Sending is opt-in. WATCHER_DRY_RUN must be exactly "false" to send. */
export function resolveWatcherDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveDryRun(env.WATCHER_DRY_RUN);
}

/**
 * Poll cadence. Floored rather than trusted: a mistyped `0` or `1` would turn
 * a 30-hour watch into a hot loop against the Gmail-backed tables and burn the
 * reply ceilings in seconds.
 */
export function resolvePollIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WATCHER_POLL_INTERVAL_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_POLL_INTERVAL_SECONDS * 1000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_POLL_INTERVAL_SECONDS) {
    throw new Error(
      `WATCHER_POLL_INTERVAL_SECONDS="${raw}" must be an integer of at least ` +
      `${MIN_POLL_INTERVAL_SECONDS}. A shorter interval is a hot loop, not a watcher.`,
    );
  }
  return n * 1000;
}

/**
 * Ceiling on the lookback. 14 days is generous for "mail we have not answered
 * yet" and still far short of a whole mailbox; the point of the cap is that a
 * fat-fingered `240` reads as ten days rather than quietly pulling in a year.
 */
export const MAX_LOOKBACK_HOURS = 336;

/**
 * How far before NOW a cycle is willing to look for inbound mail.
 *
 * Default 0 means "only since the window opened", which is what the original
 * run wanted: the window opened as the campaign went out. A REOPENED window
 * starts its clock at the restart, so without a lookback the watcher can only
 * see mail that arrives after the moment it was restarted, and every reply
 * already sitting unanswered in the mailbox is invisible to it.
 *
 * Rejects rather than defaults on a bad value. Silently reading a typo as 0
 * would produce a watcher that looks healthy and sees nothing, which is the
 * failure mode this whole module keeps arguing against.
 */
export function resolveLookbackHours(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WATCHER_LOOKBACK_HOURS;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `WATCHER_LOOKBACK_HOURS="${raw}" must be a non-negative number of hours. A negative ` +
      'lookback would put the floor in the future and the watcher would see nothing.',
    );
  }
  if (n > MAX_LOOKBACK_HOURS) {
    throw new Error(
      `WATCHER_LOOKBACK_HOURS="${raw}" exceeds the ${MAX_LOOKBACK_HOURS}-hour ceiling. Reading ` +
      'further back than that is a mailbox sweep, not a watch.',
    );
  }
  return n;
}

/**
 * The `received_at >=` floor for a cycle.
 *
 * Whichever is EARLIER: the window start, or `hours` before now. Clamping to
 * the window start means a short lookback can never hide mail the window itself
 * already covers — the lookback only ever widens the view, never narrows it.
 */
export function resolveInboundSince(windowStart: Date, now: Date, hours: number): Date {
  const floor = new Date(now.getTime() - hours * 3_600_000);
  return floor.getTime() < windowStart.getTime() ? floor : windowStart;
}

/**
 * Rows one cycle will read from `inbox_emails`.
 *
 * The mailbox takes roughly 1900 messages in 48 hours, the overwhelming
 * majority of them nothing to do with a student — Basecamp notifications and
 * the rest. 500 is far more than one five-minute poll can accumulate, so this
 * is a runaway guard rather than a working limit.
 */
export const INBOUND_FETCH_LIMIT = 500;

/**
 * Put a newest-first page back into the order the cycle reasons about.
 *
 * The fetch has to be `ORDER BY received_at DESC LIMIT n` and not `ASC`, and
 * the difference is not cosmetic. With the floor at the window start of a
 * freshly-opened window there were never n messages to choose between, so the
 * direction never mattered. Widening the floor made it decisive: an ascending
 * fetch returns the OLDEST n of ~1900, which is a watcher that reports 500 seen
 * every five minutes and never reaches a single message written today.
 *
 * The cycle still wants oldest-first, so a thread reads as a conversation and
 * the guards see a student's reply after the message it answers. Hence: newest
 * n off the database, chronological into the loop.
 */
export function newestFirstToChronological<T>(newestFirst: T[]): T[] {
  // Copy rather than reverse in place: the caller's array is not ours to flip.
  return [...newestFirst].reverse();
}

export function checkHalt(stateDir: string): HaltVerdict {
  const watcherHalt = path.join(stateDir, WATCHER_HALT_FILENAME);
  const campaignHalt = path.join(stateDir, CAMPAIGN_HALT_FILENAME);
  try {
    if (fs.existsSync(watcherHalt)) {
      return {
        halted: true,
        reason: 'watcher_halt_file',
        detail: `${watcherHalt} exists. Stopping. Delete it to allow a restart.`,
      };
    }
    if (fs.existsSync(campaignHalt)) {
      return {
        halted: true,
        reason: 'campaign_halt_file',
        detail: `${campaignHalt} exists: the send run was halted, so the watcher stops too.`,
      };
    }
  } catch (err: any) {
    return {
      halted: true,
      reason: 'state_dir_unreadable',
      detail:
        `Cannot read ${stateDir} to check for a halt file (${err?.message ?? err}). Treating as ` +
        'halted: a kill switch that cannot be read is not a kill switch.',
    };
  }
  // A state directory that has vanished is also an unreadable kill switch.
  try {
    if (!fs.statSync(stateDir).isDirectory()) {
      return {
        halted: true,
        reason: 'state_dir_unreadable',
        detail: `${stateDir} is not a directory. Refusing to run without a readable kill switch.`,
      };
    }
  } catch (err: any) {
    return {
      halted: true,
      reason: 'state_dir_unreadable',
      detail: `${stateDir} cannot be stat'd (${err?.message ?? err}). Treating as halted.`,
    };
  }
  return { halted: false };
}

/** The exact command an operator runs to stop the watcher. Used in logs and the handoff. */
export function killCommand(stateDir: string): string {
  return `touch "${path.join(stateDir, WATCHER_HALT_FILENAME)}"`;
}
