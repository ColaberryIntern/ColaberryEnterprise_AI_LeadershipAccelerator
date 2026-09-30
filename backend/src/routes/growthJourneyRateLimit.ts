import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';

/**
 * The rate limit for the Growth Journey surfaces (Phase 6, T612).
 *
 * 120 requests a minute, the same numbers `explorerSignalRoutes.ts` and
 * `trackingRoutes` already use, so there is one answer in this repo to "how
 * fast may a client hit us" rather than a third.
 *
 * ─── PATH-SCOPED AT THE CALL SITE. NEVER `router.use(limiter)` BARE ─────────
 *
 * Sub-routers in this app mount with NO path prefix (`router.use(gjRoutes)`),
 * so a bare `router.use(...)` gates every request that reaches the router -
 * including traffic belonging to completely unrelated routers mounted after
 * it. `explorerSignalRoutes.ts` records two production outages from exactly
 * that, and `growthJourneyStatusRoutes.ts` repeats the rule for its own guard.
 * Every call site here passes a prefix.
 *
 * ─── WHY THE THREE ADMIN ROUTERS SHARE ONE INSTANCE ────────────────────────
 *
 * `router.use(prefix, mw)` runs `mw` for ANY request whose path starts with
 * `prefix` and then calls `next()` - it does not require that this router own
 * the route. The three admin routers are mounted status -> read -> journey over
 * ONE prefix, and `growthJourneyReadRoutes` has to scope at the bare
 * `/api/admin/growth-journey` because eight of its routes live directly there
 * (`/decisions/snapshots`, `/content/rules`, ...) rather than under its
 * `/performance` base. So a request for `growthJourneyRoutes`' own
 * `/participations` passes through the read router's limiter FIRST and then the
 * journey router's - two counts for one request, halving the effective limit
 * for most of the surface and making "the 121st request is refused" untrue.
 *
 * One shared instance plus a re-entry mark fixes that: whichever router sees a
 * request first counts it, and the others skip it. The limit is therefore 120
 * per minute per caller across the whole admin surface, which is what the
 * number was meant to mean. A cell drives a path that traverses two routers and
 * asserts the refusal lands on the 121st request, not the 61st.
 *
 * ─── AND WHY THE PORTAL ROUTER DOES NOT SHARE IT ───────────────────────────
 *
 * `journeyNudgeRoutes` is a learner surface on a different prefix, authed as a
 * participant. An admin id means nothing there, and sharing the admin instance
 * would put a learner and an admin in the same IP bucket - one could exhaust
 * the other's budget. It gets its own bucket from the same factory.
 */

export const GROWTH_JOURNEY_RATE_WINDOW_MS = 60 * 1000;
export const GROWTH_JOURNEY_RATE_MAX = 120;

/** Set on the request by whichever limiter counted it. See the header. */
const COUNTED = '__growthJourneyRateCounted';

/**
 * WHO is being limited - and why `req.ip` is the last resort, not the first.
 *
 * `req.ip` IS NOT A CALLER ON THIS DEPLOYMENT. Traffic arrives Cloudflare -> nginx
 * -> Express and `server.ts` sets `trust proxy` to 1, so Express resolves `req.ip`
 * to the Cloudflare EDGE NODE. `middlewares/authFailureLog.ts` records a week of
 * `admin_auth_failed` rows in August 2026 that could only ever name the CDN, and
 * ends with the rule this file must obey: "Nothing here becomes an authorization
 * or rate-limiting input."
 *
 * The first version of this file broke that rule. It keyed on `req.admin?.sub`
 * with an IP fallback and was mounted ABOVE `requireAdmin` - where `req.admin` is
 * never set, because no guard runs before it on this surface. So the admin branch
 * was dead code in production and every caller behind one Cloudflare PoP shared a
 * single 120/minute bucket. Worse, an unauthenticated flood would have spent that
 * bucket and 429'd every legitimate admin behind the same edge.
 *
 * So the limiter is now mounted BELOW A GUARD WHOSE PREFIX MATCHES ITS OWN, on every
 * router, and the key prefers the identity that guard set. `edge:` is deliberately
 * spelled out on the fallback so that anything reading a key can see it names a CDN
 * rather than a person.
 *
 * "Below the guard" IS NOT ENOUGH ON ITS OWN, and the second attempt at this proved it.
 * `growthJourneyReadRoutes` mounted one limiter over the whole `/api/admin/growth-journey`
 * prefix, below its own guards - but that prefix is BROADER than any guard in that file,
 * so requests for `growthJourneyRoutes`' paths reached it with no guard ahead and were
 * keyed to the edge on twelve routes, five of them writes. The re-entry mark below then
 * made the journey router's correctly-placed limiter SKIP them, so `edge:` was not a
 * fallback there - it was the only key that ever ran. Same edit also pushed that limiter
 * below five `router.get` registrations, and Express matches layers in order, so those
 * five lost their limit entirely. Neither was visible to a positional scan.
 *
 * The rule that actually holds: ONE LIMITER PER GUARDED PREFIX, mounted directly after
 * that prefix's guard and above the routes it covers. Asserted per route, as behaviour,
 * in `routes/admin/__tests__/growthJourneyRateLimitMount.phase6.test.ts`. The trade is that an unauthenticated flood is no longer counted here -
 * it is rejected by the guard's JWT verify, which is the same cheap rejection
 * every other admin route in this repo already relies on, and is a far smaller
 * cost than locking out every admin behind a PoP.
 *
 * Widening `trust proxy` would make the real client IP available and is
 * DELIBERATELY NOT DONE here: `authFailureLog.ts` explains that it would make
 * X-Forwarded-For load-bearing and spoofable end to end. That is a posture
 * decision for Ali, not for a limiter.
 *
 * `sub` is the identity, NOT `email`: both payloads carry an address beside it, and
 * a rate-limit key reaches the store and the library's own error paths. The IP
 * branch goes through the library's `ipKeyGenerator` because a custom generator
 * returning a bare `req.ip` trips v8's ERR_ERL_KEY_GEN_IPV6 validation.
 */
export function callerKey(req: Request): string {
  const adminSub = req.admin?.sub;
  if (adminSub) return `admin:${adminSub}`;
  const participantSub = req.participant?.sub;
  if (participantSub) return `participant:${participantSub}`;
  return `edge:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
}

/**
 * A limiter with its own bucket. `bucket` namespaces the key, so two limiters
 * built here never share a budget even for the same caller.
 */
export function makeGrowthJourneyLimiter(bucket: string): RequestHandler {
  return rateLimit({
    windowMs: GROWTH_JOURNEY_RATE_WINDOW_MS,
    max: GROWTH_JOURNEY_RATE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${bucket}|${callerKey(req as Request)}`,
    // One count per request, not one per router it passes through - see the header.
    skip: (req) => {
      const r = req as Request & { [COUNTED]?: string };
      if (r[COUNTED] === bucket) return true;
      r[COUNTED] = bucket;
      return false;
    },
  });
}

/**
 * The ONE instance the three admin routers share. Exported as a value rather
 * than built per file on purpose: four instances would be four buckets, and the
 * re-entry mark above only collapses double counting within a single bucket.
 */
export const growthJourneyAdminLimiter = makeGrowthJourneyLimiter('growth-journey-admin');
