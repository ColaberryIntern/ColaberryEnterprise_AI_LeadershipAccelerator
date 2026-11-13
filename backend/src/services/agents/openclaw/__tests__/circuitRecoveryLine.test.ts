/**
 * L7.3 — a circuit breaker closing is an event, and it used to be silent.
 *
 * The ticket's success metric, verbatim: "Every recovery path leaves a log line naming why it
 * retried. A silent recovery is an unmeasurable one."
 *
 * ## What was and was not wrong here, because only half of it was
 *
 * The TRIP was already handled. `checkCircuitBreaker` raises a deduped `emitAlert` when the
 * breaker opens, with the error rate and counts in its metadata, and logs if alerting itself
 * fails. That was fixed under BC #10099862873 and this suite does not touch it.
 *
 * The RECOVERY was not. `HALF_OPEN -> CLOSED` set the map entry and emitted nothing at all, and
 * the `CLOSED` branch deleted the entry just as quietly. So the asymmetry was: an operator gets
 * paged when distribution to a platform stops, and is told nothing when it starts again. The only
 * way to learn that posting had resumed was to open a dashboard and look.
 *
 * ## What is asserted here, and what is not
 *
 * `circuitRecoveryLine` is pure, so these assertions are exact and need no database behind
 * `getTaskCountsForPlatform`. They do NOT prove `checkCircuitBreaker` calls it on both branches;
 * that is two call sites and the typecheck is what keeps them honest.
 *
 * They also do not claim the breaker survives a restart. It does not: the state lives in a
 * process-local Map, so a restart silently closes every breaker. That gap is recorded on the
 * ticket rather than hidden behind a test that would imply otherwise.
 */
import { circuitRecoveryLine, type CircuitState } from '../openclawCircuitBreaker';

describe('a breaker closing says so, and says on what evidence', () => {
  it('names the event, the reason and a successful outcome', () => {
    const line = circuitRecoveryLine('reddit', 'HALF_OPEN', 3);
    expect(line.event).toBe('circuit_closed');
    expect(line.reason).toBe('recovered_after_cooldown');
    expect(line.outcome).toBe('success');
    expect(line.to).toBe('CLOSED');
  });

  it('carries the platform and the evidence count, not just a state change', () => {
    // "the circuit closed" is a state change. "3 tasks ran clean" is why it closed, and the
    // difference is whether a reader has to go and check for themselves.
    const line = circuitRecoveryLine('quora', 'HALF_OPEN', 3);
    expect(line.platform).toBe('quora');
    expect(line.observed_tasks).toBe(3);
    expect(line.detail).toContain('quora');
    expect(line.detail).toContain('3 task');
  });

  it('records which state it recovered FROM, because the two routes differ', () => {
    // HALF_OPEN -> CLOSED is the breaker proving itself after a cooldown. OPEN -> CLOSED is the
    // evaluator deciding the platform is healthy outright. Both are recoveries; a reader chasing
    // a flapping platform needs to know which one happened.
    const half: CircuitState = 'HALF_OPEN';
    const open: CircuitState = 'OPEN';
    expect(circuitRecoveryLine('skool', half, 3).from).toBe('HALF_OPEN');
    expect(circuitRecoveryLine('skool', open, 9).from).toBe('OPEN');
  });

  it('says in words that distribution is running again', () => {
    // The operator-facing half. Somebody who was paged when posting stopped should be able to
    // read one line and know it started, without decoding an enum.
    const line = circuitRecoveryLine('hn', 'HALF_OPEN', 3);
    expect(line.detail).toMatch(/resumed|running again/);
  });

  it('CONTROL does not invent a reason when no tasks were observed', () => {
    // A zero here would mean the breaker closed on no evidence. The line must still be honest
    // about that rather than implying successes that were never counted.
    const line = circuitRecoveryLine('devto', 'HALF_OPEN', 0);
    expect(line.observed_tasks).toBe(0);
    expect(line.detail).toContain('0 task');
    expect(line.detail).not.toMatch(/\b[1-9]\d* task/);
  });
});
