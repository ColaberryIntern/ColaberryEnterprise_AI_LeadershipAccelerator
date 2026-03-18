import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createInvoiceSchema, createInvoiceRequestSchema } from '../schemas/enrollmentSchema';
import { createEnrollmentInvoice } from '../services/paysimpleService';
import {
  validateCohortAvailability,
  createPendingEnrollment,
  createInvoiceEnrollment,
  getEnrollmentByInvoiceId,
} from '../services/enrollmentService';
import { listOpenCohorts } from '../services/cohortService';
import { Cohort } from '../models';
import { sendInvoiceRequestConfirmation } from '../services/emailService';

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

export async function handleCreateInvoice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createInvoiceSchema.parse(req.body);

    // Validate cohort availability
    const cohort = await validateCohortAvailability(data.cohort_id);

    // Create PaySimple invoice with customer + payment link
    const result = await createEnrollmentInvoice({
      fullName: data.full_name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      cohortName: cohort.name,
    });

    // Create enrollment record (pending until webhook confirms payment)
    await createPendingEnrollment(
      data,
      result.paymentLinkId,
      String(result.customerId),
      result.externalId,
      result.mode
    );

    console.log(
      `[Enrollment] Payment link ${result.paymentLinkId} created for ${data.email}` +
        ` (external: ${result.externalId}, $${result.amount}, mode: ${result.mode})`
    );

    res.json({
      invoice_id: result.externalId,
      payment_link: result.paymentLink,
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
