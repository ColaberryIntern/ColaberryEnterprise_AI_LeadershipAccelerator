import { Router } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireContentEntitlement } from '../middlewares/requireContentEntitlement';
import { handleGetCareerProfile } from '../controllers/careerPortfolioController';

/**
 * Living Career Portfolio — the private Career Studio at /portal/portfolio.
 *
 * Both gates are deliberate and ordered:
 *   requireParticipant        — who are you (401 if nobody)
 *   requireContentEntitlement — may you open a paid surface (402 if not)
 *
 * `requireContentEntitlement` is the SAME middleware Classroom and Projects use,
 * flag-gated on CONTENT_PAGE_GATE_ENABLED and fail-open, not a second ad hoc
 * subscription check (build plan §2.5, §71). The third gate — "have you uploaded
 * a resume" — lives in the service, because it decides what data may be
 * assembled rather than whether the request is allowed at all.
 *
 * Read-only by design: this increment publishes nothing, so there is no write
 * route here to secure.
 */
const router = Router();

router.get(
  '/api/portal/career/profile',
  requireParticipant,
  requireContentEntitlement('portfolio'),
  handleGetCareerProfile,
);

export default router;
