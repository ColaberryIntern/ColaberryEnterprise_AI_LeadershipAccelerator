import fs from 'fs';
import path from 'path';
import { CronIo, CronRetirementStatus, retireCronLine } from './cronRetirement';

/**
 * What the watcher does ONCE when its window elapses.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * `watchWindow.ts` makes the deadline a stored instant, which is the right
 * shape: a restarted process cannot award itself a fresh 30 hours. But an
 * elapsed window only made each cycle a no-op — it did not make the cycles
 * stop. The 2026-08-17 run closed at 16:57Z and the cron entry kept firing 288
 * times a day, appending a `window_expired` line each time to a log that had
 * reached 15MB. The runner's own header reasoned that "after the deadline every
 * tick is a no-op that logs and exits 0 — so the leftover crontab line is
 * harmless rather than a liability". Inert is not the same as free.
 *
 * ── TWO MECHANISMS, DELIBERATELY, BECAUSE ONE OF THEM CAN FAIL ──────────────
 *
 *   1. LOG ONCE. `shouldLogExpiry` is true only until the sentinel exists. This
 *      is the cheap, local, always-works half: it needs one small file write
 *      and no privileges, so even if the crontab cannot be touched the log
 *      stops growing.
 *
 *   2. REMOVE THE CRON ENTRY. This is the half that actually stops the
 *      invocations, and it is the half that can fail — a locked crontab, a
 *      concurrent edit, or `cronRetirement`'s own refusal when the markers
 *      matched more lines than expected.
 *
 * Ordering them this way means the worst case degrades to "a cheap no-op tick
 * every five minutes with no disk growth", not back to the flood.
 *
 * ── WHY THE RETRIES ARE CAPPED ──────────────────────────────────────────────
 *
 * A retirement that failed is worth retrying: the next tick may find the
 * crontab free. Retrying forever is the original bug wearing a different hat,
 * so attempts stop at MAX_RETIREMENT_ATTEMPTS and the record says so. After
 * that a human has a sentinel file naming the exact failure and a backup of the
 * crontab sitting next to it.
 *
 * ── WHY THE SENTINEL IS SEPARATE FROM `WATCHER-HALT` ────────────────────────
 *
 * `WATCHER-HALT` means a human stopped this watcher and it must not restart.
 * A window that simply ran its course is a different fact, and conflating them
 * would make a normal expiry indistinguishable from an intervention — and would
 * block the legitimate case of opening a NEW window in the same run directory.
 */

export const RETIREMENT_SENTINEL_FILENAME = 'watch-window.retired.json';
export const CRON_BACKUP_PREFIX = 'crontab.backup-retire-';

/** Attempts at the crontab edit before giving up and leaving it to a human. */
export const MAX_RETIREMENT_ATTEMPTS = 3;

/**
 * Outcomes that mean there is nothing left to do. `no_crontab` and
 * `already_absent` are successes: the entry is not there, which is the goal.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set<CronRetirementStatus>([
  'retired',
  'already_absent',
  'no_crontab',
]);

export interface RetirementRecord {
  run_id: string;
  /** The deadline that elapsed, copied from the window file. */
  window_expires_at: string;
  /** First tick that observed the window over. Never moves once written. */
  first_observed_at: string;
  cron_status: CronRetirementStatus | 'pending';
  cron_detail: string;
  cron_removed: string[];
  cron_backup_path: string | null;
  attempts: number;
  last_attempt_at: string | null;
}

export function retirementPath(stateDir: string): string {
  return path.join(stateDir, RETIREMENT_SENTINEL_FILENAME);
}

/**
 * Read the sentinel. Missing, unreadable and malformed all return null.
 *
 * Collapsing malformed into null is deliberate here, and it is the opposite of
 * the window file's fail-closed rule — on purpose. A torn sentinel that read as
 * "already retired" would silence the one log line that says the window closed
 * AND skip the cron removal, leaving the flood running and invisible. Failing
 * toward "do the work again" is the safe direction for this file, because the
 * work is idempotent.
 */
export function readRetirement(stateDir: string): RetirementRecord | null {
  let raw: string;
  try {
    raw = fs.readFileSync(retirementPath(stateDir), 'utf8');
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
    typeof parsed.first_observed_at !== 'string' ||
    typeof parsed.attempts !== 'number'
  ) {
    return null;
  }
  return parsed as RetirementRecord;
}

function writeRetirement(stateDir: string, record: RetirementRecord): void {
  fs.mkdirSync(stateDir, { recursive: true });
  // Write-then-rename, so a crash mid-write cannot leave a half-parsed sentinel
  // that suppresses the expiry log line.
  const tmp = `${retirementPath(stateDir)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, retirementPath(stateDir));
}

/**
 * Should this cycle write a `window_expired` line?
 *
 * True exactly once per run directory. This is what turns 288 log lines a day
 * into one.
 */
export function shouldLogExpiry(stateDir: string): boolean {
  return readRetirement(stateDir) === null;
}

/**
 * Record that the window has been observed to be over. Idempotent: a second
 * call leaves `first_observed_at` alone, because that instant is evidence.
 */
export function noteExpiryObserved(
  stateDir: string,
  opts: { runId: string; now: Date; windowExpiresAt: string },
): RetirementRecord {
  const existing = readRetirement(stateDir);
  if (existing) return existing;

  const record: RetirementRecord = {
    run_id: opts.runId,
    window_expires_at: opts.windowExpiresAt,
    first_observed_at: opts.now.toISOString(),
    cron_status: 'pending',
    cron_detail: 'Window observed elapsed; the cron entry has not been retired yet.',
    cron_removed: [],
    cron_backup_path: null,
    attempts: 0,
    last_attempt_at: null,
  };
  writeRetirement(stateDir, record);
  return record;
}

export interface RetireWatcherCronOptions {
  io: CronIo;
  /** Every one of these must appear in a line for it to be the watcher's. */
  markers: string[];
  now: Date;
  runId?: string;
  windowExpiresAt?: string;
  maxAttempts?: number;
}

/**
 * Remove the watcher's own cron entry, at most `maxAttempts` times across all
 * ticks, recording the outcome next to the run's other state.
 */
export function retireWatcherCron(
  stateDir: string,
  opts: RetireWatcherCronOptions,
): RetirementRecord {
  const maxAttempts = opts.maxAttempts ?? MAX_RETIREMENT_ATTEMPTS;

  // The sentinel may not exist yet if this is called without a prior cycle.
  let record =
    readRetirement(stateDir) ??
    noteExpiryObserved(stateDir, {
      runId: opts.runId ?? 'unknown',
      now: opts.now,
      windowExpiresAt: opts.windowExpiresAt ?? 'unknown',
    });

  if (TERMINAL_STATUSES.has(record.cron_status)) return record;

  if (record.attempts >= maxAttempts) {
    // Already said so once; do not rewrite the sentinel on every later tick.
    if (record.cron_detail.includes('gave up')) return record;
    record = {
      ...record,
      cron_detail:
        `Retiring the cron entry failed ${record.attempts} times and gave up. Last failure: ` +
        `${record.cron_detail} Remove the line by hand — the crontab backup is at ` +
        `${record.cron_backup_path ?? '(none taken)'}.`,
    };
    writeRetirement(stateDir, record);
    return record;
  }

  const backupPath = path.join(
    stateDir,
    `${CRON_BACKUP_PREFIX}${opts.now.toISOString().replace(/[:.]/g, '-')}.txt`,
  );

  const outcome = retireCronLine({
    io: opts.io,
    markers: opts.markers,
    onBackup: (content) => fs.writeFileSync(backupPath, content, 'utf8'),
  });

  record = {
    ...record,
    cron_status: outcome.status,
    cron_detail: outcome.detail,
    cron_removed: outcome.removed,
    cron_backup_path: fs.existsSync(backupPath) ? backupPath : record.cron_backup_path,
    attempts: record.attempts + 1,
    last_attempt_at: opts.now.toISOString(),
  };
  writeRetirement(stateDir, record);
  return record;
}
