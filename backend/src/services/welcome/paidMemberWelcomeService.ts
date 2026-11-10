/**
 * The welcome a new paying member gets (C10.18).
 *
 * Ali, on the ticket: "When someone pays for a membership they are placed automatically into that
 * month's batch (C10.13). Nothing then tells them what they just joined, when anything happens, or
 * what to do first."
 *
 * That was measured, not assumed. Traced on 2026-11-08: `grantMembership`, `reconcilePayment` and
 * `paymentSyncService` contain no email reference of any kind, and the only payment-triggered mail
 * in the tree, `sendEnrollmentConfirmation`, is reachable solely through the legacy `CB-` webhook
 * path, which `webhookController` returns early from for every `SUB-` reference. So a self-serve
 * paying member receives nothing today. This is a new email, not a correction to one.
 *
 * ── WHY A SWEEP AND NOT A CALL IN THE PAYMENT PATH ──
 *
 * Four writers perform the unpaid -> paid transition and the ticket requires exactly one email per
 * member. Calling a sender from each of the four would mean four call sites to keep in step, an
 * email send inside a payment transaction, and - specifically - a problem in `paymentSyncService`,
 * which is deliberately model-free because it writes raw SQL: importing a sender that reaches the
 * model layer is the exact import-graph break C10.13 hit and now pins with a tripwire.
 *
 * A sweep inverts that. It asks the database the only question that matters - "who is a paid,
 * placed member with no paid welcome on record" - so it covers all four writers, and any fifth
 * added later, without those writers knowing it exists. Nothing is added to the payment path, so a
 * mail outage cannot affect a payment. The cost is honest and small: the welcome arrives within a
 * sweep interval rather than in the same instant as the payment.
 *
 * ── IDEMPOTENCY ──
 *
 * The record IS the dedup. A `communication_logs` row with `metadata.event = 'paid_member_welcome'`
 * means this person has been welcomed, and `alreadyWelcomed(email, [PAID_MEMBER_WELCOME_EVENT])`
 * is checked per member before each send. Re-running the reconciliation sweeps, or this sweep,
 * sends nothing further - which is the ticket's own acceptance criterion.
 *
 * The per-event key is load-bearing. `alreadyWelcomed`'s default set means "already has a sign-in
 * link" and spans both free doors, so a paying ex-Explorer - who by definition already received
 * `open_house_welcome` - would be silently skipped by the default. Passing this event alone is
 * what prevents that, and `sendPortalWelcome.ts` carries the reasoning next to the parameter.
 *
 * ── FAILURE PATH ──
 *
 * Per member, never per run. One unreachable address, one missing cohort or one mail failure is
 * recorded against that member and the sweep continues. Every outcome is returned AND written to
 * `communication_logs`, so a failure is visible rather than swallowed - and a failed send writes
 * `status: 'failed'`, which the dedup does not count, so the next sweep retries it.
 *
 * ── THE SWITCH IS OFF BY DEFAULT, ON PURPOSE ──
 *
 * This is the one job in this subtree that sends unrecallable mail to paying customers without a
 * human in the loop. `PAID_MEMBER_WELCOME_ENABLED=true` turns it on, and until somebody has read
 * the rendered copy it stays off. `scripts/previewPaidMemberWelcome.ts` renders it to a file for
 * exactly that reading, and the sweep's own dry run names every member it would mail.
 */
import { Op } from 'sequelize';
import { Cohort, Enrollment } from '../../models';
import { env } from '../../config/env';
import { batchMonthOf } from '../batch/batchCohort';
import { formatBatchMonth, orientationOf } from '../batch/batchOrientation';
import { centralDateKey } from '../centralDate';
import { buildPaidMemberWelcomeCopy } from './paidMemberWelcomeCopy';
import { isFirstSessionPast, NEW_PAID_MEMBERS_SQL, parseWelcomeSince } from './paidMemberWelcomeCutoff';
import { alreadyWelcomed } from './sendPortalWelcome';

/** What this writes into `communication_logs.metadata.event`. Deliberately NOT in WELCOME_EVENTS. */
export const PAID_MEMBER_WELCOME_EVENT = 'paid_member_welcome';

const SERVICE = 'paid-member-welcome';

export type WelcomeOutcome =
  | 'sent'
  | 'would-send'
  | 'already-welcomed'
  | 'not-in-a-batch'
  | 'no-email'
  | 'disabled'
  | 'failed';

export interface PaidWelcomeRow {
  enrollmentId: string;
  email: string;
  batchLabel: string | null;
  orientation: string | null;
  hasRoom: boolean;
  outcome: WelcomeOutcome;
  error?: string;
}

export interface PaidWelcomeReport {
  executed: boolean;
  rows: PaidWelcomeRow[];
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: SERVICE, event,
    outcome: level === 'error' ? 'failure' : 'success', context,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** The portal base, trailing slash removed, matching how sendPortalWelcome builds its links. */
function portalBase(): string {
  return (env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/$/, '');
}

/**
 * The batch room's URL for an email, or null.
 *
 * `/portal/rooms/:roomId` takes the room ID, not the slug, so the room has to be resolved rather
 * than guessed from the cohort id. Non-fatal: a batch whose room does not exist yet still gets a
 * welcome, with the room paragraph dropped rather than a dead link printed.
 */
async function batchRoomUrl(cohort: Cohort): Promise<string | null> {
  try {
    const { ensureRoomForCohort } = await import('../communityRooms/cohortRoomService');
    const room = await ensureRoomForCohort(cohort as any);
    return room ? `${portalBase()}/portal/rooms/${encodeURIComponent(String((room as any).id))}` : null;
  } catch (err: any) {
    log('warn', 'room_url_unavailable', {
      cohort_id: (cohort as any)?.id ?? null,
      error_class: err?.name || 'Error',
      message: err?.message,
    });
    return null;
  }
}

/** Write the outcome where the dedup will read it next time. */
async function record(
  enrollment: any,
  subject: string,
  sent: boolean,
  messageId: string | null,
  error: string | null,
): Promise<void> {
  const { logCommunication } = await import('../communicationLogService');
  await logCommunication({
    channel: 'email',
    direction: 'outbound',
    delivery_mode: 'live',
    status: sent ? 'sent' : 'failed',
    to_address: String(enrollment.email),
    from_address: env.trainingWelcomeFromEmail,
    subject,
    provider: 'mandrill',
    provider_message_id: messageId,
    error_message: error,
    metadata: { event: PAID_MEMBER_WELCOME_EVENT, enrollment_id: String(enrollment.id) },
  } as any);
}

/**
 * Welcome one member. Never throws.
 *
 * Returns `not-in-a-batch` rather than mailing a member whose placement has not landed: the batch
 * room is `privacy: 'cohort'`, so a link to it before placement would be a link they cannot open,
 * and the email's whole subject is which batch they are in.
 */
export async function welcomeOnePaidMember(enrollment: any, execute: boolean): Promise<PaidWelcomeRow> {
  const base: PaidWelcomeRow = {
    enrollmentId: String(enrollment?.id ?? '(no id)'),
    email: String(enrollment?.email ?? ''),
    batchLabel: null,
    orientation: null,
    hasRoom: false,
    outcome: 'failed',
  };
  if (!base.email) return { ...base, outcome: 'no-email' };

  try {
    if (await alreadyWelcomed(base.email, [PAID_MEMBER_WELCOME_EVENT])) {
      return { ...base, outcome: 'already-welcomed' };
    }
  } catch (err: any) {
    // The same stance as sendPortalWelcome: an unknown idempotency state must not send. Mailing
    // somebody twice is worse than mailing them a sweep interval later.
    return { ...base, outcome: 'failed', error: `idempotency_check_failed: ${err?.message || err}` };
  }

  const cohort = enrollment.cohort_id ? await Cohort.findByPk(enrollment.cohort_id) : null;
  const monthKey = cohort ? batchMonthOf(cohort as any) : null;
  const batchLabel = monthKey ? formatBatchMonth(monthKey) : null;
  if (!cohort || !batchLabel) return { ...base, outcome: 'not-in-a-batch' };

  // Today in Central decides whether the November batch's 12 November exception still applies.
  const today = centralDateKey(Date.now());
  const computed = orientationOf(cohort as any, today);
  // Never tell anyone a first session that has already happened. The copy drops the line when the
  // label is null, which is the same honest degradation as a batch with no readable date.
  const orientation = computed && !isFirstSessionPast(computed.date, today) ? computed : null;
  const roomUrl = await batchRoomUrl(cohort);
  const copy = buildPaidMemberWelcomeCopy({
    fullName: enrollment.full_name,
    batchLabel,
    orientationLabel: orientation?.label ?? null,
    roomUrl,
    portalUrl: `${portalBase()}/portal`,
  });

  const row: PaidWelcomeRow = {
    ...base,
    batchLabel,
    orientation: orientation?.label ?? null,
    hasRoom: Boolean(roomUrl),
  };
  if (!execute) return { ...row, outcome: 'would-send' };

  try {
    const { guardedSendMail, resolveEmailRecipient } = await import('../emailService');
    // NO `neverRedirect` here, and that is deliberate. `sendTrainingWelcome` passes it because its
    // body carries a magic-link sign-in token, which must never be redirected into somebody else's
    // inbox. This email carries no credential - only portal links that require a login - so it
    // SHOULD honour the test sink like ordinary mail.
    const to = await resolveEmailRecipient(base.email, copy.subject);
    const info = await guardedSendMail({
      from: env.trainingWelcomeFromEmail,
      replyTo: env.trainingWelcomeFromEmail,
      to: to.to,
      subject: to.subject,
      html: copy.html,
      text: copy.text,
      // No List-Unsubscribe: this is transactional, and that header trips inbox-manager rules
      // that archive the mail out of the recipient's inbox. Same reasoning as the training welcome.
      headers: { 'X-MC-Tags': 'paid-member-welcome' },
    });
    const messageId = info?.messageId ? String(info.messageId) : null;
    // The kill switch in guardedSendMail returns a stub with an empty messageId, so this is also
    // how "the switch was on and nothing went out" is detected.
    const sent = Boolean(messageId);
    await record(enrollment, copy.subject, sent, messageId, sent ? null : 'no_message_id');
    log(sent ? 'info' : 'warn', sent ? 'welcomed' : 'send_returned_no_message_id', {
      enrollment_id: row.enrollmentId, batch: batchLabel, has_room: row.hasRoom,
    });
    return { ...row, outcome: sent ? 'sent' : 'failed', error: sent ? undefined : 'no_message_id' };
  } catch (err: any) {
    const error = `${err?.name || 'Error'}: ${err?.message || String(err)}`;
    try {
      await record(enrollment, copy.subject, false, null, error);
    } catch {
      // Recording the failure failed too. The thrown error is already being returned and logged;
      // swallowing this one keeps the sweep moving rather than losing the remaining members.
    }
    log('error', 'welcome_failed', { enrollment_id: row.enrollmentId, error_class: err?.name || 'Error', message: err?.message });
    return { ...row, outcome: 'failed', error };
  }
}

/**
 * Every NEW paid, active member who has not been welcomed yet: new meaning first paid at or after
 * `PAID_MEMBER_WELCOME_SINCE` (see `paidMemberWelcomeCutoff.ts`).
 *
 * Ordered oldest first so a backlog is cleared in the order people paid, and capped so one run
 * cannot empty a large backlog into the mail provider in one burst.
 *
 * `opts.since` overrides the env cutoff, for a dry run that asks "who would a given cutoff mail".
 * A dry run with no cutoff at all lists every paid member, for inspection; an EXECUTE with no
 * readable cutoff refuses, because no cutoff would mean mailing everyone.
 */
export async function runPaidMemberWelcomeSweep(
  opts: { execute?: boolean; limit?: number; since?: string } = {},
): Promise<PaidWelcomeReport> {
  const execute = opts.execute === true;
  const limit = Number.isFinite(opts.limit as number) && (opts.limit as number) > 0 ? Number(opts.limit) : 50;
  const disabled = (reason: string): PaidWelcomeReport => {
    log('warn', 'sweep_disabled', { reason });
    return { executed: false, rows: [{
      enrollmentId: '(none)', email: '', batchLabel: null, orientation: null,
      hasRoom: false, outcome: 'disabled', error: reason,
    }] };
  };

  if (execute && !env.paidMemberWelcomeEnabled) return disabled('PAID_MEMBER_WELCOME_ENABLED is not true');
  const since = parseWelcomeSince(opts.since ?? env.paidMemberWelcomeSince);
  if (execute && !since) return disabled('PAID_MEMBER_WELCOME_SINCE is missing or not an ISO timestamp with a zone');

  const and: any[] = [
    { payment_status: 'paid' },
    { status: 'active' },
    { cohort_id: { [Op.ne]: null } },
    { email: { [Op.ne]: null } },
  ];
  if (since) {
    const { sequelize } = await import('../../config/database');
    const found = (await sequelize.query(NEW_PAID_MEMBERS_SQL, {
      replacements: { since: since.toISOString(), limit },
      type: 'SELECT',
    })) as Array<{ id: string }>;
    if (!found.length) return { executed: execute, rows: [] };
    and.push({ id: { [Op.in]: found.map((r) => String(r.id)) } });
  }

  const members = await Enrollment.findAll({
    where: { [Op.and]: and } as any,
    order: [['enrolled_at', 'ASC'], ['id', 'ASC']],
    limit,
  });

  const rows: PaidWelcomeRow[] = [];
  for (const member of members || []) {
    rows.push(await welcomeOnePaidMember(member, execute));
  }
  return { executed: execute, rows };
}
