import { Request, Response } from 'express';
import { constructWebhookEvent } from '../services/stripeService';
import { markEnrollmentPaid } from '../services/enrollmentService';
import { sendEnrollmentConfirmation } from '../services/emailService';
import { Cohort } from '../models';

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;

  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  try {
    const event = constructWebhookEvent(req.body as Buffer, sig);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;

      const enrollment = await markEnrollmentPaid(session.id);

      if (enrollment) {
        // Send confirmation email
        const cohort = await Cohort.findByPk(enrollment.cohort_id);
        if (cohort) {
          try {
            await sendEnrollmentConfirmation({
              to: enrollment.email,
              fullName: enrollment.full_name,
              cohortName: cohort.name,
              startDate: cohort.start_date,
              coreDay: cohort.core_day,
              coreTime: cohort.core_time,
              optionalLabDay: cohort.optional_lab_day || undefined,
            });
          } catch (emailError) {
            // Log but don't fail the webhook — payment was successful
            console.error('[Webhook] Email send failed:', emailError);
          }
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Signature verification failed:', error);
    res.status(400).json({ error: 'Webhook signature verification failed' });
  }
}
