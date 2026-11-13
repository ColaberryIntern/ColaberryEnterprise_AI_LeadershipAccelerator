import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createInvoiceSchema, createInvoiceRequestSchema, createFreeAccountSchema } from '../schemas/enrollmentSchema';
import {
  createInvoiceEnrollment,
  createExplorerEnrollment,
  getEnrollmentByInvoiceId,
} from '../services/enrollmentService';
import { listOpenCohorts } from '../services/cohortService';
import { Cohort } from '../models';
import { sendInvoiceRequestConfirmation } from '../services/emailService';
import {
  captureSignupConsent,
  SIGNUP_CONSENT_TEXT,
} from '../services/consent/captureSignupConsent';
import { capturePhoneConsent } from '../services/consent/capturePhoneConsent';

export async function handleListOpenCohorts(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cohorts = await listOpenCohorts();
    res.json({ cohorts });
  } catch (error) {
    next(error);
  }
}

/**
 * RETIRED. This route used to mint a real PaySimple payment link for $4,500.
 *
 * Reported by Victoria Spencer-Auber on 11 Nov 2026 while building Vick's sales
 * capabilities: *"The live /api/create-invoice route creates payment links for
 * $4,500, not the plan price."* She was right, and three facts made it live
 * rather than theoretical:
 *
 *   - the route is PUBLIC. `enrollmentRoutes` is mounted before the auth guard
 *     and nginx proxies `/api/` straight through, so it took no credentials
 *   - production runs `PAYMENT_MODE=live`, so the test-mode $0.01 clamp that
 *     makes this harmless in dev does not apply
 *   - $4,500 is a RETIRED price. `admissionsKnowledgeGate.ts` carries a check
 *     specifically for "the retired $4,500 offer", and `marketingMetrics.ts`
 *     records that revenue used to be derived from that hardcoded figure. This
 *     route was the last place still quoting it.
 *
 * Nobody was ever charged it. Of the 8 enrollments that ever went through the
 * payment-link path, 0 were at $4,500, the 2 that paid paid $199, and the last
 * use was 21 July 2026. The exposure was prospective, not historical.
 *
 * ## Why 410 and not a deletion
 *
 * A deleted route answers 404, which is indistinguishable from a bad deploy or
 * a typo. This is a deliberate retirement and it should say so, and it should
 * be VISIBLE if anything still calls it: no frontend code referenced this route
 * when it was retired, but "no caller in this repo" is not the same as "no
 * caller", and a silent 404 is how you find out the slow way. So the refusal is
 * logged with the caller's email, and that log line is the evidence for whether
 * this can eventually be deleted outright.
 */
export async function handleCreateInvoice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Parsed only so a malformed body is still a 400 rather than a 410, which
    // keeps the refusal honest: "this route is gone" and "your request was
    // wrong" are different answers and a caller needs to be able to tell them
    // apart while they migrate.
    const data = createInvoiceSchema.parse(req.body);

    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'create_invoice_route_retired',
      outcome: 'failure',
      error_class: 'RouteRetired',
      context: { email: data.email, cohort_id: data.cohort_id },
    }));

    res.status(410).json({
      error: 'This enrollment route has been retired',
      code: 'create_invoice_retired',
      detail: 'It issued payment links at a price that is no longer offered. '
        + 'Enrollment and checkout now run through the application.',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    next(error);
  }
}

export async function handleCreateInvoiceRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createInvoiceRequestSchema.parse(req.body);
    const enrollment = await createInvoiceEnrollment(data);

    // Send immediate confirmation email with payment instructions (fire-and-forget)
    const cohort = await Cohort.findByPk(data.cohort_id);
    if (cohort) {
      sendInvoiceRequestConfirmation({
        to: data.email,
        fullName: data.full_name,
        cohortName: cohort.name,
        startDate: cohort.start_date,
        coreDay: cohort.core_day,
        coreTime: cohort.core_time,
        optionalLabDay: cohort.optional_lab_day || undefined,
      }).catch((err) => console.error('[Enrollment] Invoice confirmation email error:', err));
    }

    console.log(
      `[Enrollment] Invoice request created for ${data.email} (cohort: ${data.cohort_id})`
    );

    res.status(201).json({
      message: 'Your seat is reserved. A confirmation email with payment instructions has been sent.',
      enrollmentId: enrollment.id,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    next(error);
  }
}

// POST /api/create-free-account — public, /enroll page's free-signup path.
// Reuses createExplorerEnrollment (same idempotent-by-email, auto-placed-in-
// Explorer-cohort, magic-link-welcome-email behavior as the Open House flow),
// just with a distinguishable source label and no service-token requirement
// since this is a first-party call from our own frontend, not a partner site.
export async function handleCreateFreeAccount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createFreeAccountSchema.parse(req.body);
    const { enrollment, created } = await createExplorerEnrollment({
      name: data.full_name,
      email: data.email,
      company: data.company,
      title: data.title,
      company_size: data.company_size,
      phone: data.phone,
      source: 'Free signup (/enroll)',
      utm_source: typeof req.body.utm_source === 'string' ? req.body.utm_source : undefined,
      utm_campaign: typeof req.body.utm_campaign === 'string' ? req.body.utm_campaign : undefined,
      page_url: typeof req.body.page_url === 'string' ? req.body.page_url : undefined,
    });

    // Capture marketing consent if they ticked the box. AWAITED but never
    // allowed to fail the signup: captureSignupConsent is swallow-safe, and a
    // person must get their account regardless. An unticked box records
    // nothing - it is not a revocation.
    await captureSignupConsent({
      email: data.email,
      marketingOptIn: (data as any).marketing_opt_in,
      source: 'free_signup',
      consentText: SIGNUP_CONSENT_TEXT,
      ipAddress: req.ip ?? null,
      // `req.get` is an Express helper, not part of the bare request shape.
      // Calling it unguarded threw on a hand-rolled req in an existing test, and
      // the controller's catch turned that into a silent failure to respond -
      // consent capture must never be able to break a signup that way.
      userAgent: typeof (req as any).get === 'function' ? req.get('user-agent') ?? null : null,
    });

    // Phone permission, a SEPARATE act from the email box above.
    //
    // /enroll has collected a phone number and shown only the email wording, so a
    // person who ticked "Email me about Colaberry courses" has been recorded as
    // consenting to email and nothing else — correctly. This records the telephone
    // grant when, and only when, they tick the second box.
    //
    // Keyed on the number inside the helper, not on the email: a voice or SMS send
    // looks consent up by phone, so an email-keyed row would be invisible to the
    // gate while looking perfectly valid in the table.
    await capturePhoneConsent({
      phone: data.phone,
      email: data.email,
      phoneConsent: (data as any).phone_consent,
      source: 'free_signup',
      ipAddress: req.ip ?? null,
      userAgent: typeof (req as any).get === 'function' ? req.get('user-agent') ?? null : null,
    });

    console.log(
      `[Enrollment] Free account ${created ? 'created' : 'already existed'} for enrollment ${enrollment.id}`
    );

    res.status(created ? 201 : 200).json({
      message: created
        ? 'Your account is ready. Check your email for your sign-in link.'
        : 'You already have an account. Check your email for your sign-in link.',
      enrollmentId: enrollment.id,
      created,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    next(error);
  }
}

export async function handleVerifyEnrollment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.query.invoice_id as string;
    if (!invoiceId) {
      res.status(400).json({ error: 'invoice_id query parameter required' });
      return;
    }

    // Check our enrollment record
    const enrollment = await getEnrollmentByInvoiceId(invoiceId);
    if (!enrollment) {
      res.status(404).json({ error: 'Enrollment not found' });
      return;
    }

    // Get the associated cohort data
    const cohort = (enrollment as any).cohort;

    res.json({
      enrollment: {
        id: enrollment.id,
        full_name: enrollment.full_name,
        email: enrollment.email,
        company: enrollment.company,
        payment_status: enrollment.payment_status,
      },
      cohort: cohort
        ? {
            name: cohort.name,
            start_date: cohort.start_date,
            core_day: cohort.core_day,
            core_time: cohort.core_time,
            optional_lab_day: cohort.optional_lab_day,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
}
