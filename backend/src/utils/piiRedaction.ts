/**
 * PII redaction utilities (TBI audit P0-3).
 *
 * Two distinct jobs — do not confuse them:
 *
 *  - redactSensitive(text): strip HIGH-sensitivity identifiers (SSN, payment-card numbers)
 *    that must NEVER be sent to a third-party LLM / voice provider. Names, emails, and phone
 *    numbers are intentionally NOT stripped here — they are legitimate personalization inputs
 *    for outreach. Use this on prompts/payloads before they leave our systems.
 *
 *  - redactForLogs(text): mask common PII (email, phone) so it isn't written to logs/telemetry
 *    in the clear. Use this when emitting log lines or persisting context that may contain PII.
 *
 * These are deliberately conservative (low false-positive) regexes. They are a safety net, not
 * a substitute for not collecting sensitive data in the first place.
 */

const EMAIL_RE = /([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// US-style phone: optional +1, 3-3-4 with common separators. Conservative to avoid masking IDs.
const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
// 13-16 digit card-like sequences allowing single spaces/dashes BETWEEN digits only
// (starts and ends on a digit, so a trailing separator is never consumed).
const CC_RE = /\b\d(?:[ -]?\d){12,15}\b/g;

/** Mask an email as first-char + *** + domain, e.g. "a***@example.com". */
export function maskEmail(email: string): string {
  return email.replace(EMAIL_RE, (_m, first: string, _rest: string, domain: string) => `${first}***${domain}`);
}

/** Mask a string for safe logging: emails and phone numbers are partially masked. */
export function redactForLogs(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, (_m, first: string, _rest: string, domain: string) => `${first}***${domain}`)
    .replace(PHONE_RE, (m: string) => `***-***-${m.replace(/\D/g, '').slice(-4)}`);
}

/**
 * Strip high-sensitivity identifiers (SSN, payment cards) before sending text to a third-party
 * LLM or voice provider. Returns the text with those patterns replaced by tokens.
 */
export function redactSensitive(text: string): string {
  if (!text) return text;
  return text
    .replace(SSN_RE, '[REDACTED-SSN]')
    .replace(CC_RE, (m: string) => {
      // Only redact if it has 13-16 digits (CC_RE can match digit-runs with separators).
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 16 ? '[REDACTED-CARD]' : m;
    });
}

/** Shallow-redact string values of a flat object for logging. */
export function redactObjectForLogs<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? redactForLogs(v) : v;
  }
  return out;
}
