// Wrap nodemailer's sendMail with a bounded retry for TRANSIENT transport
// errors (TLS-handshake blips, socket resets, connection timeouts).
//
// Mandrill SMTP occasionally returns `tlsv1 alert internal error` (surfaces as
// an ESOCKET error on the CONN command) - a transient failure that a single
// retry almost always clears. Observed 2026-06-23 on the Interview Prep report,
// where the blip escaped as an unhandled rejection and killed the whole
// reporting run. A bounded retry turns a transient blip into a non-event; a
// persistent failure still throws after the cap so the caller can report it.
//
// Failure-First contract: capped attempts (no infinite retry), fixed-base
// linear backoff, only transient error classes are retried - a real auth or
// content error throws on the first attempt.

const TRANSIENT_CODES = new Set([
  'ESOCKET', 'ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ECONNREFUSED', 'EDNS', 'ETLS', 'EAI_AGAIN',
]);

function isTransient(err) {
  if (!err) return false;
  if (err.code && TRANSIENT_CODES.has(err.code)) return true;
  const msg = String(err.message || '');
  return /\b(tls|socket|timed?\s?out|econn|handshake|alert number)\b/i.test(msg);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// transport: any object with an async sendMail(message) method (nodemailer transport).
// opts: { attempts=3, baseDelayMs=2000, log=()=>{}, sleep=delay }
async function sendMailWithRetry(transport, message, opts = {}) {
  const attempts = opts.attempts || 3;
  const baseDelayMs = opts.baseDelayMs || 2000;
  const log = opts.log || (() => {});
  const sleep = opts.sleep || delay; // injectable for tests
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await transport.sendMail(message);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts && isTransient(err)) {
        const wait = baseDelayMs * attempt;
        log(`sendMail attempt ${attempt}/${attempts} failed (${err.code || err.message}); retrying in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = { sendMailWithRetry, isTransient };
