import { Router } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { handleGetSkillProfile } from '../controllers/capePortalController';

const router = Router();

router.get('/api/portal/cape/skill-profile', requireParticipant, handleGetSkillProfile);

export default router;
