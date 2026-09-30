/**
 * What happens ONCE when the window elapses, and what must not happen 287 more
 * times that day.
 *
 * The window closing is not an error, it is the design working. The defect was
 * that nothing followed from it: the cron entry stayed, so the watcher woke
 * every five minutes forever, and each wake appended another `window_expired`
 * line to a log already at 15MB.
 *
 * Two things are pinned here.
 *
 *   LOG ONCE. The expiry is worth exactly one line. `shouldLogExpiry` is false
 *   from the second tick onward, so a watcher whose cron entry could not be
 *   removed still stops growing the log. That matters because it is the
 *   fallback when the crontab edit is the thing that failed.
 *
 *   RETIRE, WITH BOUNDED RETRIES. The cron edit can legitimately fail — a
 *   locked crontab, a concurrent edit, a refusal because the markers matched
 *   more than expected. Retrying forever would reintroduce the flood in a new
 *   costume, so attempts are capped and the record says why it stopped.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CronIo } from '../cronRetirement';
import {
  shouldLogExpiry,
  noteExpiryObserved,
  readRetirement,
  retireWatcherCron,
  retirementPath,
  MAX_RETIREMENT_ATTEMPTS,
} from '../watcherRetirement';

const RUN_ID = '20260816-student-unblock-and-watch';
const RUN_DIR_MARKER = '/root/loop-runs/20260816-student-unblock-and-watch/';
const SCRIPT_MARKER = 'dist/scripts/runInboxWatcher30h.js';
const MARKERS = [SCRIPT_MARKER, RUN_DIR_MARKER];
const EXPIRES = '2026-08-18T16:57:00.289Z';
const T1 = new Date('2026-08-18T17:00:00.000Z');
const T2 = new Date('2026-08-18T17:05:00.000Z');

const WATCHER_LINE =
  `*/5 * * * * WATCHER_DRY_RUN=false /opt/x/cron-env-wrapper.sh ` +
  `/mnt/HC_Volume_105361916/send-runtime/${SCRIPT_MARKER} --run-dir ${RUN_DIR_MARKER} --once`;
const KEEPER = '0 8 * * * /opt/colaberry-accelerator/scripts/refreshBasecampTokenFromVault.sh --commit';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-retire-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function fakeIo(initial: string | null) {
  const state = { content: initial, writes: 0 };
  const io: CronIo = {
    read: () => state.content,
    write: (c: string) => {
      state.writes++;
      state.content = c;
    },
  };
  return { io, state };
}

/** An io whose write always fails, standing in for a locked or busy crontab. */
function failingIo(initial: string) {
  const state = { content: initial as string | null, writes: 0 };
  const io: CronIo = {
    read: () => state.content,
    write: () => {
      state.writes++;
      throw new Error('crontab: installing new crontab failed');
    },
  };
  return { io, state };
}

const observe = (now = T1) =>
  noteExpiryObserved(dir, { runId: RUN_ID, now, windowExpiresAt: EXPIRES });

describe('the expiry is logged once, not on every tick', () => {
  it('wants the first expired tick logged', () => {
    expect(shouldLogExpiry(dir)).toBe(true);
  });

  it('does not want the second expired tick logged', () => {
    observe();

    expect(shouldLogExpiry(dir)).toBe(false);
  });

  it('keeps the instant the window was first seen to be over', () => {
    observe(T1);

    expect(readRetirement(dir)?.first_observed_at).toBe(T1.toISOString());
  });

  it('does not move that instant on a later tick', () => {
    observe(T1);

    observe(T2);

    expect(readRetirement(dir)?.first_observed_at).toBe(T1.toISOString());
  });

  it('records the deadline it is retiring against', () => {
    observe();

    expect(readRetirement(dir)?.window_expires_at).toBe(EXPIRES);
  });

  it('treats a corrupt sentinel as absent, so a torn write self-heals', () => {
    fs.writeFileSync(retirementPath(dir), '{ this is not json');

    expect(shouldLogExpiry(dir)).toBe(true);
  });
});

/**
 * A sentinel belongs to ONE window.
 *
 * Reopening the watch in the same run directory leaves the previous window's
 * sentinel on disk. If that counted, the new window would inherit a
 * `cron_status: retired` it never earned — so its own expiry would log nothing
 * and, far worse, `retireWatcherCron` would see a terminal status and never
 * remove the NEW cron entry. The mechanism would appear to work and would
 * silently stop working from the second window onward, which is the same class
 * of bug as the one it was written to fix.
 *
 * So the sentinel is keyed to the deadline it was written for.
 */
describe('a sentinel from a previous window does not silence the current one', () => {
  const OLD_EXPIRES = '2026-08-18T16:57:00.289Z';
  const NEW_EXPIRES = '2026-08-22T00:00:00.000Z';

  const observeOld = () =>
    noteExpiryObserved(dir, { runId: RUN_ID, now: T1, windowExpiresAt: OLD_EXPIRES });

  it('wants the new window\'s expiry logged despite the old sentinel', () => {
    observeOld();

    expect(shouldLogExpiry(dir, NEW_EXPIRES)).toBe(true);
  });

  it('still stays quiet for the window the sentinel actually belongs to', () => {
    observeOld();

    expect(shouldLogExpiry(dir, OLD_EXPIRES)).toBe(false);
  });

  it('rewrites the sentinel for the new window', () => {
    observeOld();

    noteExpiryObserved(dir, { runId: RUN_ID, now: T2, windowExpiresAt: NEW_EXPIRES });

    expect(readRetirement(dir)?.window_expires_at).toBe(NEW_EXPIRES);
  });

  it('resets the observation instant to the new window\'s first expired tick', () => {
    observeOld();

    noteExpiryObserved(dir, { runId: RUN_ID, now: T2, windowExpiresAt: NEW_EXPIRES });

    expect(readRetirement(dir)?.first_observed_at).toBe(T2.toISOString());
  });

  it('RETIRES the new cron entry even though the old window reported retired', () => {
    observeOld();
    const stale = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    retireWatcherCron(dir, { io: stale.io, markers: MARKERS, now: T1, windowExpiresAt: OLD_EXPIRES });
    // A brand new window, a freshly installed cron line, same run directory.
    const fresh = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    const record = retireWatcherCron(dir, {
      io: fresh.io, markers: MARKERS, now: T2, windowExpiresAt: NEW_EXPIRES,
    });

    expect(record.cron_status).toBe('retired');
  });

  it('actually removes the new line from the new crontab', () => {
    observeOld();
    const stale = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    retireWatcherCron(dir, { io: stale.io, markers: MARKERS, now: T1, windowExpiresAt: OLD_EXPIRES });
    const fresh = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    retireWatcherCron(dir, {
      io: fresh.io, markers: MARKERS, now: T2, windowExpiresAt: NEW_EXPIRES,
    });

    expect(fresh.state.content).toBe(`${KEEPER}\n`);
  });

  it('starts the new window\'s attempt count from zero', () => {
    observeOld();
    const failing = failingIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    retireWatcherCron(dir, { io: failing.io, markers: MARKERS, now: T1, windowExpiresAt: OLD_EXPIRES });
    const fresh = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    const record = retireWatcherCron(dir, {
      io: fresh.io, markers: MARKERS, now: T2, windowExpiresAt: NEW_EXPIRES,
    });

    expect(record.attempts).toBe(1);
  });
});

describe('retireWatcherCron removes the entry and records what it did', () => {
  it('reports the cron line retired', () => {
    observe();
    const { io } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    const record = retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(record.cron_status).toBe('retired');
  });

  it('leaves the unrelated entry in place', () => {
    observe();
    const { io, state } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(state.content).toBe(`${KEEPER}\n`);
  });

  it('persists the retirement so a later process can read it', () => {
    observe();
    const { io } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(readRetirement(dir)?.cron_status).toBe('retired');
  });

  it('records the exact line it removed, for the audit trail', () => {
    observe();
    const { io } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(readRetirement(dir)?.cron_removed).toEqual([WATCHER_LINE]);
  });

  it('writes a backup of the pre-change crontab into the run directory', () => {
    observe();
    const { io } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    const record = retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(fs.readFileSync(record.cron_backup_path as string, 'utf8')).toBe(
      `${KEEPER}\n${WATCHER_LINE}\n`,
    );
  });

  it('starts the sentinel itself when the expiry was never noted', () => {
    const { io } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(readRetirement(dir)?.cron_status).toBe('retired');
  });
});

describe('retireWatcherCron is idempotent, because it runs from a cron tick', () => {
  it('does not touch the crontab again once retired', () => {
    observe();
    const { io, state } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    retireWatcherCron(dir, { io, markers: MARKERS, now: T2 });

    expect(state.writes).toBe(1);
  });

  it('stops counting attempts once the outcome is terminal', () => {
    observe();
    const { io } = fakeIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    retireWatcherCron(dir, { io, markers: MARKERS, now: T2 });

    expect(readRetirement(dir)?.attempts).toBe(1);
  });

  it('treats an already-absent line as terminal, not as something to retry', () => {
    observe();
    const { io } = fakeIo(`${KEEPER}\n`);

    const record = retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(record.cron_status).toBe('already_absent');
  });
});

describe('a failed retirement retries, but not forever', () => {
  it('records the failure rather than claiming success', () => {
    observe();
    const { io } = failingIo(`${KEEPER}\n${WATCHER_LINE}\n`);

    const record = retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    expect(record.cron_status).toBe('io_error');
  });

  it('tries again on the next tick', () => {
    observe();
    const { io, state } = failingIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });

    retireWatcherCron(dir, { io, markers: MARKERS, now: T2 });

    expect(state.writes).toBe(2);
  });

  it('gives up after the attempt cap, so a broken crontab is not a new flood', () => {
    observe();
    const { io, state } = failingIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    for (let i = 0; i < MAX_RETIREMENT_ATTEMPTS + 3; i++) {
      retireWatcherCron(dir, { io, markers: MARKERS, now: T2 });
    }

    expect(state.writes).toBe(MAX_RETIREMENT_ATTEMPTS);
  });

  it('says it exhausted its attempts rather than going quiet', () => {
    observe();
    const { io } = failingIo(`${KEEPER}\n${WATCHER_LINE}\n`);
    for (let i = 0; i < MAX_RETIREMENT_ATTEMPTS + 1; i++) {
      retireWatcherCron(dir, { io, markers: MARKERS, now: T2 });
    }

    expect(readRetirement(dir)?.cron_detail).toContain('gave up');
  });

  it('succeeds on a retry once the crontab is writable again', () => {
    observe();
    const state = { content: `${KEEPER}\n${WATCHER_LINE}\n` as string | null, fail: true };
    const io: CronIo = {
      read: () => state.content,
      write: (c: string) => {
        if (state.fail) throw new Error('crontab busy');
        state.content = c;
      },
    };
    retireWatcherCron(dir, { io, markers: MARKERS, now: T1 });
    state.fail = false;

    const record = retireWatcherCron(dir, { io, markers: MARKERS, now: T2 });

    expect(record.cron_status).toBe('retired');
  });
});
