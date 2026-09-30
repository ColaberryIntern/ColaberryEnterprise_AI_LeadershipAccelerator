import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { Enrollment } from '../models';
import { getCurrentConsent, recordConsent } from '../services/consentService';
import { redactForLogs } from '../utils/piiRedaction';

/**
 * In-app consent prompt. The only realistic path to upgrading the learners who
 * already have accounts.
 *
 * WHY THIS EXISTS. All 143 contactable Explorers are emailable solely under
 * CAN-SPAM's default rule for US business contacts. Signup capture fixes every
 * FUTURE learner, but nothing retroactively creates consent for someone who
 * never gave it — so the back catalogue only improves if those people are asked
 * and choose to say yes.
 *
 * IT IS A PROMPT, NOT A GATE. The portal must stay fully usable whether they
 * accept, decline, or ignore it forever. Consent extracted as the price of
 * reaching your own account is not freely given, and would be worth less than
 * the default rule it replaced.
 *
 * DECLINING IS NOT REVOKING. Someone who says "no thanks" to marketing email is
 * not asking to be suppressed from transactional mail, and we must not record a
 * revocation that stops their sign-in links. Declining records nothing and
 * simply stops the asking.
 */

const router = Router();

const respondSchema = z.object({
  // Deliberately three-valued. `dismissed` is not `false`: "not now" and "no"
  // are different answers, and collapsing them would either nag someone who
  // declined or silently treat a dismissal as a refusal.
  choice: z.enum(['accept', 'decline', 'dismiss']),
});

/** Should the portal show the prompt to this learner? */
router.get(
  '/api/portal/consent-prompt',
  requireParticipant,
  async (req: Request, res: Response) => {
    const enrollmentId = (req as any).participant?.sub as string | undefined;
    if (!enrollmentId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const enrollment = await Enrollment.findByPk(enrollmentId, {
        attributes: ['id', 'email'],
      });
      const email = (enrollment as any)?.email as string | undefined;
      if (!email) return res.json({ show: false, reason: 'no_email' });

      const current = await getCurrentConsent('email', [
        { subject_type: 'email', subject_id: email.toLowerCase().trim() },
      ]);

      // Already answered, either way. A granted record means there is nothing
      // to ask; a revoked one means they said no and must not be asked again.
      if (current) return res.json({ show: false, reason: `already_${current.status}` });

      return res.json({
        show: true,
        text: 'Email me about Colaberry courses, events and AI resources. You can unsubscribe at any time.',
      });
    } catch (err: any) {
      // FAIL CLOSED on the ASK, not on the access. If we cannot tell, do not
      // nag — the learner keeps full use of the portal either way, and the
      // worst case is one prompt not shown.
      console.warn(
        redactForLogs(
          JSON.stringify({
            event: 'consent_prompt.check_failed',
            service: 'consent',
            level: 'warn',
            outcome: 'failure',
            error_class: err?.name || 'ConsentPromptError',
            enrollment_id: enrollmentId,
          }),
        ),
      );
      return res.json({ show: false, reason: 'lookup_failed' });
    }
  },
);

/** Record what they chose. */
router.post(
  '/api/portal/consent-prompt',
  requireParticipant,
  async (req: Request, res: Response) => {
    const enrollmentId = (req as any).participant?.sub as string | undefined;
    if (!enrollmentId) return res.status(401).json({ error: 'Unauthorized' });

    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid choice', issues: parsed.error.issues });
    }

    try {
      const enrollment = await Enrollment.findByPk(enrollmentId, {
        attributes: ['id', 'email'],
      });
      const email = (enrollment as any)?.email as string | undefined;
      if (!email) return res.status(200).json({ ok: true, recorded: false });

      if (parsed.data.choice === 'accept') {
        await recordConsent({
          subjectType: 'email',
          subjectId: email,
          channel: 'email',
          status: 'granted',
          basis: 'express_written',
          source: 'in_app_prompt',
          evidence: {
            consent_text:
              'Email me about Colaberry courses, events and AI resources. You can unsubscribe at any time.',
            enrollment_id: enrollmentId,
            captured_via: 'portal_prompt',
          },
        });
        return res.json({ ok: true, recorded: true });
      }

      if (parsed.data.choice === 'decline') {
        // Records a marketing-channel revocation so we stop asking AND stop
        // relying on the default rule for them. This does NOT touch
        // transactional mail: sign-in links and receipts are a different
        // concern and are not governed by this record.
        await recordConsent({
          subjectType: 'email',
          subjectId: email,
          channel: 'email',
          status: 'revoked',
          source: 'in_app_prompt_decline',
          evidence: { enrollment_id: enrollmentId, captured_via: 'portal_prompt' },
        });
        return res.json({ ok: true, recorded: true });
      }

      // 'dismiss' — deliberately records NOTHING. "Not now" is not "no", and
      // writing either answer would put words in their mouth.
      return res.json({ ok: true, recorded: false });
    } catch (err: any) {
      console.warn(
        redactForLogs(
          JSON.stringify({
            event: 'consent_prompt.record_failed',
            service: 'consent',
            level: 'warn',
            outcome: 'failure',
            error_class: err?.name || 'ConsentPromptError',
            enrollment_id: enrollmentId,
          }),
        ),
      );
      // Never fail the request: a consent write that did not land must not look
      // like a broken portal to the learner.
      return res.status(200).json({ ok: true, recorded: false });
    }
  },
);

export default router;
