import { Request, Response } from 'express';
import { verifyWebhookSignature } from '../services/paysimpleService';
import { markEnrollmentPaid, markEnrollmentFailed, enrollInClassReadinessCampaign } from '../services/enrollmentService';
import { Cohort } from '../models';
import { runEnrollmentAutomation } from '../services/automationService';

export async function handlePaySimpleWebhook(req: Request, res: Response): Promise<void> {
  // PaySimple sends signature in 'paysimple-hmac-sha256' header
  const signature = req.headers['paysimple-hmac-sha256'] as string | undefined;
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[Webhook] PaySimple signature verification failed');
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  try {
    const event = req.body;
    const eventType = event.event_type;

    console.log(`[Webhook] PaySimple event received: ${eventType}`, {
      event_id: event.event_id,
      merchant_id: event.merchant_id,
    });

    if (eventType === 'payment_created') {
      // PaySimple payment_created payload: event.data contains payment details
      // Our external ID (CB-{customerId}-{timestamp}) is in order_external_id
      const externalId = event.data?.order_external_id;
      const paymentId = event.data?.payment_id;
      const amount = event.data?.amount;
      const paymentStatus = event.data?.payment_status;

      console.log(`[Webhook] Payment created:`, {
        externalId,
        paymentId,
        amount,
        paymentStatus,
      });

      if (!externalId) {
        console.error('[Webhook] No external ID in payment event:', JSON.stringify(event.data));
        // Still acknowledge receipt to avoid retries
        res.json({ received: true, warning: 'No external ID found' });
        return;
      }

      const enrollment = await markEnrollmentPaid(externalId);

      if (enrollment) {
        console.log(`[Webhook] Enrollment ${enrollment.id} marked as paid (payment: ${paymentId}, $${amount})`);

        const cohort = await Cohort.findByPk(enrollment.cohort_id);
        if (cohort) {
          // Run all enrollment automation (email + voice call) — ONLY after confirmed payment
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

          // Enroll in Class Readiness Campaign (T-minus onboarding sequence)
          enrollInClassReadinessCampaign(enrollment)
            .catch((err) => console.error('[Webhook] Class readiness enrollment error:', err));
        }
      } else {
        console.warn(`[Webhook] No enrollment found for external ID: ${externalId}`);
      }
    } else if (eventType === 'payment_failed') {
      const externalId = event.data?.order_external_id;
      const failureReason = event.data?.failure_reason || 'Unknown';

      console.log(`[Webhook] Payment failed for ${externalId}: ${failureReason}`);

      if (externalId) {
        await markEnrollmentFailed(externalId);
      }
    } else {
      console.log(`[Webhook] Unhandled event type: ${eventType}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
