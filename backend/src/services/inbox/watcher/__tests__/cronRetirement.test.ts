/**
 * Removing the watcher's OWN crontab line, and nothing else.
 *
 * The watcher's window is a stored deadline, so after it elapses every tick is
 * already a no-op. What the no-op does not do is stop: the five-minute entry kept firing 288
 * times a day, each one appending a `window_expired` line to a log that had
 * reached 15MB. "Harmless" and "free" are not the same thing.
 *
 * The reason this is delicate rather than obvious is the crontab it edits. That
 * file is SHARED: roughly forty other entries live there, including the inbound
 * dispatcher, the token refreshers and the reporting audit, and it has already
 * been destroyed once this year by a `crontab <file>` that replaced the whole
 * thing with a single line. So the contract these tests pin is not "the watcher
 * line goes away" — it is "the watcher line goes away and every other byte of
 * that file survives, or nothing is written at all".
 *
 * Hence: strict multi-marker matching, a hard ceiling on how many lines one
 * call may remove, a backup taken before the write, and a verification read
 * that restores the backup if what landed is not what was intended.
 */
import {
  retireCronLine,
  CronIo,
  MARKER_TOO_SHORT_MIN_LENGTH,
} from '../cronRetirement';

const RUN_DIR = '/root/loop-runs/20260816-student-unblock-and-watch/';
const SCRIPT = 'runInboxWatcher30h.js';
const MARKERS = [SCRIPT, RUN_DIR];

const WATCHER_LINE =
  `*/5 * * * * WATCHER_DRY_RUN=false /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh ` +
  `/mnt/HC_Volume_105361916/send-runtime/dist/scripts/${SCRIPT} --run-dir ${RUN_DIR} --once ` +
  `>> /var/log/student-unblock-watcher.log 2>&1`;

/** A realistic neighbourhood: comments, blank lines, and jobs that must survive. */
const OTHER_LINES = [
  '# --- Colaberry Accelerator: high-frequency workers ---',
  '*/3 * * * * CB_USE_SYSTEM_TOKEN=1 /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh scripts/ops-engine/inbound-dispatcher.js >> /var/log/cb-inbound.log 2>&1',
  '*/2 * * * * /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh /opt/colaberry-accelerator/backend/src/scripts/vipInboxWatcher.js >> /var/log/vip-inbox-watcher.log 2>&1',
  '',
  '0 8 * * * /opt/colaberry-accelerator/scripts/refreshBasecampTokenFromVault.sh --commit >> /var/log/bc-token-refresh.log 2>&1',
  '# student-unblock 30h inbox watcher - self-expires 2026-08-18T16:57:00Z',
];

const crontabWith = (...extra: string[]) =>
  `${[...OTHER_LINES, ...extra].join('\n')}\n`;

/** An in-memory `crontab -l` / `crontab -` pair, so no test touches a real crontab. */
function fakeIo(initial: string | null) {
  const state = { content: initial, writes: [] as string[] };
  const io: CronIo = {
    read: () => state.content,
    write: (c: string) => {
      state.writes.push(c);
      state.content = c;
    },
  };
  return { io, state };
}

describe('retireCronLine removes the watcher entry and leaves the shared crontab intact', () => {
  it('removes the one matching line and reports it', () => {
    const { io } = fakeIo(crontabWith(WATCHER_LINE));

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('retired');
    expect(result.removed).toEqual([WATCHER_LINE]);
  });

  it('leaves every other line byte-identical and in its original order', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));

    retireCronLine({ io, markers: MARKERS });

    // The surviving content is exactly the original minus the watcher line.
    expect(state.content).toBe(`${OTHER_LINES.join('\n')}\n`);
  });

  it('does not remove the human comment that merely mentions the watcher', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));

    retireCronLine({ io, markers: MARKERS });

    // The comment names the watcher but carries neither marker, so it stays.
    expect(state.content).toContain('# student-unblock 30h inbox watcher');
  });

  it('writes exactly once', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));

    retireCronLine({ io, markers: MARKERS });

    expect(state.writes).toHaveLength(1);
  });

  it('hands the pre-change crontab to the backup hook BEFORE writing', () => {
    const before = crontabWith(WATCHER_LINE);
    const { io } = fakeIo(before);
    const seen: string[] = [];

    retireCronLine({ io, markers: MARKERS, onBackup: (c) => seen.push(c) });

    expect(seen).toEqual([before]);
  });
});

describe('retireCronLine is idempotent, because it runs from a cron tick', () => {
  it('reports already_absent when the line has gone', () => {
    const { io } = fakeIo(crontabWith());

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('already_absent');
  });

  it('writes nothing at all on the second call', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));
    retireCronLine({ io, markers: MARKERS });

    retireCronLine({ io, markers: MARKERS });

    expect(state.writes).toHaveLength(1);
  });

  it('reports no_crontab rather than installing an empty one', () => {
    const { io, state } = fakeIo(null);

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('no_crontab');
    expect(state.writes).toHaveLength(0);
  });
});

describe('retireCronLine refuses rather than risking the shared crontab', () => {
  it('refuses when more lines match than the caller expects', () => {
    const { io } = fakeIo(crontabWith(WATCHER_LINE, WATCHER_LINE));

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('refused');
  });

  it('writes nothing when it refuses on an unexpected match count', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE, WATCHER_LINE));

    retireCronLine({ io, markers: MARKERS });

    expect(state.writes).toHaveLength(0);
  });

  it('removes both only when the caller has explicitly allowed two', () => {
    const { io } = fakeIo(crontabWith(WATCHER_LINE, WATCHER_LINE));

    const result = retireCronLine({ io, markers: MARKERS, expectAtMost: 2 });

    expect(result.removed).toHaveLength(2);
  });

  it('refuses an empty marker list, which would match every line in the file', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));

    const result = retireCronLine({ io, markers: [] });

    expect(result.status).toBe('refused');
    expect(state.writes).toHaveLength(0);
  });

  it('refuses a marker short enough to match a line it was never meant to', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));

    const result = retireCronLine({ io, markers: ['*/5'] });

    expect(result.status).toBe('refused');
    expect(state.writes).toHaveLength(0);
  });

  it('names the minimum marker length in the refusal, so the caller can fix it', () => {
    const { io } = fakeIo(crontabWith(WATCHER_LINE));

    const result = retireCronLine({ io, markers: ['*/5'] });

    expect(result.detail).toContain(String(MARKER_TOO_SHORT_MIN_LENGTH));
  });

  it('requires EVERY marker, so a line carrying only the script name survives', () => {
    // Same script, a DIFFERENT run directory: another watcher's entry.
    const otherRun = WATCHER_LINE.replace(RUN_DIR, '/root/loop-runs/some-other-run/');
    const { io } = fakeIo(crontabWith(otherRun));

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('already_absent');
  });
});

describe('retireCronLine verifies what actually landed', () => {
  it('restores the backup when the write loses the other entries', () => {
    const before = crontabWith(WATCHER_LINE);
    const { io, state } = fakeIo(before);
    // A crontab that truncates on write is the 2026-07-31 incident in miniature.
    io.write = (c: string) => {
      state.writes.push(c);
      state.content = '*/5 * * * * something-else\n';
    };

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('restored');
  });

  it('puts the original content back, byte for byte', () => {
    const before = crontabWith(WATCHER_LINE);
    const { io, state } = fakeIo(before);
    let truncateOnce = true;
    io.write = (c: string) => {
      state.writes.push(c);
      state.content = truncateOnce ? '' : c;
      truncateOnce = false;
    };

    retireCronLine({ io, markers: MARKERS });

    expect(state.content).toBe(before);
  });

  it('reports io_error rather than claiming success when the write throws', () => {
    const { io } = fakeIo(crontabWith(WATCHER_LINE));
    io.write = () => {
      throw new Error('crontab: installing new crontab failed');
    };

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('io_error');
  });

  it('carries the underlying failure into the detail', () => {
    const { io } = fakeIo(crontabWith(WATCHER_LINE));
    io.write = () => {
      throw new Error('crontab: installing new crontab failed');
    };

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.detail).toContain('installing new crontab failed');
  });
});

describe('retireCronLine handles the file shapes a real crontab comes in', () => {
  it('keeps a single trailing newline when the watcher line was last', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));

    retireCronLine({ io, markers: MARKERS });

    expect(state.content.endsWith('\n')).toBe(true);
  });

  it('does not leave a blank line where the entry used to be', () => {
    const { io, state } = fakeIo(crontabWith(WATCHER_LINE));

    retireCronLine({ io, markers: MARKERS });

    expect(state.content).not.toContain('\n\n\n');
  });

  it('installs an empty crontab when the watcher entry was the only line', () => {
    const { io, state } = fakeIo(`${WATCHER_LINE}\n`);

    const result = retireCronLine({ io, markers: MARKERS });

    expect(result.status).toBe('retired');
    expect(state.content).toBe('');
  });

  it('tolerates a crontab with no trailing newline', () => {
    const { io, state } = fakeIo(`${OTHER_LINES.join('\n')}\n${WATCHER_LINE}`);

    retireCronLine({ io, markers: MARKERS });

    expect(state.content).toBe(`${OTHER_LINES.join('\n')}\n`);
  });
});
