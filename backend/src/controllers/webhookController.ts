import { Request, Response } from 'express';
import { verifyWebhookSignature } from '../services/paysimpleService';
import { markEnrollmentPaid, markEnrollmentFailed, enrollInClassReadinessCampaign } from '../services/enrollmentService';
import { Cohort, EnrollmentLead } from '../models';
import { runEnrollmentAutomation } from '../services/automationService';
import { activateByRef, isSubscriptionRef } from '../services/subscriptionService';
import { recordWebhookOutcome } from '../services/paysimpleWebhookHealth';
import LiveSession from '../models/LiveSession';
import RoomBooking from '../models/RoomBooking';
import CommunityRoom from '../models/CommunityRoom';
import { verifyZoomWebhookSignature, computeZoomWebhookEncryptedToken } from '../services/zoomService';
import {
  ingestRecordingForSession,
  ingestRecordingForBooking,
  ingestRecordingForRoom,
  findAlwaysOpenRoomForZoomMeeting,
} from '../services/sessionRecordingService';

export async function handlePaySimpleWebhook(req: Request, res: Response): Promise<void> {
  // PaySimple sends signature in 'paysimple-hmac-sha256' header, computed over
  // the EXACT bytes it sent. The route parses this body with express.raw()
  // (not express.json()) specifically so req.body here is a Buffer of those
  // original bytes -- re-serializing an already-parsed object via
  // JSON.stringify(req.body) (the previous approach) essentially never
  // reproduces byte-identical JSON (key order, spacing, and number formatting
  // can all differ from the source), so verification failed on every real
  // request. Found live 2026-07-30: a real student's subscription payment sat
  // unactivated through 14 checkout attempts because every one of PaySimple's
  // webhook calls was silently rejected right here. The Buffer.isBuffer
  // branches below are defensive only (e.g. a misconfigured route or a test
  // harness posting a pre-parsed object) -- the real fix is the route change.
  const signature = req.headers['paysimple-hmac-sha256'] as string | undefined;
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[Webhook] PaySimple signature verification failed');
    // Feed the health window BEFORE returning: a sustained run of these is exactly the
    // 2026-08-12 outage, and it went unnoticed because nothing counted them.
    recordWebhookOutcome('rejected_signature');
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }
  recordWebhookOutcome('accepted');

  try {
    const event = Buffer.isBuffer(req.body) ? JSON.parse(rawBody) : req.body;
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

      // Student self-serve subscription payments (SUB-<enrollment>-<ts>) activate
      // the subscription + convert the Explorer, separate from the enrollment flow.
      if (isSubscriptionRef(externalId)) {
        const sub = await activateByRef(externalId, { paymentId, amount });
        if (sub) console.log(`[Webhook] Subscription ${sub.id} activated (${sub.plan}) for enrollment ${sub.enrollment_id}`);
        else console.warn(`[Webhook] No subscription found for ref: ${externalId}`);
        res.json({ received: true });
        return;
      }

      const enrollment = await markEnrollmentPaid(externalId, {
        paymentId: paymentId as number,
        amount: amount as number,
      });

      if (enrollment) {
        console.log(`[Webhook] Enrollment ${enrollment.id} marked as paid (payment: ${paymentId}, $${amount})`);

        // Upsert EnrollmentLead — funnel tracking (non-blocking)
        EnrollmentLead.findOrCreate({
          where: { email: enrollment.email },
          defaults: {
            name: enrollment.full_name,
            email: enrollment.email,
            phone: enrollment.phone || undefined,
            status: 'enrolled',
            enrollment_id: enrollment.id,
          },
        }).then(([lead, created]) => {
          if (!created && lead.status !== 'enrolled') {
            lead.status = 'enrolled';
            lead.enrollment_id = enrollment.id;
            return lead.save();
          }
        }).catch((err) => console.error('[Webhook] EnrollmentLead upsert error:', err));

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

export async function handleZoomWebhook(req: Request, res: Response): Promise<void> {
  // Same reasoning as PaySimple above: the route parses this body with
  // express.raw() so req.body is a Buffer of Zoom's exact original bytes —
  // signature verification (and the URL-validation handshake) must be
  // computed over those bytes, not a re-serialized object.
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  // One-time endpoint verification handshake, sent whenever the webhook URL
  // is first registered (or changed) in the Zoom Marketplace app. Handled
  // before signature checking — Zoom hasn't signed this specific challenge
  // the normal way; correctly computing encryptedToken back IS the proof.
  // Must respond within 3s.
  if (event.event === 'endpoint.url_validation') {
    const plainToken = event.payload?.plainToken;
    if (!plainToken) {
      res.status(400).json({ error: 'Missing plainToken' });
      return;
    }
    try {
      res.status(200).json({ plainToken, encryptedToken: computeZoomWebhookEncryptedToken(plainToken) });
    } catch (err: any) {
      console.error('[Webhook] Zoom URL validation failed:', err.message);
      res.status(500).json({ error: 'Zoom webhook not configured' });
    }
    return;
  }

  const signature = req.headers['x-zm-signature'] as string | undefined;
  const timestamp = req.headers['x-zm-request-timestamp'] as string | undefined;
  if (!verifyZoomWebhookSignature(rawBody, timestamp, signature)) {
    console.error('[Webhook] Zoom signature verification failed');
    res.status(401).json({ error: 'Webhook signature verification failed' });
    return;
  }

  if (event.event !== 'recording.completed') {
    res.status(200).json({ received: true });
    return;
  }

  try {
    const meetingId = String(event.payload?.object?.id || '');
    const session = meetingId ? await LiveSession.findOne({ where: { zoom_meeting_id: meetingId } }) : null;
    // Only checked when no class session matched — a general Room booking
    // (the "+ Book a session" flow). related_live_session_id: null excludes
    // class-session-derived bookings, which never carry google_event_id
    // anyway (they're keyed by LiveSession.zoom_meeting_id above instead)
    // but the extra check makes the exclusion explicit rather than implicit.
    const booking = !session && meetingId
      ? await RoomBooking.findOne({ where: { google_event_id: meetingId, related_live_session_id: null } })
      : null;
    // Last fallback: an always-open persistent video Room (a cohort's main
    // "class" room, always_open + is_video — no RoomBooking exists for
    // these, so the room's meeting_link itself, not any booking field, is
    // the only place the Zoom meeting id is recorded).
    const room = !session && !booking && meetingId
      ? await findAlwaysOpenRoomForZoomMeeting(meetingId)
      : null;

    // No match at all is a normal, benign outcome — this webhook
    // subscription is account-wide, so any non-class, non-booking, non-room
    // Zoom meeting on the same account (a 1:1 call, a personal meeting) also
    // fires this event. Acking 200 avoids Zoom retrying something that was
    // never going to match anything, and avoids log noise for a "failure"
    // that isn't one.
    if (!session && !booking && !room) {
      res.status(200).json({ received: true, matched: false });
      return;
    }

    const files: any[] = event.payload?.object?.recording_files || [];
    const mp4s = files.filter((f: any) => f.file_type === 'MP4');
    if (!mp4s.length) {
      res.status(200).json({ received: true, matched: true, note: 'no MP4 file in payload' });
      return;
    }
    // Pause/resume can produce more than one MP4 for the same meeting — the
    // largest file is the real one, not necessarily whichever comes first.
    const best = mp4s.reduce((a: any, b: any) => (b.file_size > a.file_size ? b : a));

    const fallbackTitle = session ? session.title : booking ? booking.title : (room as CommunityRoom).name;
    const preResolvedMatch = {
      downloadUrl: best.download_url,
      downloadToken: event.download_token as string | undefined,
      name: `${event.payload?.object?.topic || fallbackTitle}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: best.file_size ?? null,
    };

    // Ack fast — a multi-hundred-MB download shouldn't block Zoom's webhook
    // response window. Ingest is idempotent (sessionRecordingService's
    // existing RoomResource-lookup guard), so running it after the response
    // is sent, or retrying it on a later webhook/cron pass, is always safe.
    res.status(200).json({ received: true, matched: true });

    if (session) {
      ingestRecordingForSession(session, preResolvedMatch).catch((err: any) => {
        console.error(`[Webhook] Zoom recording ingest failed for session ${session.id}:`, err.message);
      });
    } else if (booking) {
      ingestRecordingForBooking(booking, preResolvedMatch).catch((err: any) => {
        console.error(`[Webhook] Zoom recording ingest failed for booking ${booking.id}:`, err.message);
      });
    } else if (room) {
      const instanceUuid = String(event.payload?.object?.uuid || '');
      ingestRecordingForRoom(room, instanceUuid, preResolvedMatch).catch((err: any) => {
        console.error(`[Webhook] Zoom recording ingest failed for room ${room.id}:`, err.message);
      });
    }
  } catch (err: any) {
    console.error('[Webhook] Zoom processing error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Webhook processing failed' });
  }
}
