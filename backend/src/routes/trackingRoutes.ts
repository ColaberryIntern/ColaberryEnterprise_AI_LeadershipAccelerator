import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handleTrackEvent, handleTrackBatch, handleHeartbeat, handleIdentify } from '../controllers/trackingController';
import { handlePortalSession } from '../controllers/portalTrackingController';
import { requireParticipant } from '../middlewares/participantAuth';
import {
  handleChatStart,
  handleChatMessage,
  handleChatClose,
  handleChatHistory,
  handleProactiveCheck,
  handleContextUpdate,
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
router.post('/api/t/identify', eventLimiter, handleIdentify);

// Signed-in portal sessions. requireParticipant is not optional here: the whole design
// is that eligibility and identity are decided from the token rather than asserted by
// the page. Rate-limited with the same bucket as events - it is called once per portal
// mount, so anything approaching that ceiling is not a real browser.
router.post('/api/t/portal-session', eventLimiter, requireParticipant, handlePortalSession);

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
router.post('/api/chat/context-update', chatMessageLimiter, handleContextUpdate);

export default router;
