/**
 * intelHttp — the shared outbound-fetch primitive for intel source adapters.
 *
 * Extracted verbatim (behaviour-for-behaviour) from the proven private
 * fetchWithTimeout in aiNewsIngestionService so every generic adapter shares one
 * failure-first HTTP path: native fetch wrapped in an AbortController hard timeout
 * with capped retries and a stable User-Agent.
 *
 * FAIL-FIRST (CLAUDE.md): every attempt has an explicit timeout (no unbounded
 * hang); retries are capped (no infinite loop); the last error is re-thrown so the
 * caller decides how to degrade (skip the source, keep prior state). Pure of DB —
 * unit-testable with a mocked global fetch.
 */

/** Default User-Agent identifying the Accelerator to upstream feeds. */
export const INTEL_USER_AGENT = 'ColaberryAccelerator/1.0 (+https://enterprise.colaberry.ai)';

export interface FetchWithTimeoutOptions {
  timeoutMs?: number;                 // hard per-attempt timeout (default 20s)
  attempts?: number;                  // capped retry count (default 3)
  userAgent?: string;
  headers?: Record<string, string>;
}

/**
 * Fetch a URL as text with a hard per-attempt timeout and capped retries. Returns
 * the response body on the first 2xx; throws the last error after all attempts are
 * exhausted (never hangs, never loops unbounded). A non-2xx status is treated as a
 * retryable failure (`HTTP <status>`), matching the reference implementation.
 */
export async function fetchWithTimeout(url: string, opts: FetchWithTimeoutOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const attempts = Math.max(1, opts.attempts ?? 3);
  const headers: Record<string, string> = {
    'User-Agent': opts.userAgent ?? INTEL_USER_AGENT,
    ...(opts.headers || {}),
  };
  // any: the caught value is genuinely unknown (fetch AbortError, TypeError,
  // thrown HTTP-status Error) and is only re-thrown, never inspected structurally.
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
