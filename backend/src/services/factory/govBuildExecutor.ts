/**
 * govBuildExecutor — the FUTURE autonomous build-executor contract, shipped DISABLED.
 *
 * Live autonomous execution is OFF and this file does not turn it on. It defines the interface a future
 * executor (a manual human runner, or an agent) would implement — claim a story, heartbeat a lease,
 * submit a result, or fail — and provides the ONLY executor that exists today: a STUB that REFUSES every
 * operation with ExecutionDisabledError. The agent never self-approves, signs, submits, or publishes, and
 * cannot run a build. Mirrors the parked dark-switch pattern of factoryGenerationEntry + the pure throwing
 * gate of buildAuthorization: enabling execution is a deliberate governance change (a real executor wired in
 * behind an explicit flag + a live, scoped build authorization), never a default and never a flag flip here.
 *
 * Shipping the interface now (disabled) lets the rest of the Build track be typed against the eventual
 * executor without any path that could actually execute.
 */

/** A future executor is either a human doing the work manually, or an autonomous agent. */
export type ExecutorKind = 'manual' | 'agent';

/** A claim on one build story for a bounded lease (the future contract — never honored by the stub). */
export interface ExecutorClaim {
  storyId: string;
  executor: ExecutorKind;
  actorIdentityId: string;
  leaseSeconds: number;
}

/** A submitted result for a claimed story (the future contract — never accepted by the stub). */
export interface ExecutorResult {
  storyId: string;
  ok: boolean;
  /** Evidence reference (e.g. a repo commit / screenshot id) — reviewed by a human, never self-attested. */
  evidenceRef?: string | null;
  notes?: string | null;
}

export interface ExecutorFailure {
  storyId: string;
  reason: string;
}

/**
 * The executor interface a future (manual or agent) runner implements. Every method is async and, in the only
 * implementation that exists today, refuses — see disabledGovBuildExecutor.
 */
export interface GovBuildExecutor {
  claim(claim: ExecutorClaim): Promise<never>;
  heartbeat(storyId: string, actorIdentityId: string): Promise<never>;
  submitResult(result: ExecutorResult): Promise<never>;
  fail(failure: ExecutorFailure): Promise<never>;
}

export const EXECUTION_DISABLED_REASON = 'autonomous_execution_disabled' as const;

/** Thrown by every stub operation — the single refusal that keeps the autonomous builder parked. */
export class ExecutionDisabledError extends Error {
  readonly reason = EXECUTION_DISABLED_REASON;
  constructor(message = 'Autonomous build execution is disabled; the executor ships as a stub only.') {
    super(message);
    this.name = 'ExecutionDisabledError';
  }
}

/** The ONLY executor today: every operation refuses. No flag enables it here; there is no autobuild service. */
export const disabledGovBuildExecutor: GovBuildExecutor = {
  async claim(): Promise<never> { throw new ExecutionDisabledError(); },
  async heartbeat(): Promise<never> { throw new ExecutionDisabledError(); },
  async submitResult(): Promise<never> { throw new ExecutionDisabledError(); },
  async fail(): Promise<never> { throw new ExecutionDisabledError(); },
};

/** Whether autonomous execution is enabled. Hard-wired FALSE: enabling is a deliberate change, never inferred. */
export function isAutonomousExecutionEnabled(): boolean {
  return false;
}

/**
 * Resolve the build executor. There is no enabled path: this always returns the disabled stub. A future
 * real executor would be wired here behind isAutonomousExecutionEnabled() AND a live build authorization —
 * until then, every caller gets a stub that refuses, so no code path can run a build.
 */
export function resolveGovBuildExecutor(): GovBuildExecutor {
  return disabledGovBuildExecutor;
}
