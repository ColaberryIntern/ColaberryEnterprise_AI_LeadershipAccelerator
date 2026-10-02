import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { requireParticipant } from '../middlewares/participantAuth';
import { attachCommunityStaffContext } from '../middlewares/communityRoomsStaffContext';
import * as c from '../controllers/broadcastController';

/**
 * Colaberry Live — broadcast routes.
 *
 * Three deliberate choices, each copied from a lesson this repo already paid for:
 *
 *  - EVERY guard is attached PER ROUTE, never `router.use(guard)`. Sub-routers here mount
 *    without a path prefix, so an unscoped guard gates unrelated traffic — the comment in
 *    explorerSignalRoutes records that this caused two production outages.
 *
 *  - The flag gate runs BEFORE auth, so a disabled feature returns a clean 404 instead of
 *    a 401 that looks like a broken login (communityRoomsRoutes:16).
 *
 *  - Read-only impersonation is NOT re-checked here. participantAuth:53 already blocks
 *    non-safe methods for a read-only token, and a second copy of that rule is one that can
 *    drift out of agreement with the first.
 */

const router = Router();

function flagGate(_req: Request, res: Response, next: NextFunction): void {
  if (!env.broadcastEnabled) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}

/**
 * Playback grants are minted per viewer, per asset, and are short-lived, so a player
 * renews them routinely — the limit has to clear normal renewal while still bounding a
 * scraper. Unlike the fire-and-forget instrumentation limiter in explorerSignalRoutes,
 * this one returns a real 429: a player that is being throttled must find out, because
 * silently returning 204 would look like an empty grant and fail confusingly.
 */
const playbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'RateLimited', reason: 'too_many_playback_requests' });
  },
});

/** Producer commands are rare and deliberate; a flood is a bug or an attack, not normal use. */
const commandLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'RateLimited', reason: 'too_many_commands' });
  },
});

const P = '/api/portal/broadcasts';

// attachCommunityStaffContext resolves whether this participant is staff, which is how
// producer rights are decided. Without it the controller would see every caller as a
// non-producer and every command would 403. The viewer route needs it too, because an
// admin watching a private occurrence is allowed through on that same signal.
//
// Written out per route rather than spread from a shared array: the limiter differs
// between the two, and a reader should be able to see each route's full chain on one line
// without resolving an array slice.
router.post(
  `${P}/:id/command`,
  flagGate, commandLimiter, requireParticipant, attachCommunityStaffContext,
  c.postProducerCommand,
);

router.post(
  `${P}/:id/playback`,
  flagGate, playbackLimiter, requireParticipant, attachCommunityStaffContext,
  c.postPlaybackGrant,
);

export default router;
