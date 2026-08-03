import { Router } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { handleGetSkillProfile } from '../controllers/capePortalController';
import { handleStartDiagnostic, handleSubmitDiagnostic } from '../controllers/capeDiagnosticController';

const router = Router();

router.get('/api/portal/cape/skill-profile', requireParticipant, handleGetSkillProfile);

// CAPE Phase 2 — adaptive diagnostic + "test out" (design doc §5, §11). Both
// a system-prompted diagnostic and a learner-initiated "test out" trigger use
// these same 2 routes (see capeDiagnosticController.ts).
router.get('/api/portal/cape/diagnostic/:skillId', requireParticipant, handleStartDiagnostic);
router.post('/api/portal/cape/diagnostic/:skillId/submit', requireParticipant, handleSubmitDiagnostic);

export default router;
