/**
 * executionRunState — the ExecutionRun state machine. PURE, no I/O.
 *
 * Master plan §Gate 8 defines eleven states. This module owns which transitions are
 * legal, which are terminal, and which are claimable by a worker.
 *
 * ## Why the state machine is a module and not a status column
 *
 * Gate 0's **E-03**: there is no durable job queue in this repo (`node-cron` plus two
 * in-process queues), and a run can sit in `executing` for minutes and in
 * `waiting_for_human` for days. An in-process queue loses every in-flight run on deploy,
 * and this stack deploys with `docker compose up -d --build`.
 *
 * So the run row **is** the queue: a worker claims rows with `SELECT … FOR UPDATE SKIP
 * LOCKED`, and the legal-transition table below is what stops two workers, or a worker
 * and a retry, from moving the same run in incompatible directions. No new dependency,
 * and the queue survives a deploy because it is in Postgres.
 */

export type ExecutionRunState =
  | 'queued'
  | 'provisioning'
  | 'planning'
  | 'executing'
  | 'testing'
  | 'verifying'
  | 'waiting_for_human'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export const EXECUTION_RUN_STATES: readonly ExecutionRunState[] = [
  'queued',
  'provisioning',
  'planning',
  'executing',
  'testing',
  'verifying',
  'waiting_for_human',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
];

/** States from which nothing further happens. */
export const TERMINAL_STATES: readonly ExecutionRunState[] = [
  'completed',
  'failed',
  'cancelled',
  'timed_out',
];

export function isTerminal(state: ExecutionRunState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * States in which a workspace may still exist and therefore must be destroyed on exit.
 *
 * `queued` is excluded because nothing was provisioned yet; every state after
 * `provisioning` is included, including `waiting_for_human` — a run parked for days
 * still holds a workspace containing a client's source.
 */
const HOLDS_WORKSPACE: readonly ExecutionRunState[] = [
  'provisioning',
  'planning',
  'executing',
  'testing',
  'verifying',
  'waiting_for_human',
];

export function holdsWorkspace(state: ExecutionRunState): boolean {
  return HOLDS_WORKSPACE.includes(state);
}

/**
 * Legal transitions.
 *
 * Every non-terminal state can reach `failed`, `cancelled` and `timed_out` — a run can
 * die at any point, and a machine that cannot express that produces rows stuck forever
 * in `executing` because the only modelled exit was success.
 */
const ALWAYS_AVAILABLE: readonly ExecutionRunState[] = ['failed', 'cancelled', 'timed_out'];

const TRANSITIONS: Record<ExecutionRunState, readonly ExecutionRunState[]> = {
  queued: ['provisioning', ...ALWAYS_AVAILABLE],
  provisioning: ['planning', ...ALWAYS_AVAILABLE],
  planning: ['executing', 'waiting_for_human', ...ALWAYS_AVAILABLE],
  executing: ['testing', 'waiting_for_human', ...ALWAYS_AVAILABLE],
  testing: ['verifying', 'executing', 'waiting_for_human', ...ALWAYS_AVAILABLE],
  // Verification failing sends the run back to executing — that loop is the point of
  // having testing and verifying as separate states rather than one "checking".
  verifying: ['completed', 'executing', 'waiting_for_human', ...ALWAYS_AVAILABLE],
  // A human answering can resume the run at the phase that asked.
  waiting_for_human: ['planning', 'executing', 'testing', 'verifying', ...ALWAYS_AVAILABLE],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

export function canTransition(from: ExecutionRunState, to: ExecutionRunState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: ExecutionRunState): readonly ExecutionRunState[] {
  return TRANSITIONS[from] ?? [];
}

export class InvalidTransitionError extends Error {
  readonly from: ExecutionRunState;
  readonly to: ExecutionRunState;

  constructor(from: ExecutionRunState, to: ExecutionRunState) {
    super(`illegal execution run transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Throwing guard for the write path. */
export function assertTransition(from: ExecutionRunState, to: ExecutionRunState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/**
 * States a worker may claim off the queue.
 *
 * Only `queued`. A run already in flight belongs to the worker that claimed it, and a
 * run in `waiting_for_human` is waiting on a person, not on capacity — claiming either
 * would produce two workers driving one workspace.
 */
export const CLAIMABLE_STATES: readonly ExecutionRunState[] = ['queued'];

export function isClaimable(state: ExecutionRunState): boolean {
  return CLAIMABLE_STATES.includes(state);
}

/**
 * The claim query. Exported as a constant so the concurrency semantics are reviewable
 * and testable without a database.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes the table a queue: concurrent workers skip rows
 * another worker holds instead of blocking on them. Without `SKIP LOCKED` the workers
 * serialize behind one lock and the queue has no concurrency at all.
 */
export const CLAIM_NEXT_RUN_SQL = `
  UPDATE delivery_execution_runs
     SET state = 'provisioning',
         claimed_by = :workerId,
         claimed_at = NOW(),
         updated_at = NOW()
   WHERE id = (
     SELECT id
       FROM delivery_execution_runs
      WHERE state = 'queued'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING *`;

/**
 * A run whose worker died mid-flight.
 *
 * Detected by heartbeat age rather than by a worker reporting its own failure — a worker
 * that can reliably report its own death is not the failure being modelled. The reaper
 * moves these to `failed` so their workspace is destroyed and the story can be retried.
 */
export function isStale(input: {
  state: ExecutionRunState;
  lastHeartbeatAt: Date | null;
  now: Date;
  staleAfterSeconds: number;
}): boolean {
  if (isTerminal(input.state)) return false;
  // Waiting on a person is not staleness, however long it takes.
  if (input.state === 'waiting_for_human') return false;
  if (input.state === 'queued') return false;
  if (!input.lastHeartbeatAt) return true;

  const ageSeconds = (input.now.getTime() - input.lastHeartbeatAt.getTime()) / 1000;
  return ageSeconds > input.staleAfterSeconds;
}
