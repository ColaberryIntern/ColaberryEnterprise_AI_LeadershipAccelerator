import { env } from '../../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../../emailService';
import { RecapSummary, RecapSummarySchema, NextEventUrlSchema, defaultSummary } from './recapContent';
import { buildRecapEmail, firstNameOf } from './recapEmail';
import { lintObject, LintViolation } from './recapLint';
import { loadRecipientPlan } from './recapRecipients';
import { mintOptOutToken, mintRecapToken } from './recapToken';
import * as store from './recapStore';

/**
 * Send the recap (WL1.3). Three modes:
 *  - dry:  counts only (to send, already sent, skipped by reason). Sends nothing, writes nothing.
 *  - test: one copy to Ali, then marks the recap as test-sent (Ali's pre-approval: the real send may
 *          go once a test copy has reached him).
 *  - send: everyone who checked in. Refused until a test went out. Idempotent: one row per (session,
 *          email); a row is claimed atomically before its mail goes, so a rerun or a double click can
 *          never mail anyone twice. Failed rows are retried on the next send, at most 3 attempts.
 * Failure handling: a provider error marks that row failed with its error class and the run continues;
 * the global email kill switch (guardedSendMail) stops everything.
 */
export const RECAP_FROM = process.env.WEEKLY_LIVE_RECAP_FROM || '"Ali Muwwakkil" <ali@colaberry.com>';
export const RECAP_TEST_TO = process.env.WEEKLY_LIVE_RECAP_TEST_TO || 'ali@colaberry.com';
const GAP_MS = 150;

export class RecapError extends Error {
  constructor(public status: number, public code: string, message: string, public violations: LintViolation[] = []) {
    super(message); this.name = 'RecapError';
  }
}

export interface RecapReady { session: store.SessionInfo; summary: RecapSummary; nextEventUrl: string }

/** Everything a send needs, validated; throws RecapError (400/404) with a reason the panel can show. */
export async function loadReady(sessionId: string): Promise<RecapReady> {
  const session = await store.getSession(sessionId);
  if (!session) throw new RecapError(404, 'not_found', 'Class not found');
  const recap = await store.getRecap(sessionId);
  const parsed = RecapSummarySchema.safeParse(recap?.summary ?? null);
  if (!parsed.success) throw new RecapError(400, 'no_summary', 'Draft or write the overview first');
  const url = NextEventUrlSchema.safeParse(recap?.next_event_url ?? '');
  if (!url.success) throw new RecapError(400, 'no_next_event', 'Paste the Eventbrite link for the next class (https)');
  const violations = lintObject(parsed.data);
  if (violations.length) throw new RecapError(400, 'content_rules', 'The overview breaks a content rule', violations);
  return { session, summary: parsed.data, nextEventUrl: url.data };
}

export function classDate(d: string): string {
  const dt = new Date(`${d}T12:00:00Z`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function links(sessionId: string, guestId: string, emailLower: string) {
  const base = String(env.frontendUrl || '').replace(/\/$/, '');
  return {
    recapUrl: `${base}/portal/class-recap/${sessionId}?t=${encodeURIComponent(mintRecapToken(sessionId, guestId))}`,
    unsubscribeUrl: `${base}/api/live/recap/unsubscribe?t=${encodeURIComponent(mintOptOutToken(emailLower))}`,
  };
}

async function deliver(to: string, subject: string, html: string, text: string, unsubscribeUrl: string) {
  const r = await resolveEmailRecipient(to, subject);
  const info = await guardedSendMail({
    from: RECAP_FROM, to: r.to, subject: r.subject, html, text,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'X-MC-Tags': 'weekly-live-recap' },
  });
  return String(info?.messageId ?? '');
}

export interface DryRun { toSend: number; alreadySent: number; skipped: Record<string, number>; checkedIn: number }

export async function dryRun(sessionId: string): Promise<DryRun> {
  const plan = await loadRecipientPlan(sessionId);
  const sent = await store.sentEmails(sessionId);
  const skipped: Record<string, number> = {};
  for (const s of plan.skipped) skipped[s.reason] = (skipped[s.reason] || 0) + 1;
  const toSend = plan.recipients.filter((r) => !sent.has(r.emailLower)).length;
  return { toSend, alreadySent: plan.recipients.length - toSend, skipped, checkedIn: plan.recipients.length + plan.skipped.length };
}

export async function sendTest(sessionId: string): Promise<{ to: string }> {
  const ready = await loadReady(sessionId);
  const l = links(sessionId, 'preview', RECAP_TEST_TO.toLowerCase());
  const mail = buildRecapEmail({ summary: ready.summary, firstName: 'Ali', classTitle: ready.session.title, classDate: classDate(ready.session.session_date), recapUrl: l.recapUrl, nextEventUrl: ready.nextEventUrl, unsubscribeUrl: l.unsubscribeUrl });
  await deliver(RECAP_TEST_TO, `[TEST] ${mail.subject}`, mail.html, mail.text, l.unsubscribeUrl);
  await store.markTestSent(sessionId);
  return { to: RECAP_TEST_TO };
}

export interface SendResult { sent: number; failed: number; skippedNow: number; alreadySent: number }

/**
 * Stable error classes for a failed delivery (CLAUDE.md: generic Error is not a classification).
 * nodemailer exposes the SMTP reply as responseCode and transport faults as code.
 */
export function classifySendError(e: unknown): string {
  const err = (e ?? {}) as { responseCode?: number; code?: string; name?: string };
  const rc = Number(err.responseCode);
  if (rc === 429 || rc === 421 || rc === 450 || rc === 451) return 'RateLimitError';
  if (rc >= 500 && rc < 600 && rc !== 550 && rc !== 553) return 'UpstreamUnavailable';
  if (rc === 550 || rc === 553 || (rc >= 400 && rc < 500)) return 'RecipientRejected';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EDNS', 'ECONNREFUSED'].includes(String(err.code))) return 'UpstreamUnavailable';
  if (String(err.code) === 'EAUTH') return 'AuthError';
  if (err.name === 'TimeoutError') return 'TimeoutError';
  return 'SendError';
}

const logSend = (outcome: string, errorClass: string, sessionId: string) =>
  console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'weekly_live.recap_send', outcome, error_class: errorClass, context: { session_id: sessionId } }));

/** Preview: the exact email the first attendee would get, rendered for Ali; nothing is sent or stored. */
export async function previewEmail(sessionId: string): Promise<{ subject: string; html: string }> {
  const ready = await loadReady(sessionId);
  const l = links(sessionId, 'preview', RECAP_TEST_TO.toLowerCase());
  const mail = buildRecapEmail({ summary: ready.summary, firstName: 'Ali', classTitle: ready.session.title, classDate: classDate(ready.session.session_date), recapUrl: l.recapUrl, nextEventUrl: ready.nextEventUrl, unsubscribeUrl: l.unsubscribeUrl });
  return { subject: mail.subject, html: mail.html };
}

export async function sendAll(sessionId: string, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<SendResult> {
  const ready = await loadReady(sessionId);
  const recap = await store.getRecap(sessionId);
  if (!recap?.test_sent_at) throw new RecapError(409, 'test_first', 'Send the test copy to Ali first');
  const plan = await loadRecipientPlan(sessionId);
  await store.ensureSendRows(sessionId, [
    ...plan.recipients.map((r) => ({ guestId: r.guestId, emailLower: r.emailLower, status: 'queued' as const })),
    ...plan.skipped.map((s) => ({ guestId: s.guestId, emailLower: s.emailLower, status: 'skipped' as const, skipReason: s.reason })),
  ]);
  const result: SendResult = { sent: 0, failed: 0, skippedNow: plan.skipped.length, alreadySent: 0 };
  for (const r of plan.recipients) {
    if (!(await store.claimSend(sessionId, r.emailLower))) { result.alreadySent++; continue; }
    const l = links(sessionId, r.guestId, r.emailLower);
    const mail = buildRecapEmail({ summary: ready.summary, firstName: firstNameOf(r.name), classTitle: ready.session.title, classDate: classDate(ready.session.session_date), recapUrl: l.recapUrl, nextEventUrl: ready.nextEventUrl, unsubscribeUrl: l.unsubscribeUrl });
    let messageId: string;
    try {
      messageId = await deliver(r.email, mail.subject, mail.html, mail.text, l.unsubscribeUrl);
    } catch (e) {
      const errorClass = classifySendError(e);
      await store.finishSend(sessionId, r.emailLower, false, { errorClass });
      logSend('failure', errorClass, sessionId);
      result.failed++;
      await sleep(GAP_MS);
      continue;
    }
    // Delivered. Recording it is a separate step on purpose: if this write fails, the row stays
    // claimed ('sending'), which no later run re-claims, so the person is never mailed twice.
    try {
      await store.finishSend(sessionId, r.emailLower, true, { messageId });
    } catch {
      logSend('partial', 'StateWriteError', sessionId);
    }
    result.sent++;
    await sleep(GAP_MS);
  }
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'weekly_live.recap_send', outcome: result.failed ? 'partial' : 'success', context: { session_id: sessionId, ...result } }));
  return result;
}

/** What the admin panel shows. */
export async function recapState(sessionId: string) {
  const session = await store.getSession(sessionId);
  if (!session) throw new RecapError(404, 'not_found', 'Class not found');
  const recap = await store.getRecap(sessionId);
  return {
    session: { id: session.id, title: session.title, date: session.session_date },
    summary: (recap?.summary as RecapSummary | null) ?? defaultSummary(session.title),
    hasSavedSummary: Boolean(recap?.summary),
    nextEventUrl: recap?.next_event_url ?? '',
    testSentAt: recap?.test_sent_at ?? null,
    counts: await store.sendCounts(sessionId),
    dry: await dryRun(sessionId),
  };
}
