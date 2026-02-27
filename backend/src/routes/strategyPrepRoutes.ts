import { Router } from 'express';
import { handleGetPrep, handleSubmitPrep, handleUploadFile } from '../controllers/strategyPrepController';
import { strategyPrepUpload } from '../config/upload';

const router = Router();

router.get('/api/strategy-prep/:token', handleGetPrep);
router.post('/api/strategy-prep/:token', handleSubmitPrep);
router.post('/api/strategy-prep/:token/upload', strategyPrepUpload.single('file'), handleUploadFile);

export default router;
