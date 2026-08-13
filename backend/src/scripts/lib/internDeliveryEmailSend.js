// internDeliveryEmailSend.js
//
// The single send path for the Intern Delivery Command Center email, shared by
// the manual CLI (sendInternDeliveryEmail.js) and the cron runner
// (sendInternDeliveryScheduled.js). Two send paths would drift, and the one that
// drifts is always the one nobody watches.
//
// Everything that can refuse to send lives here: preflight, the Gmail size gate,
// and the idempotency ledger. The caller supplies the idempotency key because
// the two callers key on different things:
//   manual CLI -> the snapshot's generatedAt (re-running the same snapshot is a
//                 duplicate)
//   cron       -> the scheduled occurrence (each run harvests fresh data, so
//                 generatedAt always differs and would never dedupe; what must
//                 not double-fire is the Monday 08:45 slot)

const fs = require('fs');
const path = require('path');

const { renderInternDeliveryEmail } = require('./renderInternDeliveryEmail');
const { validateBeforeSend } = require('./mandrillPreflight');

const GMAIL_CLIP_BYTES = 100 * 1024;
const SEND_ATTEMPTS = 3;

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
<div style="margin-top: 14px;">
<a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
</div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

function fail(message, errorClass) {
  const e = new Error(message);
  e.error_class = errorClass || 'Error';
  throw e;
}

function assertSnapshotShape(data) {
  for (const key of ['generatedAt', 'portfolio', 'people', 'projects', 'decisionQueue', 'meta', 'lookbackDays']) {
    if (data[key] == null) fail(`snapshot is missing required key "${key}"`, 'ContractViolation');
  }
  if (!Array.isArray(data.projects) || !data.projects.length) fail('snapshot contains no projects', 'ContractViolation');
}

// The signature goes inside the 600px column so its font matches the body.
function spliceSignature(bodyHtml) {
  const html = bodyHtml.replace(
    /(\s*)<\/table>\s*<\/td><\/tr>\s*<\/table>\s*<\/body>/,
    `$1<tr><td style="padding:0 16px 8px 16px">${SIG_HTML}</td></tr></table></td></tr></table></body>`,
  );
  if (html === bodyHtml) fail('could not splice the signature into the email shell (layout drifted)', 'ContractViolation');
  return html;
}

function buildMessage(data) {
  assertSnapshotShape(data);
  const { subject, html: bodyHtml, text: bodyText } = renderInternDeliveryEmail(data);
  const html = spliceSignature(bodyHtml);
  const text = `${bodyText}\n\n${SIG_TEXT}`;

  validateBeforeSend(html, text);

  const bytes = Buffer.byteLength(html);
  if (bytes > GMAIL_CLIP_BYTES) {
    fail(`body is ${(bytes / 1024).toFixed(1)} KB, over the ${GMAIL_CLIP_BYTES / 1024} KB Gmail clipping threshold. Lower the caps in renderInternDeliveryEmail.js.`, 'ContractViolation');
  }

  return { subject, html, text, bytes };
}

function readLedger(ledgerPath) {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch (_e) { return {}; }
}

function writeLedger(ledgerPath, ledger) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendWithRetry(transport, message, log) {
  let lastErr;
  for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
    try {
      return await transport.sendMail(message);
    } catch (e) {
      lastErr = e;
      // A 5xx from the relay is a permanent rejection; retrying just repeats it.
      if (e.responseCode && e.responseCode >= 500 && e.responseCode < 600) {
        fail(`Mandrill permanently rejected the message (${e.responseCode}): ${e.message}`, 'UpstreamRejected');
      }
      if (attempt < SEND_ATTEMPTS) {
        const backoff = 2000 * attempt;
        log(`send attempt ${attempt} failed (${e.message}); retrying in ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }
  fail(`all ${SEND_ATTEMPTS} send attempts failed. Last error: ${lastErr && lastErr.message}`, 'UpstreamUnavailable');
}

/**
 * Render and send the briefing.
 *
 * @param {object}   opts
 * @param {object}   opts.data            the snapshot
 * @param {string}   opts.to              recipient
 * @param {string}   opts.idempotencyKey  what must not be sent twice
 * @param {string}   opts.ledgerPath      where the sent-record lives
 * @param {string?}  opts.attachmentPath  dashboard HTML to attach, if present
 * @param {boolean?} opts.force           send even if the ledger has this key
 * @param {function?} opts.log
 * @returns {Promise<{skipped:boolean, subject:string, bytes:number, mandrillId?:string}>}
 */
async function deliverInternEmail(opts) {
  const { data, to, idempotencyKey, ledgerPath, attachmentPath, force = false } = opts;
  const log = opts.log || (() => {});

  const { subject, html, text, bytes } = buildMessage(data);
  log(`preflight passed, body is ${(bytes / 1024).toFixed(1)} KB`);

  const key = `${to}|${idempotencyKey}`;
  const ledger = readLedger(ledgerPath);
  if (ledger[key] && !force) {
    log(`already sent "${idempotencyKey}" to ${to} at ${ledger[key].sentAt} (mandrill ${ledger[key].mandrillId}); nothing to do`);
    return { skipped: true, subject, bytes };
  }

  const apiKey = process.env.MANDRILL_API_KEY;
  if (!apiKey) {
    fail('MANDRILL_API_KEY is not set. Pull it with: ssh root@95.216.199.47 "docker exec accelerator-backend printenv MANDRILL_API_KEY"', 'AuthError');
  }

  const attachments = [];
  if (attachmentPath && fs.existsSync(attachmentPath)) {
    attachments.push({
      filename: `INTERN_DELIVERY_DASHBOARD_${String(data.generatedAt).slice(0, 10)}.html`,
      content: fs.readFileSync(attachmentPath),
      contentType: 'text/html',
    });
    log(`attaching the interactive dashboard (${(fs.statSync(attachmentPath).size / 1024).toFixed(0)} KB)`);
  } else if (attachmentPath) {
    log(`no dashboard at ${attachmentPath}; sending without the attachment`);
  }

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: apiKey },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 45000,
  });

  const info = await sendWithRetry(transport, {
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to,
    replyTo: 'ali@colaberry.com',
    subject,
    html,
    text,
    attachments,
    // Internal briefing, so no tracking pixel.
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  }, log);

  const mandrillId = (info.messageId || '').replace(/[<>]/g, '');
  ledger[key] = { sentAt: new Date().toISOString(), to, subject, mandrillId, idempotencyKey, generatedAt: data.generatedAt };
  writeLedger(ledgerPath, ledger);

  if (info.rejected && info.rejected.length) {
    fail(`relay rejected ${info.rejected.join(', ')}`, 'UpstreamRejected');
  }

  return { skipped: false, subject, bytes, mandrillId, accepted: info.accepted };
}

module.exports = {
  deliverInternEmail, buildMessage, assertSnapshotShape,
  SIG_HTML, SIG_TEXT, GMAIL_CLIP_BYTES,
};
