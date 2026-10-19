import rateLimit from 'express-rate-limit';
import type { Request, RequestHandler, Response } from 'express';

/**
 * A per-PARTICIPANT rate limiter with its own bucket and budget (Colaberry Campus C10). Mount it AFTER requireParticipant: the key is
 * the token's `sub`, because req.ip is the Cloudflare edge here and would put every learner behind one PoP in one bucket (see
 * growthJourneyRateLimit.ts, whose limiter hard-codes 120/min; this one takes the budget). Over the budget: 429 with RateLimited.
 */
export function makeParticipantLimiter(bucket: string, max: number, windowMs = 60_000): RequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${bucket}|participant:${(req as Request).participant?.sub ?? 'none'}`,
    handler: (_req, res: Response) => { res.status(429).json({ error: 'Too many requests. Try again in a minute.', error_class: 'RateLimited' }); },
  });
}
