import { Router } from 'express';
import { submitLead } from '../controllers/leadController';

const router = Router();

router.post('/api/leads', submitLead);

export default router;
