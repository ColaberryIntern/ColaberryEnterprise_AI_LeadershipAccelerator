import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import {
  loadCapabilityBoard,
  loadUndecidedChangeRequests,
} from '../../services/agentDomain/capabilityBoardService';
import { configuredApprovers } from '../../services/agentDomain/approverConfiguration';

/**
 * AF11.10 — the five-column board.
 *
 * One read, no writes. The board derives every column from records that already exist, so there
 * is nothing here that could set a stage: a route that could write one would be the second
 * source of truth the whole design refuses.
 *
 * `requireAdmin`, and the prefix `/api/admin/agent-domain-capability-board` gets its own
 * `mgmtSectionGate` row in this change. The gate is DENY-BY-DEFAULT, so an unmapped prefix
 * reaches a 403 with nothing in the logs saying why, which is how a route ships looking broken.
 */

const router = Router();

/**
 * GET — every capability in flight, placed, with who is holding each one and for how long.
 *
 * `?domain_key=` narrows it to one builder's board. Omitted, it is every domain, which is the
 * view the ticket is actually about: *"Ali reads column two and nothing else."*
 */
router.get(
  '/api/admin/agent-domain-capability-board',
  requireAdmin,
  async (req, res) => {
    const viewerEmail = (req as unknown as { admin?: { email?: string } }).admin?.email ?? '';
    const domainKey = String(req.query.domain_key ?? '').trim() || null;
    try {
      const now = new Date();
      // The approver comes from configuration, never a literal: Ali's ruling says "for now", and
      // a hardcoded identity is how a temporary decision becomes permanent.
      const approverEmail = configuredApprovers()[0] ?? '';
      const [board, undecidedChangeRequests] = await Promise.all([
        loadCapabilityBoard({ sequelize, viewerEmail, approverEmail, domainKey, now }),
        loadUndecidedChangeRequests(sequelize, now),
      ]);
      res.json({ board, undecided_change_requests: undecidedChangeRequests });
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'capability_board_unavailable',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
      // A board that cannot be read must say so. Returning an empty board would read as "nothing
      // is in flight", which is the most misleading thing this endpoint could say.
      res.status(500).json({ error: 'Could not read the capability board.' });
    }
  },
);

export default router;
