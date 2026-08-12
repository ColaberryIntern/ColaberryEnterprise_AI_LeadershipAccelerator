#!/usr/bin/env node
// sendInternDeliveryScheduled.js
//
// Cron entry point for the Intern Delivery Command Center briefing. Harvests
// Basecamp fresh, renders the dashboard, and emails the briefing with the
// dashboard attached, 15 minutes before each scrum call:
//
//   Monday  08:45 America/Chicago  (before the 09:00 meeting)
//   Tuesday 09:45 America/Chicago  (before the 10:00 meeting)
//
// WHY THE SCHEDULE LIVES HERE AND NOT IN CRON
// The VPS runs UTC and no entry in its crontab sets CRON_TZ, so a fixed UTC time
// would drift an hour twice a year and land the briefing after the meeting for
// half of it. Setting CRON_TZ in a shared crontab is worse: in vixie cron it
// applies to every line after it, so it would silently re-time unrelated jobs.
// Instead cron fires this script at all UTC hours that could be the right
// Central hour, and the script decides. This mirrors the existing house pattern
// (`--only-if-noon-ct`, `--ct-now`).
//
//   45 13,14,15 * * 1,2  ->  covers 08:45/09:45 CT in both CST and CDT
//
// Usage:
//   node backend/src/scripts/sendInternDeliveryScheduled.js
//   node backend/src/scripts/sendInternDeliveryScheduled.js --force        # ignore schedule + ledger
//   node backend/src/scripts/sendInternDeliveryScheduled.js --dry-run      # harvest + render, no send
//   node backend/src/scripts/sendInternDeliveryScheduled.js --snapshot x.json --force
//
// Failure modes handled: outside a slot (exit 0, quiet); no Basecamp token
// (AuthError, exit 1); Basecamp 429/5xx (bounded retry inside the harvester);
// OpenAI unavailable (deterministic narrative fallback, briefing still sends);
// duplicate fire of the same slot (refused via durable ledger); send failure
// (3 attempts, then a distinct-subject alert email so it is not silent).
//
// Idempotency: keyed on the scheduled OCCURRENCE, not the snapshot. Each run
// harvests fresh data so generatedAt always differs; what must never double-fire
// is "Monday 2026-08-17 08:45 CT". The ledger lives outside tmp/ for that reason.

const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (_e) { /* optional */ }

const { deliverInternEmail } = require(path.resolve(__dirname, './lib/internDeliveryEmailSend'));

const DEFAULT_SLOTS = '1@08:45,2@09:45';   // 1 = Monday, 2 = Tuesday (JS getDay)
const DEFAULT_TOLERANCE_MIN = 20;          // how late a cron tick may be and still count
const ZONE = 'America/Chicago';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const NO_LLM = process.argv.includes('--no-llm');
const TO = arg('--to', 'ali@colaberry.com');
const SLOTS_RAW = arg('--slots', DEFAULT_SLOTS);
const TOLERANCE_MIN = parseInt(arg('--tolerance', String(DEFAULT_TOLERANCE_MIN)), 10);
const LOOKBACK = parseInt(arg('--lookback', '14'), 10);
const SNAPSHOT_IN = arg('--snapshot', null);

const STATE_DIR = path.resolve(
  arg('--state-dir', process.env.INTERN_DELIVERY_STATE_DIR
    || (process.platform === 'win32'
      ? path.join(__dirname, '../../..', 'tmp', 'intern-delivery')
      : '/var/lib/colaberry/intern-delivery')),
);
const LEDGER = path.join(STATE_DIR, 'scheduled-send-ledger.json');

function log(m) { console.log(`[intern-scheduled] ${new Date().toISOString()} ${m}`); }

// --------------------------------------------------------------- schedule
// Read the wall clock in Central directly from the zone database rather than
// doing arithmetic on a UTC offset, so DST is handled by definition.
function centralNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, weekday: 'long', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  // hour can come back as "24" at midnight in some ICU builds
  const hour = parseInt(parts.hour, 10) % 24;
  return {
    dayOfWeek: DAY_NAMES.indexOf(parts.weekday),
    dayName: parts.weekday,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: parseInt(parts.minute, 10),
    minutesOfDay: hour * 60 + parseInt(parts.minute, 10),
    label: `${parts.weekday} ${parts.year}-${parts.month}-${parts.day} ${String(hour).padStart(2, '0')}:${parts.minute} CT`,
  };
}

function parseSlots(raw) {
  return String(raw).split(',').map((chunk) => {
    const m = chunk.trim().match(/^([0-6])@(\d{1,2}):(\d{2})$/);
    if (!m) {
      const e = new Error(`bad --slots entry "${chunk}". Expected DAY@HH:MM, e.g. 1@08:45 for Monday.`);
      e.error_class = 'ValidationError';
      throw e;
    }
    const dayOfWeek = parseInt(m[1], 10);
    const hour = parseInt(m[2], 10);
    const minute = parseInt(m[3], 10);
    return { dayOfWeek, hour, minute, minutesOfDay: hour * 60 + minute, label: `${DAY_NAMES[dayOfWeek]} ${String(hour).padStart(2, '0')}:${m[3]} CT` };
  });
}

// A tick counts for a slot when it lands in [slot, slot + tolerance).
function matchSlot(ct, slots, toleranceMin) {
  return slots.find((s) => s.dayOfWeek === ct.dayOfWeek
    && ct.minutesOfDay >= s.minutesOfDay
    && ct.minutesOfDay < s.minutesOfDay + toleranceMin) || null;
}

// ------------------------------------------------------------- harvesting
async function resolveToken() {
  const envToken = String(process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
  try {
    const { getBasecampToken } = require(path.resolve(__dirname, './lib/basecampToken'));
    const t = await getBasecampToken();
    if (t) return t;
  } catch (e) {
    if (!envToken) throw e;
    log(`token resolver unavailable (${e.message}); falling back to env token`);
  }
  return envToken;
}

async function buildFreshSnapshot() {
  const { harvestDelivery } = require(path.resolve(__dirname, './lib/internDeliveryData'));
  const { computeDelivery } = require(path.resolve(__dirname, './lib/internDeliveryMetrics'));
  const { enrichNarrative } = require(path.resolve(__dirname, './lib/internDeliveryNarrative'));

  const token = await resolveToken();
  if (!token) {
    const e = new Error('No Basecamp token available (cron-env-wrapper.sh normally supplies BASECAMP_ACCESS_TOKEN)');
    e.error_class = 'AuthError';
    throw e;
  }

  const raw = await harvestDelivery({ token, lookbackDays: LOOKBACK, historyDays: 28, onProgress: log });
  log(`harvest complete: ${raw.projects.length} projects, ${raw.commentCount} comments`);

  const data = computeDelivery(raw);
  log(`metrics complete: ${data.portfolio.taskDone}/${data.portfolio.taskTotal} tasks done`);

  if (NO_LLM) delete process.env.OPENAI_API_KEY;
  await enrichNarrative(data, { onProgress: log });
  log(`narrative complete: mode=${data.meta.narrativeMode}, queue=${data.decisionQueue.length}`);

  return data;
}

function renderDashboard(data) {
  const { buildHtml } = require(path.resolve(__dirname, './lib/internDashboardShell'));
  const out = path.join(STATE_DIR, 'INTERN_DELIVERY_DASHBOARD.html');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(out, buildHtml(data), 'utf8');
  log(`dashboard rendered: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  return out;
}

// A cron that fails silently is worse than no cron. Distinct subject and sender
// so it dodges the Gmail filter that auto-trashes "Reporting Audit" mail.
async function alertFailure(err, occurrence) {
  if (!process.env.MANDRILL_API_KEY) return;
  try {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com',
      port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
      connectionTimeout: 15000,
    });
    await transport.sendMail({
      from: '"CB Intern Briefing Alert" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      subject: `[FAILED] Intern Delivery briefing did not send (${occurrence || 'unscheduled run'})`,
      text: `The Intern Delivery Command Center briefing failed before it could send.\n\n`
        + `Occurrence: ${occurrence || 'n/a'}\nError class: ${err.error_class || 'Error'}\nMessage: ${err.message}\n\n`
        + `Log: /var/log/intern-delivery-briefing.log on 95.216.199.47\n`
        + `Re-run by hand: /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh /opt/colaberry-accelerator/backend/src/scripts/sendInternDeliveryScheduled.js --force`,
      headers: { 'X-MC-Track': 'none' },
    });
    log('failure alert sent');
  } catch (e) {
    log(`could not send the failure alert (${e.message}); original error still stands`);
  }
}

// ------------------------------------------------------------------- main
async function main() {
  const slots = parseSlots(SLOTS_RAW);
  const ct = centralNow();
  const slot = matchSlot(ct, slots, TOLERANCE_MIN);

  log(`tick at ${ct.label}; slots = ${slots.map((s) => s.label).join(', ')}`);

  if (!slot && !FORCE) {
    log('not inside a scheduled slot; exiting without sending');
    return;
  }

  const occurrence = slot ? `${ct.date} ${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')} CT` : `manual ${ct.date} ${ct.hour}:${String(ct.minute).padStart(2, '0')} CT`;
  log(slot ? `matched slot ${slot.label}; occurrence = ${occurrence}` : `forced run; occurrence = ${occurrence}`);

  // Check the ledger BEFORE harvesting. A duplicate tick should cost nothing.
  if (!FORCE) {
    let ledger = {};
    try { ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (_e) { /* first run */ }
    if (ledger[`${TO}|${occurrence}`]) {
      log(`${occurrence} already sent to ${TO}; exiting without harvesting`);
      return;
    }
  }

  try {
    let data;
    if (SNAPSHOT_IN) {
      data = JSON.parse(fs.readFileSync(SNAPSHOT_IN, 'utf8'));
      log(`using supplied snapshot ${SNAPSHOT_IN} (generated ${data.generatedAt})`);
    } else {
      data = await buildFreshSnapshot();
    }

    const dashboardPath = renderDashboard(data);

    if (DRY_RUN) {
      log(`DRY RUN, nothing sent. Dashboard at ${dashboardPath}`);
      return;
    }

    const result = await deliverInternEmail({
      data,
      to: TO,
      idempotencyKey: occurrence,
      ledgerPath: LEDGER,
      attachmentPath: dashboardPath,
      force: FORCE,
      log,
    });

    if (result.skipped) {
      log('ledger says this occurrence already went out; nothing sent');
      return;
    }
    log(`SENT "${result.subject}" to ${TO} (mandrill ${result.mandrillId})`);
  } catch (e) {
    await alertFailure(e, occurrence);
    throw e;
  }
}

// The schedule gate is the part most likely to be silently wrong, so it is
// exported and unit tested rather than only exercised by the cron itself.
module.exports = { centralNow, parseSlots, matchSlot, DEFAULT_SLOTS, DEFAULT_TOLERANCE_MIN };

if (require.main === module) {
  main().catch((e) => {
    console.error(`[intern-scheduled] FATAL ${e.error_class || 'Error'}: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  });
}
