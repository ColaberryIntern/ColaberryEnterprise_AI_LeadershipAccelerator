import { Op } from 'sequelize';
import { InternshipOffering, InternshipApplication, Enrollment, Lead } from '../models';
import type { ApplyToInternshipInput } from '../schemas/internshipSchema';
import { redactForLogs } from '../utils/piiRedaction';

/**
 * AI Internship — application intake. Plan §22.
 *
 * The product is real and has never been marketed; this is the machine that
 * takes an application. Schema and its rationale: db/ensureInternshipSchema.ts.
 *
 * THE CENTRAL RULE, and the reason this file exists rather than a controller
 * writing directly: a submitted application is REPLAYABLE but a DECIDED one is
 * NOT. Re-submitting must update a draft, must return the existing row when
 * already submitted, and must NEVER overwrite a decision. Someone who was
 * accepted and re-opens the form must not be silently reset to `submitted` —
 * that would erase a real decision a human made, which is the kind of data loss
 * nobody notices until it matters.
 */

/** Terminal from the applicant's side — the form can no longer change these. */
const DECIDED_STATUSES = ['accepted', 'rejected', 'withdrawn'] as const;

export type ApplyOutcome =
  | 'created'
  | 'updated'
  | 'already_submitted'
  | 'already_decided'
  | 'offering_not_open';

export interface ApplyResult {
  outcome: ApplyOutcome;
  application_id: string | null;
  status: string | null;
  /** Safe to show the applicant. Never leaks whether an email is already in the system. */
  message: string;
}

function isOpenForApplications(offering: InternshipOffering, now: Date): boolean {
  if (offering.status !== 'open') return false;
  if (offering.application_deadline && new Date(offering.application_deadline) < now) return false;
  if (offering.application_opens_on && new Date(offering.application_opens_on) > now) return false;
  return true;
}

/** Offerings a member of the public may see and apply to. */
export async function listOpenOfferings(track?: string): Promise<InternshipOffering[]> {
  const where: Record<string, unknown> = { status: 'open' };
  if (track) where.track = track;
  return InternshipOffering.findAll({
    where,
    order: [['starts_on', 'ASC']],
  });
}

export async function getOfferingBySlug(slug: string): Promise<InternshipOffering | null> {
  return InternshipOffering.findOne({ where: { slug } });
}

/**
 * Best-effort identity resolution. READ-ONLY on both tables — this never
 * creates an enrollment or a lead, because applying to an internship is not
 * consent to become a marketing contact. Both ids are nullable by design and a
 * miss here is normal, not an error: the first applicants to a never-marketed
 * product are exactly the people we have no record of.
 */
async function resolveIdentity(
  email: string,
): Promise<{ enrollment_id: string | null; lead_id: number | null }> {
  const [enrollment, lead] = await Promise.all([
    Enrollment.findOne({ where: { email: { [Op.iLike]: email } }, attributes: ['id'] }).catch(
      () => null,
    ),
    Lead.findOne({ where: { email: { [Op.iLike]: email } }, attributes: ['id'] }).catch(() => null),
  ]);
  return {
    enrollment_id: (enrollment as any)?.id ?? null,
    lead_id: (lead as any)?.id ?? null,
  };
}

/**
 * Submit (or re-submit) an application. Idempotent: the UNIQUE index on
 * (offering_id, email_normalized) makes a duplicate row impossible, and this
 * function makes a duplicate SUBMISSION harmless.
 */
export async function applyToInternship(
  input: ApplyToInternshipInput,
  now: Date = new Date(),
): Promise<ApplyResult> {
  const email = input.email.trim().toLowerCase();

  const offering = await getOfferingBySlug(input.offering_slug);
  if (!offering || !isOpenForApplications(offering, now)) {
    // Same response whether the offering is missing, draft, or past deadline —
    // an anonymous caller should not be able to enumerate unpublished offerings.
    return {
      outcome: 'offering_not_open',
      application_id: null,
      status: null,
      message: 'This internship is not currently accepting applications.',
    };
  }

  const existing = await InternshipApplication.findOne({
    where: { offering_id: offering.id, email_normalized: email },
  });

  if (existing) {
    if ((DECIDED_STATUSES as readonly string[]).includes(existing.status)) {
      // Never overwrite a decision a human made.
      return {
        outcome: 'already_decided',
        application_id: existing.id,
        status: existing.status,
        message: 'Your application has already been reviewed. Check your email for details.',
      };
    }
    if (existing.status !== 'started') {
      return {
        outcome: 'already_submitted',
        application_id: existing.id,
        status: existing.status,
        message: 'We already have your application. We will be in touch.',
      };
    }
    // A started (draft) application is completed by this submission.
    await existing.update({
      full_name: input.full_name ?? existing.full_name,
      motivation: input.motivation ?? existing.motivation,
      portfolio_url: input.portfolio_url || existing.portfolio_url,
      status: 'submitted',
      submitted_at: now,
    });
    return {
      outcome: 'updated',
      application_id: existing.id,
      status: 'submitted',
      message: 'Your application is in. We will be in touch.',
    };
  }

  const identity = await resolveIdentity(email);

  try {
    const created = await InternshipApplication.create({
      offering_id: offering.id,
      email_normalized: email,
      enrollment_id: identity.enrollment_id,
      lead_id: identity.lead_id,
      full_name: input.full_name ?? null,
      motivation: input.motivation ?? null,
      portfolio_url: input.portfolio_url || null,
      source: input.source ?? null,
      status: 'submitted',
      submitted_at: now,
    });
    return {
      outcome: 'created',
      application_id: created.id,
      status: 'submitted',
      message: 'Your application is in. We will be in touch.',
    };
  } catch (err: any) {
    // The unique index is the real guarantee, and it fires when two submissions
    // race past the findOne above. That is a duplicate SUBMISSION, not an
    // error worth surfacing — re-read and report the row that won.
    if (err?.name === 'SequelizeUniqueConstraintError') {
      const winner = await InternshipApplication.findOne({
        where: { offering_id: offering.id, email_normalized: email },
      });
      return {
        outcome: 'already_submitted',
        application_id: winner?.id ?? null,
        status: winner?.status ?? null,
        message: 'We already have your application. We will be in touch.',
      };
    }
    console.error(
      redactForLogs(
        JSON.stringify({
          event: 'internship.apply_failed',
          service: 'internship',
          level: 'error',
          outcome: 'failure',
          error_class: err?.name || 'InternshipApplyError',
          offering: input.offering_slug,
          detail: err?.message,
        }),
      ),
    );
    throw err;
  }
}
