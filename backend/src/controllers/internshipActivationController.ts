import { Request, Response } from 'express';
import { z } from 'zod';
import { findOpenApplication } from '../services/internship/internshipApplicationService';
import {
  activeInternView, advanceAfterDocumentsVerified, recordAcknowledgement,
} from '../services/internship/internshipActivationService';
import { ACKNOWLEDGEMENT_STATES, REQUIREMENT_KEYS } from '../models/InternshipRequirementAcknowledgement';
import { InvalidInternshipTransitionError } from '../services/internship/internshipStateMachine';
import { isInternshipEnabled } from '../services/portalFlagsService';

/**
 * Participant activation endpoints: the onboarding checklist and the tool
 * acknowledgements.
 *
 * NOTE WHAT IS ABSENT: there is no participant route that activates anyone.
 * Activation is reviewer- or system-driven only, so a student cannot put
 * themselves in the cohort by calling an endpoint. The state machine would refuse
 * it anyway; not offering the route means it is never even attempted.
 */

const ackSchema = z.object({
  requirement_key: z.enum(REQUIREMENT_KEYS as [string, ...string[]]),
  state: z.enum(ACKNOWLEDGEMENT_STATES as [string, ...string[]]),
  // How it was checked. NEVER a key value — there is no field for one, and
  // `.strict()` rejects any extra property that tried to be one.
  verification_method: z.string().max(80).nullish(),
}).strict();

function callerEnrollmentId(req: Request): string | null {
  const sub = req.participant?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

async function requireOpenApplication(req: Request, res: Response) {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return null; }
  const application = await findOpenApplication(enrollmentId);
  if (!application) { res.status(404).json({ error: 'No open application' }); return null; }
  return { enrollmentId, application };
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request' }); return; }
  if (err instanceof InvalidInternshipTransitionError) { res.status(409).json({ error: 'Not available yet.' }); return; }
  const e = err as any;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: e?.constructor?.name ?? 'Error', context: { message: e?.message },
  }));
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

/**
 * GET /api/portal/internship/onboarding
 *
 * The checklist, the internship's own terms, and the single next action.
 *
 * Reading it also advances a documents-verified application through the payment
 * gate, because that transition is mechanical and the student opening this page is
 * the natural moment to evaluate it. It never activates anyone.
 */
export async function handleGetInternshipOnboarding(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    if (ctx.application.state === 'documents_verified') {
      await advanceAfterDocumentsVerified({
        application: ctx.application,
        actorId: 'internship_onboarding_read',
      });
    }

    const view = await activeInternView(ctx.application);
    await ctx.application.reload();
    res.json({ state: ctx.application.state, ...view });
  } catch (err) {
    fail(res, err, 'internship_onboarding_failed');
  }
}

/** POST /api/portal/internship/acknowledgements */
export async function handleRecordAcknowledgement(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const body = ackSchema.parse(req.body ?? {});
    const result = await recordAcknowledgement({
      applicationId: ctx.application.id,
      requirementKey: body.requirement_key,
      state: body.state,
      verificationMethod: body.verification_method ?? null,
    });

    if (!result.ok) { res.status(400).json({ error: result.error }); return; }

    const view = await activeInternView(ctx.application);
    res.json({ state: ctx.application.state, ...view });
  } catch (err) {
    fail(res, err, 'internship_acknowledgement_failed');
  }
}
