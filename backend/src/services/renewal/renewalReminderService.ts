/**
 * Renewal reminders - the stopgap for a platform with no recurring billing.
 *
 * Finds active paid subscriptions approaching `current_period_end`, mints (or
 * reuses) a hosted checkout link through the EXISTING startCheckout path, and
 * mails the student one short note so they can renew themselves. It does not
 * charge anybody: a student clicking a checkout link authorizes that charge
 * themselves, which sidesteps the authorization question entirely. Converting
 * an existing one-time authorization into a standing schedule needs notice,
 * opt-out, and NACHA affirmative consent for the ACH subscribers. That is a
 * business decision and is out of scope here.
 *
 * See docs/RECURRING_BILLING_EXPOSURE.md for the measured exposure and the
 * traps this deliberately avoids.
 *
 * DRY RUN BY DEFAULT. `runRenewalReminders()` with no options writes nothing,
 * calls no external API, and sends no mail. Only `{ send: true }` does anything.
 *
 * Failure-first (CLAUDE.md):
 *  - What happens if it fails? One student's checkout or send throws; that
 *    student is recorded as failed and the loop continues to the next. A run
 *    never aborts partway through the book.
 *  - Retry? None in-process. The job is daily and idempotent, so tomorrow's run
 *    naturally retries anything that failed today, still inside the lead window.
 *  - Recovery if retries are exhausted? The period lapses and the subscription
 *    appears in the next run's `already_lapsed` skip list, which is the signal
 *    for a human.
 *  - Handled: transport errors, PaySimple errors, malformed rows, duplicate
 *    runs, concurrent runs. Not handled: a hosted link that PaySimple expires
 *    before the student clicks it (the next kind's reminder mints a fresh one
 *    only if the stored one is gone; see resolveCheckout).
 */

import { QueryTypes } from 'sequelize';
import nodemailer from 'nodemailer';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { isDev } from '../../config/featureFlags';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { isKillSwitchActive } from '../launchSafety';
import { decideDevEmailRouting } from '../devEmailGuard';
import { getTestOverrides } from '../settingsService';
import { startCheckout } from '../subscriptionService';
import type { SubscriptionPlan } from '../../models/Subscription';
import {
  selectRenewalReminders,
  type DueReminder,
  type RenewalSubscriptionRow,
  type SelectionResult,
} from './renewalReminderSelection';
import { renderRenewalReminderEmail } from './renewalReminderEmail';
import { validateRenewalEmailStyle } from './renewalReminderStyle';

const FROM = '"Ali Muwwakkil" <ali@colaberry.com>';
const SERVICE = 'renewal-reminders';

/** Placeholder shown in a dry run in place of a real hosted link. A dry run
 *  must not POST to PaySimple, so there is no real URL to show; this keeps the
 *  shape visible without pretending it is clickable. */
export const DRY_RUN_LINK = 'https://sandbox.paysimple.com/checkout/DRY-RUN-NO-LINK-MINTED';

// ---------------------------------------------------------------- structured logs

type Outcome = 'success' | 'failure' | 'partial';

function log(event: string, fields: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info'): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    event,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

// ------------------------------------------------------------------- the ledger

/**
 * (subscription_id, period_end, reminder_kind) is the idempotency key, enforced
 * by a unique index rather than by a SELECT-then-INSERT, because two operators
 * or two containers running this at once must not both win the race.
 *
 * Claim then commit: the row is inserted as 'claimed' BEFORE the SMTP call and
 * upgraded to 'sent' after. A crash in between leaves a claim, and a claim
 * blocks the recipient exactly as firmly as a completed send. That is
 * deliberate. On an ambiguous outcome we would rather skip a student than mail
 * a paying customer about their money twice.
 *
 * period_end is part of the key rather than a date bucket so that next month's
 * period is a different key and gets its own pair of reminders, automatically.
 */
const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS subscription_renewal_reminders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID         NOT NULL,
  enrollment_id    UUID,
  period_end       TIMESTAMPTZ  NOT NULL,
  reminder_kind    VARCHAR(24)  NOT NULL,
  recipient_email  VARCHAR(255) NOT NULL,
  payment_ref      VARCHAR(120),
  payment_link     TEXT,
  amount_cents     INTEGER,
  applied_credit_cents INTEGER,
  status           VARCHAR(20)  NOT NULL DEFAULT 'claimed',
  message_id       TEXT,
  error            TEXT,
  error_class      VARCHAR(60),
  claimed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at          TIMESTAMPTZ
)`;

const LEDGER_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS subscription_renewal_reminders_unique
  ON subscription_renewal_reminders (subscription_id, period_end, reminder_kind)`;

const LEDGER_LOOKUP_INDEX = `
CREATE INDEX IF NOT EXISTS subscription_renewal_reminders_period
  ON subscription_renewal_reminders (subscription_id, period_end)`;

/** Prod does not run sequelize.sync; every table is created explicitly. */
export async function ensureRenewalReminderSchema(): Promise<void> {
  await sequelize.query(LEDGER_DDL);
  await sequelize.query(LEDGER_INDEX);
  await sequelize.query(LEDGER_LOOKUP_INDEX);
}

export async function ledgerExists(): Promise<boolean> {
  const rows = (await sequelize.query(
    `SELECT to_regclass('public.subscription_renewal_reminders') AS t`,
    { type: QueryTypes.SELECT },
  )) as Array<{ t: string | null }>;
  return !!rows[0]?.t;
}

interface LedgerRow {
  reminder_kind: string;
  status: string;
  sent_at: Date | null;
  payment_link: string | null;
  payment_ref: string | null;
}

/** Every reminder row already recorded for this subscription's current period,
 *  across all kinds. One query answers both "have we sent this one?" and "is
 *  there a link from the earlier reminder we should reuse?". */
export async function ledgerRowsForPeriod(subscriptionId: string, periodEnd: string): Promise<LedgerRow[]> {
  return (await sequelize.query(
    `SELECT reminder_kind, status, sent_at, payment_link, payment_ref
       FROM subscription_renewal_reminders
      WHERE subscription_id = :sid AND period_end = :pe`,
    { replacements: { sid: subscriptionId, pe: periodEnd }, type: QueryTypes.SELECT },
  )) as LedgerRow[];
}

/** @returns true when this run won the claim and may send. */
async function claim(r: DueReminder, checkout: ResolvedCheckout): Promise<boolean> {
  const [, affected] = await sequelize.query(
    `INSERT INTO subscription_renewal_reminders
       (subscription_id, enrollment_id, period_end, reminder_kind, recipient_email,
        payment_ref, payment_link, amount_cents, applied_credit_cents)
     VALUES (:sid, :eid, :pe, :kind, :email, :ref, :link, :amt, :credit)
     ON CONFLICT DO NOTHING`,
    {
      replacements: {
        sid: r.subscription_id, eid: r.enrollment_id, pe: r.period_end, kind: r.kind,
        email: r.email, ref: checkout.payment_ref, link: checkout.payment_link,
        amt: r.amount_cents, credit: checkout.applied_credit_cents,
      },
      type: QueryTypes.INSERT,
    },
  );
  return affected === 1;
}

async function commit(r: DueReminder, messageId: string | null): Promise<void> {
  await sequelize.query(
    `UPDATE subscription_renewal_reminders
        SET status = 'sent', sent_at = NOW(), message_id = :mid
      WHERE subscription_id = :sid AND period_end = :pe AND reminder_kind = :kind`,
    { replacements: { sid: r.subscription_id, pe: r.period_end, kind: r.kind, mid: messageId }, type: QueryTypes.UPDATE },
  );
}

/**
 * Only called when the transport itself threw, which means the mail never left
 * this process. A timeout AFTER handoff is not this case and must keep its
 * claim, because the message may well have been delivered.
 */
async function release(r: DueReminder, err: unknown): Promise<void> {
  await sequelize.query(
    `DELETE FROM subscription_renewal_reminders
      WHERE subscription_id = :sid AND period_end = :pe AND reminder_kind = :kind AND status = 'claimed'`,
    { replacements: { sid: r.subscription_id, pe: r.period_end, kind: r.kind }, type: QueryTypes.DELETE },
  ).catch((e: any) => log('ledger_release_failed', { subscription_id: r.subscription_id, error_class: classifyError(e) }, 'error'));
  log('claim_released', { subscription_id: r.subscription_id, kind: r.kind, error_class: classifyError(err) }, 'warn');
}

// ------------------------------------------------------------------ loading rows

/**
 * Every active subscription with the person attached. Deliberately unfiltered
 * beyond `status = 'active'`: the exclusions live in the pure selector so they
 * are testable, and so a dry run can report what it refused and why.
 *
 * The enrollment columns are carried for that reason. `subscriptions.status`
 * describes a paid term, not a person, and nothing retires it when a student
 * withdraws or is moved to a later cohort, so the selector needs the
 * enrollment's own lifecycle to decide whether this human should be mailed.
 */
export async function loadActiveSubscriptions(): Promise<RenewalSubscriptionRow[]> {
  return (await sequelize.query(
    `SELECT s.id, s.enrollment_id, s.plan, s.status, s.amount_cents,
            s.current_period_end, s.canceled_at,
            e.email, e.full_name,
            e.status AS enrollment_status,
            e.access_starts_at,
            e.notifications_paused_at
       FROM subscriptions s
       JOIN enrollments e ON e.id = s.enrollment_id
      WHERE s.status = 'active'`,
    { type: QueryTypes.SELECT },
  )) as RenewalSubscriptionRow[];
}

// -------------------------------------------------------------- checkout linking

export interface ResolvedCheckout {
  payment_link: string;
  payment_ref: string | null;
  applied_credit_cents: number;
  reused: boolean;
}

/**
 * The checkout link this reminder points at.
 *
 * Reuses the link minted for an EARLIER reminder in the same period when there
 * is one. That is not just tidiness: startCheckout creates a pending
 * subscription row per call, and appPaymentReconcileService cancels sibling
 * pending rows as "duplicate checkout submission (reconcile)". Minting a second
 * link for the final reminder would put two pending rows on one enrollment and
 * hand the reconciler a genuine duplicate to resolve, which is risk 4 in the
 * exposure doc. One link per (subscription, period) removes the condition
 * entirely, and it means both emails send the student to the same page.
 *
 * Only called on a live send. A dry run never reaches here, because minting a
 * link is a write to PaySimple and an INSERT into subscriptions.
 */
export async function resolveCheckout(r: DueReminder, priorRows: LedgerRow[]): Promise<ResolvedCheckout> {
  const prior = priorRows.find((row) => !!row.payment_link && row.payment_link !== DRY_RUN_LINK);
  if (prior?.payment_link) {
    // Only reuse while the row that link points at is still awaiting payment.
    // If it went active the student already paid, and the selector would have
    // called this subscription superseded on the next run anyway.
    const stillPending = (await sequelize.query(
      `SELECT 1 FROM subscriptions WHERE payment_ref = :ref AND status = 'pending'`,
      { replacements: { ref: prior.payment_ref }, type: QueryTypes.SELECT },
    )) as unknown[];
    if (!prior.payment_ref || stillPending.length > 0) {
      return {
        payment_link: prior.payment_link,
        payment_ref: prior.payment_ref,
        applied_credit_cents: 0,
        reused: true,
      };
    }
  }

  const result = await startCheckout(r.enrollment_id, r.plan as SubscriptionPlan);
  if (!result.ok) {
    throw Object.assign(new Error(`startCheckout refused: ${result.reason}${result.message ? ` (${result.message})` : ''}`), {
      error_class: result.reason === 'billing_unconfigured' ? 'ConfigError' : 'UpstreamUnavailable',
    });
  }
  return {
    payment_link: result.payment_link,
    payment_ref: null,   // startCheckout does not hand the ref back; the link is the artifact
    applied_credit_cents: Math.round((result.full_amount - result.amount) * 100),
    reused: false,
  };
}

// ------------------------------------------------------------------- the transport

function buildTransport(): nodemailer.Transporter {
  if (!env.mandrillApiKey) {
    throw Object.assign(new Error('MANDRILL_API_KEY is not set. Refusing to attempt a send.'), { error_class: 'ConfigError' });
  }
  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: { user: process.env.MANDRILL_USERNAME || 'apikey', pass: env.mandrillApiKey },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
}

/**
 * Send, honouring the two global safety nets every other outbound path in this
 * codebase honours: the launch kill switch, and the dev-environment guard that
 * stops a dev container mailing a real customer. Returns null when a guard
 * blocked the message, which the caller treats as "not sent" and releases.
 */
async function guardedSend(
  transport: nodemailer.Transporter,
  options: nodemailer.SendMailOptions,
): Promise<{ messageId: string | null } | null> {
  if (await isKillSwitchActive()) {
    log('send_blocked', { reason: 'kill_switch', to: redactForLogs(String(options.to ?? '')) }, 'warn');
    return null;
  }
  if (isDev) {
    let sink = (process.env.DEV_EMAIL_SINK || '').trim();
    if (!sink) {
      try {
        const test = await getTestOverrides();
        if (test.email) sink = test.email;
      } catch { /* settings unreadable, fall through and fail closed below */ }
    }
    const decision = decideDevEmailRouting(options as any, sink || null, true);
    if (decision.action === 'block') {
      log('send_blocked', { reason: 'dev_email_guard', to: redactForLogs(decision.originalRecipients) }, 'warn');
      return null;
    }
    if (decision.action === 'redirect') {
      log('send_redirected', { reason: 'dev_email_guard', sink: redactForLogs(sink) }, 'warn');
      options = decision.options as nodemailer.SendMailOptions;
    }
  }
  const info = await transport.sendMail(options);
  return { messageId: (info as any)?.messageId ?? null };
}

// ----------------------------------------------------------------------- the run

export interface RenewalRunOptions {
  /** Default false. Without it nothing is written, minted, or mailed. */
  send?: boolean;
  /** Restrict to one address, for a careful first live send. */
  onlyEmail?: string | null;
  /** Injectable clock, so the window can be tested without waiting for a date. */
  nowMs?: number;
}

export interface PlannedReminder {
  reminder: DueReminder;
  subject: string;
  text: string;
  html: string;
  payment_link: string;
  applied_credit_cents: number;
  reused_link: boolean;
}

export interface RenewalRunSummary {
  dry_run: boolean;
  now: string;
  considered: number;
  due: number;
  skipped_already_sent: number;
  planned: PlannedReminder[];
  sent: number;
  failed: Array<{ subscription_id: string; email: string; error_class: string; message: string }>;
  selection: SelectionResult;
  outcome: Outcome;
}

/**
 * One pass over the book.
 *
 * A dry run stops after selection and rendering: it reports exactly who would
 * be mailed, with a placeholder in place of the hosted link, and touches
 * nothing. It does not even create the ledger table, so a dry run against a
 * fresh database is still a read-only operation.
 */
export async function runRenewalReminders(opts: RenewalRunOptions = {}): Promise<RenewalRunSummary> {
  const send = opts.send === true;
  const nowMs = opts.nowMs ?? Date.now();
  const startedAt = Date.now();

  const rows = await loadActiveSubscriptions();
  const selection = selectRenewalReminders(rows, nowMs, { onlyEmail: opts.onlyEmail ?? null });

  const summary: RenewalRunSummary = {
    dry_run: !send,
    now: new Date(nowMs).toISOString(),
    considered: rows.length,
    due: selection.due.length,
    skipped_already_sent: 0,
    planned: [],
    sent: 0,
    failed: [],
    selection,
    outcome: 'success',
  };

  log('run_started', { dry_run: !send, considered: rows.length, due: selection.due.length });

  if (send) await ensureRenewalReminderSchema();
  const haveLedger = send ? true : await ledgerExists();
  const transport = send ? buildTransport() : null;

  for (const reminder of selection.due) {
    try {
      // 1. Has this exact (subscription, period, kind) already gone out? This is
      //    the check that makes a same-day re-run send zero emails.
      const priorRows = haveLedger ? await ledgerRowsForPeriod(reminder.subscription_id, reminder.period_end) : [];
      const already = priorRows.find((row) => row.reminder_kind === reminder.kind);
      if (already) {
        summary.skipped_already_sent += 1;
        log('reminder_skipped', {
          subscription_id: reminder.subscription_id, kind: reminder.kind,
          reason: `already ${already.status}`, outcome: 'success',
        });
        continue;
      }

      // 2. The link. A dry run never mints one.
      const checkout: ResolvedCheckout = send
        ? await resolveCheckout(reminder, priorRows)
        : { payment_link: DRY_RUN_LINK, payment_ref: null, applied_credit_cents: 0, reused: false };

      // 3. The words.
      const email = renderRenewalReminderEmail({
        full_name: reminder.full_name,
        email: reminder.email,
        plan: reminder.plan,
        kind: reminder.kind,
        period_end: reminder.period_end,
        amount_cents: reminder.amount_cents,
        applied_credit_cents: checkout.applied_credit_cents,
        payment_link: checkout.payment_link,
        day_delta: reminder.day_delta,
      });

      // Style gate before anything is sent or even shown as final copy. A
      // violation here is a build defect, not a runtime condition.
      validateRenewalEmailStyle(email.html, email.text);

      summary.planned.push({
        reminder,
        subject: email.subject,
        text: email.text,
        html: email.html,
        payment_link: checkout.payment_link,
        applied_credit_cents: checkout.applied_credit_cents,
        reused_link: checkout.reused,
      });

      if (!send) continue;

      // 4. Claim, then send, then commit.
      const won = await claim(reminder, checkout);
      if (!won) {
        summary.skipped_already_sent += 1;
        log('reminder_skipped', { subscription_id: reminder.subscription_id, kind: reminder.kind, reason: 'claimed by a concurrent run', outcome: 'success' });
        continue;
      }

      let result: { messageId: string | null } | null;
      try {
        result = await guardedSend(transport!, {
          from: FROM,
          to: reminder.email,
          replyTo: 'ali@colaberry.com',
          bcc: 'ali@colaberry.com',
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'X-MC-Tags': 'renewal-reminder' },
        });
      } catch (err) {
        // The transport threw, so the message never left. Give the claim back
        // so tomorrow's run can try again inside the same lead window.
        await release(reminder, err);
        throw err;
      }

      if (!result) {
        // A guard blocked it. Nothing was delivered, so the claim must not
        // stand or the student would never be reminded once the guard clears.
        await release(reminder, new Error('blocked by a send guard'));
        continue;
      }

      await commit(reminder, result.messageId);
      summary.sent += 1;
      log('reminder_sent', {
        subscription_id: reminder.subscription_id, kind: reminder.kind,
        to: redactForLogs(reminder.email), period_end: reminder.period_end,
        amount_cents: reminder.amount_cents, reused_link: checkout.reused,
        outcome: 'success',
      });
    } catch (err: any) {
      // One student's failure must never stop the rest of the book.
      const error_class = err?.error_class || classifyError(err);
      summary.failed.push({
        subscription_id: reminder.subscription_id,
        email: reminder.email,
        error_class,
        message: String(err?.message || err),
      });
      log('reminder_failed', {
        subscription_id: reminder.subscription_id, kind: reminder.kind,
        to: redactForLogs(reminder.email), error_class,
        message: String(err?.message || err), outcome: 'failure',
      }, 'error');
    }
  }

  summary.outcome = summary.failed.length === 0 ? 'success' : (summary.sent > 0 || !send ? 'partial' : 'failure');
  log('run_finished', {
    dry_run: !send, considered: summary.considered, due: summary.due,
    planned: summary.planned.length, sent: summary.sent,
    already_sent: summary.skipped_already_sent, failed: summary.failed.length,
    lapsed: summary.selection.skipped.filter((s) => s.reason === 'already_lapsed').length,
    duration_ms: Date.now() - startedAt, outcome: summary.outcome,
  });

  return summary;
}
