import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { sequelize } from '../config/database';
import { createLead } from '../services/leadService';
import { Cohort, Enrollment } from '../models';
// These four models are not (yet) re-exported from the models barrel, so they
// are imported directly from their definition files. Importing the file runs
// the `Model.init(...)` side effect that registers the model with Sequelize.
import Sponsor from '../models/Sponsor';
import SponsorSeat from '../models/SponsorSeat';
import Challenge from '../models/Challenge';
import ChallengeParticipant from '../models/ChallengeParticipant';

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

// Mirror the ZodError → 400 shape used by leadController / enrollmentController
// so the public API stays consistent across the two-door flow.
function respondZodError(res: Response, error: ZodError): void {
  res.status(400).json({
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

// Typed error so redemption failures carry an explicit HTTP status out of the
// transaction callback without leaking through the generic 500 path.
class RedeemError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'RedeemError';
  }
}

/* ------------------------------------------------------------------ */
/*  Door B — "Sponsor Your Team" inquiry                               */
/*  POST /api/sponsor-inquiry  (public, on leadRoutes)                 */
/* ------------------------------------------------------------------ */

// An employer asking about sponsoring annual seats. This is a corporate-intent
// Lead, not an enrollment: it is written with form_type="sponsor_inquiry" and
// corporate_sponsorship_interest=true so the pipeline can route it to the
// talent-discovery sales motion. createLead() dedups by email, so a re-POST
// from the same company contact does not create a duplicate Lead.
const sponsorInquirySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  email: z.string().trim().email('Invalid email address').max(255),
  company: z.string().trim().min(1, 'Company is required').max(255),
  title: z.string().trim().max(255).optional().default(''),
  phone: z.string().trim().max(50).optional().default(''),
  company_size: z.string().trim().max(50).optional().default(''),
  seats_interested: z.coerce.number().int().min(0).max(100000).optional().default(0),
  message: z.string().trim().max(5000).optional().default(''),
  utm_source: z.string().trim().max(255).optional().default(''),
  utm_campaign: z.string().trim().max(255).optional().default(''),
  page_url: z.string().trim().max(500).optional().default(''),
});

export async function handleSponsorInquiry(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = sponsorInquirySchema.parse(req.body);

    const seatsNote =
      data.seats_interested > 0 ? `Seats interested: ${data.seats_interested}. ` : '';

    const { lead, isDuplicate } = await createLead({
      name: data.name,
      email: data.email.toLowerCase(),
      company: data.company,
      title: data.title,
      phone: data.phone,
      company_size: data.company_size,
      message: `${seatsNote}${data.message}`.trim(),
      interest_area: 'corporate_sponsorship',
      // Force the corporate-intent contract regardless of client input.
      source: 'website',
      form_type: 'sponsor_inquiry',
      corporate_sponsorship_interest: true,
      utm_source: data.utm_source,
      utm_campaign: data.utm_campaign,
      page_url: data.page_url,
      // leadSchema defaults fill the remaining optional fields.
      role: '',
      evaluating_90_days: false,
      consent_contact: false,
      timeline: '',
    });

    console.log(
      `[SponsorController] Sponsor inquiry lead ${lead.id} (${data.email}, company: ${data.company}, duplicate: ${isDuplicate}).`,
    );

    res.status(201).json({
      message: "Thank you. Our team will reach out about sponsoring your team's seats.",
      leadId: lead.id,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      respondZodError(res, error);
      return;
    }
    next(error);
  }
}

/* ------------------------------------------------------------------ */
/*  Door B — employee seat redemption                                 */
/*  POST /api/sponsor/redeem  (public, on enrollmentRoutes)           */
/* ------------------------------------------------------------------ */

// An employee redeems a sponsor-issued code to claim a seat in the sponsor
// cohort. The operation is idempotent on the redemption_code: re-POSTing an
// already-redeemed code returns the same enrollment and does not double-enroll,
// double-count seats, or create a second ChallengeParticipant row.
const redeemSeatSchema = z.object({
  code: z.string().trim().min(1, 'Redemption code is required').max(64),
  full_name: z.string().trim().min(1, 'Full name is required').max(255),
  email: z.string().trim().email('Invalid email address').max(255),
  title: z.string().trim().max(255).optional().default(''),
  phone: z.string().trim().max(50).optional().default(''),
});

type RedeemInput = z.infer<typeof redeemSeatSchema>;

interface RedeemResult {
  enrollmentId: string;
  cohortId: string;
  alreadyRedeemed: boolean;
}

// Resolve the cohort that sponsor seats redeem into. The sponsor cohort is the
// open cohort flagged cohort_type='sponsor'. We do not create cohorts here
// (migrations/seed data own that); a missing sponsor cohort is an operator
// configuration error surfaced as a clear 409.
async function findSponsorCohort(): Promise<Cohort | null> {
  return Cohort.findOne({
    where: { cohort_type: 'sponsor', status: 'open' },
    order: [['start_date', 'ASC']],
  });
}

export async function handleRedeemSeat(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let data: RedeemInput;
  try {
    data = redeemSeatSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      respondZodError(res, error);
      return;
    }
    next(error);
    return;
  }

  try {
    const result = await sequelize.transaction(async (t): Promise<RedeemResult> => {
      // Lock the seat row for the duration of the transaction so two concurrent
      // redemptions of the same code cannot both pass the "available" check.
      const seat = await SponsorSeat.findOne({
        where: { redemption_code: data.code },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!seat) {
        throw new RedeemError(404, 'Invalid redemption code.');
      }

      if (seat.status === 'expired' || seat.status === 'reassigned') {
        throw new RedeemError(409, 'This redemption code is no longer active.');
      }

      // Idempotent path: the seat is already redeemed. Return its existing
      // enrollment without creating anything new.
      if (seat.status === 'redeemed' && seat.assigned_enrollment_id) {
        const existing = await Enrollment.findByPk(seat.assigned_enrollment_id, {
          attributes: ['id', 'cohort_id'],
          transaction: t,
        });
        if (existing) {
          return {
            enrollmentId: existing.id,
            cohortId: existing.cohort_id,
            alreadyRedeemed: true,
          };
        }
        // Seat marked redeemed but enrollment vanished — fall through and re-create.
      }

      const sponsor = await Sponsor.findByPk(seat.sponsor_id, { transaction: t });
      if (!sponsor) {
        throw new RedeemError(409, 'Sponsor account not found for this seat.');
      }

      const cohort = await findSponsorCohort();
      if (!cohort) {
        throw new RedeemError(409, 'No sponsor cohort is currently open for redemption.');
      }

      // Create the enrollment in the sponsor cohort. Seat-funded, so it lands
      // paid via invoice (the employer already paid for the seat).
      const enrollment = await Enrollment.create(
        {
          full_name: data.full_name,
          email: data.email.toLowerCase().trim(),
          company: sponsor.company_name,
          title: data.title || undefined,
          phone: data.phone || undefined,
          cohort_id: cohort.id,
          payment_status: 'paid',
          payment_method: 'invoice',
          status: 'active',
        },
        { transaction: t },
      );

      // Mark the seat redeemed and bind it to the enrollment.
      await seat.update(
        {
          status: 'redeemed',
          assigned_enrollment_id: enrollment.id,
          redeemed_at: new Date(),
          updated_at: new Date(),
        },
        { transaction: t },
      );

      // Reserve the cohort seat.
      await Cohort.increment('seats_taken', {
        by: 1,
        where: { id: cohort.id },
        transaction: t,
      });

      // Attach the participant to the sponsor's company-scoped challenge so they
      // appear on the company leaderboard. findOrCreate keeps this idempotent
      // against the (challenge_id, enrollment_id) unique constraint.
      const challenge = await Challenge.findOne({
        where: { sponsor_id: sponsor.id },
        order: [['created_at', 'DESC']],
        transaction: t,
      });
      if (challenge) {
        await ChallengeParticipant.findOrCreate({
          where: { challenge_id: challenge.id, enrollment_id: enrollment.id },
          defaults: {
            challenge_id: challenge.id,
            enrollment_id: enrollment.id,
            joined_at: new Date(),
          },
          transaction: t,
        });
      }

      return {
        enrollmentId: enrollment.id,
        cohortId: cohort.id,
        alreadyRedeemed: false,
      };
    });

    console.log(
      `[SponsorController] Seat redeemed (code: ${data.code}, enrollment: ${result.enrollmentId}, alreadyRedeemed: ${result.alreadyRedeemed}).`,
    );

    res.status(result.alreadyRedeemed ? 200 : 201).json({
      message: result.alreadyRedeemed
        ? 'This code was already redeemed. Welcome back.'
        : "You're in. Your seat is active — learn on your own time and climb the leaderboard.",
      enrollmentId: result.enrollmentId,
      cohortId: result.cohortId,
    });
  } catch (error) {
    if (error instanceof RedeemError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
}
