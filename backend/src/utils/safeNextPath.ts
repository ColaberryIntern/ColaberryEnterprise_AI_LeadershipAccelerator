// Post-login redirect target ("next") sanitizer.
//
// The QR check-in flow needs a student's intent to survive the magic-link round
// trip: scan QR -> /portal/login -> emailed link -> /portal/verify -> back to the
// check-in page. That means an attacker-controllable string travels through an
// email we send, so it is sanitized here BEFORE it is embedded in the link and
// again on the frontend before navigation.
//
// Failure modes handled: open redirect (absolute URLs, protocol-relative "//evil",
// backslash variants browsers normalize to "/"), javascript:/data: schemes,
// header/URL injection via control characters, and unbounded length.
// Failure mode NOT handled: an authorized portal page that is itself unsafe to
// land on — every /portal/ route is already behind participant auth.
//
// Deliberately strict: only a /portal/ path, no query string, no fragment. The
// only caller today needs "/portal/class-checkin/<uuid>", and rejecting query
// strings outright removes a whole class of parameter-smuggling bugs. Widen the
// contract (and these tests) if a future flow genuinely needs one.

/** Longest redirect target we will echo back into an email link. */
export const MAX_NEXT_PATH_LENGTH = 256;

/**
 * A safe internal redirect target: "/portal/" followed only by unreserved URL
 * path characters. Anchored at both ends, so any scheme, host, "?", "#", "\",
 * whitespace, or control character fails the match.
 */
const SAFE_PORTAL_PATH = /^\/portal\/[A-Za-z0-9\-._~/]*$/;

/** Highest C0 control code point; DEL sits at 0x7F just above printable ASCII. */
const LAST_C0_CONTROL = 0x1f;
const DEL = 0x7f;

/**
 * True if the string contains a C0 control character or DEL — the CR/LF
 * injection vectors. Written as a code-point scan rather than a regex so the
 * source file stays free of literal control bytes.
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= LAST_C0_CONTROL || code === DEL) return true;
  }
  return false;
}

/**
 * Pure: return `next` if it is a safe same-origin portal path, else null.
 * Callers treat null as "no redirect requested" and fall back to their default
 * landing page — a rejected value is never an error, just ignored.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string') return null;

  // Checked on the RAW input, before trimming. Trimming first would silently
  // strip a trailing CR/LF and accept the remainder, turning a CRLF-injection
  // attempt into a "clean" pass instead of a refusal. Surrounding spaces are
  // still tolerated (ordinary copy/paste noise).
  if (hasControlChar(next)) return null;

  const trimmed = next.trim();
  if (!trimmed || trimmed.length > MAX_NEXT_PATH_LENGTH) return null;

  // "//evil.com" and "/\evil.com" are protocol-relative in browsers despite the
  // leading slash — reject before the charset check so intent is obvious here.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;

  // ".." cannot escape an origin, but it signals a caller doing something odd
  // and has no legitimate use in a generated portal link.
  if (trimmed.includes('..')) return null;

  return SAFE_PORTAL_PATH.test(trimmed) ? trimmed : null;
}
