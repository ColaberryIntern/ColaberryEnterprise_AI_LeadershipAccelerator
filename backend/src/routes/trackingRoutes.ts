import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handleTrackEvent, handleTrackBatch, handleHeartbeat } from '../controllers/trackingController';

const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(204).end();
  },
});

const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(204).end();
  },
});

const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(204).end();
  },
});

const router = Router();

router.post('/api/t/event', eventLimiter, handleTrackEvent);
router.post('/api/t/batch', batchLimiter, handleTrackBatch);
router.post('/api/t/heartbeat', heartbeatLimiter, handleHeartbeat);

export default router;
