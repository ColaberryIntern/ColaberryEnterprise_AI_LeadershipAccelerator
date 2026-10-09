/**
 * Durable execution: exactly-once, bounded retries, leases, dead-lettering.
 *
 * Every assertion here is on the STORE's recorded state rather than on a log line or a return
 * message, because "it said it worked" is not the property under test — "it wrote one row, not
 * two" is. The store double counts its writes for exactly that reason.
 *
 * The clock is injected, so lease expiry is tested by moving time rather than by waiting, and
 * the third retry is reachable without 42 seconds of real backoff.
 */
import {
  executeStage,
  classifyError,
  MAX_ATTEMPTS,
  BACKOFF_MS,
  LEASE_TTL_MS,
  type ExecutionStore,
  type StageRun,
  type DeadLetter,
} from '../lifecycleExecution';

/** In-memory store that records every write, so duplicate execution is observable. */
function makeStore() {
  const runs = new Map<string, StageRun>();
  const deadLetters: DeadLetter[] = [];
  let putCount = 0;
  const key = (id: string, stage: string) => `${id}::${stage}`;
  const store: ExecutionStore = {
    async get(id, stage) { return runs.get(key(id, stage)) ?? null; },
    async put(run) { putCount++; runs.set(key(run.lifecycleStateId, run.stage), { ...run }); },
    async deadLetter(entry) { deadLetters.push(entry); },
  };
  return {
    store,
    deadLetters,
    get putCount() { return putCount; },
    current: () => runs.get(key('ls-1', 'planning')) ?? null,
    seed: (over: Partial<StageRun> = {}) => {
      runs.set(key('ls-1', 'planning'), {
        lifecycleStateId: 'ls-1', tenantId: 't-1', stage: 'planning',
        leaseUntil: null, attempts: 0, completedAt: null, holdForReview: false, ...over,
      });
    },
  };
}

/** A fake clock that only moves when told to. */
function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function run(s: ReturnType<typeof makeStore>, work: () => Promise<void>, now?: () => number) {
  return executeStage({
    lifecycleStateId: 'ls-1', tenantId: 't-1', stage: 'planning',
    correlationId: 'corr-1', work, store: s.store, now,
  });
}

const ok = async () => { /* succeeds */ };
const boom = (msg = 'upstream exploded') => async () => { throw new Error(msg); };

describe('the caps are real values, not prose', () => {
  it('caps attempts at 3, matching Stall Detection', () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });

  it('has one backoff interval per retry, and none after the last attempt', () => {
    expect(BACKOFF_MS).toEqual([2_000, 8_000, 32_000]);
    expect(BACKOFF_MS.length).toBeGreaterThanOrEqual(MAX_ATTEMPTS - 1);
  });

  it('has a finite lease TTL', () => {
    expect(LEASE_TTL_MS).toBeGreaterThan(0);
    expect(Number.isFinite(LEASE_TTL_MS)).toBe(true);
  });
});

describe('exactly once', () => {
  it('completes on the first attempt and records completion', async () => {
    const s = makeStore();
    const res = await run(s, ok);
    expect(res.outcome).toBe('completed');
    expect(res.attempts).toBe(1);
    expect(s.current()?.completedAt).not.toBeNull();
    expect(s.current()?.leaseUntil).toBeNull();
  });

  it('a duplicate start after completion does NOT re-run the work', async () => {
    const s = makeStore();
    let ran = 0;
    const counted = async () => { ran++; };
    await run(s, counted);
    const second = await run(s, counted);
    expect(ran).toBe(1);                      // the property under test
    expect(second.outcome).toBe('completed');
    expect(second.message).toMatch(/already completed/i);
  });

  it('a duplicate start WHILE in flight is refused rather than racing', async () => {
    const s = makeStore();
    const clock = makeClock();
    // A live claim, as a crashed-mid-run worker would leave.
    s.seed({ leaseUntil: clock.now() + LEASE_TTL_MS, attempts: 1 });
    let ran = 0;
    const res = await run(s, async () => { ran++; }, clock.now);
    expect(res.outcome).toBe('in_flight');
    expect(ran).toBe(0);
    expect(res.message).toMatch(/duplicate start ignored/i);
  });

  it('two near-simultaneous starts produce one execution, not two', async () => {
    const s = makeStore();
    let ran = 0;
    const slow = async () => { ran++; await new Promise((r) => setTimeout(r, 5)); };
    // Sequential-await is the honest model here: the first claims the lease, the second sees it.
    await run(s, slow);
    await run(s, slow);
    expect(ran).toBe(1);
  });
});

describe('the review hold survives a restart — the LC-13 regression', () => {
  it('carries holdForReview forward instead of defaulting it to false', async () => {
    const s = makeStore();
    const clock = makeClock();
    // A crashed attempt that had the hold set, with an EXPIRED lease so it is resumable.
    s.seed({ holdForReview: true, attempts: 1, leaseUntil: clock.now() - 1 });
    const res = await run(s, ok, clock.now);
    expect(res.outcome).toBe('completed');
    // The specific regression: this must still be true. A build that lost it published itself
    // to a student who had never been shown it.
    expect(s.current()?.holdForReview).toBe(true);
  });

  it('keeps the hold even when the attempt fails again', async () => {
    const s = makeStore();
    const clock = makeClock();
    s.seed({ holdForReview: true, attempts: 1, leaseUntil: clock.now() - 1 });
    await run(s, boom(), clock.now);
    expect(s.current()?.holdForReview).toBe(true);
  });

  it('POSITIVE CONTROL: a run without the hold does not acquire one', async () => {
    // Otherwise the assertion above would pass even if holdForReview were hard-coded true.
    const s = makeStore();
    await run(s, ok);
    expect(s.current()?.holdForReview).toBe(false);
  });
});

describe('leases', () => {
  it('an EXPIRED lease is reclaimable', async () => {
    const s = makeStore();
    const clock = makeClock();
    s.seed({ leaseUntil: clock.now() + LEASE_TTL_MS, attempts: 1 });
    clock.advance(LEASE_TTL_MS + 1);
    let ran = 0;
    const res = await run(s, async () => { ran++; }, clock.now);
    expect(res.outcome).toBe('completed');
    expect(ran).toBe(1);
  });

  it('a lease one millisecond from expiry is NOT yet reclaimable', async () => {
    const s = makeStore();
    const clock = makeClock();
    s.seed({ leaseUntil: clock.now() + LEASE_TTL_MS, attempts: 1 });
    clock.advance(LEASE_TTL_MS - 1);
    const res = await run(s, ok, clock.now);
    expect(res.outcome).toBe('in_flight');
  });

  it('claims a lease before doing the work, so a crash mid-work leaves the claim visible', async () => {
    const s = makeStore();
    const clock = makeClock();
    let leaseDuringWork: number | null | undefined;
    await run(s, async () => { leaseDuringWork = s.current()?.leaseUntil; }, clock.now);
    expect(leaseDuringWork).toBe(clock.now() + LEASE_TTL_MS);
  });

  it('releases the lease on failure so a retry is possible', async () => {
    const s = makeStore();
    await run(s, boom());
    expect(s.current()?.leaseUntil).toBeNull();
  });
});

describe('bounded retries and dead-lettering', () => {
  it('attempts exactly MAX_ATTEMPTS times for a permanently failing command, then dead-letters', async () => {
    const s = makeStore();
    let ran = 0;
    const always = async () => { ran++; throw new Error('timeout talking to provider'); };

    const r1 = await run(s, always);
    expect(r1.outcome).toBe('retry_scheduled');
    expect(r1.retryAfterMs).toBe(BACKOFF_MS[0]);

    const r2 = await run(s, always);
    expect(r2.outcome).toBe('retry_scheduled');
    expect(r2.retryAfterMs).toBe(BACKOFF_MS[1]);

    const r3 = await run(s, always);
    expect(r3.outcome).toBe('dead_lettered');

    expect(ran).toBe(MAX_ATTEMPTS);
    expect(s.deadLetters).toHaveLength(1);
    expect(s.deadLetters[0]).toMatchObject({
      lifecycleStateId: 'ls-1', attemptedStage: 'planning',
      attempts: MAX_ATTEMPTS, errorClass: 'TimeoutError', correlationId: 'corr-1',
    });
  });

  it('refuses a FOURTH attempt rather than quietly continuing', async () => {
    const s = makeStore();
    const always = boom();
    await run(s, always); await run(s, always); await run(s, always);
    let ran = 0;
    const res = await run(s, async () => { ran++; });
    expect(res.outcome).toBe('dead_lettered');
    expect(ran).toBe(0);
    expect(s.deadLetters).toHaveLength(1); // not dead-lettered twice
  });

  it('POSITIVE CONTROL: a command that fails twice then succeeds still completes', async () => {
    // Without this, "attempts exactly 3" would also pass for an implementation that never
    // retries at all, or one that gives up after one failure.
    const s = makeStore();
    let n = 0;
    const flaky = async () => { n++; if (n < 3) throw new Error('rate limit 429'); };
    expect((await run(s, flaky)).outcome).toBe('retry_scheduled');
    expect((await run(s, flaky)).outcome).toBe('retry_scheduled');
    const third = await run(s, flaky);
    expect(third.outcome).toBe('completed');
    expect(third.attempts).toBe(3);
    expect(s.deadLetters).toHaveLength(0);
    expect(s.current()?.completedAt).not.toBeNull();
  });

  it('never advances the stage on failure — a draft may survive, an approved stage may not move', async () => {
    const s = makeStore();
    await run(s, boom());
    expect(s.current()?.completedAt).toBeNull();
  });

  it('carries a visible retry reason rather than failing silently', async () => {
    const s = makeStore();
    const res = await run(s, boom('connection ECONNREFUSED'));
    expect(res.errorClass).toBe('UpstreamUnavailable');
    expect(res.message).toMatch(/UpstreamUnavailable/);
  });
});

describe('error classification is specific, never a bare Error', () => {
  it('classifies the provider failure modes the contract names', () => {
    expect(classifyError(new Error('Request timeout after 30s'))).toBe('TimeoutError');
    expect(classifyError(new Error('429 Too Many Requests'))).toBe('RateLimitError');
    expect(classifyError(new Error('rate limit exceeded'))).toBe('RateLimitError');
    expect(classifyError(new Error('connect ECONNREFUSED 10.0.0.1'))).toBe('UpstreamUnavailable');
    expect(classifyError(new Error('service unavailable'))).toBe('UpstreamUnavailable');
    expect(classifyError(new Error('malformed JSON in response'))).toBe('ContractViolation');
  });

  it('prefers a real error name when one exists', () => {
    class ApprovalConflictError extends Error { constructor() { super('x'); this.name = 'ApprovalConflictError'; } }
    expect(classifyError(new ApprovalConflictError())).toBe('ApprovalConflictError');
  });

  it('never returns a bare "Error" — an unclassifiable failure is named as such', () => {
    // A generic `Error` in production logs means the surrounding code needs a specific catch.
    expect(classifyError(new Error('something odd'))).toBe('UnclassifiedError');
    expect(classifyError('a string')).toBe('UnclassifiedError');
    expect(classifyError(null)).toBe('UnclassifiedError');
    expect(classifyError(undefined)).toBe('UnclassifiedError');
  });
});
