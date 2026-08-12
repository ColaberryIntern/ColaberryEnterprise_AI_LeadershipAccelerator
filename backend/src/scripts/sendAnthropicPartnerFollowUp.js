#!/usr/bin/env node
// sendAnthropicPartnerFollowUp.js
//
// One short, warm follow-up note to the Claude Partner Network team each
// weekday morning, until they reply. Continues the status check Ali sent on
// 2026-08-05 about the Learning Path completion submitted 2026-06-24.
//
//   To:  partner-support@anthropic.com
//   Cc:  ram@colaberry.com
//   Bcc: ali@colaberry.com
//
// STOPS ITSELF ON ANY OF:
//   - a human reply from anthropic.com (checked before every send)
//   - the 15 note sequence running out (three weeks of weekdays)
//   - an operator running --stop
// The first and third are terminal and survive --force. Only --reset restarts.
//
// WHY THE SCHEDULE LIVES HERE AND NOT IN CRON
// The VPS runs UTC and nothing in its crontab sets CRON_TZ. Setting it would
// re-time every later line in vixie cron. So cron fires at both UTC hours that
// could be 08:30 Central and this script reads the Central wall clock and
// decides. Same house pattern as sendInternDeliveryScheduled.js.
//
//   30 13,14 * * 1-5  ->  08:30 CT in both CDT and CST
//
// Usage:
//   node backend/src/scripts/sendAnthropicPartnerFollowUp.js
//   node backend/src/scripts/sendAnthropicPartnerFollowUp.js --dry-run
//   node backend/src/scripts/sendAnthropicPartnerFollowUp.js --preview 1
//   node backend/src/scripts/sendAnthropicPartnerFollowUp.js --status
//   node backend/src/scripts/sendAnthropicPartnerFollowUp.js --stop
//   node backend/src/scripts/sendAnthropicPartnerFollowUp.js --force        # ignore window/weekday, NOT the halts
//   node backend/src/scripts/sendAnthropicPartnerFollowUp.js --retry-claim  # clear an ambiguous claim after checking Sent
//
// Failure modes handled: unknown ledger state (abort, alert, never send);
// unverifiable inbox (skip the day, alert); Mandrill transient blip (3 attempts
// via sendMailWithRetry); crash between claim and send (day stays blocked);
// duplicate cron tick (ledger refuses); weekend tick (quiet exit 0).
// Not handled: a reply sent only to Ram and never forwarded. See
// anthropicReplyWatch.js for why, and use --stop when that happens.

const path = require('path');

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (_e) { /* optional */ }

const { SEQUENCE, SEQUENCE_LENGTH } = require(path.resolve(__dirname, './lib/anthropicFollowUpMessages'));
const { renderMessage } = require(path.resolve(__dirname, './lib/anthropicFollowUpRender'));
const ledgerLib = require(path.resolve(__dirname, './lib/anthropicFollowUpLedger'));
const { detectReplyOrBlock } = require(path.resolve(__dirname, './lib/anthropicReplyWatch'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));
const { sendMailWithRetry } = require(path.resolve(__dirname, './lib/sendMailWithRetry'));

const ZONE = 'America/Chicago';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The campaign began with Ali's 2026-08-05 status check. Any human anthropic.com
// mail after that date is a reply to us.
const CAMPAIGN_SINCE = '2026/08/05';

const TO = 'partner-support@anthropic.com';
const CC = 'ram@colaberry.com';
const BCC = 'ali@colaberry.com';
const FROM = '"Ali Muwwakkil" <ali@colaberry.com>';
const OPERATOR = 'ali@colaberry.com';

// 08:30 to 09:10 Central. The window is wider than the cron tick so a late or
// retried tick still counts, and narrow enough that a stray midnight run does
// not mail a partner at 3am.
const WINDOW = { startMinutes: 8 * 60 + 30, endMinutes: 9 * 60 + 10 };

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const STATUS = process.argv.includes('--status');
const STOP = process.argv.includes('--stop');
const RESET = process.argv.includes('--reset');
const RETRY_CLAIM = process.argv.includes('--retry-claim');
const PREVIEW = arg('--preview', null);
const LEDGER_PATH = arg('--ledger', ledgerLib.defaultLedgerPath());

function log(m) { console.log(`[anthropic-followup] ${new Date().toISOString()} ${m}`); }

function centralNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, weekday: 'long', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const hour = parseInt(parts.hour, 10) % 24;   // some ICU builds return "24" at midnight
  const minute = parseInt(parts.minute, 10);
  return {
    dayOfWeek: DAY_NAMES.indexOf(parts.weekday),
    dayName: parts.weekday,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    label: `${parts.weekday} ${parts.year}-${parts.month}-${parts.day} ${String(hour).padStart(2, '0')}:${parts.minute} CT`,
  };
}

function transport() {
  if (!process.env.MANDRILL_API_KEY) {
    const e = new Error('MANDRILL_API_KEY is not set');
    e.error_class = 'AuthError';
    throw e;
  }
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    connectionTimeout: 15000,
  });
}

// A campaign that dies quietly is worse than one that never ran. Distinct
// subject and sender name so it dodges the Gmail filter that auto-trashes
// anything matching "Reporting Audit".
async function notifyOperator(subject, text) {
  if (!process.env.MANDRILL_API_KEY) { log('no MANDRILL_API_KEY; cannot notify operator'); return; }
  try {
    await transport().sendMail({
      from: '"CB Partner Followup" <ali@colaberry.com>',
      to: OPERATOR,
      cc: CC,
      subject,
      text,
      headers: { 'X-MC-Track': 'none' },
    });
    log(`operator notified: ${subject}`);
  } catch (e) {
    log(`could not notify operator (${e.message}); original condition still stands`);
  }
}

function describeLedger(ledger) {
  const sent = ledgerLib.sentEntries(ledger).sort((a, b) => a.dayNumber - b.dayNumber);
  const lines = [
    `campaign: ${ledger.campaign}`,
    `started:  ${ledger.startedAt || 'not yet'}`,
    `halt:     ${ledger.halt ? `${ledger.halt.reason} at ${ledger.halt.at}` : 'none'}`,
    `sent:     ${sent.length} of ${SEQUENCE_LENGTH}`,
    `ledger:   ${LEDGER_PATH}`,
    '',
  ];
  for (const e of sent) lines.push(`  ${String(e.dayNumber).padStart(2)}. ${e.sentAt ? e.sentAt.slice(0, 10) : '?'}  ${e.angle}`);
  const claimed = Object.entries(ledger.entries).filter(([, e]) => e.status === 'claimed');
  for (const [k, e] of claimed) lines.push(`  !! ${k} claimed but unconfirmed (note ${e.dayNumber}, ${e.angle}). Check Sent, then --retry-claim.`);
  return lines.join('\n');
}

async function main() {
  // ---------------------------------------------------------------- previews
  if (PREVIEW) {
    const n = parseInt(PREVIEW, 10);
    if (!(n >= 1 && n <= SEQUENCE_LENGTH)) throw new Error(`--preview must be 1..${SEQUENCE_LENGTH}`);
    const m = renderMessage(SEQUENCE[n - 1], n);
    validateBeforeSend(m.html, m.text);
    console.log(`--- note ${n} of ${SEQUENCE_LENGTH} (${m.angle}) ---\nTo:  ${TO}\nCc:  ${CC}\nBcc: ${BCC}\nSubject: ${m.subject}\n\n${m.text}`);
    return;
  }

  const ledger = ledgerLib.loadLedger(LEDGER_PATH);

  if (STATUS) { console.log(describeLedger(ledger)); return; }

  if (RESET) {
    ledgerLib.saveLedger(ledgerLib.reset(ledger), LEDGER_PATH);
    log('ledger reset; the sequence will start again from note 1 on the next weekday tick');
    return;
  }

  if (STOP) {
    ledgerLib.saveLedger(ledgerLib.halt(ledger, 'stopped', 'operator ran --stop'), LEDGER_PATH);
    log('campaign stopped by operator. Nothing further will send. Use --reset to restart.');
    return;
  }

  if (RETRY_CLAIM) {
    const claimed = Object.keys(ledger.entries).filter((k) => ledger.entries[k].status === 'claimed');
    if (!claimed.length) { log('no unconfirmed claims to clear'); return; }
    claimed.forEach((k) => { log(`clearing unconfirmed claim ${k} (note ${ledger.entries[k].dayNumber})`); delete ledger.entries[k]; });
    ledgerLib.saveLedger(ledger, LEDGER_PATH);
    log('claims cleared. Confirm nothing went out before the next tick.');
    return;
  }

  const ct = centralNow();
  log(`tick at ${ct.label}`);

  // Cheap gates first. Do not spend a Gmail API call to discover it is Saturday.
  const preflightDecision = ledgerLib.decide({ ledger, central: ct, reply: null, sequenceLength: SEQUENCE_LENGTH, window: WINDOW, force: FORCE });
  if (!preflightDecision.send && preflightDecision.reason !== 'ok') {
    if (preflightDecision.reason === 'sequence-complete' && !(ledger.halt && ledger.halt.reason === 'sequence-complete')) {
      ledgerLib.saveLedger(ledgerLib.halt(ledger, 'sequence-complete', `all ${SEQUENCE_LENGTH} notes sent, no reply`), LEDGER_PATH);
      await notifyOperator(
        `[Anthropic follow-up] Sequence complete, ${SEQUENCE_LENGTH} notes sent, no reply`,
        `The Claude Partner Network follow-up sequence has finished.\n\n`
        + `All ${SEQUENCE_LENGTH} weekday notes went out and no human reply from anthropic.com was detected.\n`
        + `The final note told them we were stepping back and would check in next month, so nothing further will send.\n\n`
        + `${describeLedger(ledger)}\n\n`
        + `Suggested next moves: a LinkedIn approach to someone on the partnerships team, or the sales contact form at anthropic.com, rather than more mail to this queue.\n`,
      );
      log('sequence complete; halted and operator notified');
      return;
    }
    log(`not sending: ${preflightDecision.reason}`);
    return;
  }

  // Now the expensive gate: has Anthropic replied?
  const reply = await detectReplyOrBlock({ since: CAMPAIGN_SINCE, log });

  const decision = ledgerLib.decide({ ledger, central: ct, reply, sequenceLength: SEQUENCE_LENGTH, window: WINDOW, force: FORCE });

  if (decision.reason === 'reply-detected') {
    ledgerLib.saveLedger(ledgerLib.halt(ledger, 'replied', { from: reply.from, subject: reply.subject, date: reply.date }), LEDGER_PATH);
    await notifyOperator(
      `[Anthropic follow-up] STOPPED, Anthropic replied`,
      `Anthropic replied. The follow-up campaign has stopped and will not send again.\n\n`
      + `From:    ${reply.from}\nSubject: ${reply.subject}\nDate:    ${reply.date}\n\n${reply.snippet}\n\n`
      + `${describeLedger(ledger)}\n\nOver to you and Ram.\n`,
    );
    log(`REPLY DETECTED from ${reply.from}; campaign halted`);
    return;
  }

  if (decision.reason === 'reply-check-unavailable') {
    log(`not sending: ${reply.why}`);
    await notifyOperator(
      `[Anthropic follow-up] Skipped today, could not verify the inbox`,
      `Today's Claude Partner Network follow-up did NOT send because the reply check failed, and sending on an unverified inbox risks mailing someone who already answered.\n\n`
      + `${reply.why}\n\nThe campaign is not stopped. It will try again on the next weekday tick.\n`,
    );
    return;
  }

  if (!decision.send) { log(`not sending: ${decision.reason}`); return; }

  // ------------------------------------------------------------------ send
  const message = SEQUENCE[decision.dayNumber - 1];
  const rendered = renderMessage(message, decision.dayNumber);
  validateBeforeSend(rendered.html, rendered.text);

  if (DRY_RUN) {
    log(`DRY RUN. Would send note ${decision.dayNumber}/${SEQUENCE_LENGTH} (${rendered.angle}) as "${rendered.subject}"`);
    console.log(`\nTo:  ${TO}\nCc:  ${CC}\nBcc: ${BCC}\nSubject: ${rendered.subject}\n\n${rendered.text}`);
    return;
  }

  // Claim BEFORE the send. If we crash mid-send the day stays blocked, which is
  // the right way to be wrong.
  ledgerLib.claim(ledger, {
    occurrenceKey: decision.occurrenceKey, dayNumber: decision.dayNumber, angle: rendered.angle, subject: rendered.subject,
  });
  ledgerLib.saveLedger(ledger, LEDGER_PATH);
  log(`claimed ${decision.occurrenceKey} for note ${decision.dayNumber}/${SEQUENCE_LENGTH} (${rendered.angle})`);

  let result;
  try {
    result = await sendMailWithRetry(transport(), {
      from: FROM,
      to: TO,
      cc: CC,
      bcc: BCC,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      // No open or click tracking. A tracking pixel in a partnership letter is
      // both tacky and a deliverability risk into a corporate support queue.
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
    }, { log });
  } catch (e) {
    // The transport threw after its retries, so nothing left. Safe to release.
    ledgerLib.release(ledger, decision.occurrenceKey);
    ledgerLib.saveLedger(ledger, LEDGER_PATH);
    log(`send failed and claim released: ${e.message}`);
    await notifyOperator(
      `[Anthropic follow-up] Note ${decision.dayNumber} FAILED to send`,
      `Note ${decision.dayNumber}/${SEQUENCE_LENGTH} ("${rendered.subject}") did not send.\n\n`
      + `Error class: ${e.error_class || e.code || 'Error'}\nMessage: ${e.message}\n\n`
      + `The claim was released, so the next weekday tick will retry this same note. The campaign is not stopped.\n`,
    );
    throw e;
  }

  ledgerLib.commit(ledger, { occurrenceKey: decision.occurrenceKey, messageId: result.messageId });
  ledgerLib.saveLedger(ledger, LEDGER_PATH);
  log(`SENT note ${decision.dayNumber}/${SEQUENCE_LENGTH} "${rendered.subject}" (mandrill ${result.messageId})`);
}

// The schedule and clock helpers are the parts most likely to be silently wrong,
// so they are exported and unit tested rather than only exercised by cron.
module.exports = { centralNow, WINDOW, CAMPAIGN_SINCE, TO, CC, BCC, SEQUENCE_LENGTH };

if (require.main === module) {
  main().catch(async (e) => {
    console.error(`[anthropic-followup] FATAL ${e.error_class || 'Error'}: ${e.message}`);
    console.error(e.stack);
    if (e.error_class === 'StateUnavailable') {
      await notifyOperator(
        '[Anthropic follow-up] HALTED, ledger state is unreadable',
        `The follow-up campaign could not read its ledger and refused to send rather than risk a duplicate.\n\n${e.message}\n\nFix the file at ${LEDGER_PATH} or run --status to inspect.\n`,
      );
    }
    process.exit(1);
  });
}
