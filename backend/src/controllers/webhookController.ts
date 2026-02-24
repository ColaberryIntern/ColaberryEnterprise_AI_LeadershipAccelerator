import { Request, Response } from 'express';
import { constructWebhookEvent } from '../services/stripeService';
import { markEnrollmentPaid } from '../services/enrollmentService';
import { Cohort } from '../models';
import { runEnrollmentAutomation } from '../services/automationService';

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
        const cohort = await Cohort.findByPk(enrollment.cohort_id);
        if (cohort) {
          // Run all enrollment automation (email + voice call)
          runEnrollmentAutomation({
            id: enrollment.id,
            email: enrollment.email,
            full_name: enrollment.full_name,
            phone: enrollment.phone || undefined,
            cohort: {
              name: cohort.name,
              start_date: cohort.start_date,
              core_day: cohort.core_day,
              core_time: cohort.core_time,
              optional_lab_day: cohort.optional_lab_day || undefined,
            },
          }).catch((err) => console.error('[Webhook] Automation error:', err));
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Signature verification failed:', error);
    res.status(400).json({ error: 'Webhook signature verification failed' });
  }
}
