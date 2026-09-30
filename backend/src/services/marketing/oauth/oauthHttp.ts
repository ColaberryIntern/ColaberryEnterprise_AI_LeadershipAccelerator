import type { OAuthHttp } from './connectorTypes';

/**
 * The production transport for every sign-in call: `fetch` with a hard timeout.
 *
 * Failure handling, in writing (CLAUDE.md, Failure-First Design):
 *   - Timeout: 20 s, then the request is aborted and the caller sees an AbortError. A sign-in is
 *     a person waiting on a spinner; twenty seconds is already long.
 *   - Retry: none. Authorization codes are single-use - retrying an exchange whose first attempt
 *     actually reached the provider burns the code and turns a slow success into a refusal. The
 *     recovery is the operator pressing Connect again, which the error page tells them to do.
 *   - Non-JSON bodies are wrapped rather than thrown, so a provider's HTML error page becomes a
 *     readable ExchangeFailed instead of a JSON parse crash with no context.
 *   - The URL is never logged here or by callers (see OAuthHttp).
 */
export const OAUTH_TIMEOUT_MS = 20_000;

export const fetchOAuthHttp: OAuthHttp = async ({ method, url, headers, body }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OAUTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    const raw = await res.text();
    let parsed: unknown;
    try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { message: raw.slice(0, 300) }; }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
};
