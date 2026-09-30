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
 * Per-admin when we know who is asking, per-IP when we do not.
 *
 * `req.admin` is populated by each router's own path-scoped `requireAdmin`, and
 * the limiter is mounted BEFORE that guard so an unauthenticated flood is bounded
 * too - so in practice this keys by IP for anyone who has not authenticated and
 * by admin id for anyone whose request already passed a guard upstream. The IP
 * branch goes through the library's `ipKeyGenerator`: a custom key generator that
 * returns a bare `req.ip` trips v8's ERR_ERL_KEY_GEN_IPV6 validation, because a
 * single IPv6 address is one of trillions a client may hold.
 *
 * `sub` is the identity, NOT `email`: the same payload carries an address, and a
 * rate-limit key reaches the store and the library's own error paths. An address
 * must never become a key here - the rule this phase carries everywhere is that
 * ids are never emails.
 */
export function callerKey(req: Request): string {
  const sub = req.admin?.sub;
  if (sub) return `admin:${sub}`;
  return ipKeyGenerator(req.ip ?? '0.0.0.0');
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
