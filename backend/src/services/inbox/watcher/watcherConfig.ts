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
