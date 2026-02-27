import { Router } from 'express';
import { handleGetPrep, handleSubmitPrep } from '../controllers/strategyPrepController';

const router = Router();

router.get('/api/strategy-prep/:token', handleGetPrep);
router.post('/api/strategy-prep/:token', handleSubmitPrep);

export default router;
