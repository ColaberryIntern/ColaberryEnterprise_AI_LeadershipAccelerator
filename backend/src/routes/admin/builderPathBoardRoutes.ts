/**
 * The owner's cross-builder read: where everyone is, and what is waiting on Ali.
 *
 * ## Why `requireAdmin` here and `requireSection('dashboard')` on the sibling
 *
 * `agent-domains-mine` records the principle both follow: *"Section access decides whether you may
 * ask; ownership decides what comes back."* The self-scoped candidate routes resolve the caller's
 * own identity and return only their domains, so a builder reaching one learns nothing about
 * anybody else. THIS route returns all ten domains by design, so its safety cannot come from the
 * handler — it has to come from the door. That is the same split the ten-domain
 * `/api/admin/agent-domains` read already makes.
 *
 * ## It still needs a PATH_SECTION row
 *
 * `mgmtSectionGate` runs before the router and is deny-by-default for a scoped role. An unmapped
 * prefix 403s with nothing in the response explaining why, which is AF8.3's recorded failure: six
 * correctly-scoped interns got 403 on the page built for them and it was only found by walking all
 * six through production. The row maps it to `program`, the section the other programme-wide reads
 * already use, and `requireAdmin` is the narrower gate that actually decides.
 *
 * ## Read-only
 *
 * No write routes. Every mutation a builder makes goes through the self-scoped router, where it is
 * scoped at the query. An owner-facing write surface would need its own identity guarding and is
 * not what this board is for.
 */

import { Router, type Request, type Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { builderPathBoard } from '../../services/agentDomain/builderPathBoard';

const router = Router();

/**
 * Wraps an async handler so a rejection becomes a 500 instead of nothing at all.
 *
 * Express 4 does not route a rejected promise to the error handler and this repo has no
 * `express-async-errors`. A sibling router shipped without this and returned NOTHING to the caller
 * when its database mock rejected.
 */
function guarded(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    handler(req, res).catch((err: unknown) => {
      const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({
        level: 'error',
        service: 'backend',
        event: 'builder_path_board_failed',
        error_class,
        outcome: 'failure',
        context: { path: req.path },
      }));
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not read the builder path board.', error_class });
      }
    });
  };
}

router.get(
  '/api/admin/builder-path-board',
  requireAdmin,
  guarded(async (_req: Request, res: Response) => {
    res.json(await builderPathBoard());
  }),
);

export default router;
