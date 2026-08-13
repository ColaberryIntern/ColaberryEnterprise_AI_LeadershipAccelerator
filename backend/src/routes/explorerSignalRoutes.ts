import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { recordLearnerSignal } from '../services/explorerGrowth/explorerSignalWriter';
import { writableSignals } from '../services/explorerGrowth/explorerSignalDefinitions';

/**
 * Explorer Growth OS — portal signal ingest. Plan EPIC 2 T003.
 *
 * The delivery path for learner-side behavioural signals. Deliberately separate
 * from the public `/api/t/*` tracker: that one is visitor/fingerprint-scoped for
 * anonymous traffic, whereas this is enrollment-scoped and already
 * authenticated, so routing learner events through it would mean re-deriving an
 * identity we already hold.
 *
 * THE SECURITY PROPERTY THAT MATTERS: `enrollment_id` comes from the verified
 * participant token and is NEVER read from the body. A body-supplied enrollment
 * id would let any authenticated learner write signals as any other, which would
 * corrupt scores, states, and eventually who gets contacted.
 *
 * A useful side effect of `requireParticipant`: it already refuses mutating
 * requests from a read-only "view as member" impersonation, so an admin
 * inspecting a learner's portal cannot manufacture signals attributed to them.
 *
 * Registered flat in server.ts alongside capePortalRoutes/trackingRoutes —
 * there is no portal route aggregator in this repo.
 */

const router = Router();

// Mirrors trackingRoutes' eventLimiter: instrumentation must degrade quietly
// under flood rather than surface errors into a learner's page.
const signalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(204).end();
  },
});

// Path-scoped guard. NEVER a bare `router.use(requireParticipant)` — sub-routers
// mount without a path prefix in this app, so an unscoped guard gates unrelated
// traffic. That has caused two production outages here.
router.use('/api/portal/explorer-signals', signalLimiter, requireParticipant);

const SignalBody = z.object({
  // Only signals this stream owns are accepted; the writer enforces the same
  // rule, but rejecting at the boundary keeps a bad client out of the service.
  event_type: z.enum(writableSignals() as [string, ...string[]]),
  page: z.string().max(255).optional(),
  lesson_id: z.string().uuid().optional(),
  duration_ms: z.number().int().nonnegative().max(86_400_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.post(
  '/api/portal/explorer-signals',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SignalBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid signal', issues: parsed.error.issues });
      return;
    }

    // The enrollment id is the token's subject. Any enrollment_id in the body is
    // ignored by construction — it is not part of the schema at all.
    const enrollmentId = req.participant?.sub;
    if (!enrollmentId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await recordLearnerSignal({
      enrollmentId,
      eventType: parsed.data.event_type,
      page: parsed.data.page ?? null,
      lessonId: parsed.data.lesson_id ?? null,
      durationMs: parsed.data.duration_ms ?? null,
      metadata: (parsed.data.metadata ?? null) as Record<string, unknown> | null,
    });

    // Always 202: the client is reporting, not requesting. A learner's page must
    // not care whether ingest is enabled, deduped, or failed — the outcome is
    // returned for observability, never as an error status.
    res.status(202).json({ accepted: result.written, outcome: result.outcome });
  },
);

export default router;
