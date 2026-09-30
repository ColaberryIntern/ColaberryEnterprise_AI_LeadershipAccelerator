/**
 * Escalation dedup is scoped to the CURRENT window; reply guards are not.
 *
 * The permanent version was the right call while the flood was fresh: it made a
 * repeat escalation impossible. The cost only became visible afterwards. The
 * compacted log carried 43 threads escalated in earlier windows, so a student
 * writing AGAIN on one of those threads was dropped in silence and never
 * reached Ali. That is the same failure the watcher exists to prevent, arriving
 * from the other direction.
 *
 * Ali chose per-window on 2026-08-25. What keeps that safe is that the flood was
 * never caused by window SCOPE — it was 143 escalations across 43 threads driven
 * by re-escalating the same message every 20 minutes. Per-window still bounds it
 * to one escalation per thread per window.
 *
 * The asymmetry is the point of this file: escalations go to a human who wants
 * to hear again, replies go to a student for whom a second copy is a defect.
 * A test that only checked "escalation resets" would pass just as happily if
 * someone reset the reply ceilings too, so both are asserted here.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { replayWatcherLog, WatcherLog, WATCHER_LOG_FILENAME } from '../watcherLog';

function stateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-window-scope-'));
}

const WINDOW_1_START = '2026-08-22T00:00:00.000Z';
const WINDOW_2_START = '2026-08-25T03:18:50.460Z';

/** Write the log directly, so the fixture is the file a restart would read. */
function writeLog(dir: string, events: Array<Record<string, unknown>>): void {
  fs.writeFileSync(
    path.join(dir, WATCHER_LOG_FILENAME),
    `${events.map((e) => JSON.stringify(e)).join('\n')}\n`,
  );
}

describe('escalations are scoped to the current window', () => {
  it('a thread escalated in the PREVIOUS window can escalate again in this one', () => {
    const dir = stateDir();
    writeLog(dir, [
      { ts: '2026-08-22T04:00:00.000Z', type: 'escalation_attempt', run_id: 'w1', thread_key: 'thread-old' },
      { ts: '2026-08-22T04:00:01.000Z', type: 'escalated', run_id: 'w1', thread_key: 'thread-old' },
    ]);

    // Unscoped: the old behaviour, kept so the difference is visible.
    expect(replayWatcherLog(dir).escalatedThreads.has('thread-old')).toBe(true);

    // Scoped to window 2: that escalation belongs to window 1 and does not count.
    expect(replayWatcherLog(dir, WINDOW_2_START).escalatedThreads.has('thread-old')).toBe(false);
  });

  it('still suppresses a repeat WITHIN the current window', () => {
    const dir = stateDir();
    writeLog(dir, [
      { ts: '2026-08-22T04:00:00.000Z', type: 'escalated', run_id: 'w1', thread_key: 'thread-old' },
      { ts: '2026-08-25T04:20:05.000Z', type: 'escalation_attempt', run_id: 'w2', thread_key: 'thread-new' },
    ]);

    const replayed = replayWatcherLog(dir, WINDOW_2_START);
    expect(replayed.escalatedThreads.has('thread-new')).toBe(true);   // this window: suppressed
    expect(replayed.escalatedThreads.has('thread-old')).toBe(false);  // last window: released
  });

  it('an escalation exactly ON the window start counts as inside it', () => {
    const dir = stateDir();
    writeLog(dir, [
      { ts: WINDOW_2_START, type: 'escalated', run_id: 'w2', thread_key: 'thread-boundary' },
    ]);
    expect(replayWatcherLog(dir, WINDOW_2_START).escalatedThreads.has('thread-boundary')).toBe(true);
  });

  it('REPLY guards stay cumulative — a student is never sent a second copy', () => {
    const dir = stateDir();
    writeLog(dir, [
      {
        ts: '2026-08-22T04:00:00.000Z', type: 'reply_attempt', run_id: 'w1',
        thread_key: 'thread-replied', from_address: 'student@example.com',
      },
      {
        ts: '2026-08-22T04:00:02.000Z', type: 'reply_sent', run_id: 'w1',
        thread_key: 'thread-replied', from_address: 'student@example.com',
        reply_message_id: '<w1-reply@colaberry.com>',
      },
    ]);

    // Same window bound that RELEASED the escalation above must NOT release these.
    const replayed = replayWatcherLog(dir, WINDOW_2_START);
    expect(replayed.answeredThreads.has('thread-replied')).toBe(true);
    expect(replayed.sentReplies).toHaveLength(1);
    expect(replayed.ownReplyIds.has('w1-reply@colaberry.com')).toBe(true);
  });

  it('an unparseable window bound falls back to the SUPPRESSIVE reading, not the permissive one', () => {
    const dir = stateDir();
    writeLog(dir, [
      { ts: '2026-08-22T04:00:00.000Z', type: 'escalated', run_id: 'w1', thread_key: 'thread-old' },
    ]);
    // A corrupt watch-window.json must not silently re-arm escalation for every
    // thread the watcher has ever touched.
    expect(replayWatcherLog(dir, 'not-a-date').escalatedThreads.has('thread-old')).toBe(true);
    expect(replayWatcherLog(dir, '').escalatedThreads.has('thread-old')).toBe(true);
  });

  it('an escalation with an undated ts counts, because it cannot be proven old', () => {
    const dir = stateDir();
    writeLog(dir, [
      { ts: 'garbage', type: 'escalated', run_id: 'w?', thread_key: 'thread-undated' },
    ]);
    expect(replayWatcherLog(dir, WINDOW_2_START).escalatedThreads.has('thread-undated')).toBe(true);
  });

  it('a live append during this window is picked up by a fresh replay', () => {
    const dir = stateDir();
    const log = WatcherLog.open(dir);
    log.append({
      ts: '2026-08-25T05:00:00.000Z', type: 'escalation_attempt', run_id: 'w2', thread_key: 'thread-live',
    });
    log.close();
    expect(replayWatcherLog(dir, WINDOW_2_START).escalatedThreads.has('thread-live')).toBe(true);
  });
});
