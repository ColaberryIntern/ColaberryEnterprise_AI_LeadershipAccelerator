import express, { Router } from 'express';
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

/**
 * Parse a JSON body that arrives labelled `text/plain`.
 *
 * WHY THIS EXISTS. `navigator.sendBeacon` is the only way to report anything as a page unloads,
 * and these pages beacon CROSS-ORIGIN (www.refactored.ai -> enterprise.colaberry.ai). A beacon
 * sent as `application/json` is not a CORS-simple request, so it needs a preflight OPTIONS; during
 * unload that preflight cannot complete and the browser DROPS the beacon. Measured: of 28
 * visitors who fired `cta_click` and therefore demonstrably left the page, zero produced the
 * `time_on_page` row the unload path was supposed to send. `text/plain` is CORS-safelisted, so the
 * tracker now sends that - and this parser is what makes the body readable at this end.
 *
 * SCOPED TO THESE ROUTES ON PURPOSE. The global `express.json()` in server.ts is left alone:
 * teaching every endpoint in the app to accept `text/plain` as JSON would widen the attack
 * surface of the whole API to fix one tracker. These four routes are public, rate-limited, and
 * already validate their own payloads.
 *
 * The limit is deliberately small. A beacon carries a handful of events; the global parser allows
 * 5mb, which is three orders of magnitude more than anything legitimate here.
 */
const beaconBody = express.json({
  type: ['application/json', 'text/plain'],
  limit: '64kb',
});

router.post('/api/t/event', eventLimiter, beaconBody, handleTrackEvent);
router.post('/api/t/batch', batchLimiter, beaconBody, handleTrackBatch);
router.post('/api/t/heartbeat', heartbeatLimiter, beaconBody, handleHeartbeat);
router.post('/api/t/identify', eventLimiter, beaconBody, handleIdentify);

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
