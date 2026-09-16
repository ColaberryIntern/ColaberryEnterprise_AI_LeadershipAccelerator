/**
 * secretRedaction — strip secret material from anything on its way to a log, an error, or an
 * API response.
 *
 * WHY A HELPER AND NOT CARE AT EACH CALL SITE. The spec's credential requirements end with
 * "no token in browser logs, URLs, telemetry, error messages, or screenshots", and every one
 * of those leaks happens the same way: an object is logged whole, at a moment nobody was
 * thinking about tokens, often inside an error path written in a hurry. A rule applied by
 * hand at forty call sites is a rule that fails at the forty-first. This runs over the whole
 * object instead.
 *
 * TWO INDEPENDENT PASSES, because either alone is insufficient:
 *   1. BY KEY. Any property whose name looks credential-shaped is masked regardless of its
 *      value. Catches a token that happens to look ordinary.
 *   2. BY VALUE. Any string that looks like a bearer token, a long opaque key, or a sealed
 *      record's ciphertext is masked regardless of where it sits. Catches a token that
 *      arrived under an innocent name like `detail` or `body`, which is exactly how provider
 *      error payloads carry them back.
 *
 * Masking is `<redacted>` rather than removal: a reader needs to see that a field WAS there,
 * otherwise a redacted log and a log with a missing field are indistinguishable, and the
 * second one is a bug.
 */

const SECRET_KEY_PATTERN = /(token|secret|password|passwd|credential|api[_-]?key|authorization|auth|client[_-]?secret|refresh|bearer|private[_-]?key|ciphertext|wrapped[_-]?data[_-]?key|auth[_-]?tag)/i;

/**
 * Keys that MATCH the pattern above but are safe and useful to keep. Without this list the
 * redactor would mask `token_expires_at` and `key_id`, and an operator debugging an expiry
 * problem would be left with `<redacted>` where the timestamp should be.
 */
const SAFE_KEYS = new Set([
  'token_expires_at',
  'token_expires_in',
  'tokenexpiresat',
  'key_id',
  'keyid',
  'encrypted_at',
  'encryptedat',
  'has_token',
  'token_status',
  'auth_type',
  'credential_status',
  'needs_reconnect',
  'scopes',
  'granted_scopes',
  'missing_scopes',
]);

/**
 * Bearer prefixes and provider token shapes.
 *
 * THIS LIST IS NOT EXHAUSTIVE AND CANNOT BE. Opaque tokens from TikTok, X and others are
 * indistinguishable from ordinary identifiers by shape alone, and a pattern loose enough to
 * catch them would mask legitimate ids and make logs useless. The by-KEY pass is the general
 * defence; these patterns are the second net, for the specific case of a provider echoing its
 * own token back inside an error body under an innocent field name.
 *
 * Every entry below is covered by a case in `secretRedaction.test.ts`. Do not add a provider
 * to this comment without adding both a pattern and a test, which is exactly the drift the
 * T003 verification caught: the comment used to claim LinkedIn `AQV` coverage that did not
 * exist.
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bEAA[A-Za-z0-9]{20,}/,                 // Meta
  /\bya29\.[A-Za-z0-9._-]{20,}/,           // Google
  /\bAQV[A-Za-z0-9_-]{20,}/,               // LinkedIn
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,          // GitHub
  /\beyJ[A-Za-z0-9._-]{20,}/,              // any JWT
];

const MASK = '<redacted>';

function maskString(value: string): string {
  let out = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), MASK);
  }
  return out;
}

/**
 * Returns a deep copy with secret material masked. The input is never mutated: callers pass
 * live model rows and request bodies, and a redactor that edited them in place would corrupt
 * the very thing the caller was about to use.
 *
 * Cycles are handled (a Sequelize instance with eager-loaded associations is cyclic), and the
 * recursion is depth-capped so a pathological object cannot hang a log call.
 */
export function redactSecrets<T>(input: T, maxDepth = 8): T {
  return walk(input, maxDepth, new WeakSet()) as T;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth < 0) return '<max-depth>';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return maskString(value);
  if (typeof value !== 'object') return value;

  if (seen.has(value as object)) return '<circular>';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => walk(v, depth - 1, seen));
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return MASK;

  // A Sequelize instance carries its columns on `dataValues`; walking the instance itself
  // would miss them (see the repo's "spreading a Sequelize instance loses every column" rule).
  const source = (value as any).dataValues && typeof (value as any).dataValues === 'object'
    ? (value as any).dataValues
    : value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(source as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (SECRET_KEY_PATTERN.test(key) && !SAFE_KEYS.has(normalized)) {
      out[key] = MASK;
      continue;
    }
    out[key] = walk(v, depth - 1, seen);
  }
  return out;
}

/** Convenience for log lines: redact, then stringify. */
export function redactedJson(input: unknown): string {
  return JSON.stringify(redactSecrets(input));
}
