import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getPublicGovCatalog } from '../services/factory/publicGovServices';

/**
 * publicServiceRoutes - the one public, unauthenticated read of the service
 * catalog, for the /government page.
 *
 * WHY A NEW ROUTER AND NOT AN ADMIN ROUTE WITHOUT THE GUARD
 *
 * Every existing read of `service_offerings` sits behind `requireSection`
 * ('program') plus a tenant resolved from the admin session. Relaxing one of
 * those would have made an admin endpoint conditionally public, which is how an
 * internal field leaks: the admin payload carries the evidence score, the
 * inside/outside split and the Gov-match counts, none of which a contracting
 * officer should see. A separate router with its own projection means the
 * public shape is defined by what it CONSTRUCTS, never by what it remembers to
 * strip.
 *
 * THE TENANT IS NOT TAKEN FROM THE REQUEST. `lookupGovContractsContainer()`
 * resolves it from the fixed slug `refactored`, is read-only, creates nothing,
 * and fails closed. So this needs no session to be correct: there is exactly
 * one catalog it can ever return, and no request field can redirect it.
 *
 * MOUNT ORDER IS LOAD-BEARING. `server.ts` must register this ABOVE
 * `app.use(adminRoutes)`, because adminRoutes mounts an unscoped
 * `requireAdmin`; registered after it, every anonymous visitor gets a 401.
 * `publicServiceRoutes.mount.test.ts` pins that.
 *
 * FAILURE MODES. Handled: an unresolvable government container (503, because
 * telling a contracting officer "no services" by accident is worse than
 * admitting we are down), a database error (generic 500), a flood (429). Not
 * handled, deliberately: nothing that would require inventing a catalog.
 */

const router = Router();

/** Generic. Never carries `err.message`, a row, an id or a query. */
const SERVER_ERROR_BODY = Object.freeze({ error: 'Unable to load services' });
/** Distinguishable from the 500 so a monitor can tell "down" from "misconfigured". */
const UNAVAILABLE_BODY = Object.freeze({ error: 'Service catalog unavailable' });

/**
 * Requests per minute per IP. Env-configurable so the limit is config rather
 * than a literal, and so the suite can prove a 429 without sending 120
 * requests.
 */
const RATE_LIMIT_MAX = Math.max(
  Number.parseInt(process.env.PUBLIC_SERVICES_RATE_LIMIT || '120', 10) || 120,
  1,
);

const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many requests' });
  },
});

/* PATH-SCOPED. NEVER a bare `router.use(publicReadLimiter)`: sub-routers mount
   without a path prefix in this app, so an unscoped middleware rate-limits
   unrelated traffic on every route registered after it. That has caused two
   production outages here - see the same warning in publicCaseStudyRoutes.ts
   and explorerSignalRoutes.ts. */
router.use('/api/public/services', publicReadLimiter);

/**
 * GET /api/public/services
 *
 * `?audience=gov` is accepted and ignored for now. It is in the contract
 * because the government page is the first consumer and will not be the last,
 * and a caller that pins its audience today keeps working when a second
 * projection appears. An unknown audience is not a 400: a marketing page
 * mistyping a query parameter should get the catalog, not an error.
 */
router.get('/api/public/services', async (_req: Request, res: Response) => {
  try {
    const catalog = await getPublicGovCatalog();
    if (!catalog) {
      res.status(503).json(UNAVAILABLE_BODY);
      return;
    }
    /* A public catalog changes when an admin edits it, so it must not be held
       by an intermediary for long. One minute keeps a burst off the database
       while still making an edit feel live, which is the whole point of the
       live-read decision. */
    res.set('Cache-Control', 'public, max-age=60');
    res.json(catalog);
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'backend',
      event: 'public_services_read_failed',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'Error',
    }));
    res.status(500).json(SERVER_ERROR_BODY);
  }
});

export default router;
