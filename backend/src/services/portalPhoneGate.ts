import { Enrollment } from '../models';
import Lead from '../models/Lead';
import { isStaffEnrollment } from './access/staffAccess';
import { capturePhoneConsent } from './consent/capturePhoneConsent';
import { isAcceptablePhone, requiredPhone } from '../schemas/phone';
import type { ConsentChoice } from './consent/captureSignupConsent';

/**
 * The portal's "Add your phone" step (PH1, Ali 2026-11-19: a logged-in portal user with no phone
 * on file must add one to continue; blocking, no skip).
 *
 * ── WHERE A PHONE CAN BE ON FILE ────────────────────────────────────────────
 *
 * Phone storage is split. Portal signup wrote `leads.phone` only, Open House writes
 * `enrollments.phone`, and Settings writes `enrollments.phone`. So "has a phone" asks both: the
 * enrollment's own number, and the linked lead's (by `enrollments.lead_id`, then by email). Either
 * one with a number we would accept today (10-15 digits, the shared `requiredPhone` rule) is
 * enough.
 *
 * ── WHO IS NEVER ASKED ──────────────────────────────────────────────────────
 *
 * - An admin's read-only "View as" session. It must never be blocked by somebody else's missing
 *   number, and it cannot write one anyway (requireParticipant refuses its writes).
 * - Staff (`community_members.role = 'staff'`), who use the portal for curriculum access.
 *
 * ── WHAT IS NEVER LOGGED ────────────────────────────────────────────────────
 *
 * The number. Only `has_phone` leaves this module, and log lines carry the enrollment id.
 */

export interface PhoneGateStatus {
  has_phone: boolean;
  /** True only when this session must add a phone before continuing. */
  required: boolean;
}

/** Does this enrollment, or the lead linked to it, carry a usable phone number? */
export async function enrollmentHasPhone(enrollmentId: string): Promise<boolean> {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    attributes: ['id', 'phone', 'email', 'lead_id'],
  });
  if (!enrollment) return false;
  if (isAcceptablePhone((enrollment as any).phone)) return true;

  const leadId = (enrollment as any).lead_id as number | null | undefined;
  const lead = leadId
    ? await Lead.findByPk(leadId, { attributes: ['id', 'phone'] })
    : (enrollment as any).email
      ? await Lead.findOne({ where: { email: String((enrollment as any).email).toLowerCase() }, attributes: ['id', 'phone'] })
      : null;
  return isAcceptablePhone((lead as any)?.phone);
}

export async function getPhoneGateStatus(
  enrollmentId: string,
  opts: { readOnly?: boolean } = {},
): Promise<PhoneGateStatus> {
  if (opts.readOnly) {
    // Report only; never require. The admin viewing as somebody is not that somebody.
    return { has_phone: await enrollmentHasPhone(enrollmentId), required: false };
  }
  const [hasPhone, isStaff] = await Promise.all([
    enrollmentHasPhone(enrollmentId),
    isStaffEnrollment(enrollmentId),
  ]);
  return { has_phone: hasPhone, required: !hasPhone && !isStaff };
}

export type SavePhoneResult =
  | { ok: true; consent_records_written: number }
  | { ok: false; status: number; error: string };

/**
 * Save the number from the gate. Writes `enrollments.phone`, and the linked lead's phone only when
 * that lead has none (a number somebody gave elsewhere is not overwritten). Permission to call or
 * text is recorded only from an explicit tick, through `capturePhoneConsent`.
 */
export async function savePortalPhone(
  enrollmentId: string,
  input: { phone: unknown; phone_consent?: unknown },
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<SavePhoneResult> {
  const parsed = requiredPhone.safeParse(input?.phone);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? 'a valid phone number is required' };
  }
  const phone = parsed.data;

  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return { ok: false, status: 404, error: 'Enrollment not found' };
  await (enrollment as any).update({ phone });

  try {
    const leadId = (enrollment as any).lead_id as number | null | undefined;
    const lead = leadId
      ? await Lead.findByPk(leadId)
      : await Lead.findOne({ where: { email: String((enrollment as any).email || '').toLowerCase() } });
    if (lead && !String((lead as any).phone ?? '').trim()) await (lead as any).update({ phone });
  } catch (err) {
    // The enrollment row is the record the gate reads first; a lead write failure costs nothing
    // the person can see, so it is logged and the save still succeeds.
    console.warn(JSON.stringify({
      level: 'warn', service: 'backend', event: 'portal_phone_lead_write_failed', outcome: 'partial',
      error_class: err instanceof Error ? err.constructor.name : 'Unknown', context: { enrollment_id: enrollmentId },
    }));
  }

  const written = await capturePhoneConsent({
    phone,
    email: (enrollment as any).email ?? null,
    phoneConsent: input?.phone_consent as ConsentChoice,
    source: 'portal_phone_gate',
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return { ok: true, consent_records_written: written };
}
