/**
 * platformBuild/dispatch - ask GitHub to start the build workflow for one run. I/O.
 *
 * One POST to `/repos/{repo}/actions/workflows/{file}/dispatches` with the run id as the only
 * input. The run id is not a secret (the repo is public, so inputs are too): it only names which
 * run the job should claim, and the job proves who it is with GitHub OIDC, never with the id.
 *
 * ## Failure posture
 *
 * - Timeout: 15 s per attempt.
 * - Retry: network errors, 429 and 5xx, at most 3 attempts, backoff 1 s then 3 s.
 * - Never retried: other 4xx (bad token, missing workflow). Retrying cannot fix them.
 * - Returns a verdict, never throws: the caller records a failed run with the error class, and the
 *   next publish of the project queues a new run (up to the attempt cap in queue.ts).
 */

export interface DispatchConfig {
  repo: string;
  workflowFile: string;
  token: string;
  apiUrl?: string;
}

export interface DispatchVerdict {
  ok: boolean;
  status: number | null;
  attempts: number;
  errorClass: string | null;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>;

const TIMEOUT_MS = 15_000;
const BACKOFF_MS = [1000, 3000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classify(status: number | null, err: unknown): string {
  if (err && (err as Error).name === 'AbortError') return 'TimeoutError';
  if (err) return 'UpstreamUnavailable';
  if (status === 401 || status === 403) return 'AuthError';
  if (status === 404 || status === 422) return 'ContractViolation';
  if (status === 429) return 'RateLimitError';
  return 'UpstreamUnavailable';
}

export async function dispatchRun(
  runId: string,
  cfg: DispatchConfig,
  opts: { fetchImpl?: FetchLike; sleepImpl?: (ms: number) => Promise<void> } = {},
): Promise<DispatchVerdict> {
  if (!cfg.token) return { ok: false, status: null, attempts: 0, errorClass: 'AuthError' };
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const wait = opts.sleepImpl ?? sleep;
  const url = `${cfg.apiUrl || 'https://api.github.com'}/repos/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflowFile)}/dispatches`;
  let lastStatus: number | null = null;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= BACKOFF_MS.length + 1; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    lastErr = null;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: { run_id: runId } }),
        signal: ctrl.signal,
      });
      lastStatus = res.status;
      if (res.status === 204 || res.status === 200) return { ok: true, status: res.status, attempts: attempt, errorClass: null };
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) return { ok: false, status: res.status, attempts: attempt, errorClass: classify(res.status, null) };
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt <= BACKOFF_MS.length) await wait(BACKOFF_MS[attempt - 1]);
  }
  return { ok: false, status: lastStatus, attempts: BACKOFF_MS.length + 1, errorClass: classify(lastStatus, lastErr) };
}
