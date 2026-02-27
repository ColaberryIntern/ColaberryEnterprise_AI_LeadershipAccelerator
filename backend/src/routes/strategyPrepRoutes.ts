import { Router } from 'express';
import multer from 'multer';
import { handleGetPrep, handleSubmitPrep, handleUploadFile } from '../controllers/strategyPrepController';
import { strategyPrepUpload } from '../config/upload';

const router = Router();

router.get('/api/strategy-prep/:token', handleGetPrep);
router.post('/api/strategy-prep/:token', handleSubmitPrep);

// Wrap multer middleware to catch file filter / size errors and return 400 instead of 500
router.post('/api/strategy-prep/:token/upload', (req, res, next) => {
  strategyPrepUpload.single('file')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}, handleUploadFile);

export default router;
