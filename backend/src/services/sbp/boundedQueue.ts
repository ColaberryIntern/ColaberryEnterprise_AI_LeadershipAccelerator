/**
 * boundedQueue — a hard ceiling on concurrent work. No I/O of its own.
 *
 * Exists because a cohort starts together. Twenty students confirming a build in
 * the same minute means twenty repo creations against one platform token and
 * twenty LLM calls in one process — the first hits GitHub's secondary rate
 * limit, the second is the known batch-generation OOM (the prod backend runs
 * with no memory limit on a host shared with Postgres).
 *
 * SBP-REQ-v1 NFR-001 / SBP-GH-v1 FR-040: excess work WAITS, it does not fan out.
 * Deliberately tiny and dependency-free — a queue is not the place for surprises.
 */

export interface QueueOptions {
  /** Maximum tasks running at once. Below 1 is meaningless and is clamped. */
  concurrency: number;
  /** Reject rather than accept work the queue cannot get to (backpressure). */
  maxDepth?: number;
  /** Observability hook; called on every state change. */
  onEvent?: (event: QueueEvent) => void;
}

export interface QueueEvent {
  type: 'queued' | 'started' | 'settled' | 'rejected';
  running: number;
  waiting: number;
  label?: string;
}

export class QueueFullError extends Error {
  readonly error_class = 'QueueFull';
  constructor(public readonly depth: number, public readonly maxDepth: number) {
    super(`queue is at capacity (${depth}/${maxDepth}) — try again shortly`);
    this.name = 'QueueFullError';
  }
}

export class BoundedQueue {
  private readonly concurrency: number;
  private readonly maxDepth: number;
  private readonly onEvent?: (e: QueueEvent) => void;
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  /** High-water mark, so a load test can assert the ceiling was never breached. */
  private peak = 0;

  constructor(opts: QueueOptions) {
    this.concurrency = Math.max(1, Math.floor(opts.concurrency));
    this.maxDepth = opts.maxDepth ?? Number.POSITIVE_INFINITY;
    this.onEvent = opts.onEvent;
  }

  get stats(): { running: number; waiting: number; peak: number; concurrency: number } {
    return { running: this.running, waiting: this.waiting.length, peak: this.peak, concurrency: this.concurrency };
  }

  private emit(type: QueueEvent['type'], label?: string): void {
    this.onEvent?.({ type, running: this.running, waiting: this.waiting.length, label });
  }

  /**
   * Run `task` when a slot frees. Rejects immediately with QueueFullError when
   * the wait list is already at `maxDepth` — an honest refusal beats accepting
   * work and silently dropping it.
   *
   * The task's own rejection propagates to the caller; the slot is released
   * either way, so one failure cannot wedge the queue.
   */
  async run<T>(task: () => Promise<T>, label?: string): Promise<T> {
    if (this.running >= this.concurrency) {
      // Backpressure applies only to work that would actually have to WAIT. A
      // task that can start right now is never refused for queue depth — that
      // would reject the very first caller whenever maxDepth is 0.
      if (this.waiting.length >= this.maxDepth) {
        this.emit('rejected', label);
        throw new QueueFullError(this.waiting.length, this.maxDepth);
      }
      this.emit('queued', label);
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    this.running += 1;
    if (this.running > this.peak) this.peak = this.running;
    this.emit('started', label);

    try {
      return await task();
    } finally {
      this.running -= 1;
      const next = this.waiting.shift();
      this.emit('settled', label);
      if (next) next();
    }
  }
}

/**
 * The shared queue for repo provisioning. One instance per process: a
 * per-request queue would bound nothing, which is the mistake worth naming.
 */
let provisionQueue: BoundedQueue | null = null;

export function getProvisionQueue(): BoundedQueue {
  if (!provisionQueue) {
    provisionQueue = new BoundedQueue({
      concurrency: Number(process.env.SBP_PROVISION_CONCURRENCY) || 3,
      maxDepth: Number(process.env.SBP_PROVISION_MAX_DEPTH) || 100,
    });
  }
  return provisionQueue;
}

let architectQueue: BoundedQueue | null = null;

/**
 * A SEPARATE, wider ceiling for Architect document generation.
 *
 * The provision queue exists to cap LOCAL memory — decomposition holds a large
 * model response in this process, and batch generation here has OOM'd at ~34
 * concurrent. An Architect job is the opposite shape: ~15 minutes of remote work
 * on advisor.colaberry.ai, during which this process holds a poll timer and
 * nothing else.
 *
 * Running them on the same queue would be a serious regression. At concurrency
 * 3, twenty students would serialise into seven 15-minute waves — about 105
 * minutes for the last one, past the frontend's 25-minute poll deadline. The
 * measured 20-way run (2026-08-10) finished in 237s precisely because nothing
 * held a slot for long.
 *
 * So the ceiling here is about the ARCHITECT's capacity, not ours. Default 6 is
 * deliberately conservative — advisor's concurrent-job limit has not been
 * measured, and finding it by pointing a cohort at it is not the way.
 */
export function getArchitectQueue(): BoundedQueue {
  if (!architectQueue) {
    architectQueue = new BoundedQueue({
      concurrency: Number(process.env.SBP_ARCHITECT_CONCURRENCY) || 6,
      maxDepth: Number(process.env.SBP_ARCHITECT_MAX_DEPTH) || 100,
    });
  }
  return architectQueue;
}

/** Test seam — resets the module-level singleton between cases. */
export function __resetProvisionQueue(): void {
  provisionQueue = null;
  architectQueue = null;
}
