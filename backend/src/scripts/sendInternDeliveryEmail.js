#!/usr/bin/env node
// sendInternDeliveryEmail.js
//
// Manual send of the Intern Delivery Command Center email, from a snapshot that
// already exists. For the scheduled version that harvests fresh Basecamp data
// first, see sendInternDeliveryScheduled.js.
//
//   node backend/src/scripts/sendInternDeliveryEmail.js --dry-run --open
//   node backend/src/scripts/sendInternDeliveryEmail.js --to ali@colaberry.com
//
// With no --in, it falls back to the snapshot embedded in the committed
// dashboard HTML, so the email can be re-sent from whatever shipped without
// another Basecamp round trip.
//
// The render/preflight/size/ledger/send machinery lives in
// lib/internDeliveryEmailSend.js and is shared with the cron runner.
//
// Failure modes handled here: missing snapshot (ValidationError), snapshot shape
// drift (ContractViolation). Everything downstream of that (Gmail clip, em-dash,
// missing key, SMTP retry, duplicate send) is handled in the shared module.
//
// Idempotency: keyed on (recipient, snapshot generatedAt), so re-running against
// the same snapshot refuses rather than sending a second copy. The ledger
// defaults to tmp/, which CLAUDE.md defines as always-safe-to-delete; that is
// fine for an operator run, where the guard only has to survive a double
// invocation. The cron runner uses a durable path instead.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (_e) { /* optional */ }

const { deliverInternEmail, buildMessage } = require(path.resolve(__dirname, './lib/internDeliveryEmailSend'));

const REPO = path.resolve(__dirname, '../../..');
const DASHBOARD_HTML = path.join(REPO, 'docs', 'INTERN_DELIVERY_DASHBOARD.html');

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const OPEN = process.argv.includes('--open');
const TO = arg('--to', 'ali@colaberry.com');
const IN = arg('--in', null);
const PREVIEW_OUT = path.resolve(arg('--preview-out', path.join(REPO, 'docs', 'INTERN_DELIVERY_EMAIL_PREVIEW.html')));
const LEDGER = path.resolve(arg('--ledger', path.join(REPO, 'tmp', 'intern-delivery-email-ledger.json')));

function log(m) { console.log(`[intern-email] ${m}`); }
function die(msg, cls) {
  console.error(`[intern-email] FATAL ${cls || 'Error'}: ${msg}`);
  process.exit(1);
}

// The committed dashboard embeds its own snapshot, so it doubles as a source.
function loadSnapshot() {
  if (IN) {
    if (!fs.existsSync(IN)) die(`snapshot not found: ${IN}`, 'ValidationError');
    return { data: JSON.parse(fs.readFileSync(IN, 'utf8')), source: IN };
  }
  if (!fs.existsSync(DASHBOARD_HTML)) {
    die(`no --in given and no dashboard at ${DASHBOARD_HTML}. Run buildInternDeliveryDashboard.js first.`, 'ValidationError');
  }
  const m = fs.readFileSync(DASHBOARD_HTML, 'utf8').match(/<script>window\.DATA=([\s\S]*?);<\/script>/);
  if (!m) die(`could not find the embedded snapshot in ${DASHBOARD_HTML}`, 'ContractViolation');
  return { data: JSON.parse(m[1]), source: `${DASHBOARD_HTML} (embedded)` };
}

(async () => {
  const { data, source } = loadSnapshot();
  log(`snapshot loaded from ${source} (generated ${data.generatedAt})`);

  if (DRY_RUN) {
    const { subject, html, bytes } = buildMessage(data);
    fs.mkdirSync(path.dirname(PREVIEW_OUT), { recursive: true });
    fs.writeFileSync(PREVIEW_OUT, html, 'utf8');
    log(`preflight passed, body is ${(bytes / 1024).toFixed(1)} KB`);
    log(`DRY RUN, nothing sent. Preview written to ${PREVIEW_OUT}`);
    log(`subject: ${subject}`);
    if (OPEN) {
      const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', PREVIEW_OUT]]
        : process.platform === 'darwin' ? ['open', [PREVIEW_OUT]] : ['xdg-open', [PREVIEW_OUT]];
      execFile(opener[0], opener[1], (err) => { if (err) log(`could not auto-open: ${err.message}`); });
    }
    return;
  }

  const result = await deliverInternEmail({
    data,
    to: TO,
    idempotencyKey: data.generatedAt,
    ledgerPath: LEDGER,
    attachmentPath: DASHBOARD_HTML,
    force: FORCE,
    log,
  });

  if (result.skipped) {
    log('Nothing to do. Pass --force to send it again.');
    return;
  }
  log(`sent to ${TO}`);
  log(`subject: ${result.subject}`);
  log(`mandrill id: ${result.mandrillId}`);
  log(`accepted: ${JSON.stringify(result.accepted)}`);
})().catch((e) => {
  console.error(`[intern-email] FATAL ${e.error_class || 'Error'}: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
