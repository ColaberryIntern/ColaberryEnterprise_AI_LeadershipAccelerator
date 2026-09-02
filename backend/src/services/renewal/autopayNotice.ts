/**
 * Tell every member who is on a standing schedule that they are on one. Once.
 *
 * ── WHY THIS IS A JOB AND NOT A SCRIPT ──────────────────────────────────────
 *
 * The 2026-09-01 migration put 20 members onto PaySimple schedules and told none
 * of them. A one-off mail would have fixed those 20 and left the same hole open
 * for everyone who gains a schedule afterwards, which is every future member once
 * checkout creates schedules at first payment.
 *
 * So the rule is stated as a standing obligation instead: a member on a schedule
 * who has never been told gets told on the next run. The backfill and the ongoing
 * process are the same code, and nothing has to remember to run a script.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 *
 * Recorded in `subscription_renewal_reminders` under its own kind, reusing that
 * table's unique (subscription_id, period_end, reminder_kind) index and its
 * claim-then-commit pattern, so a double fire or a container restart mid run
 * cannot double send.
 *
 * The SELECT additionally excludes any subscription that has EVER been sent this
 * kind, at any period_end. The unique index alone would let the notice go out
 * again next period, and "your membership now renews automatically" is only true
 * as news once.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
 *
 * The charge date and amount come from the GATEWAY, never from our subscriptions
 * table. The book records what we intended; the gateway records what will
 * actually be taken, and for the August cohort those differ by a month by design.
 * A member with no live schedule at the gateway is skipped rather than guessed
 * at: telling someone a wrong date is worse than telling them nothing.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { apiRequest } from '../paysimpleService';
import { renderAutopayNoticeEmail, AUTOPAY_NOTICE_SUBJECT } from './autopayNoticeEmail';
import { SUPPORT_REPLY_TO } from './renewalReminderEmail';
import { buildTransport, guardedSend, ledgerExists } from './renewalReminderService';

/** Its own reminder kind, so it shares the ledger without colliding with the
 *  period reminders. Fits the column's VARCHAR(24). */
export const AUTOPAY_NOTICE_KIND = 'autopay_enabled';

function log(event: string, fields: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'autopay-notice', event, ...fields,
  }));
}

export interface AutopayNoticeRow {
  subscription_id: string;
  enrollment_id: string;
  full_name: string | null;
  email: string;
  plan: string;
  amount_cents: number;
  period_end: string;
  schedule_id: string;
}

/**
 * Members on a schedule who have never been sent this notice.
 *
 * DISTINCT ON (enrollment_id) because a manual renewal leaves the old period row
 * active too. Iterating rows instead of people would mail the same member twice
 * in one run, once per row.
 */
export const AUTOPAY_NOTICE_SELECT = `
  SELECT DISTINCT ON (s.enrollment_id)
         s.id::text            AS subscription_id,
         s.enrollment_id::text AS enrollment_id,
         e.full_name, e.email, s.plan, s.amount_cents,
         s.current_period_end::text AS period_end,
         s.paysimple_schedule_id    AS schedule_id
    FROM subscriptions s
    JOIN enrollments e ON e.id = s.enrollment_id
   WHERE s.paysimple_schedule_id IS NOT NULL
     AND s.status IN ('active', 'past_due')
     AND s.plan <> 'comp'
     AND e.email IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM subscription_renewal_reminders r
            WHERE r.subscription_id = s.id
              AND r.reminder_kind = '${AUTOPAY_NOTICE_KIND}')
   ORDER BY s.enrollment_id, s.current_period_end DESC`;

export async function selectAutopayNoticesDue(): Promise<AutopayNoticeRow[]> {
  return (await sequelize.query(AUTOPAY_NOTICE_SELECT, { type: QueryTypes.SELECT })) as AutopayNoticeRow[];
}

/** scheduleId -> { next charge date, amount }, straight from PaySimple. */
export async function gatewayScheduleFacts(): Promise<Map<string, { date: string; amount_cents: number; status: string }>> {
  const out = new Map<string, { date: string; amount_cents: number; status: string }>();
  for (let page = 1; page <= 20; page++) {
    const res = await apiRequest<any>('GET', `/v4/recurringpayment?page=${page}&pagesize=200`);
    const rows: any[] = Array.isArray(res) ? res : (res?.Response ?? []);
    if (!rows.length) break;
    for (const r of rows) {
      const date = String(r?.NextScheduledPaymentDate || r?.StartDate || '').slice(0, 10);
      out.set(String(r?.Id), {
        date,
        amount_cents: Math.round(Number(r?.PaymentAmount || 0) * 100),
        status: String(r?.ScheduleStatus || ''),
      });
    }
    if (rows.length < 200) break;
  }
  return out;
}

async function claim(row: AutopayNoticeRow): Promise<boolean> {
  const [, affected] = await sequelize.query(
    `INSERT INTO subscription_renewal_reminders
       (subscription_id, enrollment_id, period_end, reminder_kind, recipient_email, amount_cents)
     VALUES (:sid, :eid, :pe, :kind, :email, :amt)
     ON CONFLICT DO NOTHING`,
    {
      replacements: {
        sid: row.subscription_id, eid: row.enrollment_id, pe: row.period_end,
        kind: AUTOPAY_NOTICE_KIND, email: row.email, amt: row.amount_cents,
      },
      type: QueryTypes.INSERT,
    },
  );
  return affected === 1;
}

async function commit(row: AutopayNoticeRow, messageId: string | null): Promise<void> {
  await sequelize.query(
    `UPDATE subscription_renewal_reminders
        SET status = 'sent', sent_at = NOW(), message_id = :mid
      WHERE subscription_id = :sid AND period_end = :pe AND reminder_kind = :kind`,
    { replacements: { sid: row.subscription_id, pe: row.period_end, kind: AUTOPAY_NOTICE_KIND, mid: messageId }, type: QueryTypes.UPDATE },
  );
}

/** Release a claim when the send never happened, so the next run retries it. */
async function release(row: AutopayNoticeRow, error: string, errorClass: string): Promise<void> {
  await sequelize.query(
    `DELETE FROM subscription_renewal_reminders
      WHERE subscription_id = :sid AND period_end = :pe AND reminder_kind = :kind AND status = 'claimed'`,
    { replacements: { sid: row.subscription_id, pe: row.period_end, kind: AUTOPAY_NOTICE_KIND }, type: QueryTypes.DELETE },
  );
  log('notice_released', { outcome: 'failure', error_class: errorClass, error, to: redactForLogs(row.email) }, 'error');
}

export interface AutopayNoticeRunOptions {
  /** Default false. Without it nothing is written and nothing is mailed. */
  send?: boolean;
  /** Restrict to one address, for a careful first live send. */
  onlyEmail?: string | null;
  /** Addresses to skip entirely, for members who need a personal note instead. */
  skipEmails?: string[];
}

export interface AutopayNoticeRunResult {
  considered: number;
  planned: Array<{ email: string; name: string | null; charge_date: string; amount_cents: number }>;
  sent: number;
  skipped: Array<{ email: string; reason: string }>;
  failed: number;
}

export async function runAutopayNotices(opts: AutopayNoticeRunOptions = {}): Promise<AutopayNoticeRunResult> {
  const result: AutopayNoticeRunResult = { considered: 0, planned: [], sent: 0, skipped: [], failed: 0 };
  if (!(await ledgerExists())) {
    log('ledger_missing', { outcome: 'failure' }, 'error');
    return result;
  }

  const only = (opts.onlyEmail || '').trim().toLowerCase();
  const skip = new Set((opts.skipEmails || []).map((e) => e.trim().toLowerCase()).filter(Boolean));

  let rows = await selectAutopayNoticesDue();
  result.considered = rows.length;
  if (only) rows = rows.filter((r) => r.email.toLowerCase() === only);

  let facts: Map<string, { date: string; amount_cents: number; status: string }>;
  try {
    facts = await gatewayScheduleFacts();
  } catch (err: any) {
    // No gateway means no trustworthy date. Send nothing rather than guess.
    log('gateway_unavailable', { outcome: 'failure', error_class: classifyError(err), error: err?.message }, 'error');
    return result;
  }

  const transport = opts.send ? buildTransport() : null;

  for (const row of rows) {
    const email = row.email.toLowerCase();
    if (skip.has(email)) { result.skipped.push({ email: row.email, reason: 'held_for_personal_note' }); continue; }

    const fact = facts.get(String(row.schedule_id));
    if (!fact || !fact.date) { result.skipped.push({ email: row.email, reason: 'no_live_schedule_at_gateway' }); continue; }
    if (fact.status && fact.status.toLowerCase() !== 'active') {
      result.skipped.push({ email: row.email, reason: `schedule_${fact.status.toLowerCase()}` });
      continue;
    }

    const mail = renderAutopayNoticeEmail({
      full_name: row.full_name,
      email: row.email,
      plan: row.plan,
      amount_cents: fact.amount_cents || row.amount_cents,
      next_charge_iso: fact.date,
    });

    result.planned.push({
      email: row.email, name: row.full_name,
      charge_date: fact.date, amount_cents: fact.amount_cents || row.amount_cents,
    });

    if (!opts.send || !transport) continue;

    if (!(await claim(row))) { result.skipped.push({ email: row.email, reason: 'already_claimed' }); continue; }
    try {
      const sent = await guardedSend(transport, {
        from: `Ali Muwwakkil <${SUPPORT_REPLY_TO}>`,
        to: row.email,
        replyTo: SUPPORT_REPLY_TO,
        subject: AUTOPAY_NOTICE_SUBJECT,
        text: mail.text,
        html: mail.html,
        headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'X-MC-AutoHtml': 'false', 'X-MC-Tags': 'autopay-disclosure' },
      });
      if (!sent) { await release(row, 'blocked by a send guard', 'Blocked'); continue; }
      await commit(row, sent.messageId);
      result.sent += 1;
      log('notice_sent', { outcome: 'success', to: redactForLogs(row.email), charge_date: fact.date });
    } catch (err: any) {
      result.failed += 1;
      await release(row, String(err?.message || err), classifyError(err));
    }
  }

  return result;
}
