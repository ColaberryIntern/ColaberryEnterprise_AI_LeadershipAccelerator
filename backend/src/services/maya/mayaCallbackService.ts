import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import CallbackRequest from '../../models/CallbackRequest';
import Enrollment from '../../models/Enrollment';
import Lead from '../../models/Lead';
import Visitor from '../../models/Visitor';

/**
 * C122 — "Have someone call me" from a signed-in portal learner, through Maya's DM.
 *
 * WHY A CallbackRequest ROW. Maya's public-site `schedule_callback` only wrote an AdmissionsActionLog line, which no
 * admissions screen lists, and her `initiate_voice_call` reported success even when voice calls were switched off. The
 * admissions team's queue is `callback_requests`: Admin > AI settings > Admissions lists it (handleGetCallbacks) and
 * counts the pending ones (callbacks_pending). So this writes exactly that row, and Maya only confirms once it exists.
 *
 * THE VISITOR ROW. `callback_requests.visitor_id` is NOT NULL and belongs to `visitors` (models/index.ts), a public-site
 * concept. A portal learner has no site visitor id we may read server side, so each learner gets ONE stable visitor row,
 * fingerprint `portal-enrollment:<enrollment id>` (the fingerprint column is unique, so findOrCreate is race safe). Its
 * metadata carries who they are and the phone to call, because the callback agent later overwrites `agent_notes`
 * ("Approved by governance at ...") and the phone must survive that. No page views, no sessions: it is a contact record.
 *
 * IDEMPOTENT PER (enrollment, Central calendar day). A double click, a retried send or two DMs in a row inside one
 * day return the row already made (`already_requested`) instead of inserting another. The check and the insert run in
 * one transaction under a transaction-scoped advisory lock keyed on the enrollment and day, the same pattern as
 * sbp/projectDiscoveryCallRequest.ts, so two concurrent replies cannot both insert. Central because the admissions
 * calendar and the team run on Central time.
 *
 * FAILURE MODES HANDLED: enrollment missing (`not_found`), no phone on file and none given (`needs_phone`), a given phone
 * that is not a phone number (`invalid_phone`), any database error (`failed`, with its error class, logged). Never
 * throws. NOT handled here: actually placing the call (a person on the admissions team does that from the queue), and
 * consent/quiet-hours rules (the existing AdmissionsCallbackManagementAgent governs the queue as it does for site rows).
 */

export const CALLBACK_TZ = 'America/Chicago';
const SOURCE = 'portal_maya_dm';

export type CallbackOutcome =
  | { status: 'requested'; callbackId: string; phoneLast4: string }
  | { status: 'already_requested'; callbackId: string; phoneLast4: string | null }
  | { status: 'needs_phone' }
  | { status: 'invalid_phone' }
  | { status: 'not_found' }
  | { status: 'failed'; errorClass: string };

export interface CallbackInput {
  enrollmentId: string;
  /** A phone the learner typed in the chat; when absent the phone on their enrollment is used. */
  phone?: string | null;
  /** Free text such as "after 3pm". Kept as the learner said it; never parsed into a time. */
  preferredTime?: string | null;
}

/**
 * A phone number in a dialable form, or null. Accepts the usual punctuation (spaces, dashes, dots, parentheses) and an
 * optional leading +. Ten digits are taken as a US number (+1 added); 11 to 15 digits must be a full international
 * number. Anything with letters, or too few or too many digits, is not a phone.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 32) return null;
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15 && trimmed.startsWith('+')) return `+${digits}`;
  return null;
}

/** The calendar day in Central, e.g. "2026-11-06", for an instant. */
export function centralDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CALLBACK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

const last4 = (phone: string | null | undefined): string | null => (phone ? phone.replace(/\D/g, '').slice(-4) || null : null);

function logFailure(event: string, enrollmentId: string, e: any): string {
  const errorClass = e?.name || 'Error';
  console.warn(JSON.stringify({
    level: 'warn', service: 'maya', event, outcome: 'failure', error_class: errorClass,
    context: { enrollment_id: enrollmentId }, message: String(e?.message || e),
  }));
  return errorClass;
}

export async function requestPortalCallback(input: CallbackInput, now: Date = new Date()): Promise<CallbackOutcome> {
  const { enrollmentId } = input;
  try {
    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'full_name', 'email', 'phone'] });
    if (!enrollment) return { status: 'not_found' };

    let phone: string | null;
    if (input.phone != null && String(input.phone).trim() !== '') {
      phone = normalizePhone(input.phone);
      if (!phone) return { status: 'invalid_phone' };
    } else {
      phone = normalizePhone(enrollment.phone);
      if (!phone) return { status: 'needs_phone' };
    }

    const day = centralDay(now);
    const preferred = typeof input.preferredTime === 'string' ? input.preferredTime.trim().slice(0, 120) : '';
    const name = enrollment.full_name || '';
    const email = enrollment.email || '';

    return await sequelize.transaction(async (transaction) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `maya_portal_callback:${enrollmentId}:${day}` },
        transaction,
      });

      const metadata = { source: SOURCE, enrollment_id: enrollmentId, name, email, callback_phone: phone, preferred_time: preferred || null };
      const [visitor] = await Visitor.findOrCreate({
        where: { fingerprint: `portal-enrollment:${enrollmentId}` },
        defaults: {
          fingerprint: `portal-enrollment:${enrollmentId}`,
          first_seen_at: now, last_seen_at: now, total_sessions: 0, total_pageviews: 0,
          metadata,
        },
        transaction,
      });

      // Same Central day already requested? Look back 36 hours and compare days, which covers DST edges.
      const recent = await CallbackRequest.findAll({
        where: { visitor_id: visitor.id, request_timestamp: { [Op.gte]: new Date(now.getTime() - 36 * 3600_000) } },
        order: [['request_timestamp', 'DESC']],
        transaction,
      });
      const today = recent.find((r) => centralDay(new Date(r.request_timestamp)) === day);
      if (today) {
        const prev = (visitor.metadata as Record<string, unknown> | null)?.callback_phone;
        return { status: 'already_requested', callbackId: today.id, phoneLast4: last4(typeof prev === 'string' ? prev : phone) };
      }

      await visitor.update({ metadata: { ...(visitor.metadata || {}), ...metadata }, last_seen_at: now }, { transaction });

      const lead = email
        ? await Lead.findOne({ where: { email: email.toLowerCase() }, attributes: ['id'], transaction })
        : null;

      const row = await CallbackRequest.create({
        visitor_id: visitor.id,
        lead_id: lead ? lead.id : null,
        request_timestamp: now,
        callback_status: 'pending',
        agent_notes: `Portal learner ${name || 'unknown'} (${email || 'no email'}) asked Maya for a call. Phone: ${phone}.`
          + (preferred ? ` Preferred time: ${preferred}.` : ''),
      }, { transaction });

      console.log(JSON.stringify({
        level: 'info', service: 'maya', event: 'portal_callback_requested', outcome: 'success',
        context: { enrollment_id: enrollmentId, callback_id: row.id, day },
      }));
      return { status: 'requested', callbackId: row.id, phoneLast4: last4(phone) || '' };
    });
  } catch (e: any) {
    return { status: 'failed', errorClass: logFailure('portal_callback_failed', enrollmentId, e) };
  }
}
