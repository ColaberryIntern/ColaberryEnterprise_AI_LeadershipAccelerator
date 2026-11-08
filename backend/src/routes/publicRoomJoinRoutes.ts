import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import CommunityRoom from '../models/CommunityRoom';
import {
  ROOM_JOIN_PATH_PREFIX,
  isJoinTokenShape,
  resolveRoomJoin,
} from '../services/communityRooms/roomJoinToken';
import { joinTokenWhere } from '../services/communityRooms/roomJoinQuery';

/**
 * GET /api/public/rooms/join/:token — a room's stable join address.
 *
 * UNAUTHENTICATED BY DESIGN. This exists to be pasted into a recurring calendar
 * invite, and a calendar attendee is not logged in, so requiring a session would
 * defeat the only job it has. The token is the authorization; see
 * `services/communityRooms/roomJoinToken.ts` for why that is an acceptable
 * exposure and why it is strictly better than the raw Zoom link the invite
 * carries today.
 *
 * 302, NEVER 301. The whole point is that the target changes: a room gets
 * re-minted and the next click must follow the new link. A 301 is cached by the
 * browser more or less forever, so one click before a re-mint would pin that
 * person to the dead room — reintroducing the exact bug this route removes.
 * `Cache-Control: no-store` says the same thing to anything in between.
 *
 * 404 FOR EVERY REFUSAL, and `resolveRoomJoin` returns a reason only so it can be
 * logged. A 403 on a locked room, or a 410 on a room with no link, would each
 * confirm that a room exists behind that token. The token is the secret; a
 * distinguishable response leaks whether a guess was close.
 *
 * `X-Robots-Tag: noindex` because a link-holder address should not be indexed if
 * it ever leaks into a page a crawler can reach.
 */

const RATE_LIMIT_MAX = 60;

const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many requests' });
  },
});

const router = Router();

// PATH-SCOPED, NEVER BARE. Sub-routers mount without a path prefix in this app,
// so `router.use(joinLimiter)` would rate-limit every unrelated route registered
// after this one. That has already caused two production outages here — the same
// warning is on publicCaseStudyRoutes.ts and explorerSignalRoutes.ts.
router.use(ROOM_JOIN_PATH_PREFIX, joinLimiter);

router.get(`${ROOM_JOIN_PATH_PREFIX}/:token`, async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token || '');

  const notFound = (reason: string): void => {
    console.log(JSON.stringify({
      level: 'info',
      service: 'backend',
      event: 'room_join_token_refused',
      outcome: 'failure',
      // the token is a credential; its length is enough to tell a malformed
      // request from a well-formed one that simply does not resolve
      context: { reason, token_length: token.length },
    }));
    res.status(404).json({ error: 'Not found' });
  };

  // SHAPE FIRST, AND IT IS LOAD-BEARING FOR MORE THAN HYGIENE. Verified against
  // the real database: Sequelize's `Op.contains` does NOT bind the value as a
  // parameter, it inlines the json literal into the statement
  //   ... WHERE "metadata" @> '{"join_token":"<value>"}'
  // escaped by the query generator. So this `^[0-9a-f]{32}$` check is the thing
  // standing between a path segment and the SQL text. Do not relax it to
  // accommodate a longer or differently-encoded token without first confirming
  // the value is bound rather than interpolated.
  if (!isJoinTokenShape(token)) {
    notFound('bad_token_shape');
    return;
  }

  let room: CommunityRoom | null = null;
  try {
    // `@>` on the jsonb column, index-friendly if a GIN index is ever added.
    // The clause and the reason it needs a type assertion live in roomJoinQuery.
    room = await CommunityRoom.findOne({ where: joinTokenWhere(token) });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'backend',
      event: 'room_join_token_lookup_failed',
      outcome: 'failure',
      error_class: (err as Error)?.constructor?.name || 'Error',
      context: { message: (err as Error)?.message },
    }));
    res.status(503).json({ error: 'Unavailable' });
    return;
  }

  const decision = resolveRoomJoin(room, token);
  if (!decision.ok) {
    notFound(decision.reason);
    return;
  }

  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, decision.joinUrl);
});

export default router;
