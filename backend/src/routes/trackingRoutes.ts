import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handleTrackEvent, handleTrackBatch, handleHeartbeat } from '../controllers/trackingController';
import {
  handleChatStart,
  handleChatMessage,
  handleChatClose,
  handleChatHistory,
  handleProactiveCheck,
} from '../controllers/chatController';

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

// Chat endpoints (public, rate-limited)
const chatStartLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => { res.status(429).json({ error: 'Rate limit exceeded' }); },
});

const chatMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => { res.status(429).json({ error: 'Rate limit exceeded' }); },
});

router.post('/api/chat/start', chatStartLimiter, handleChatStart);
router.post('/api/chat/message', chatMessageLimiter, handleChatMessage);
router.post('/api/chat/close', chatMessageLimiter, handleChatClose);
router.get('/api/chat/history/:id', handleChatHistory);
router.get('/api/chat/proactive-check', handleProactiveCheck);

export default router;
