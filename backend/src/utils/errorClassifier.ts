/**
 * Shared error classifier — BC #10099862873 (P1, item 2).
 *
 * Root CLAUDE.md's Observability Framework requires a stable `error_class`
 * string on every caught exception ("generic Error is not an acceptable
 * classification in production code paths"). No such helper existed
 * anywhere in the repo before this — every call site either tagged nothing
 * or fell back to the literal string 'Error' (e.g. `err?.name || 'Error'`
 * in openaiInstrumented.ts/synthflowService.ts), which is itself a
 * violation of the rule it was trying to satisfy.
 *
 * Pure, dependency-free classification from common shapes (JWT library
 * error names, HTTP status codes, network/timeout markers, Zod validation
 * errors) into the canonical bucket list from CLAUDE.md: TimeoutError,
 * RateLimitError, AuthError, ValidationError, UpstreamUnavailable,
 * ContractViolation. Unrecognized shapes fall back to the error's own
 * `name` (still better than nothing) or 'UnknownError' — never the bare
 * string 'Error'.
 */

export type ErrorClass =
  | 'TimeoutError'
  | 'RateLimitError'
  | 'AuthError'
  | 'ValidationError'
  | 'UpstreamUnavailable'
  | 'ContractViolation'
  | 'UnknownError'
  | string;

export function classifyError(err: unknown): ErrorClass {
  if (err == null) return 'UnknownError';

  const e = err as { name?: string; message?: string; code?: string; status?: number; statusCode?: number };
  const name = e.name || '';
  const message = (e.message || '').toLowerCase();
  const status = e.status ?? e.statusCode;

  // JWT-specific (jsonwebtoken library error names)
  if (name === 'TokenExpiredError' || name === 'JsonWebTokenError' || name === 'NotBeforeError') {
    return 'AuthError';
  }

  // Zod validation errors
  if (name === 'ZodError') return 'ValidationError';

  // Structured system error codes / names — reliable, not prone to the
  // false-positive risk of matching arbitrary substrings in a message.
  if (name === 'AbortError' || e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') return 'TimeoutError';
  if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ECONNRESET') return 'UpstreamUnavailable';

  // HTTP status code buckets — evaluated before any message-substring
  // matching below, so a reliable numeric status (e.g. 401) is never
  // overridden by unrelated wording in the message (e.g. "network" or
  // "timeout" appearing in a 401 response body's text).
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return 'AuthError';
    if (status === 429) return 'RateLimitError';
    if (status === 400 || status === 422) return 'ValidationError';
    if (status >= 500) return 'UpstreamUnavailable';
  }

  // Message-substring fallback — least reliable signal, only consulted once
  // name/code/status have all failed to classify.
  if (message.includes('timeout') || message.includes('timed out')) return 'TimeoutError';
  if (message.includes('econnrefused') || message.includes('fetch failed') || message.includes('network')) return 'UpstreamUnavailable';
  if (message.includes('rate limit') || message.includes('too many requests')) return 'RateLimitError';
  if (message.includes('unauthorized') || message.includes('invalid token') || message.includes('invalid credentials')) return 'AuthError';

  return name || 'UnknownError';
}
