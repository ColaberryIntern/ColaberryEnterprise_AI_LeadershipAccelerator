import { Request, Response } from 'express';
import { Lead, Enrollment } from '../models';
import { findOrCreateVisitor, resolveIdentity } from '../services/visitorTrackingService';
import { isStaffEnrollment } from '../services/access/staffAccess';
import { validateFingerprint } from './tracking/trackingEventValidation';

/**
 * Decide whether a signed-in portal session may be tracked, and if so, bind it.
 *
 * WHY THIS ENDPOINT EXISTS. The portal emitted nothing at all: `initTracker()` runs only
 * in the public layouts, so once a person signed in they stopped generating events
 * entirely. That is why none of the Explorers appeared in the visitor data — not a broken
 * join, but nothing listening on the far side of the login wall.
 *
 * WHY THE BROWSER DECIDES NOTHING HERE. Two questions have to be answered before a
 * signed-in session is recorded: *may* we track this person, and *who* are they. Both are
 * answered from the authenticated session on the server. If the page decided either, a
 * tampered client could opt a subscriber back into collection, or claim another person's
 * lead id and bind its browser to their journey. The request body carries a fingerprint
 * and nothing else; every other fact comes from the token.
 *
 * WHO IS NOT TRACKED, and why each is deliberate:
 *
 *   - Anyone with an active subscription (`payment_status === 'paid'`). Product decision:
 *     the intent engine exists to recognise people who are still deciding. Someone
 *     already paying has decided, so scoring their behaviour buys nothing and collects
 *     something we do not need.
 *   - Staff. Their browsing is work, not interest, and would pollute every aggregate.
 *   - Impersonated sessions (`read_only`, admin "View as member"). Recording these would
 *     attribute an ADMIN's browsing to the student being viewed — wrong data and a
 *     privacy problem wearing the same costume.
 *
 * WHY NOT `resolveContentPageAccess`, WHICH LOOKS LIKE THE OBVIOUS CHECK. It answers a
 * different question — "may this person view paid content" — and it is dark-shipped: with
 * `CONTENT_PAGE_GATE_ENABLED` off it returns `hasFullAccess: true` for EVERYONE, and it
 * fails open to the same answer on any error. Reusing it here would have silently
 * excluded every user from tracking and looked like it worked. `payment_status` is the
 * fact this decision actually rests on, so this reads that directly.
 *
 * FAILURE MODEL, and note it is the OPPOSITE of the entitlement middleware's. That gate
 * fails OPEN, because an infrastructure error must never lock a paying customer out of
 * content they bought. This one fails CLOSED: if we cannot establish who someone is or
 * whether they are entitled, we do not collect. Being wrong toward less data is
 * recoverable; being wrong the other way is not.
 */
export async function handlePortalSession(req: Request, res: Response): Promise<void> {
  const participant = req.participant;
  if (!participant) {
    // requireParticipant should have rejected already; treat as not-trackable rather
    // than trusting an unauthenticated caller.
    res.status(200).json({ track: false, reason: 'unauthenticated' });
    return;
  }

  // An admin viewing a member's portal. The events would be the admin's.
  if (participant.read_only) {
    res.status(200).json({ track: false, reason: 'impersonated' });
    return;
  }

  // The fingerprint is OPTIONAL, and that is a privacy decision rather than a
  // convenience. Minting a device fingerprint for someone we are about to decide not to
  // track would leave an identifier in a subscriber's browser for no purpose. So the
  // client asks first with whatever it already has — often nothing, for a person who
  // came straight to the portal — and only mints one after being told yes, then calls
  // again to bind. Nobody we decline collects anything.
  const rawFingerprint = req.body?.fingerprint;
  let fingerprint: string | null = null;
  if (rawFingerprint !== undefined && rawFingerprint !== null) {
    // validateFingerprint returns an ERROR STRING, or null when the value is acceptable.
    // Reading it as a boolean inverts the check and is an easy mistake to make.
    if (validateFingerprint(rawFingerprint)) {
      res.status(200).json({ track: false, reason: 'invalid_fingerprint' });
      return;
    }
    fingerprint = String(rawFingerprint);
  }

  try {
    // `sub` is the enrollment id, which is what both checks below key on.
    const enrollmentId = participant.sub;

    // isStaffEnrollment fails safe to false internally and never throws.
    const [isStaff, enrollment] = await Promise.all([
      isStaffEnrollment(enrollmentId),
      Enrollment.findByPk(enrollmentId, { attributes: ['id', 'payment_status'] }),
    ]);

    if (isStaff) {
      res.status(200).json({ track: false, reason: 'staff' });
      return;
    }

    // No enrollment row means we cannot establish subscription status. Fail closed.
    if (!enrollment) {
      res.status(200).json({ track: false, reason: 'unknown_enrollment' });
      return;
    }
    if (enrollment.payment_status === 'paid') {
      res.status(200).json({ track: false, reason: 'subscriber' });
      return;
    }

    // The lead is resolved from the TOKEN's email, never from the body. That is the
    // whole reason this binding happens here rather than through /api/t/event's `lid`,
    // which any page can assert for anyone.
    const email = String(participant.email || '').toLowerCase().trim();
    if (!email) {
      res.status(200).json({ track: false, reason: 'no_email' });
      return;
    }

    // Eligible. If the client had no fingerprint yet, say yes and let it call back once
    // it has one — binding needs a browser identity to bind TO.
    if (!fingerprint) {
      res.status(200).json({ track: true, identified: false, needsFingerprint: true });
      return;
    }

    const lead = await Lead.findOne({ where: { email } });
    if (!lead) {
      // A portal user with no lead row is still trackable — there is simply nobody to
      // stitch them to yet. The events attach to the fingerprint and stitch later if a
      // lead appears, which is better than discarding the behaviour entirely.
      res.status(200).json({ track: true, identified: false });
      return;
    }

    const visitorId = await findOrCreateVisitor(fingerprint, {});
    await resolveIdentity(visitorId, lead.id);

    res.status(200).json({ track: true, identified: true });
  } catch (err) {
    // Fail closed. See the failure model above.
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'portal_session_track_decision_failed',
        outcome: 'failure',
        error_class: (err as Error)?.constructor?.name || 'Error',
      }),
    );
    res.status(200).json({ track: false, reason: 'error' });
  }
}
