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
import { FLAGS } from '../../config/featureFlags';
import { prerequisiteGaps, blockingGaps, type LifecycleEvidence } from './lifecyclePrerequisites';
import { ADVANCE } from './lifecycleStages';

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

/**
 * `refused` added by P7-T2 and it is NOT a failure outcome.
 *
 * A refusal means the command was never run: no attempt consumed, no lease taken, no
 * dead-letter. `retry_scheduled` and `dead_lettered` both mean the work RAN and did not
 * succeed, so folding a refusal into either would make an authorization decision look like
 * a flaky job and invite a retry that must never happen.
 */
export type ExecutionOutcome = 'completed' | 'in_flight' | 'dead_lettered' | 'retry_scheduled' | 'refused';

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

/**
 * What the guard needs to decide. REQUIRED, not optional, and that is the point.
 *
 * `plan-phase7.md` §3b: the field is required "so the guard cannot be optionally injected".
 * An optional authorization is a guard every caller may silently skip, which is how a control
 * becomes decoration. TypeScript enforces it at compile time; `assertAuthorized` below enforces
 * it at runtime, because a JavaScript caller or an `as any` can defeat the type.
 */
export interface StageAuthorization {
  /** The stage the project is CURRENTLY at. The transition being attempted is `from -> stage`. */
  from: LifecycleStage;
  /** The tenant the ACTOR belongs to. Compared against the row's tenant, never trusted as equal. */
  actorTenantId: string;
  /** The evidence snapshot the prerequisites are judged against. */
  evidence: LifecycleEvidence;
}

export interface ExecuteStageInput {
  lifecycleStateId: string;
  tenantId: string;
  stage: LifecycleStage;
  correlationId: string;
  /**
   * REQUIRED. See `StageAuthorization`.
   *
   * Typed as required and checked at runtime. The runtime check is not belt-and-braces: this
   * module is reached from a worker path, and `plan-phase7.md` §0.1 records that
   * `executeStage` today "imports one type and checks nothing" — the guard being skippable
   * is the defect, so making it skippable-with-a-cast would reproduce it.
   */
  authorization: StageAuthorization;
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
/**
 * The guard the worker path never had.
 *
 * ## Why it is here and not at the route
 *
 * `plan-phase7.md` §0.1: `executeStage` "imports one type and checks nothing". The HTTP
 * routes are guarded; this is the WORKER path, and §130 case 3 asks for exactly that -
 * "worker/job path bypass -> refused (not only the HTTP path)". A control that exists only on
 * the route is a control an internal caller walks around.
 *
 * ## Flag-off PERMITS AND SAYS SO, following `storyAuthorization.ts`
 *
 * With `ENABLE_PROJECT_LIFECYCLE` off the guard permits and logs that it was not consulted. It
 * does NOT silently permit: a permit that leaves no trace is indistinguishable from a guard that
 * ran and approved, and this programme has already shipped one control whose silence read as a
 * pass.
 *
 * **A CORRECTION TO THE PLAN'S OWN SAFETY ARGUMENT.** §3.5 says T2 "lands behind flags
 * defaulting off" and T7 "deploys them dark". Measured 16 Oct 2026:
 * `ENABLE_PROJECT_LIFECYCLE=true` in production, set on 14 Oct with DRI authorization. So the
 * flag does NOT hold this dark any more. What holds it is that `executeStage` has no non-test
 * caller - which §0.2 records and this guard does not change. Stated here because the next
 * person to wire a caller will reach for the flag as the safety mechanism and find it already on.
 *
 * ## Order
 *
 * Tenant first, then transition, then prerequisites. A foreign tenant must not learn which
 * transitions are legal or which prerequisites are unmet for a row it cannot see - refusing in
 * that order means the cheapest and least revealing check answers first.
 */
function authorize(input: ExecuteStageInput): ExecuteStageResult | null {
  const { authorization: auth, tenantId, stage, correlationId, lifecycleStateId } = input;

  // RUNTIME, not only the type. A JavaScript caller or an `as any` defeats the compiler, and a
  // guard that can be skipped by a cast is the defect this packet exists to close.
  if (!auth || typeof auth !== 'object') {
    throw new Error(
      'ContractViolation: executeStage requires `authorization` carrying the actor tenant, the '
      + 'current stage and the evidence. It is required so the guard cannot be optionally '
      + 'injected; passing it is how a caller proves it was authorized rather than assumed.',
    );
  }

  const log = (decision: string, reason: string, extra: Record<string, unknown> = {}) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: decision === 'refused' ? 'warn' : 'info',
      service: 'backend',
      event: 'lifecycle_stage_authorization',
      correlation_id: correlationId,
      outcome: decision === 'refused' ? 'failure' : 'success',
      context: { lifecycle_state_id: lifecycleStateId, stage, decision, reason, ...extra },
    }));
  };

  if (!FLAGS.lifecycleEnforcement) {
    // PERMIT, and say so. Never silent.
    log('permitted', 'not_consulted_flag_off');
    return null;
  }

  // 1. Tenant. Compared, never assumed equal, and the refusal does not say what exists.
  if (auth.actorTenantId !== tenantId) {
    log('refused', 'tenant_mismatch', { actor_tenant_id: auth.actorTenantId });
    return {
      outcome: 'refused',
      attempts: 0,
      errorClass: 'TenantIsolationViolation',
      message: `Stage ${stage} refused: the actor's tenant does not own this lifecycle row.`,
    };
  }

  // 2. The transition itself. `ADVANCE` is the single source of which edge is legal.
  if (ADVANCE[auth.from] !== stage) {
    log('refused', 'illegal_transition', { from: auth.from });
    return {
      outcome: 'refused',
      attempts: 0,
      errorClass: 'IllegalTransition',
      message: `Stage ${stage} refused: ${auth.from} does not advance to ${stage}.`,
    };
  }

  // 3. Prerequisites, by the SHIPPED predicate rather than a second opinion. `blockingGaps`
  //    filters only ADVISORY_RULES and no gap KIND is advisory, so `not_assessed` blocks too.
  const blocking = blockingGaps(prerequisiteGaps(stage, auth.evidence));
  if (blocking.length) {
    const named = blocking.map((g) => `${g.rule}:${g.kind}`).join(', ');
    log('refused', 'prerequisites_unmet', { blocking: named });
    return {
      outcome: 'refused',
      attempts: 0,
      errorClass: 'PrerequisitesUnmet',
      // THE RULE IS NAMED, which the acceptance requires: "refused, with the rule named". A
      // refusal that says only "not ready" sends a reviewer hunting.
      message: `Stage ${stage} refused: ${blocking.length} blocking prerequisite(s) - ${named}.`,
    };
  }

  log('permitted', 'all_checks_passed');
  return null;
}

export async function executeStage(input: ExecuteStageInput): Promise<ExecuteStageResult> {
  // BEFORE any store read, lease or attempt increment. A refused command must not consume an
  // attempt or leave a claim behind.
  const refusal = authorize(input);
  if (refusal) return refusal;

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
