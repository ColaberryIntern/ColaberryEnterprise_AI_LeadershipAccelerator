/**
 * L7.3: the room-outbox crash recovery must say WHY it reclaimed a row.
 *
 * `recoverStaleProcessing` returned `void` and logged nothing, in a file with no logging of any
 * kind. The reason reached the row's `last_error` column and went no further, so a sweep that
 * dead-lettered a community-room event was invisible to anyone watching the service. The ticket's
 * metric is that every recovery path leaves a log line naming why it retried, and a path that
 * could not even say how many rows it touched could not meet it.
 *
 * These assertions are on the PURE line builder, not on the sweep, because the metric is about the
 * line. The sweep's database behaviour is covered by roomOutboxClaimRace.integration.test.ts.
 *
 * WHICH TEST CATCHES WHAT, measured by mutation:
 *  - returning a line when nothing was recovered   -> 'stays silent on a quiet sweep'
 *  - merging the two outcomes into one line        -> 'separates a retry from a death'
 *  - dropping `reason`                             -> 'names the cause, not just the effect'
 *  - swapping the outcome values                   -> 'marks a dead-letter as a failure'
 *  - dropping `stale_after_ms`                     -> 'carries the bound that defines staleness'
 */
import {
  staleProcessingLogLines,
  type StaleProcessingOutcome,
} from '../roomOutboxService';

const outcome = (over: Partial<StaleProcessingOutcome> = {}): StaleProcessingOutcome => ({
  deadLettered: 0,
  requeued: 0,
  deadLetteredIds: [],
  requeuedIds: [],
  staleAfterMs: 600_000,
  ...over,
});

describe('staleProcessingLogLines', () => {
  it('stays silent on a quiet sweep', () => {
    // A line every time the drain runs would bury the one sweep that mattered.
    expect(staleProcessingLogLines(outcome())).toEqual([]);
  });

  it('names the cause, not just the effect', () => {
    const [line] = staleProcessingLogLines(outcome({ requeued: 2, requeuedIds: ['a', 'b'] }));
    expect(line.reason).toBe('worker_crash_left_row_processing');
    expect(line.error_class).toBe('StaleProcessing');
    expect(line.detail).toContain('worker presumed dead');
  });

  it('separates a retry from a death', () => {
    const lines = staleProcessingLogLines(outcome({
      requeued: 2, requeuedIds: ['a', 'b'],
      deadLettered: 1, deadLetteredIds: ['c'],
    }));
    expect(lines).toHaveLength(2);
    const events = lines.map((l) => l.event);
    expect(events).toContain('stale_processing_requeued');
    expect(events).toContain('stale_processing_dead_lettered');
    // The ids must not be pooled: "which rows were recycled" is the first question asked when
    // somebody reports a duplicate, and a merged array cannot answer it.
    const requeuedLine = lines.find((l) => l.event === 'stale_processing_requeued');
    const deadLine = lines.find((l) => l.event === 'stale_processing_dead_lettered');
    expect(requeuedLine?.ids).toEqual(['a', 'b']);
    expect(deadLine?.ids).toEqual(['c']);
  });

  it('marks a dead-letter as a failure and a requeue as partial', () => {
    const lines = staleProcessingLogLines(outcome({
      requeued: 1, requeuedIds: ['a'], deadLettered: 1, deadLetteredIds: ['c'],
    }));
    expect(lines.find((l) => l.event === 'stale_processing_requeued')?.outcome).toBe('partial');
    expect(lines.find((l) => l.event === 'stale_processing_dead_lettered')?.outcome).toBe('failure');
  });

  it('says a dead-lettered row will not be retried', () => {
    const [line] = staleProcessingLogLines(outcome({ deadLettered: 1, deadLetteredIds: ['c'] }));
    expect(line.detail).toContain('no attempts left');
    expect(line.detail).toContain('rather than recycled');
  });

  it('carries the bound that defines staleness', () => {
    // Without it the line says a worker was presumed dead and gives no way to judge whether the
    // threshold was reasonable.
    const [line] = staleProcessingLogLines(outcome({ requeued: 1, requeuedIds: ['a'], staleAfterMs: 42 }));
    expect(line.stale_after_ms).toBe(42);
    expect(line.detail).toContain('42ms');
  });

  it('reports counts that match the ids it carries', () => {
    const lines = staleProcessingLogLines(outcome({
      requeued: 3, requeuedIds: ['a', 'b', 'c'], deadLettered: 2, deadLetteredIds: ['d', 'e'],
    }));
    for (const line of lines) expect(line.count).toBe(line.ids.length);
  });

  it('is tagged with the service, so the line is attributable in a shared log stream', () => {
    const [line] = staleProcessingLogLines(outcome({ requeued: 1, requeuedIds: ['a'] }));
    expect(line.service).toBe('room-outbox');
  });
});
