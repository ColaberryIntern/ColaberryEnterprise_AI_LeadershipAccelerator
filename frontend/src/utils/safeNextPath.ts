// Post-login redirect target ("next") sanitizer — client-side mirror of
// backend/src/utils/safeNextPath.ts. Kept as a duplicate rather than a shared
// module because the backend and CRA builds do not share a tsconfig; the two
// implementations MUST be changed together (both have unit tests).
//
// Why it exists: the QR check-in flow carries the student's intent through a
// magic-link email round trip (scan QR -> login -> emailed link -> verify ->
// back to check-in). The value arrives from the URL query string, so it is
// attacker-controllable and is validated again here before we navigate.

/** Longest redirect target we will act on. */
export const MAX_NEXT_PATH_LENGTH = 256;

/**
 * "/portal/" plus unreserved URL path characters only, anchored at both ends —
 * any scheme, host, "?", "#", "\", whitespace or control character fails.
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
 * Null means "no redirect requested" — callers fall back to their default
 * landing page rather than surfacing an error.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string') return null;

  // Checked before trimming: trimming first would strip a trailing CR/LF and
  // accept the remainder, normalizing an injection attempt into a clean pass.
  if (hasControlChar(next)) return null;

  const trimmed = next.trim();
  if (!trimmed || trimmed.length > MAX_NEXT_PATH_LENGTH) return null;

  // Protocol-relative in browsers despite the leading slash.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
  if (trimmed.includes('..')) return null;

  return SAFE_PORTAL_PATH.test(trimmed) ? trimmed : null;
}
