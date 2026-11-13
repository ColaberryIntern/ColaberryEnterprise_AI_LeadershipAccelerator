#!/usr/bin/env node
/**
 * C124: build the weekly email, the report and ONE_MOVE_PROMPT.md from one snapshot, and send them.
 *
 *   node sendWeekly.js --snapshot s.json --out-dir dir [--to a@x,b@y] [--key "Wed 2026-11-18 08:00 CT"]
 *                      [--ledger file] [--dry-run] [--force]
 *
 * --dry-run writes EMAIL_PREVIEW.html, EMAIL_PREVIEW.txt, OPEN_HOUSE_WEEKLY_REPORT.html and ONE_MOVE_PROMPT.md to
 * --out-dir and sends nothing. Without it, the same files are written and then sent through Mandrill SMTP as Ali.
 *
 * Refuses to send (exit 1, nothing sent) when: the Mandrill preflight fails (dashes, double signature), the body is over
 * Gmail's ~100 KB clip, MANDRILL_API_KEY is missing, or the ledger already holds this key for these recipients.
 * Retries: 3 attempts, 2 s / 4 s backoff; a 5xx from the relay is permanent and not retried.
 * Idempotency: ledger key = recipients + --key (the scheduled occurrence), written only after the relay accepts.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildHtml } = require('./render');
const { buildView } = require('./lib/view');
const { buildPromptMd } = require('./lib/promptMd');
const { renderEmail } = require('./lib/emailRender');
const S = require('./lib/story');
const targets = require('./targets');
const { validateBeforeSend } = require(path.join(__dirname, '..', '..', '..', 'backend', 'src', 'scripts', 'lib', 'mandrillPreflight'));

const GMAIL_CLIP_BYTES = 100 * 1024;
const DEFAULT_TO = 'taiwo@colaberry.com,sohail@colaberry.com,ali@colaberry.com';

function fail(message, errorClass) { const e = new Error(message); e.error_class = errorClass; throw e; }

/** Everything that goes out, built once. Pure apart from reading the ledger file inside buildHtml's default. */
function buildPackage(snap, entries) {
  const view = buildView(snap, targets, entries);
  const email = renderEmail(view);
  validateBeforeSend(email.html, email.text);
  const bytes = Buffer.byteLength(email.html);
  if (bytes > GMAIL_CLIP_BYTES) fail(`email body is ${(bytes / 1024).toFixed(1)} KB, over the Gmail clip`, 'ContractViolation');
  return { view, email, bytes, report: buildHtml(snap, targets, [], entries), prompt: buildPromptMd(view, targets) };
}

function readLedger(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_e) { return {}; } }

async function sendWithRetry(transport, message, log) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await transport.sendMail(message); } catch (e) {
      last = e;
      if (e.responseCode >= 500 && e.responseCode < 600) fail(`Mandrill rejected the message (${e.responseCode}): ${e.message}`, 'UpstreamRejected');
      if (attempt < 3) { log(`send attempt ${attempt} failed (${e.message}); retrying`); await new Promise((r) => setTimeout(r, 2000 * attempt)); }
    }
  }
  return fail(`all 3 send attempts failed: ${last && last.message}`, 'UpstreamUnavailable');
}

async function deliver({ pkg, to, key, ledgerPath, force, log }) {
  const lkey = `${to}|${key}`;
  const ledger = readLedger(ledgerPath);
  if (ledger[lkey] && !force) { log(`already sent ${key} at ${ledger[lkey].sentAt}; nothing to do`); return { skipped: true }; }
  if (!process.env.MANDRILL_API_KEY) fail('MANDRILL_API_KEY is not set', 'AuthError');
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 45000 });
  const info = await sendWithRetry(transport, {
    from: '"Ali Muwwakkil" <ali@colaberry.com>', to, replyTo: 'ali@colaberry.com',
    subject: pkg.email.subject, html: pkg.email.html, text: pkg.email.text,
    attachments: [
      { filename: 'OPEN_HOUSE_WEEKLY_REPORT.html', content: pkg.report, contentType: 'text/html' },
      { filename: 'ONE_MOVE_PROMPT.md', content: pkg.prompt, contentType: 'text/markdown' },
    ],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },   // internal report: no tracking pixel
  }, log);
  if (info.rejected && info.rejected.length) fail(`relay rejected ${info.rejected.join(', ')}`, 'UpstreamRejected');
  ledger[lkey] = { sentAt: new Date().toISOString(), subject: pkg.email.subject, messageId: info.messageId, star: pkg.view.rec.star && pkg.view.rec.star.id };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return { skipped: false, accepted: info.accepted, messageId: info.messageId };
}

async function main(argv) {
  const arg = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const log = (m) => console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'open-house-weekly', event: 'send', msg: m }));
  const snapFile = arg('--snapshot'), outDir = arg('--out-dir');
  if (!snapFile || !outDir) fail('usage: sendWeekly.js --snapshot s.json --out-dir dir [--to ...] [--key ...] [--dry-run]', 'ValidationError');
  const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  const pkg = buildPackage(snap, S.load());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'EMAIL_PREVIEW.html'), pkg.email.html);
  fs.writeFileSync(path.join(outDir, 'EMAIL_PREVIEW.txt'), pkg.email.text);
  fs.writeFileSync(path.join(outDir, 'OPEN_HOUSE_WEEKLY_REPORT.html'), pkg.report);
  fs.writeFileSync(path.join(outDir, 'ONE_MOVE_PROMPT.md'), pkg.prompt);
  log(`built: subject "${pkg.email.subject}", body ${(pkg.bytes / 1024).toFixed(1)} KB, star ${pkg.view.rec.star ? pkg.view.rec.star.id : 'none'}`);
  if (argv.includes('--dry-run')) { log(`DRY RUN, nothing sent; files in ${outDir}`); return; }
  const r = await deliver({ pkg, to: arg('--to', DEFAULT_TO), key: arg('--key', snap.generated_ct),
    ledgerPath: arg('--ledger', path.join(outDir, 'sent-ledger.json')), force: argv.includes('--force'), log });
  if (!r.skipped) log(`sent to ${r.accepted.join(', ')} (${r.messageId})`);
}

if (require.main === module) {
  main(process.argv).catch((e) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', service: 'open-house-weekly', event: 'send_failed', error_class: e.error_class || 'Error', msg: e.message }));
    process.exit(1);
  });
}

module.exports = { buildPackage, deliver, DEFAULT_TO, GMAIL_CLIP_BYTES };
