// anthropicFollowUpLedger.js
//
// Durable state for the Claude Partner Network follow-up sequence, plus the
// decision function that says whether today's note may go out.
//
// WHY A FILE AND NOT THE DATABASE
// This runs host-side from the source tree (same pattern as the rest of the
// reporting suite), where Postgres is only reachable by shelling into a
// container. reportRunRecorder.js does exactly that and SOFT-FAILS when docker
// is unavailable, which is correct for a run log and completely wrong for an
// idempotency key: a soft-fail there means "state unreadable, so send again",
// and the failure mode is emailing a partner twice in one morning. A local JSON
// file with an atomic write has no such ambiguity.
//
// IDEMPOTENCY MODEL (claim then commit)
// Sending mail is not transactional with writing state, so the ledger records a
// CLAIM before the send and upgrades it to SENT afterwards. A crash between the
// two leaves a claim behind, and a claim blocks the day just as firmly as a
// completed send. That is deliberate: on an ambiguous day we would rather skip
// a note than double-send one. Recovery is a human running --retry-claim after
// checking the sent folder.
//
// FAIL-CLOSED READS
// A missing file means "nothing sent yet" and is the normal first-run path. Any
// other read or parse error means the state is unknown, and unknown state must
// never authorise a send. loadLedger throws, and the caller aborts and alerts.

const fs = require('fs');
const path = require('path');

const LEDGER_VERSION = 1;

// Halt reasons that are terminal. Once one of these is written the sequence is
// over and only an explicit human --reset restarts it.
const TERMINAL_HALTS = new Set(['replied', 'stopped', 'sequence-complete']);

function defaultLedgerPath() {
  if (process.env.ANTHROPIC_FOLLOWUP_STATE_PATH) return process.env.ANTHROPIC_FOLLOWUP_STATE_PATH;
  return process.platform === 'win32'
    ? path.join(__dirname, '../../../..', 'tmp', 'anthropic-followup', 'ledger.json')
    : '/var/lib/colaberry/anthropic-followup/ledger.json';
}

function emptyLedger() {
  return {
    version: LEDGER_VERSION,
    campaign: 'anthropic-partner-network-followup',
    startedAt: null,
    halt: null,          // { reason, at, detail }
    entries: {},         // occurrenceKey -> { dayNumber, angle, subject, status, claimedAt, sentAt, messageId }
  };
}

function loadLedger(ledgerPath = defaultLedgerPath()) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return emptyLedger();
    const err = new Error(`ledger unreadable at ${ledgerPath}: ${e.message}`);
    err.error_class = 'StateUnavailable';
    throw err;
  }
  try {
    // A hand-edit in a Windows editor can leave a BOM, and JSON.parse rejects
    // it. Losing the campaign to an invisible character is a silly way to fail.
    const parsed = JSON.parse(raw.replace(/^﻿/, ''));
    if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
      throw new Error('ledger has no entries map');
    }
    return parsed;
  } catch (e) {
    const err = new Error(`ledger at ${ledgerPath} is corrupt: ${e.message}. Refusing to send on unknown state.`);
    err.error_class = 'StateUnavailable';
    throw err;
  }
}

// Atomic: write a sibling temp file then rename. A torn write here would put the
// campaign into the corrupt-ledger path above and stop all sends until a human
// looks, which is safe but noisy, so it is worth avoiding properly.
function saveLedger(ledger, ledgerPath = defaultLedgerPath()) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const tmp = `${ledgerPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2), 'utf8');
  fs.renameSync(tmp, ledgerPath);
  return ledgerPath;
}

function sentEntries(ledger) {
  return Object.values(ledger.entries).filter((e) => e.status === 'sent');
}

// How many notes have gone out, or been claimed and left ambiguous. Both consume
// a slot in the sequence: a claimed-but-unconfirmed note may well have been
// delivered, so re-using its day number risks sending the same words twice.
function consumedCount(ledger) {
  return Object.values(ledger.entries).filter((e) => e.status === 'sent' || e.status === 'claimed').length;
}

function nextDayNumber(ledger) {
  return consumedCount(ledger) + 1;
}

/**
 * The whole go/no-go decision in one pure function, so the cron path and the
 * tests exercise identical logic.
 *
 * @param {object} args
 * @param {object} args.ledger        current ledger
 * @param {object} args.central       { dayOfWeek, date, hour, minute, minutesOfDay, label } in America/Chicago
 * @param {object|null} args.reply    reply-detector result, or null if not checked
 * @param {number} args.sequenceLength total notes in the sequence
 * @param {object} [args.window]      { startMinutes, endMinutes } allowed send window, Central
 * @param {boolean} [args.force]      operator override for schedule + weekday gates only
 * @returns {{ send: boolean, reason: string, dayNumber?: number, occurrenceKey?: string, terminal?: boolean }}
 */
function decide({ ledger, central, reply, sequenceLength, window: win, force = false }) {
  // 1. Terminal halts win over everything, including --force. If they replied,
  //    no flag should be able to fire another note at them.
  if (ledger.halt && TERMINAL_HALTS.has(ledger.halt.reason)) {
    return { send: false, reason: `halted: ${ledger.halt.reason}`, terminal: true };
  }

  // 2. A reply detected on this run halts before anything else is considered.
  //    An unverifiable inbox (expired token, Gmail 5xx) also blocks the send,
  //    but only for today. Treating a transient API error as a permanent
  //    "they replied" would quietly kill a campaign nobody asked to stop, so it
  //    stays non-terminal and simply skips the day.
  if (reply && reply.found) {
    return reply.blocking
      ? { send: false, reason: 'reply-check-unavailable', replyDetail: reply }
      : { send: false, reason: 'reply-detected', terminal: true, replyDetail: reply };
  }

  // 3. Weekdays only. Monday through Friday, per the brief.
  if (central.dayOfWeek === 0 || central.dayOfWeek === 6) {
    return { send: false, reason: 'weekend' };
  }

  // 4. Inside the morning window, unless forced.
  if (win && !force) {
    if (central.minutesOfDay < win.startMinutes || central.minutesOfDay >= win.endMinutes) {
      return { send: false, reason: 'outside-window' };
    }
  }

  // 5. One note per calendar day in Central, whatever the cron does.
  const occurrenceKey = central.date;
  const existing = ledger.entries[occurrenceKey];
  if (existing) {
    return {
      send: false,
      reason: existing.status === 'sent' ? 'already-sent-today' : 'claimed-today-unconfirmed',
      occurrenceKey,
    };
  }

  // 6. The sequence is finite.
  const dayNumber = nextDayNumber(ledger);
  if (dayNumber > sequenceLength) {
    return { send: false, reason: 'sequence-complete', terminal: true };
  }

  return { send: true, reason: 'ok', dayNumber, occurrenceKey };
}

function claim(ledger, { occurrenceKey, dayNumber, angle, subject }, now = new Date()) {
  if (ledger.entries[occurrenceKey]) {
    const err = new Error(`refusing to re-claim ${occurrenceKey}; it already has status "${ledger.entries[occurrenceKey].status}"`);
    err.error_class = 'IdempotencyViolation';
    throw err;
  }
  if (!ledger.startedAt) ledger.startedAt = now.toISOString();
  ledger.entries[occurrenceKey] = {
    dayNumber, angle, subject, status: 'claimed', claimedAt: now.toISOString(), sentAt: null, messageId: null,
  };
  return ledger;
}

function commit(ledger, { occurrenceKey, messageId }, now = new Date()) {
  const entry = ledger.entries[occurrenceKey];
  if (!entry) {
    const err = new Error(`cannot commit ${occurrenceKey}; no claim exists`);
    err.error_class = 'IdempotencyViolation';
    throw err;
  }
  entry.status = 'sent';
  entry.sentAt = now.toISOString();
  entry.messageId = messageId || null;
  return ledger;
}

// Used when a send throws. Releasing the claim is only correct when we know the
// mail never left, which is why the caller passes the transport outcome rather
// than this deciding for itself.
function release(ledger, occurrenceKey) {
  const entry = ledger.entries[occurrenceKey];
  if (entry && entry.status === 'claimed') delete ledger.entries[occurrenceKey];
  return ledger;
}

function halt(ledger, reason, detail = null, now = new Date()) {
  ledger.halt = { reason, at: now.toISOString(), detail };
  return ledger;
}

function reset(ledger) {
  const fresh = emptyLedger();
  fresh.previousRun = { haltedAt: ledger.halt ? ledger.halt.at : null, sent: sentEntries(ledger).length };
  return fresh;
}

module.exports = {
  LEDGER_VERSION,
  TERMINAL_HALTS,
  defaultLedgerPath,
  emptyLedger,
  loadLedger,
  saveLedger,
  sentEntries,
  consumedCount,
  nextDayNumber,
  decide,
  claim,
  commit,
  release,
  halt,
  reset,
};
