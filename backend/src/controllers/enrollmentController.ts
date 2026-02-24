import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createCheckoutSessionSchema, createInvoiceRequestSchema } from '../schemas/enrollmentSchema';
import { createCheckoutSession, retrieveSession } from '../services/stripeService';
import {
  validateCohortAvailability,
  createPendingEnrollment,
  createInvoiceEnrollment,
  getEnrollmentBySessionId,
} from '../services/enrollmentService';
import { listOpenCohorts } from '../services/cohortService';

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

export async function handleCreateCheckoutSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createCheckoutSessionSchema.parse(req.body);

    // Validate cohort availability
    await validateCohortAvailability(data.cohort_id);

    // Create Stripe checkout session
    const session = await createCheckoutSession({
      cohortId: data.cohort_id,
      fullName: data.full_name,
      email: data.email,
      company: data.company,
      title: data.title,
      phone: data.phone,
      companySize: data.company_size,
      couponCode: data.coupon_code,
    });

    // Create enrollment record (pending until webhook confirms)
    await createPendingEnrollment(data, session.id);

    res.json({ sessionId: session.id, url: session.url });
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

    res.status(201).json({
      message: 'Invoice request received. Our team will contact you within 1 business day.',
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

export async function handleVerifyEnrollment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId) {
      res.status(400).json({ error: 'session_id query parameter required' });
      return;
    }

    // Check our enrollment record
    const enrollment = await getEnrollmentBySessionId(sessionId);
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
