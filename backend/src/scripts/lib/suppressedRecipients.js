// Single source of truth for addresses that must never receive outbound mail
// from this repo.
//
// Why this exists: alimuwwakkil@gmail.com was added as a CC/BCC on ~15
// cron-driven reports plus ~100 one-off scripts back when Ali's colaberry.com
// mail was being filtered and he needed a phone-reachable mailbox. That
// workaround is retired (2026-09-01) and the mailbox had accumulated 4,538
// unread messages. Rather than trust that nobody re-adds the address, every
// recipient list is scrubbed through here.
//
// Use:
//   const { scrubRecipients, assertNoSuppressed } = require('./lib/suppressedRecipients');
//   const mail = scrubRecipients({ to, cc, bcc, subject, html });
//   await transport.sendMail(mail);
//
// scrubRecipients() is the safe default (drops silently, returns the same
// shape). assertNoSuppressed() is for tests and for send paths that would
// rather fail loudly than quietly change who gets the mail.

const SUPPRESSED = new Set([
  'alimuwwakkil@gmail.com',
]);

function normalize(addr) {
  if (typeof addr !== 'string') return '';
  // Handles both "foo@bar.com" and "Name <foo@bar.com>".
  const angle = addr.match(/<([^>]+)>/);
  return (angle ? angle[1] : addr).trim().toLowerCase();
}

function isSuppressed(addr) {
  return SUPPRESSED.has(normalize(addr));
}

/**
 * Strip suppressed addresses from a nodemailer recipient field.
 * Preserves the input shape: string in => string (or undefined) out,
 * array in => array out. A comma-joined string is split and rejoined.
 */
function stripSuppressed(field) {
  if (field == null) return field;

  if (Array.isArray(field)) {
    return field.filter(a => !isSuppressed(a));
  }

  if (typeof field === 'string') {
    const parts = field.split(',').map(s => s.trim()).filter(Boolean);
    const kept = parts.filter(a => !isSuppressed(a));
    if (kept.length === 0) return undefined;
    return kept.join(', ');
  }

  return field;
}

/**
 * Return a copy of a nodemailer mail options object with every suppressed
 * address removed from to/cc/bcc. Empty cc/bcc fields are deleted rather
 * than left as [] so nodemailer does not emit an empty header.
 */
function scrubRecipients(mailOptions = {}) {
  const out = { ...mailOptions };
  for (const field of ['to', 'cc', 'bcc']) {
    if (!(field in out)) continue;
    const scrubbed = stripSuppressed(out[field]);
    if (scrubbed == null || (Array.isArray(scrubbed) && scrubbed.length === 0)) {
      delete out[field];
    } else {
      out[field] = scrubbed;
    }
  }
  return out;
}

/**
 * Throw if any suppressed address appears in to/cc/bcc. Used by tests and by
 * send paths that must not silently reroute mail.
 */
function assertNoSuppressed(mailOptions = {}) {
  const offenders = [];
  for (const field of ['to', 'cc', 'bcc']) {
    const value = mailOptions[field];
    if (value == null) continue;
    const list = Array.isArray(value) ? value : String(value).split(',');
    for (const addr of list) {
      if (isSuppressed(addr)) offenders.push(`${field}: ${String(addr).trim()}`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      'Suppressed recipient in outbound mail:\n  - ' + offenders.join('\n  - ') +
      '\nThis address is on the do-not-send list in backend/src/scripts/lib/suppressedRecipients.js. ' +
      'Remove it from the recipient list, or remove it from SUPPRESSED if the suppression is genuinely over.'
    );
  }
}

module.exports = {
  SUPPRESSED,
  isSuppressed,
  stripSuppressed,
  scrubRecipients,
  assertNoSuppressed,
};
