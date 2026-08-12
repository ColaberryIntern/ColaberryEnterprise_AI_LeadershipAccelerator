/**
 * architectClient — the AI Project Architect's JSON REST API.
 *
 * WHY THIS EXISTS: SBP-REQ-v1 FR-003 requires the requirements document to be
 * built chapter-by-chapter with a per-chapter minimum and retry-if-short. That
 * is not a preference, it is a measured result — `docs/REQUIREMENTS_GENERATOR_COMPARISON.html`
 * (2026-05-21) ran both approaches on the same idea: chapter-by-chapter produced
 * 13,742 words; a single gpt-4o-mini call ASKED for >=6,000 words produced 1,450,
 * 24% of the ask. Raising max_tokens does not help; the model wraps up early
 * regardless. The Architect's value is the scaffolding, not a smarter model.
 *
 * The orchestrator has been shipping without this — it decomposed straight from
 * the 4-field brief, which is why a build took 30 seconds instead of the ~15
 * minutes the pipeline was designed around, and why plans were thinner than the
 * spec called for.
 *
 * WHY NOT architectProxyService: that service drives the Architect's CHAT flow —
 * form-encoded POST to /projects/new, parsing a slug out of a Location header,
 * then approving features and outline to walk phases 1-4. It is scraping a
 * browser flow. `/api/v1/generate` is the real machine interface: JSON in, job
 * id out, poll, download. It runs the same 8-phase pipeline and needs no session
 * cookie (/api/v1 is outside login_required_paths).
 *
 * FAILURE-FIRST (CLAUDE.md):
 *  - every call has an explicit timeout; none can hang
 *  - transient failures retry with capped exponential backoff; 4xx never retries
 *    (a 422 will fail identically forever, and retrying a 409 would race)
 *  - polling has a hard deadline AND a stall detector, so a job that dies
 *    upstream surfaces as an error rather than an infinite wait
 *  - the job id is returned to the caller BEFORE polling starts, so a backend
 *    restart can resume a job that is still running on the Architect
 */

const DEFAULT_BASE = 'https://advisor.colaberry.ai';

/** Per-request ceilings. Start/status are quick; download can be ~250KB of markdown. */
const START_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

/** A real run is 14-16 minutes. 40 gives headroom for a slow queue without hanging forever. */
const DEFAULT_DEADLINE_MS = 40 * 60_000;
const POLL_INTERVAL_MS = 15_000;

/** Transient-only retry budget. */
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;

export type ArchitectErrorClass =
  | 'ConfigError'
  | 'ValidationError'      // 422 — our payload is wrong; never retried
  | 'JobConflict'          // 409 — a job with this id is already running
  | 'UpstreamTimeout'
  | 'UpstreamUnavailable'
  | 'GenerationFailed'     // the pipeline reported error/quality_failed
  | 'GenerationStalled'    // upstream lost its in-memory progress
  | 'DeadlineExceeded'
  | 'EmptyDocument';

export class ArchitectError extends Error {
  constructor(
    public readonly error_class: ArchitectErrorClass,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ArchitectError';
  }
}

/** SBP build tiers → Architect depth. Word floors per FR-003: 2.5k / 6k / 12k. */
const DEPTH_BY_SIZE: Record<string, ArchitectDepth> = {
  workflow: 'standard',
  project: 'professional',
  autonomous: 'enterprise',
};

export type ArchitectDepth = 'light' | 'standard' | 'professional' | 'enterprise';
export type ArchitectBlueprint = 'standard' | 'autonomous';
export type ArchitectStatus = 'running' | 'complete' | 'quality_failed' | 'error' | 'stalled';

export function depthForSize(size: string | undefined): ArchitectDepth {
  return DEPTH_BY_SIZE[size ?? 'project'] ?? 'professional';
}

/** `autonomous` forces enterprise depth upstream; be explicit rather than relying on that. */
export function blueprintForSize(size: string | undefined): ArchitectBlueprint {
  return size === 'autonomous' ? 'autonomous' : 'standard';
}

export interface StartJobInput {
  /** Becomes the job id via the Architect's own _slugify. MUST be unique per live job. */
  projectName: string;
  /** 10..100,000 chars. Validated upstream; we check here to fail before the round trip. */
  requirements: string;
  depthMode?: ArchitectDepth;
  blueprint?: ArchitectBlueprint;
  correlationId?: string;
}

export interface StartJobResult {
  jobId: string;
  status: string;
  blueprint: string;
}

export interface JobStatus {
  status: ArchitectStatus;
  percent?: number;
  phase?: string;
  raw: Record<string, unknown>;
}

export interface GeneratedDocument {
  markdown: string;
  words: number;
  /** Present when the Architect served a document below its own quality threshold. */
  qualityWarning?: { score?: string; threshold?: string };
}

function baseUrl(): string {
  return (process.env.ARCHITECT_SERVICE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-architect',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One bounded HTTP call. Retries only what can plausibly succeed on a retry:
 * network errors, timeouts, and 5xx. A 4xx is our fault or a conflict and is
 * raised immediately — retrying a 422 wastes 3 round trips to fail the same way,
 * and retrying a 409 races the job that already holds the id.
 */
async function request(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  correlationId?: string,
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
          ...(init.headers || {}),
        },
      });

      if (res.status >= 500) {
        lastErr = new ArchitectError('UpstreamUnavailable', `Architect returned ${res.status}`, res.status);
        if (attempt < MAX_ATTEMPTS) { await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1)); continue; }
        throw lastErr;
      }
      return res;
    } catch (err: any) {
      if (err instanceof ArchitectError) { lastErr = err; if (attempt >= MAX_ATTEMPTS) throw err; continue; }
      const timedOut = err?.name === 'AbortError';
      lastErr = new ArchitectError(
        timedOut ? 'UpstreamTimeout' : 'UpstreamUnavailable',
        timedOut ? `Architect did not respond within ${timeoutMs}ms` : `Architect unreachable: ${err?.message}`,
      );
      if (attempt >= MAX_ATTEMPTS) throw lastErr;
      await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * Start a generation job. Returns as soon as the Architect accepts it — the job
 * runs for ~15 minutes upstream, so the caller must persist `jobId` before
 * polling. Without that, a backend restart orphans a job that is still running.
 */
export async function startJob(input: StartJobInput): Promise<StartJobResult> {
  const requirements = input.requirements.trim();
  if (requirements.length < 10) {
    throw new ArchitectError('ValidationError', 'requirements must be at least 10 characters');
  }
  // Upstream caps at 100k. Truncate rather than 422 — a brief this long is
  // already far past the point where more text improves the document.
  const payload = {
    project_name: input.projectName,
    requirements: requirements.slice(0, 100_000),
    depth_mode: input.depthMode ?? 'professional',
    blueprint: input.blueprint ?? 'standard',
  };

  const res = await request('/api/v1/generate', { method: 'POST', body: JSON.stringify(payload) },
    START_TIMEOUT_MS, input.correlationId);

  if (res.status === 409) {
    throw new ArchitectError('JobConflict', `a job named "${input.projectName}" is already running`, 409);
  }
  if (res.status === 422) {
    const body = await res.text().catch(() => '');
    throw new ArchitectError('ValidationError', `Architect rejected the request: ${body.slice(0, 300)}`, 422);
  }
  if (!res.ok) {
    throw new ArchitectError('UpstreamUnavailable', `Architect returned ${res.status} starting the job`, res.status);
  }

  const body: any = await res.json().catch(() => ({}));
  if (!body?.job_id) {
    throw new ArchitectError('UpstreamUnavailable', 'Architect accepted the job but returned no job_id');
  }

  log('architect_job_started', input.correlationId, 'success', {
    job_id: body.job_id, depth: payload.depth_mode, blueprint: payload.blueprint,
    requirement_chars: payload.requirements.length,
  });
  return { jobId: body.job_id, status: body.status ?? 'started', blueprint: body.blueprint ?? payload.blueprint };
}

export async function getStatus(jobId: string, correlationId?: string): Promise<JobStatus> {
  const res = await request(`/api/v1/generate/${encodeURIComponent(jobId)}/status`, { method: 'GET' },
    STATUS_TIMEOUT_MS, correlationId);

  if (res.status === 404) {
    // The Architect forgets a job it never had, or one cleared by DELETE.
    throw new ArchitectError('GenerationFailed', `Architect has no job "${jobId}"`, 404);
  }
  if (!res.ok) {
    throw new ArchitectError('UpstreamUnavailable', `status returned ${res.status}`, res.status);
  }

  const raw: any = await res.json().catch(() => ({}));
  return { status: (raw?.status ?? 'running') as ArchitectStatus, percent: raw?.percent, phase: raw?.phase, raw };
}

/**
 * Download the assembled markdown. Returns 409 upstream until the job completes,
 * which is treated as "not ready" rather than an error so the poller can decide.
 *
 * A below-threshold document is SERVED with X-Quality-Warning rather than
 * refused. We take it and record the warning: a 6,000-word document that scored
 * slightly low still beats the 1,450-word single-call alternative, and the
 * traceability gate downstream is the real quality bar for what students see.
 */
export async function downloadDocument(jobId: string, correlationId?: string): Promise<GeneratedDocument | null> {
  const res = await request(`/api/v1/generate/${encodeURIComponent(jobId)}/download`, { method: 'GET' },
    DOWNLOAD_TIMEOUT_MS, correlationId);

  if (res.status === 409) return null;               // not finished yet
  if (!res.ok) {
    throw new ArchitectError('UpstreamUnavailable', `download returned ${res.status}`, res.status);
  }

  const markdown = await res.text();
  if (!markdown.trim()) {
    throw new ArchitectError('EmptyDocument', `Architect returned an empty document for "${jobId}"`);
  }

  const warn = res.headers.get('X-Quality-Warning');
  const doc: GeneratedDocument = {
    markdown,
    words: markdown.trim().split(/\s+/).length,
    ...(warn ? {
      qualityWarning: {
        score: res.headers.get('X-Quality-Score') ?? undefined,
        threshold: res.headers.get('X-Quality-Threshold') ?? undefined,
      },
    } : {}),
  };
  log('architect_document_downloaded', correlationId, 'success', {
    job_id: jobId, words: doc.words, chars: markdown.length, quality_warning: Boolean(warn),
  });
  return doc;
}

export interface AwaitOptions {
  correlationId?: string;
  deadlineMs?: number;
  intervalMs?: number;
  /** Progress hook, for surfacing queue position / percent to the student. */
  onProgress?: (status: JobStatus) => void;
  /** Test seam. */
  now?: () => number;
}

/**
 * Poll a running job to its terminal state and return the document.
 *
 * Bounded three ways, because a 15-minute remote job has three distinct ways to
 * never finish: it errors (caught by status), it silently stops progressing
 * (caught by the stall detector), or the whole thing hangs (caught by the
 * deadline). CLAUDE.md forbids an unbounded retry loop; this has no path that
 * does not terminate.
 */
export async function awaitDocument(jobId: string, opts: AwaitOptions = {}): Promise<GeneratedDocument> {
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;

  // A `stalled` status means upstream lost its in-memory events and rebuilt
  // progress from disk. That is recoverable — the pipeline may still be
  // writing chapters — so it is tolerated for a few polls rather than failed
  // instantly, but it cannot be tolerated forever.
  let stalledPolls = 0;
  const MAX_STALLED_POLLS = 8;   // ~2 minutes at the default interval

  while (now() < deadline) {
    const status = await getStatus(jobId, opts.correlationId);
    opts.onProgress?.(status);

    switch (status.status) {
      case 'complete': {
        const doc = await downloadDocument(jobId, opts.correlationId);
        if (doc) return doc;
        break;      // reported complete but not yet served; poll again
      }
      case 'error':
        throw new ArchitectError('GenerationFailed', `Architect job "${jobId}" failed`, undefined);
      case 'quality_failed': {
        // The document exists and is served with a warning header. Take it.
        const doc = await downloadDocument(jobId, opts.correlationId);
        if (doc) {
          log('architect_quality_failed_but_served', opts.correlationId, 'partial', { job_id: jobId, words: doc.words });
          return doc;
        }
        throw new ArchitectError('GenerationFailed', `Architect job "${jobId}" failed quality with no document`);
      }
      case 'stalled':
        stalledPolls += 1;
        if (stalledPolls >= MAX_STALLED_POLLS) {
          throw new ArchitectError('GenerationStalled',
            `Architect job "${jobId}" reported stalled for ${stalledPolls} consecutive polls`);
        }
        break;
      default:
        stalledPolls = 0;   // any healthy poll clears the streak
    }

    await sleep(interval);
  }

  throw new ArchitectError('DeadlineExceeded',
    `Architect job "${jobId}" did not complete within ${Math.round((opts.deadlineMs ?? DEFAULT_DEADLINE_MS) / 60000)} minutes`);
}

/**
 * A job id that cannot collide with another student's.
 *
 * The Architect derives the job id by slugifying project_name, and rejects a
 * duplicate with 409 while one is running. Two students building "Inventory
 * Tracker" in the same class is not a hypothetical — so the project's own uuid
 * prefix is appended. Kept short because the id appears in URLs upstream.
 */
export function jobNameFor(projectName: string | null | undefined, projectId: string): string {
  const clean = (projectName || 'AI System').replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'AI System';
  return `${clean} ${projectId.replace(/-/g, '').slice(0, 8)}`;
}
