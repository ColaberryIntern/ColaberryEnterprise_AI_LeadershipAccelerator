/**
 * Platform Operations — the admin surface behind /admin/system/operations.
 *
 * ## Why it is gated on `system`
 *
 * This page answers "what is running, and is it alive" across the whole fleet, naming every
 * scheduled agent, its cadence, its failures and the timers nobody is watching. That is the
 * `system` section by any reading, and `mgmtRoles.ts` already grants `['dashboard','system']`
 * to the `platform` role, which is the role this page was built for. There is a matching
 * `['/api/admin/system/operations', 'system']` row in `mgmtSectionGate.ts`: without it the
 * gate runs first, classifies the path as null and 403s every scoped identity before
 * `requireSection` can admit them.
 *
 * ## Read-only, deliberately
 *
 * Every endpoint here is a GET. The Fleet tab draws buttons that stop, enable and reschedule
 * things, and none of them are wired yet — those are the Controls tab, which is its own
 * phase with its own approval. Shipping the reads first means a person can SEE the fleet
 * before anyone can change it from a browser, which is the safer order.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { getFleetPanels, DEFAULT_LOOKBACK_DAYS, DEFAULT_WINDOW_HOURS } from '../../services/platformOperations/fleetService';

const router = Router();

/**
 * Query contract. Both are bounded rather than free: `window_hours` above a week stops being
 * "is it alive now", and an unbounded `lookback_days` is a full table scan on a page people
 * open when the system is already unwell.
 */
const fleetQuery = z.object({
  window_hours: z.coerce.number().int().min(1).max(168).default(DEFAULT_WINDOW_HOURS),
  lookback_days: z.coerce.number().int().min(1).max(90).default(DEFAULT_LOOKBACK_DAYS),
});

router.get(
  '/api/admin/system/operations/fleet',
  requireSection('system'),
  async (req: Request, res: Response) => {
    const parsed = fleetQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query',
        code: 'invalid_query',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    try {
      const panels = await getFleetPanels({
        windowHours: parsed.data.window_hours,
        lookbackDays: parsed.data.lookback_days,
      });
      res.json(panels);
    } catch (err) {
      // The page is a health surface. If it cannot read, it says so plainly rather than
      // rendering empty panels, which would read as "nothing is scheduled" — the most
      // dangerous wrong answer this tab could give.
      const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
      console.error(JSON.stringify({
        level: 'error',
        service: 'platform-operations',
        event: 'fleet_read_failed',
        outcome: 'failure',
        error_class,
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
      res.status(503).json({
        error: 'The fleet could not be read, so this page cannot tell you whether it is alive.',
        code: 'fleet_unavailable',
        error_class,
      });
    }
  },
);

export default router;
