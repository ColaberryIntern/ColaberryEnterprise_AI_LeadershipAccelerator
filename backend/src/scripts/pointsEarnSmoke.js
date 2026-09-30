#!/usr/bin/env node
'use strict';
/**
 * pointsEarnSmoke.js — daily production smoke test for the portal points "earn" loop.
 *
 * WHY THIS RUNS ON THE PRODUCTION HOST
 * ------------------------------------
 * This check previously lived in a scheduled cloud agent (routine
 * "portal-points-earn-smoke", created 2026-07-19, daily at 13:00 UTC). It never
 * produced a single valid result. Its July runs died on a weekly model rate
 * limit; from at least 2026-08-10 every run failed with `curl (56) CONNECT
 * tunnel failed, response 403` because the sandbox egress proxy does not
 * allowlist enterprise.colaberry.ai. Not one request ever reached the API, so
 * every alert it sent described the monitor, not the product, and the points
 * economy went unwatched for a month behind a monitor that looked alive.
 *
 * The fix is to stop asking a sandboxed agent to reach production and instead
 * run the assertions on the box that already serves them, deterministically, with
 * no model in the assertion path. Everything that decides something lives in
 * lib/pointsSmokeChecks.js and is unit-tested in CI.
 *
 * WHAT IT PROVES (API-level mirror of tests/systemV2/pointsEarnFlow.e2e.js)
 *   2. POST /api/portal/free-signup mints a guest JWT
 *   3. GET  /api/portal/points answers 200 (baseline total)
 *   4. GET  /api/portal/classroom returns a feed with at least one completable,
 *          point-bearing, non-gated card
 *   5. POST /api/portal/classroom/cards/:id/complete awards EXACTLY the card's
 *          rendered "+N pts" badge (the badge<->HUD parity that must never drift)
 *   6. GET  /api/portal/points rises by exactly that award
 *
 * FAILURE MODEL (Failure-First Design, the four required answers)
 *   1. What happens if this fails? One plain-text email to ali@colaberry.com and
 *      a non-zero exit. Nothing retries the business operation.
 *   2. Retries? Only on transient transport faults (network error, 429, 5xx):
 *      2 extra attempts, fixed 2s backoff, per request. The card completion in
 *      check 5 is NEVER retried, because it is the one call with a side effect
 *      and a retry could double-award. Every request has a hard timeout
 *      (POINTS_SMOKE_TIMEOUT_MS, default 20s), so nothing can hang the cron.
 *   3. Recovery path when retries are exhausted: the run reports failure and
 *      emails. There is no dead-letter queue because there is no work to
 *      re-drive; the next daily run is the retry.
 *   4. Handled vs not handled: handled are transport faults, non-2xx responses,
 *      malformed/absent JSON, an empty or fully gated feed, a completion that
 *      awards nothing, badge mismatch, accrual mismatch, and its own crash
 *      (exit 2 still alerts). NOT handled: a semantically wrong but internally
 *      consistent points value (if the API awards 10 and the badge also says 10,
 *      both being wrong is invisible here), and anything about the browser HUD,
 *      which stays with the Playwright e2e.
 *
 * SIDE EFFECTS, and why they are safe to repeat
 *   Each run creates one throwaway guest (…@colaberry-test.local) and completes
 *   one card for that guest. Guests are unique per run, so the operation is
 *   naturally idempotent: a re-run cannot corrupt a previous run's state or
 *   double-award anyone. The ALERT is deduped separately, keyed on (UTC date,
 *   kind), so running this twice in a day yields at most one failure email.
 *
 * USAGE
 *   node backend/src/scripts/pointsEarnSmoke.js            # real run, may email
 *   node backend/src/scripts/pointsEarnSmoke.js --dry      # never emails
 *   BASE_URL=http://localhost:9999 node …/pointsEarnSmoke.js
 *
 * CRON (production host, mirrors the other host jobs)
 *   30 13 * * * /opt/colaberry-accelerator/scripts/cron-env-wrapper.sh \
 *     /opt/colaberry-accelerator/backend/src/scripts/pointsEarnSmoke.js \
 *     >> /var/log/points-earn-smoke.log 2>&1
 *
 * ENV: MANDRILL_API_KEY (alert), MANDRILL_USERNAME. Optional: BASE_URL,
 *   POINTS_SMOKE_ALERT_TO (default ali@colaberry.com), POINTS_SMOKE_TIMEOUT_MS,
 *   POINTS_SMOKE_STATE (state file path), DRY_RUN=1.
 * EXIT: 0 pass, 1 checks failed (alert sent), 2 harness error (alert sent).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  badgeOf,
  selectCandidates,
  evaluateEarn,
  decideAlert,
  nextState,
  formatFailureEmail,
  formatRecoveryEmail,
} = require('./lib/pointsSmokeChecks');

const BASE = (process.env.BASE_URL || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
const TIMEOUT_MS = parseInt(process.env.POINTS_SMOKE_TIMEOUT_MS || '20000', 10);
const ALERT_TO = process.env.POINTS_SMOKE_ALERT_TO || 'ali@colaberry.com';
const DRY = process.env.DRY_RUN === '1' || process.argv.includes('--dry');
const STATE_PATH = process.env.POINTS_SMOKE_STATE
  || path.join(__dirname, '..', '..', '..', 'tmp', 'points-smoke-state.json');

const CORRELATION_ID = crypto.randomUUID();
const SERVICE = 'points-earn-smoke';

function log(level, event, context = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    event,
    correlation_id: CORRELATION_ID,
    ...context,
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One HTTP call with a hard timeout and a capped, transport-only retry.
 *
 * `retry` is opt-out rather than blanket: the caller that has a side effect
 * passes { retry: 0 }. A 4xx other than 429 is never retried either, because a
 * contract error does not get better by asking again.
 */
async function api(pathname, opts = {}, { retry = 2, label = pathname } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${pathname}`, { ...opts, signal: controller.signal });
      const text = await res.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { __unparsed: text.slice(0, 200) };
      }
      const duration_ms = Date.now() - started;
      const transient = res.status === 429 || res.status >= 500;
      if (transient && attempt < retry) {
        log('warn', 'upstream_transient', {
          endpoint: label, status: res.status, duration_ms, attempt, outcome: 'failure', error_class: 'UpstreamUnavailable',
        });
        await sleep(2000);
        continue;
      }
      log('info', 'upstream_call', {
        endpoint: label, status: res.status, duration_ms, attempt, outcome: res.ok ? 'success' : 'failure',
      });
      return { status: res.status, body };
    } catch (err) {
      const duration_ms = Date.now() - started;
      const error_class = err.name === 'AbortError' ? 'TimeoutError' : 'UpstreamUnavailable';
      lastErr = Object.assign(new Error(err.message), { error_class });
      log('warn', 'upstream_error', {
        endpoint: label, duration_ms, attempt, outcome: 'failure', error_class, message: err.message,
      });
      if (attempt < retry) await sleep(2000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || Object.assign(new Error('request failed'), { error_class: 'UpstreamUnavailable' });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null; // absent or corrupt state is simply "no history"
  }
}

/** Atomic write, so a crash mid-write cannot leave state that re-sends forever. */
function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    const tmp = `${STATE_PATH}.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_PATH);
  } catch (err) {
    log('error', 'state_write_failed', { error_class: 'StateWriteError', message: err.message });
  }
}

async function sendAlert(subject, body) {
  if (DRY) {
    log('warn', 'alert_suppressed_dry_run', { subject });
    console.log(`\n--- would send to ${ALERT_TO} ---\n${subject}\n\n${body}\n---\n`);
    return;
  }
  if (!process.env.MANDRILL_API_KEY) {
    log('error', 'alert_skipped_no_mandrill_key', { subject, error_class: 'ConfigError' });
    return;
  }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: {
      user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
      pass: process.env.MANDRILL_API_KEY,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  const r = await transport.sendMail({
    from: '"Points Smoke" <ali@colaberry.com>',
    to: ALERT_TO,
    subject,
    text: body,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  log('info', 'alert_sent', { subject, message_id: r.messageId });
}

/** Runs checks 2 through 6. Returns { failures, context, earned }. */
async function runChecks() {
  const jsonHeaders = { 'Content-Type': 'application/json' };
  const auth = (t) => ({ ...jsonHeaders, Authorization: `Bearer ${t}` });
  const failures = [];
  const context = {};

  // 2) mint a throwaway guest JWT
  const email = `e2e-points-${Date.now()}@colaberry-test.local`;
  context.guest_email = email;
  const signup = await api('/api/portal/free-signup', {
    method: 'POST', headers: jsonHeaders, body: JSON.stringify({ full_name: 'Points Smoke', email }),
  }, { label: 'POST /api/portal/free-signup' });
  const token = signup.body && signup.body.jwt;
  if (signup.status < 200 || signup.status >= 300 || !token) {
    failures.push({
      check: 2,
      error_class: 'ContractViolation',
      message: `free-signup did not return a guest JWT (status ${signup.status})`,
      detail: JSON.stringify(signup.body).slice(0, 200),
    });
    return { failures, context };
  }

  // 3) baseline total
  const before = await api('/api/portal/points', { headers: auth(token) }, { label: 'GET /api/portal/points (baseline)' });
  if (before.status !== 200) {
    failures.push({ check: 3, error_class: 'ContractViolation', message: `points baseline returned ${before.status}` });
    return { failures, context };
  }
  const total0 = before.body.total ?? 0;
  context.total_before = total0;

  // 4) feed and eligible candidates
  const feed = await api('/api/portal/classroom', { headers: auth(token) }, { label: 'GET /api/portal/classroom' });
  const cards = (feed.body && feed.body.cards) || [];
  if (feed.status !== 200 || cards.length === 0) {
    failures.push({
      check: 4, error_class: 'ContractViolation',
      message: `classroom feed returned ${feed.status} with ${cards.length} card(s)`,
    });
    return { failures, context };
  }
  const candidates = selectCandidates(cards);
  context.cards = cards.length;
  context.candidates = candidates.length;
  if (candidates.length === 0) {
    failures.push({
      check: 4, error_class: 'ContractViolation',
      message: `feed has ${cards.length} card(s) but none are completable and point-bearing`,
    });
    return { failures, context };
  }

  // 5) complete the first candidate that actually awards. Never retried: this
  //    is the only call with a side effect.
  let earned = null;
  for (const c of candidates) {
    const comp = await api(`/api/portal/classroom/cards/${c.id}/complete`, {
      method: 'POST', headers: auth(token),
    }, { retry: 0, label: 'POST /api/portal/classroom/cards/:id/complete' });
    const awarded = comp.body && comp.body.points_awarded;
    if (comp.status === 200 && typeof awarded === 'number' && awarded > 0) {
      earned = { card: c, awarded, badge: badgeOf(c) };
      break;
    }
  }
  if (!earned) {
    failures.push({
      check: 5, error_class: 'ContractViolation',
      message: `none of the ${candidates.length} candidate card(s) completed with points_awarded > 0`,
    });
    return { failures, context };
  }
  context.card_id = earned.card.id;
  context.render_band = earned.card.render_band;
  context.awarded = earned.awarded;
  context.badge = earned.badge;

  // 6) accrual
  const after = await api('/api/portal/points', { headers: auth(token) }, { label: 'GET /api/portal/points (after)' });
  if (after.status !== 200) {
    failures.push({ check: 6, error_class: 'ContractViolation', message: `points after completion returned ${after.status}` });
    return { failures, context, earned };
  }
  const total1 = after.body.total ?? 0;
  context.total_after = total1;

  const verdict = evaluateEarn({ total0, total1, awarded: earned.awarded, badge: earned.badge });
  failures.push(...verdict.failures);
  return { failures, context, earned: { ...earned, total0, total1 } };
}

(async () => {
  const started = Date.now();
  const todayUtc = new Date().toISOString().slice(0, 10);
  const prev = readState();
  log('info', 'run_start', { base: BASE, dry_run: DRY, prev_status: prev ? prev.status : null });

  let failures = [];
  let context = {};
  let earned = null;
  let exitCode = 0;

  try {
    ({ failures, context, earned } = await runChecks());
  } catch (err) {
    // The harness itself broke (transport exhausted, unexpected throw). Still an
    // alert: a monitor that dies quietly is the exact failure being fixed here.
    failures = [{
      check: 0,
      error_class: err.error_class || 'HarnessError',
      message: `smoke test could not complete: ${err.message}`,
    }];
    exitCode = 2;
  }

  const outcome = failures.length === 0 ? 'pass' : 'fail';
  const alert = decideAlert({ prev, outcome, todayUtc });
  if (exitCode === 0) exitCode = outcome === 'pass' ? 0 : 1;

  log(outcome === 'pass' ? 'info' : 'error', 'run_complete', {
    outcome: outcome === 'pass' ? 'success' : 'failure',
    duration_ms: Date.now() - started,
    failed_checks: failures.map((f) => f.check),
    alert_sent: alert.send,
    alert_reason: alert.reason,
    ...context,
  });

  if (alert.send && alert.kind === 'failure') {
    await sendAlert(
      `[Points Smoke] FAILED on prod — ${todayUtc}`,
      formatFailureEmail({ base: BASE, failures, context }),
    ).catch((e) => log('error', 'alert_send_failed', { error_class: 'AlertSendError', message: e.message }));
  } else if (alert.send && alert.kind === 'recovery') {
    await sendAlert(
      `[Points Smoke] back to green — ${todayUtc}`,
      formatRecoveryEmail({
        base: BASE,
        awarded: earned.awarded,
        badge: earned.badge,
        total0: earned.total0,
        total1: earned.total1,
        renderBand: earned.card.render_band,
      }),
    ).catch((e) => log('error', 'alert_send_failed', { error_class: 'AlertSendError', message: e.message }));
  }

  if (!DRY) {
    writeState(nextState({ prev, outcome, todayUtc, nowIso: new Date().toISOString(), alert }));
  }

  if (outcome === 'pass') {
    console.log(`PASS — awarded ${context.awarded} == badge ${context.badge} [${context.render_band}]; total ${context.total_before} -> ${context.total_after}`);
  } else {
    console.error(`FAIL — check(s) ${failures.map((f) => f.check).join(', ')}: ${failures.map((f) => f.message).join(' | ')}`);
  }
  process.exit(exitCode);
})();
