/**
 * Admin - every project's Connected Demo link. READ ONLY.
 *
 * ## Its own router, deliberately
 *
 * `projectOverviewRoutes.ts` is the natural home and it is 590 lines, already past this repo's
 * 500-line hard ceiling. CLAUDE.md's Modular Composition rule says the next change to such a file
 * must split it before adding to it, so this is a new file instead - the same call
 * `factoryDownstreamRoutes` and `caseStudyServiceLinkRoutes` made, for the same reason.
 *
 * ## The gate
 *
 * `requireAdmin` plus the section gate that runs once in `adminRoutes.ts`.
 * `/api/admin/projects` is ALREADY mapped to `program` in `mgmtSectionGate`'s `PATH_SECTION`, so
 * this path inherits it and no new row is needed. That matters: the gate is DENY-BY-DEFAULT for
 * scoped management roles, so a route family under an unmapped prefix 403s every scoped role while
 * looking fine to a legacy full admin. The accompanying test proves a real scoped token reaches
 * the handler rather than proving a row exists in a table.
 *
 * `scripts/lint-route-auth.js` substring-scans for guard names and would pass this file even if
 * the guard did nothing, so the 401 is ASSERTED in the test instead of inferred from the lint.
 *
 * ## Read only, and why staff cannot publish from here
 *
 * Publishing a demo exposes a student's work on an unauthenticated URL. That decision belongs to
 * the person whose work it is, through the participant control in `projectRoutes.ts`. This surface
 * shows staff what is already public; it cannot make anything public. The absence of a write
 * handler here is the feature.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { listDemoLinks, DEMO_DIRECTORY_MAX } from '../../services/sbp/demoLinkDirectory';

const router = Router();

/**
 * `limit` is coerced and bounded rather than trusted.
 *
 * `z.coerce.number()` because a query string is always text, and the bounds are here as well as
 * in the service: a 400 tells the caller what was wrong, where the service's clamp would silently
 * return a different page size than was asked for.
 */
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(DEMO_DIRECTORY_MAX).optional(),
});

/**
 * GET /api/admin/projects/demos
 *
 * Every live project with the state of its Connected Demo, newest first. `url` is present only
 * for a demo that is actually published, so the panel never renders a link that 404s.
 */
router.get('/api/admin/projects/demos', requireAdmin, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(await listDemoLinks(parsed.data.limit ?? 200));
  } catch (err) {
    const e = err as Error;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'admin-project-demos',
      event: 'demo_link_directory_failed',
      outcome: 'failure',
      error_class: e?.constructor?.name ?? 'Error',
      context: { message: e?.message },
    }));
    // No `err.message` in the body. This reads a raw query, and a driver message can name columns
    // and constraints; the log carries it for us instead.
    res.status(500).json({ error: 'Could not load the demo directory.' });
  }
});

export default router;
