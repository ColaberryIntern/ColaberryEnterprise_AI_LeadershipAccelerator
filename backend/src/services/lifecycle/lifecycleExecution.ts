/**
 * Durable stage execution — re-entry guards, bounded retries, leases, dead-lettering.
 *
 * THE INVARIANT THIS EXISTS FOR: running the same stage command twice must produce one result,
 * and a crash in the middle must leave something safe to resume from. LC-13 was a real incident
 * of exactly this shape — a review hold dropped on restart, and a build published itself to a
 * student who had never been shown it.
 *
 * DEPENDENCIES ARE INJECTED, not imported. The store is an interface and the clock is a function,
 * so every branch here — lease expiry, the third retry, a dead-letter write — is reachable from a
 * test with no database and no real waiting. That is also why this stays inside the CI gate,
 * which has no `DATABASE_URL`.
 *
 * IDEMPOTENCY IS PER DOMAIN, deliberately. `services/cape/*` and `agentTicketLinkService.ts`
 * each own their own dedup, and this follows that convention rather than introducing a global
 * outbox table. A new generic outbox would be a new architectural layer, which is ESCALATE-tier
 * under CLAUDE.md's Autonomy Model and outside this contract's scope.
 *
 * THE RE-ENTRY GUARD is the pattern `sbpOrchestrator.ts:196` already uses: refuse while a run is
 * in flight rather than starting a second one. Cheap, and it turns a duplicate click into a
 * no-op instead of a race.
 */
import type { LifecycleStage } from './lifecycleStages';

/**
 * Max attempts for one stage command, then it dead-letters.
 *
 * Three, matching CLAUDE.md's Stall Detection ("same failure 3 times = stop, not retry again").
 * Exported so a test can assert the cap rather than hard-code a number that could drift away
 * from the implementation.
 */
export const MAX_ATTEMPTS = 3;

/** Fixed backoff between attempts, in ms. Length is MAX_ATTEMPTS - 1: no wait after the last. */
export const BACKOFF_MS: ReadonlyArray<number> = [2_000, 8_000, 32_000];

/** How long a claim on a stage command is honoured before another worker may take it. */
export const LEASE_TTL_MS = 5 * 60_000;

export type ExecutionOutcome = 'completed' | 'in_flight' | 'dead_lettered' | 'retry_scheduled';

export interface StageRun {
  lifecycleStateId: string;
  tenantId: string;
  stage: LifecycleStage;
  /** Set while a worker holds the claim. Null when free. */
  leaseUntil: number | null;
  attempts: number;
  /** Set once the command has succeeded. A completed run is never re-run. */
  completedAt: number | null;
  /** Preserved across attempts. This is the field LC-13 was about. */
  holdForReview: boolean;
}

export interface DeadLetter {
  lifecycleStateId: string;
  tenantId: string;
  attemptedStage: LifecycleStage;
  attempts: number;
  errorClass: string;
  errorMessage: string;
  correlationId: string;
}

/** The persistence surface, kept narrow so a test double is a few lines rather than a fixture. */
export interface ExecutionStore {
  get(lifecycleStateId: string, stage: LifecycleStage): Promise<StageRun | null>;
  put(run: StageRun): Promise<void>;
  deadLetter(entry: DeadLetter): Promise<void>;
}

export interface ExecuteStageInput {
  lifecycleStateId: string;
  tenantId: string;
  stage: LifecycleStage;
  correlationId: string;
  /** The side-effecting work. Throwing means this attempt failed. */
  work: () => Promise<void>;
  store: ExecutionStore;
  /** Injected so lease expiry is testable without waiting. Defaults to the real clock. */
  now?: () => number;
}

export interface ExecuteStageResult {
  outcome: ExecutionOutcome;
  attempts: number;
  /** Set when the outcome is `retry_scheduled`. */
  retryAfterMs?: number;
  /** A stable class, never a bare `Error`, so logs can be routed and counted. */
  errorClass?: string;
  message: string;
}

/** Stable classification. A generic `Error` in production logs means a missing specific catch. */
export function classifyError(err: unknown): string {
  if (err && typeof err === 'object') {
    const name = String((err as { name?: unknown }).name ?? '');
    if (name && name !== 'Error') return name;
    const msg = String((err as { message?: unknown }).message ?? '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('etimedout')) return 'TimeoutError';
    if (msg.includes('429') || msg.includes('rate limit')) return 'RateLimitError';
    if (msg.includes('econnrefused') || msg.includes('unavailable')) return 'UpstreamUnavailable';
    if (msg.includes('json') || msg.includes('malformed') || msg.includes('parse')) return 'ContractViolation';
  }
  return 'UnclassifiedError';
}

/**
 * Run one stage command, at most once, with bounded retries.
 *
 * Returns rather than throws for every expected condition, so a caller never has to distinguish
 * "already done" from "genuinely broken" by catching.
 */
export async function executeStage(input: ExecuteStageInput): Promise<ExecuteStageResult> {
  const now = input.now ?? (() => Date.now());
  const { store, lifecycleStateId, tenantId, stage, correlationId } = input;

  const existing = await store.get(lifecycleStateId, stage);

  // Already done. A duplicate request is a no-op, not a second execution.
  if (existing?.completedAt) {
    return {
      outcome: 'completed',
      attempts: existing.attempts,
      message: `Stage ${stage} already completed; nothing re-run.`,
    };
  }

  // Someone else holds a live claim. Refuse rather than race — the sbpOrchestrator pattern.
  if (existing?.leaseUntil && existing.leaseUntil > now()) {
    return {
      outcome: 'in_flight',
      attempts: existing.attempts,
      message: `Stage ${stage} is already running; duplicate start ignored.`,
    };
  }

  // Already exhausted. Do not quietly start a fourth attempt.
  if (existing && existing.attempts >= MAX_ATTEMPTS) {
    return {
      outcome: 'dead_lettered',
      attempts: existing.attempts,
      message: `Stage ${stage} exhausted ${MAX_ATTEMPTS} attempts and is dead-lettered.`,
    };
  }

  // Claim it. `holdForReview` is carried forward from the existing row, never defaulted — losing
  // it on resume is precisely the LC-13 failure.
  const run: StageRun = {
    lifecycleStateId,
    tenantId,
    stage,
    leaseUntil: now() + LEASE_TTL_MS,
    attempts: (existing?.attempts ?? 0) + 1,
    completedAt: null,
    holdForReview: existing?.holdForReview ?? false,
  };
  await store.put(run);

  try {
    await input.work();
  } catch (err) {
    const errorClass = classifyError(err);
    const message = err instanceof Error ? err.message : String(err);

    // Release the claim so a retry is possible, and keep the attempt count and the review hold.
    // The stage is NOT advanced: a model or tool failure may leave a recoverable draft behind,
    // but it must never move an approved stage forward.
    await store.put({ ...run, leaseUntil: null });

    if (run.attempts >= MAX_ATTEMPTS) {
      await store.deadLetter({
        lifecycleStateId,
        tenantId,
        attemptedStage: stage,
        attempts: run.attempts,
        errorClass,
        errorMessage: message,
        correlationId,
      });
      return {
        outcome: 'dead_lettered',
        attempts: run.attempts,
        errorClass,
        message: `Stage ${stage} failed ${run.attempts} times (${errorClass}); dead-lettered for manual triage.`,
      };
    }

    return {
      outcome: 'retry_scheduled',
      attempts: run.attempts,
      retryAfterMs: BACKOFF_MS[run.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1],
      errorClass,
      message: `Stage ${stage} attempt ${run.attempts} failed (${errorClass}); retrying.`,
    };
  }

  await store.put({ ...run, leaseUntil: null, completedAt: now() });
  return {
    outcome: 'completed',
    attempts: run.attempts,
    message: `Stage ${stage} completed on attempt ${run.attempts}.`,
  };
}
