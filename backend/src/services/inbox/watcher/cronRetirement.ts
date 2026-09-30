import { execFileSync } from 'child_process';

/**
 * Removing ONE line from a shared crontab, safely.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The watcher's deadline is a stored timestamp, so once it elapses every cycle
 * is already a no-op — `watchWindow.ts` explains why that is the right shape.
 * What a stored deadline cannot do is stop cron from calling. The 30-hour
 * window closed at 2026-08-18T16:57Z and the five-minute entry kept firing: 288
 * invocations a day, each appending a `window_expired` line to a log that had
 * reached 15MB. The runner's own header called the leftover entry "harmless".
 * It is inert, which is not the same thing as free.
 *
 * ── WHY IT IS THIS PARANOID ─────────────────────────────────────────────────
 *
 * The crontab it edits is SHARED. Around forty other entries live there: the
 * inbound dispatcher, the Basecamp and CB token refreshers, the reporting
 * audit, the payment reconciliation sweep, other systems on the same host
 * entirely. And it has already been destroyed once — on 2026-07-31 a
 * `crontab <file>` meant to append one entry replaced the whole crontab with a
 * single line, and it had to be rebuilt from 26 days of syslog.
 *
 * So the contract is deliberately narrow: remove the lines that carry EVERY one
 * of the caller's markers, at most as many as the caller said to expect, and
 * verify afterwards that what landed is what was intended — or put the backup
 * back. Anything the slightest bit surprising refuses and writes nothing. A
 * watcher that keeps ticking is a nuisance; a crontab that loses the token
 * refreshers takes the whole estate down quietly.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 *
 * This is called from a cron tick, so it must be safe to run any number of
 * times. With the line already gone it reports `already_absent` and does not
 * write. That is also what makes the retry path in `watcherRetirement.ts`
 * cheap: a retry that has nothing to do costs one crontab read.
 *
 * ── THE RACE THIS DOES NOT ELIMINATE ────────────────────────────────────────
 *
 * `crontab -l` then `crontab -` is read-modify-write, so an edit by a human or
 * another script in between would be lost. There is no portable lock that other
 * editors would honour, so this narrows the window rather than closing it: the
 * two calls are adjacent, the backup is taken first, and the verification read
 * catches a clobber that happened in between and restores. The exposure is one
 * write, once, at the end of a watch window — not a standing risk.
 */

export interface CronIo {
  /** `crontab -l`. Null means there is no crontab, or it could not be read. */
  read(): string | null;
  /** `crontab -` with the given content. Throws if the install fails. */
  write(content: string): void;
}

export type CronRetirementStatus =
  /** The line was removed and the result verified. */
  | 'retired'
  /** Nothing matched. The common case on every tick after the first. */
  | 'already_absent'
  /** No crontab at all. Nothing to do, and nothing installed. */
  | 'no_crontab'
  /** A safety assertion failed. Nothing was written. */
  | 'refused'
  /** The write landed wrong and the backup was put back. */
  | 'restored'
  /** The read or the write itself failed. */
  | 'io_error';

export interface CronRetirementResult {
  status: CronRetirementStatus;
  /** The exact lines removed, for the audit record. */
  removed: string[];
  detail: string;
}

export interface RetireCronOptions {
  io: CronIo;
  /**
   * A line is ours only if it contains EVERY one of these. Two independent
   * markers (the script path and the run directory) rather than one, so a
   * second watcher on the same host, or the same script pointed at a different
   * run, is not swept up by a loose match.
   */
  markers: string[];
  /** Refuse if more than this many lines match. Default 1. */
  expectAtMost?: number;
  /** Called with the pre-change crontab BEFORE anything is installed. */
  onBackup?: (content: string) => void;
}

/**
 * Shortest marker this will accept. A bare interval field or `bash` would match half the file;
 * requiring something path-length long means a marker has to be specific by
 * construction rather than by the caller being careful.
 */
export const MARKER_TOO_SHORT_MIN_LENGTH = 12;

const DEFAULT_EXPECT_AT_MOST = 1;

/** Split into lines without inventing or losing a trailing blank. */
function toLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Reassemble, always newline-terminated unless the result is empty. */
function fromLines(lines: string[]): string {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function result(
  status: CronRetirementStatus,
  detail: string,
  removed: string[] = [],
): CronRetirementResult {
  return { status, removed, detail };
}

export function retireCronLine(opts: RetireCronOptions): CronRetirementResult {
  const expectAtMost = opts.expectAtMost ?? DEFAULT_EXPECT_AT_MOST;

  // ── Marker sanity, before anything is read ───────────────────────────────
  // An empty list makes `every()` vacuously true, which would match — and
  // therefore delete — every line in the file. That is the 2026-07-31 incident
  // reachable through a typo, so it is checked first and refuses hardest.
  if (opts.markers.length === 0) {
    return result(
      'refused',
      'No markers given. An empty marker list matches every line in the crontab, which would ' +
      'delete the whole file. Refusing.',
    );
  }
  const tooShort = opts.markers.filter((m) => m.trim().length < MARKER_TOO_SHORT_MIN_LENGTH);
  if (tooShort.length > 0) {
    return result(
      'refused',
      `Marker(s) ${JSON.stringify(tooShort)} are shorter than ${MARKER_TOO_SHORT_MIN_LENGTH} ` +
      'characters. A short marker matches lines it was never meant to. Use the full script path ' +
      'and the full run directory.',
    );
  }

  // ── Read ─────────────────────────────────────────────────────────────────
  let before: string | null;
  try {
    before = opts.io.read();
  } catch (err: any) {
    return result('io_error', `Could not read the crontab: ${err?.message ?? err}`);
  }
  if (before === null) {
    return result('no_crontab', 'No crontab for this user. Nothing to retire.');
  }

  const lines = toLines(before);
  const mine: string[] = [];
  const kept: string[] = [];
  for (const line of lines) {
    if (opts.markers.every((m) => line.includes(m))) mine.push(line);
    else kept.push(line);
  }

  if (mine.length === 0) {
    return result(
      'already_absent',
      'No crontab line carries all of the markers. Already retired, or never installed.',
    );
  }
  if (mine.length > expectAtMost) {
    return result(
      'refused',
      `${mine.length} lines match all markers but at most ${expectAtMost} was expected. That ` +
      'usually means the markers are looser than intended, so nothing was written. Inspect the ' +
      'crontab by hand.',
      mine,
    );
  }
  // Partition invariant. Cheap, and it is the thing that would actually hurt.
  if (kept.length + mine.length !== lines.length) {
    return result(
      'refused',
      `Partition lost lines: ${kept.length} kept + ${mine.length} matched != ${lines.length} read.`,
    );
  }

  const after = fromLines(kept);

  // ── Backup, then write ───────────────────────────────────────────────────
  if (opts.onBackup) {
    try {
      opts.onBackup(before);
    } catch (err: any) {
      return result(
        'refused',
        `Refusing to edit the crontab because the backup could not be taken: ${err?.message ?? err}`,
      );
    }
  }

  try {
    opts.io.write(after);
  } catch (err: any) {
    return result('io_error', `Could not install the new crontab: ${err?.message ?? err}`);
  }

  // ── Verify what actually landed ──────────────────────────────────────────
  // Not decoration. `crontab -` can fail partially, and another writer can land
  // between the read and the write. The check is against the exact intended
  // content, so anything unexpected — a truncation, someone else's concurrent
  // edit — is caught here rather than discovered next week.
  let verify: string | null;
  try {
    verify = opts.io.read();
  } catch (err: any) {
    return result(
      'io_error',
      `Installed the new crontab but could not read it back to verify: ${err?.message ?? err}. ` +
      'Check it by hand against the backup.',
      mine,
    );
  }

  if (verify === null || toLines(verify).join('\n') !== kept.join('\n')) {
    try {
      opts.io.write(before);
      return result(
        'restored',
        'The installed crontab did not match what was intended, so the pre-change backup was ' +
        'put back. The watcher entry is still there; nothing else was lost.',
      );
    } catch (err: any) {
      return result(
        'io_error',
        `The installed crontab did not match what was intended AND the restore failed: ` +
        `${err?.message ?? err}. RESTORE THE BACKUP BY HAND NOW.`,
      );
    }
  }

  return result(
    'retired',
    `Removed ${mine.length} crontab line(s); the other ${kept.length} line(s) verified unchanged.`,
    mine,
  );
}

/**
 * The real `crontab -l` / `crontab -` pair.
 *
 * A non-zero exit from `crontab -l` is how "no crontab for root" is reported,
 * so it maps to null rather than throwing. Everything else throws, because a
 * read that failed for some other reason must not be mistaken for an empty
 * crontab — treating it as empty is precisely how a crontab gets wiped.
 */
export function systemCronIo(): CronIo {
  return {
    read(): string | null {
      try {
        return execFileSync('crontab', ['-l'], { encoding: 'utf8' });
      } catch (err: any) {
        const stderr = String(err?.stderr ?? '');
        if (/no crontab for/i.test(stderr)) return null;
        throw new Error(stderr.trim() || err?.message || 'crontab -l failed');
      }
    },
    write(content: string): void {
      execFileSync('crontab', ['-'], { input: content, encoding: 'utf8' });
    },
  };
}
