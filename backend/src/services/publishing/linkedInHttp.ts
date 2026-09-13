import type { LinkedInHttp, LinkedInHttpResponse } from './linkedInAdapter';

/**
 * The real HTTP transport for the LinkedIn adapter, kept in its own file so the adapter itself
 * stays network-free and fully testable.
 *
 * EVERY OUTBOUND CALL HAS AN EXPLICIT TIMEOUT. `CLAUDE.md`'s Failure-First rules require it and
 * the reason is specific here: the publishing worker claims a job before calling an adapter, so
 * a hung request holds that claim until the process restarts. One socket waiting on LinkedIn
 * forever is one post that never publishes and never dead-letters, which is the worst of both.
 * 20 s is well past LinkedIn's normal response and well short of the worker's tick.
 *
 * A timeout throws, and the adapter's caller treats a thrown non-`ProviderPublishError` as
 * TRANSIENT, which is right: a timed-out publish may or may not have landed, and the worker's
 * reconciliation (unique `(provider, external_id)`) is what stops a retry from duplicating it.
 */

export const LINKEDIN_TIMEOUT_MS = 20_000;

export class LinkedInTransportError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LinkedInTransportError';
  }
}

export function makeLinkedInHttp(timeoutMs: number = LINKEDIN_TIMEOUT_MS): LinkedInHttp {
  return async ({ method, url, headers, body }): Promise<LinkedInHttpResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      // Headers are read into a plain object because the adapter needs `x-restli-id`, and a
      // `Headers` instance does not survive the structural typing the adapter is tested against.
      const flat: Record<string, string> = {};
      res.headers.forEach((value, key) => { flat[key] = value; });

      // LinkedIn returns JSON on success and on error, but an infrastructure failure (a gateway
      // page, an empty 502) is not JSON. Falling back to text keeps the status - the thing the
      // adapter classifies on - rather than throwing away a perfectly good 503 on a parse error.
      const raw = await res.text();
      let parsed: unknown = raw;
      if (raw !== '') {
        try { parsed = JSON.parse(raw); } catch { parsed = { message: raw.slice(0, 500) }; }
      }

      return { status: res.status, headers: flat, body: parsed };
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new LinkedInTransportError(`LinkedIn did not respond within ${timeoutMs} ms.`, err);
      }
      throw new LinkedInTransportError('The request to LinkedIn failed before a response arrived.', err);
    } finally {
      clearTimeout(timer);
    }
  };
}
