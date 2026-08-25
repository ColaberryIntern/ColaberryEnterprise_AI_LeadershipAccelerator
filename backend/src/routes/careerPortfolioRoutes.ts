import { Router } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireContentEntitlement } from '../middlewares/requireContentEntitlement';
import { handleGetCareerProfile } from '../controllers/careerPortfolioController';
import { handleGetPublicationStatus, handleRequestReview, handleSetVisibility } from '../controllers/careerPublicationController';

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

// Gate 10 — the learner's own publication state and their request for review.
// Same two gates as the profile read: authenticated, and entitled.
router.get(
  '/api/portal/career/publication',
  requireParticipant,
  requireContentEntitlement('portfolio'),
  handleGetPublicationStatus,
);

router.post(
  '/api/portal/career/publication/request-review',
  requireParticipant,
  requireContentEntitlement('portfolio'),
  handleRequestReview,
);

// The learner's own choice of audience. Default stays unlisted/noindex; `public` is
// their explicit opt-in to being indexable (Ali, 2026-08-25).
router.put(
  '/api/portal/career/publication/visibility',
  requireParticipant,
  requireContentEntitlement('portfolio'),
  handleSetVisibility,
);

export default router;
