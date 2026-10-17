/**
 * The shared apparatus for `executeStage`: the store double, the injected clock, and a
 * permitting authorization.
 *
 * ## Why this is shared rather than copied
 *
 * Not reuse economy -- CLAUDE.md puts the extraction threshold at three callers and this has
 * two. The reason is that the guard suite's central claim is *"a refusal never touches the
 * store"*, and a claim like that is only as good as the store it is made against. If
 * `lifecycleExecutionGuard.test.ts` built its own double, "no write happened" would be a fact
 * about that double, not about the one the durability suite proves lease, retry and
 * dead-letter behaviour against. One double, so the two suites cannot disagree about what a
 * write is.
 *
 * The store counts writes instead of merely holding rows, because the properties under test are
 * "it wrote ONE row, not two" and "it wrote NOTHING", neither of which a final-state snapshot
 * can distinguish from a lucky overwrite.
 */
import {
  type ExecutionStore,
  type StageRun,
  type DeadLetter,
  type StageAuthorization,
} from '../lifecycleExecution';
import { completeEvidence } from './evidenceFixture';
import { FLAGS } from '../../../config/featureFlags';

/** The row both suites operate on. Named so a test never spells the pair twice. */
export const SUBJECT = { lifecycleStateId: 'ls-1', tenantId: 't-1', stage: 'planning' } as const;

/** In-memory store that records every write, so duplicate execution is observable. */
export function makeStore() {
  const runs = new Map<string, StageRun>();
  const deadLetters: DeadLetter[] = [];
  let putCount = 0;
  let getCount = 0;
  const key = (id: string, stage: string) => `${id}::${stage}`;
  const store: ExecutionStore = {
    async get(id, stage) { getCount++; return runs.get(key(id, stage)) ?? null; },
    async put(run) { putCount++; runs.set(key(run.lifecycleStateId, run.stage), { ...run }); },
    async deadLetter(entry) { deadLetters.push(entry); },
  };
  return {
    store,
    deadLetters,
    get putCount() { return putCount; },
    /**
     * READS, counted separately from writes. The guard is specified to run before any store
     * read, so "no write" is the weaker claim and this is the one that pins the ordering: a
     * guard that refused only after loading the row would still show `putCount === 0`.
     */
    get getCount() { return getCount; },
    current: () => runs.get(key(SUBJECT.lifecycleStateId, SUBJECT.stage)) ?? null,
    seed: (over: Partial<StageRun> = {}) => {
      runs.set(key(SUBJECT.lifecycleStateId, SUBJECT.stage), {
        lifecycleStateId: SUBJECT.lifecycleStateId,
        tenantId: SUBJECT.tenantId,
        stage: SUBJECT.stage,
        leaseUntil: null,
        attempts: 0,
        completedAt: null,
        holdForReview: false,
        ...over,
      });
    },
  };
}

/**
 * Flip `ENABLE_PROJECT_LIFECYCLE`'s in-process flag for one call, and ALWAYS put it back.
 *
 * Shared rather than copied because a second copy that forgot the restore would leak
 * enforcement into whatever test ran next, and the symptom -- a suite that passes alone and
 * fails in a full run -- is the kind nobody attributes to a helper.
 *
 * It is also the omission that caught `sourceInjectionSafe002.test.ts` out: that file's first
 * version never enabled the flag, so the guard was never consulted and a case asserting a
 * refusal got `completed`. One definition, imported, is why that cannot recur per file.
 */
export function withFlag<T>(on: boolean, fn: () => T): T {
  const prev = FLAGS.lifecycleEnforcement;
  (FLAGS as { lifecycleEnforcement: boolean }).lifecycleEnforcement = on;
  try {
    return fn();
  } finally {
    (FLAGS as { lifecycleEnforcement: boolean }).lifecycleEnforcement = prev;
  }
}

/** A fake clock that only moves when told to. */
export function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

/**
 * An authorization that passes every check: the owning tenant, a legal edge into `planning`,
 * and evidence with nothing blocking.
 *
 * Built from the SHIPPED `completeEvidence()` fixture rather than a hand-rolled object, so it
 * cannot drift from what the real predicates read. `over` is how the guard suite makes exactly
 * one thing wrong at a time: every refusal case below is this object with a single field
 * changed, which is what makes the refusal attributable to that field.
 */
export function permitting(over: Partial<StageAuthorization> = {}): StageAuthorization {
  return {
    from: 'blueprint_approved',
    actorTenantId: SUBJECT.tenantId,
    evidence: completeEvidence(),
    ...over,
  };
}
