import { Router } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { handleGetSkillProfile, handleGetSkillEvidenceHistory } from '../controllers/capePortalController';
import { handleStartDiagnostic, handleSubmitDiagnostic } from '../controllers/capeDiagnosticController';
import { handleGetTodayPlan, handlePostTodayPlanFeedback, handlePostTodayPlanTestOut } from '../controllers/capeTodayPlanController';

const router = Router();

router.get('/api/portal/cape/skill-profile', requireParticipant, handleGetSkillProfile);

// CAPE Phase 2 — adaptive diagnostic + "test out" (design doc §5, §11). Both
// a system-prompted diagnostic and a learner-initiated "test out" trigger use
// these same 2 routes (see capeDiagnosticController.ts).
router.get('/api/portal/cape/diagnostic/:skillId', requireParticipant, handleStartDiagnostic);
router.post('/api/portal/cape/diagnostic/:skillId/submit', requireParticipant, handleSubmitDiagnostic);

// CAPE Phase 5 — Today Plan + learner feedback controls (design doc §10, §11,
// §16 Phase 5). Flag-gated on CAPE_TODAY_PLAN_ENABLED inside each handler.
router.get('/api/portal/cape/today-plan', requireParticipant, handleGetTodayPlan);
router.post('/api/portal/cape/today-plan/feedback', requireParticipant, handlePostTodayPlanFeedback);
router.post('/api/portal/cape/today-plan/test-out', requireParticipant, handlePostTodayPlanTestOut);

// CAPE Phase 5 — skill-detail drawer evidence history (design doc §11 "AI
// Architecture Skills radar" click-through). NOT flag-gated at the route
// level (only reachable from flag-gated UI; extends the always-live Phase
// 0-1 skill-profile surface).
router.get('/api/portal/cape/skill-profile/:skillId/evidence', requireParticipant, handleGetSkillEvidenceHistory);

export default router;
