/**
 * auditRedaction — strip secret-shaped values out of an audited request body.
 *
 * WHY THIS EXISTS, measured rather than theorised. `auditMiddleware` copied
 * `req.body` verbatim into `audit_logs.new_values`. The admin login route is a
 * POST, its body is `{ email, password }`, and so production accumulated **639
 * rows holding plaintext passwords across 13 staff accounts**, the oldest from
 * 2026-03-08 and the newest written the morning this was found. The same path
 * had also captured `currentPassword` and `newPassword` from the password
 * change flow, plus `ghl_api_key`, `sms_api_key`, `synthflow_api_key` and
 * `smtp_pass`. CLAUDE.md's rule is "no secrets in logs"; this is the enforcement.
 *
 * THE DESIGN PROBLEM IS PRECISION, NOT DETECTION. A blunt /key|token|pass/
 * would also redact field names the audit trail genuinely needs, all of which
 * were observed in the same production table: `keywords`, `content_key`,
 * `step_key`, `stepKey`, `surfaceKey`, `metricKeys`, `idempotency_key`,
 * `section_variable_keys`, `associated_variable_keys`, `creates_variable_keys`
 * and `ai_max_tokens` — that last one contains "token" and is a model
 * parameter. Over-redaction is not a safe default here: it would quietly
 * destroy the audit value of thousands of legitimate rows while looking
 * responsible. So the match is deliberately narrow, and both halves are
 * pinned by tests: every known secret name redacts, every known innocent name
 * survives.
 *
 * Names are normalised to lowercase alphanumerics before matching, so
 * `smtp_pass`, `smtpPass` and `SMTP-PASS` are one case rather than three.
 */

/** Marker written in place of a secret. Searchable, and obviously not a value. */
export const REDACTED = '[redacted]';

/** Deepest nesting walked. Bodies are request payloads, not documents. */
const MAX_DEPTH = 6;

/**
 * Substrings that make a normalised key a secret wherever they appear.
 * `apikey` is the load-bearing one: it matches `ghl_api_key` and friends
 * WITHOUT matching `idempotency_key` or `content_key`.
 */
const SECRET_SUBSTRINGS = [
  'password', 'passwd', 'secret', 'credential', 'apikey',
  'privatekey', 'signingkey', 'encryptionkey', 'authorization',
  'accesstoken', 'refreshtoken', 'idtoken', 'authtoken',
  'bearertoken', 'sessiontoken', 'portaltoken', 'logintoken',
  'resettoken', 'verificationtoken', 'magictoken',
];

/**
 * Exact names that are secrets on their own. `key` and `token` are here rather
 * than in the substring list precisely so `ai_max_tokens` and `content_key`
 * survive: a bare `key` is the Mandrill-style credential field, `aimaxtokens`
 * is not a bare `token`.
 */
const SECRET_EXACT = new Set(['key', 'token', 'secret', 'auth', 'jwt', 'otp']);

/** Trailing `...pass`, which is how `smtp_pass` and `db_pass` are spelled. */
const SECRET_SUFFIXES = ['pass'];

function normalise(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Whether a field name names a secret. Exported so the tests can pin the list. */
export function isSecretKey(key: string): boolean {
  const k = normalise(key);
  if (!k) return false;
  if (SECRET_EXACT.has(k)) return true;
  if (SECRET_SUBSTRINGS.some((s) => k.includes(s))) return true;
  return SECRET_SUFFIXES.some((s) => k.endsWith(s));
}

/**
 * Return a copy of `value` with every secret-shaped field replaced by
 * {@link REDACTED}. Arrays and nested objects are walked; everything else is
 * returned as-is.
 *
 * Never throws. This runs on the response-finish path of every admin write, so
 * a malformed body must cost an audit row's detail, never the request.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return REDACTED;

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // The key decides, not the value: a redacted password stays redacted even
    // when it arrives as a number, an array or null.
    out[key] = isSecretKey(key) ? REDACTED : redactSecrets(val, depth + 1);
  }
  return out;
}
