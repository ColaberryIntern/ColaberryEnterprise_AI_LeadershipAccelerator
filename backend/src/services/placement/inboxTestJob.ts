import { randomBytes } from 'crypto';
import cron from 'node-cron';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../emailService';
import { sendOnce, type ProviderResult } from '../email/idempotentSend';
import { getSetting } from '../settingsService';
import { careerPrepEnabled, careerPrepEnrollmentIds } from '../careerPrep/careerPrepFlag';
import { BROKEN_AFTER_MS } from './inboxHealth';

/**
 * Career Prep v27, CP6.1c (kit F2): the daily forwarding test and the "forwarding broken" alert.
 *
 * DARK SWITCH: system_settings `career_prep_inbox_tests_enabled` must be exactly true. Absent, false or unreadable
 * means OFF (fail closed): no test is sent, no spell is marked, no alert goes out, and health stays "Not tested".
 *
 * TEST (sendTest; the scheduler, the student's "Send a test" and the staff desk all call it):
 *   - claimed in ONE transaction on the locked inbox row: a new token, last_test_at = now and last_test_ms = NULL
 *     (so an older test arriving late can never make this one look arrived; inboxArrival.ts matches tokens).
 *   - once per inbox per Central day. The student and desk may retry the same day only after the latest test MISSED
 *     its 10 minutes (bounded: one try per 10 minutes); the scheduler never retries the same day.
 *   - sent through `sendOnce` (event `inbox-test-<enrollment>-<token>`), subject carries `[test:<token>]`.
 *   - a failed send puts the previous test back (only if the claim is still ours), so a mail we never sent can
 *     never read as "forwarding broken". Recovery: the next day's run, or a manual test.
 * ALERT (sendBrokenAlerts, every 15 minutes 8 AM to 8 PM Central):
 *   - a verified inbox whose latest test missed 10 minutes starts a spell: broken_since = that test's send time.
 *   - ONE email per spell to the learner's personal address (`sendOnce`, event `inbox-broken-<enrollment>-<since>`),
 *     with a link back to step 3; at most 3 tries, then `inbox_broken_alert_gave_up` (error) for staff.
 *   - in the app the alert is the inbox sheet's role="alert" line, shown for as long as health is broken.
 *   - a spell ends only when a test arrives (inboxArrival.ts clears it), so a later spell alerts again.
 */
export const TESTS_SWITCH = 'career_prep_inbox_tests_enabled';
export const MAX_ALERT_ATTEMPTS = 3;
export const ALERT_SUBJECT = 'Your job-search inbox stopped forwarding';
export const testSubject = (token: string) => `Forwarding test for your job-search inbox [test:${token}]`;

type Read = (k: string) => Promise<unknown>;
export interface TestDeps { read?: Read; enabled?: (e: string) => Promise<boolean>; enabledIds?: () => Promise<string[]>; token?: () => string }
export type SendTestResult =
  | { status: 'sent'; sentAt: string }
  | { status: 'already_today' | 'switched_off' | 'no_inbox' }
  | { status: 'failed'; errorClass: string };

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

export async function testsEnabled(read: Read = getSetting): Promise<boolean> {
  try { const v = await read(TESTS_SWITCH); return v === true || v === 'true'; } catch (err) {
    log('warn', 'inbox_tests_switch_unreadable', {}, (err as Error)?.name || 'UpstreamUnavailable');
    return false;
  }
}

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
/** The Central calendar day (YYYY-MM-DD) an instant falls on. */
export const centralDay = (d: Date): string => DAY.format(d);

/** PURE: may a new test go out now? */
export function testDecision(row: { last_test_at: Date | null; last_test_ms: number | null }, now: Date, retryMissed: boolean): 'send' | 'already_today' {
  if (!row.last_test_at) return 'send';
  const last = new Date(row.last_test_at);
  if (centralDay(last) !== centralDay(now) && last.getTime() < now.getTime()) return 'send';
  if (retryMissed && row.last_test_ms === null && now.getTime() - last.getTime() > BROKEN_AFTER_MS) return 'send';
  return 'already_today';
}

/** One plain-text message to one address (test-mode redirect applies). Not ok when the send guard blocked it. */
async function transport(to: string, subject: string, text: string): Promise<ProviderResult> {
  const r = await resolveEmailRecipient(to, subject);
  const info = await guardedSendMail({ from: `"Cora at Colaberry" <${env.emailFrom}>`, to: r.to, subject: r.subject, text,
    headers: { 'X-MC-Tags': 'career-prep-inbox' } });
  return info?.messageId ? { ok: true, messageId: String(info.messageId) } : { ok: false, errorClass: 'SendBlocked', error: 'blocked by kill switch or dev guard' };
}

type Prev = { id: string; address: string; last_test_at: Date | null; last_test_token: string | null; last_test_ms: number | null };
type Claim = { status: 'claimed'; prev: Prev; token: string } | { status: 'already_today' | 'no_inbox' };

async function claimTest(enrollmentId: string, now: Date, retryMissed: boolean, token: string): Promise<Claim> {
  return sequelize.transaction(async (transaction) => {
    const [rows] = await sequelize.query(
      'SELECT id, address, last_test_at, last_test_token, last_test_ms FROM job_search_inboxes WHERE enrollment_id = :e FOR UPDATE',
      { replacements: { e: enrollmentId }, transaction });
    const prev = (rows as Prev[])[0];
    if (!prev) return { status: 'no_inbox' } as const;
    if (testDecision(prev, now, retryMissed) !== 'send') return { status: 'already_today' } as const;
    await sequelize.query('UPDATE job_search_inboxes SET last_test_at = :now, last_test_token = :tok, last_test_ms = NULL, updated_at = NOW() WHERE id = :id',
      { replacements: { now, tok: token, id: prev.id }, transaction });
    return { status: 'claimed', prev, token } as const;
  });
}

const TEST_TEXT = 'This is the forwarding test from Colaberry Career Prep.\n\nYou do not need to do anything. When this message reaches us through your Gmail forwarding, Career Prep shows your job-search inbox as healthy.\n\nCora, your interview coach';

export async function sendTest(enrollmentId: string, opts: { now?: Date; retryMissed?: boolean; deps?: TestDeps } = {}): Promise<SendTestResult> {
  const now = opts.now ?? new Date();
  const deps = opts.deps ?? {};
  if (!(await testsEnabled(deps.read))) return { status: 'switched_off' };
  const claim = await claimTest(enrollmentId, now, opts.retryMissed ?? true, (deps.token ?? (() => randomBytes(12).toString('hex')))());
  if (claim.status !== 'claimed') return claim;
  const { prev, token } = claim;
  const subject = testSubject(token);
  let errorClass: string;
  try {
    const r = await sendOnce({ recipient: prev.address, subject, businessEventId: `inbox-test-${enrollmentId}-${token}` }, () => transport(prev.address, subject, TEST_TEXT));
    if (r.outcome !== 'failed') { log('info', 'inbox_test_sent', { enrollment_id: enrollmentId }); return { status: 'sent', sentAt: now.toISOString() }; }
    errorClass = r.errorClass;
  } catch (err) {
    // The send ledger itself failed (e.g. its database): the claim never reached the provider, so nothing was sent.
    errorClass = (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable';
  }
  await restoreTest(prev, token);
  log('warn', 'inbox_test_send_failed', { enrollment_id: enrollmentId }, errorClass);
  return { status: 'failed', errorClass };
}

/** Put the previous test back, only while the claim is still ours (a newer test is never overwritten). */
async function restoreTest(prev: Prev, token: string): Promise<void> {
  await sequelize.query(
    'UPDATE job_search_inboxes SET last_test_at = :at, last_test_token = :pt, last_test_ms = :ms, updated_at = NOW() WHERE id = :id AND last_test_token = :tok',
    { replacements: { at: prev.last_test_at, pt: prev.last_test_token, ms: prev.last_test_ms, id: prev.id, tok: token } });
}

/** The scheduler's daily pass: one test per verified inbox of every Career Prep learner, never a same-day retry. */
export async function runDailyTests(now = new Date(), deps: TestDeps = {}): Promise<number> {
  if (!(await testsEnabled(deps.read))) return 0;
  const ids = await (deps.enabledIds ?? careerPrepEnrollmentIds)();
  if (!ids.length) return 0;
  const [rows] = await sequelize.query('SELECT enrollment_id FROM job_search_inboxes WHERE verified_at IS NOT NULL AND enrollment_id IN (:ids)', { replacements: { ids } });
  let sent = 0;
  for (const { enrollment_id: e } of rows as Array<{ enrollment_id: string }>) {
    try { if ((await sendTest(String(e), { now, retryMissed: false, deps })).status === 'sent') sent += 1; } catch (err) {
      log('warn', 'inbox_test_failed', { enrollment_id: e }, (err as Error)?.name || 'DatabaseError');
    }
  }
  return sent;
}

/** Intl puts a narrow or plain no-break space before AM/PM in some ICU versions; mail text uses a plain space. */
const ODD_SPACE = new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)}]`, 'g');
const WHEN = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
/** Plain text, one link back to step 3 (the inbox sheet). */
export function alertText(fullName: string | null, since: Date): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  const link = `${env.frontendUrl.replace(/\/$/, '')}/portal/career/room#inbox`;
  return `Hi${first ? ` ${first}` : ''},\n\nThe forwarding test we sent to your job-search inbox on ${WHEN.format(since).replace(ODD_SPACE, ' ').replace(/, (\d{1,2}:)/, ' at $1')} did not reach us within 10 minutes, so interview emails sent to that address may not be reaching us either.\n\nOpen your inbox sheet, check step 3 (Forward it to the central inbox) in that Gmail, then send a test:\n\n${link}\n\nCora, your interview coach`;
}

type Spell = { id: string; enrollment_id: string; broken_since: Date; email: string | null; full_name: string | null };

async function alertOne(s: Spell, now: Date, deps: TestDeps): Promise<number> {
  if (!(await (deps.enabled ?? careerPrepEnabled)(String(s.enrollment_id)))) return 0;
  const since = new Date(s.broken_since);
  const [tries] = await sequelize.query(
    `UPDATE job_search_inboxes SET broken_alert_attempts = broken_alert_attempts + 1 WHERE id = :id AND broken_since = :since
       AND broken_alerted_at IS NULL AND broken_alert_attempts < ${MAX_ALERT_ATTEMPTS} RETURNING broken_alert_attempts`, { replacements: { id: s.id, since } });
  const attempt = Number((tries as Array<{ broken_alert_attempts: number }>)[0]?.broken_alert_attempts ?? 0);
  if (!attempt) return 0;
  if (!s.email) {
    await sequelize.query(`UPDATE job_search_inboxes SET broken_alert_attempts = ${MAX_ALERT_ATTEMPTS} WHERE id = :id`, { replacements: { id: s.id } });
    log('error', 'inbox_broken_alert_gave_up', { enrollment_id: s.enrollment_id, fix: 'the learner has no email on file; staff call them' }, 'NoEmail');
    return 0;
  }
  const r = await sendOnce({ recipient: s.email, subject: ALERT_SUBJECT, businessEventId: `inbox-broken-${s.enrollment_id}-${since.toISOString()}` },
    () => transport(s.email as string, ALERT_SUBJECT, alertText(s.full_name, since)));
  // Marked only when the email is known to have gone: sent now, or the ledger says it was already sent. An in_flight
  // (or natural-key) refusal means we do not know, so the spell stays unmarked and the attempt counts toward the cap.
  if (r.outcome === 'sent' || (r.outcome === 'skipped' && r.reason === 'already_sent')) {
    await sequelize.query('UPDATE job_search_inboxes SET broken_alerted_at = :now WHERE id = :id AND broken_since = :since', { replacements: { now, id: s.id, since } });
    return r.outcome === 'sent' ? 1 : 0;
  }
  if (r.outcome === 'skipped') {
    log(attempt >= MAX_ALERT_ATTEMPTS ? 'error' : 'warn', 'inbox_broken_alert_unconfirmed', { enrollment_id: s.enrollment_id, attempts: attempt, reason: r.reason,
      fix: 'a stranded ledger claim: check Mandrill, then releaseClaim() if it never went' }, 'SendInFlight');
    return 0;
  }
  if (attempt >= MAX_ALERT_ATTEMPTS) log('error', 'inbox_broken_alert_gave_up', { enrollment_id: s.enrollment_id, attempts: attempt, fix: 'check Mandrill, then re-run with broken_alert_attempts = 0' }, r.errorClass);
  else log('warn', 'inbox_broken_alert_failed', { enrollment_id: s.enrollment_id, attempts: attempt }, r.errorClass);
  return 0;
}

/** Mark new broken spells, then send each spell's one alert. Returns how many alerts went out. */
export async function sendBrokenAlerts(now = new Date(), deps: TestDeps = {}): Promise<number> {
  if (!(await testsEnabled(deps.read))) return 0;
  await sequelize.query(
    `UPDATE job_search_inboxes SET broken_since = last_test_at WHERE broken_since IS NULL AND verified_at IS NOT NULL
       AND last_test_at IS NOT NULL AND last_test_ms IS NULL AND last_test_at < :cut`, { replacements: { cut: new Date(now.getTime() - BROKEN_AFTER_MS) } });
  const [rows] = await sequelize.query(
    `SELECT i.id, i.enrollment_id, i.broken_since, e.email, e.full_name FROM job_search_inboxes i JOIN enrollments e ON e.id = i.enrollment_id
      WHERE i.broken_since IS NOT NULL AND i.broken_alerted_at IS NULL AND i.broken_alert_attempts < ${MAX_ALERT_ATTEMPTS} ORDER BY i.broken_since LIMIT 100`);
  let sent = 0;
  for (const s of rows as Spell[]) {
    try { sent += await alertOne(s, now, deps); } catch (err) { log('warn', 'inbox_broken_alert_failed', { enrollment_id: s.enrollment_id }, (err as Error)?.name || 'DatabaseError'); }
  }
  return sent;
}

let started = false;
/** Registers both passes once per process (boot/placementBoot.ts SCHEDULERS). */
export function startInboxTestCron(): void {
  if (started) return;
  started = true;
  const pass = (name: string, run: () => Promise<number>) => () => {
    run().then((n) => { if (n) log('info', name, { count: n }); }).catch((err) => log('warn', `${name}_pass_failed`, {}, (err as Error)?.name || 'DatabaseError'));
  };
  cron.schedule('0 9 * * *', pass('inbox_tests_sent', () => runDailyTests()), { timezone: 'America/Chicago' });
  cron.schedule('*/15 8-20 * * *', pass('inbox_broken_alerts_sent', () => sendBrokenAlerts()), { timezone: 'America/Chicago' });
}
