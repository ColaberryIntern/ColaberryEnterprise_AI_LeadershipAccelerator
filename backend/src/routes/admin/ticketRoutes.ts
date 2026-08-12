import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  createTicket,
  updateTicketStatus,
  assignTicket,
  addTicketComment,
  getTicketById,
  getTicketsForBoard,
  getTicketStats,
  updateTicket,
} from '../../services/ticketService';
import { dispatchTicketToAgent } from '../../services/ticketAgentDispatcher';
import type { TicketStatus, TicketPriority, TicketType } from '../../models/Ticket';
import { getEvidenceForTicket } from '../../services/evidence/evidenceService';
import { getDecisionsForTicket, recordDecision, DecisionRecordValidationError } from '../../services/evidence/decisionRecordService';
import { generateTicketSummary } from '../../services/workLedger/summaryGeneratorService';
import {
  createWorkUnit,
  listWorkUnitsForTicket,
  addWorkUnitDependency,
  getWorkGraphForTicket,
  WorkGraphValidationError,
} from '../../services/workGraph/workGraphService';
import { retryFailedRun } from '../../services/workGraph/workCoordinatorService';

import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

// SECURITY (TBI audit P0-1): this admin sub-router shipped with NO auth, leaving its
// endpoints publicly callable. Require an authenticated admin for every route below.
// Scoped to this router's own path prefix — see autonomyRoutes.ts for why an
// unscoped `router.use(requireAdmin)` here was silently 401-ing unrelated public
// routes (e.g. the chat widget) mounted later in server.ts.
router.use('/tickets', requireAdmin);

// ROUTING FIX (discovered during ProofDesk Milestone 2, T010): every route string in
// this file previously started with bare `/tickets...`, but `adminRoutes.ts` mounts
// this router with `router.use(ticketRoutes)` (no path prefix), and `server.ts` mounts
// `adminRoutes` with `app.use(adminRoutes)` (also no prefix) — matching the convention
// every OTHER admin sub-router uses (e.g. `cohortRoutes.ts` bakes `/api/admin/cohorts`
// into its own route strings). Because this file's routes were missing that prefix,
// none of them — including the 10 pre-existing ones, not just Milestone 2's 4 new
// ones — actually resolved at `/api/admin/tickets/*`, the exact URL every caller
// (`AdminTicketBoardPage.tsx`, `TicketDetailModal.tsx`, and this milestone's new tab
// components) has always called. Confirmed via a real-module mount test (no scratch
// reimplementation): `GET /tickets/board` matched and reached the DB-backed handler,
// while `GET /api/admin/tickets/board` 404'd. Fixed by prefixing every route string
// below with `/api/admin`, matching the established repo-wide convention exactly.

// ── List with filters ────────────────────────────────────────────────────
router.get('/api/admin/tickets', async (req: Request, res: Response) => {
  try {
    const { status, priority, type, source, assigned_to_id, entity_type, entity_id } = req.query;
    const board = await getTicketsForBoard({
      status: status as TicketStatus | undefined,
      priority: priority as TicketPriority | undefined,
      type: type as TicketType | undefined,
      source: source as string | undefined,
      assigned_to_id: assigned_to_id as string | undefined,
      entity_type: entity_type as string | undefined,
      entity_id: entity_id as string | undefined,
    });

    // Flatten for list view
    const all = Object.values(board).flat();
    res.json({ tickets: all, total: all.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Kanban board format ──────────────────────────────────────────────────
router.get('/api/admin/tickets/board', async (req: Request, res: Response) => {
  try {
    const { status, priority, type, source, assigned_to_id } = req.query;
    const board = await getTicketsForBoard({
      status: status as TicketStatus | undefined,
      priority: priority as TicketPriority | undefined,
      type: type as TicketType | undefined,
      source: source as string | undefined,
      assigned_to_id: assigned_to_id as string | undefined,
    });
    res.json({ board });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ────────────────────────────────────────────────────────────────
router.get('/api/admin/tickets/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getTicketStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Detail with activities ───────────────────────────────────────────────
router.get('/api/admin/tickets/:id', async (req: Request, res: Response) => {
  try {
    const result = await getTicketById(String(req.params.id));
    if (!result) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create ───────────────────────────────────────────────────────────────
router.post('/api/admin/tickets', async (req: Request, res: Response) => {
  try {
    const ticket = await createTicket({
      ...req.body,
      created_by_type: req.body.created_by_type || 'human',
      created_by_id: req.body.created_by_id || (req as any).user?.id || 'system',
    });
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Update fields ────────────────────────────────────────────────────────
router.patch('/api/admin/tickets/:id', async (req: Request, res: Response) => {
  try {
    const { title, description, priority, type, estimated_effort, due_date, metadata, confidence } = req.body;
    const ticket = await updateTicket(
      String(req.params.id),
      { title, description, priority, type, estimated_effort, due_date, metadata, confidence },
      req.body.actor_type || 'human',
      req.body.actor_id || (req as any).user?.id || 'system',
    );
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Status transition ────────────────────────────────────────────────────
router.patch('/api/admin/tickets/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, actor_type, actor_id } = req.body;
    const ticket = await updateTicketStatus(
      String(req.params.id),
      status,
      actor_type || 'human',
      actor_id || (req as any).user?.id || 'system',
    );
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Assignment ───────────────────────────────────────────────────────────
router.patch('/api/admin/tickets/:id/assign', async (req: Request, res: Response) => {
  try {
    const { assigned_to_type, assigned_to_id, actor_type, actor_id } = req.body;
    const ticket = await assignTicket(
      String(req.params.id),
      assigned_to_type,
      assigned_to_id,
      actor_type || 'human',
      actor_id || (req as any).user?.id || 'system',
    );
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Add comment ──────────────────────────────────────────────────────────
router.post('/api/admin/tickets/:id/comment', async (req: Request, res: Response) => {
  try {
    const { comment, actor_type, actor_id } = req.body;
    if (!comment) return res.status(400).json({ error: 'comment is required' });
    const activity = await addTicketComment(
      String(req.params.id),
      comment,
      actor_type || 'human',
      actor_id || (req as any).user?.id || 'system',
    );
    res.status(201).json(activity);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Dispatch to agent ────────────────────────────────────────────────────
router.post('/api/admin/tickets/:id/dispatch', async (req: Request, res: Response) => {
  try {
    const result = await dispatchTicketToAgent(String(req.params.id));
    if (!result) return res.json({ message: 'No matching agent found', dispatched: false });
    res.json({ dispatched: true, agent: result.agent_name, result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── ProofDesk Milestone 2 (Proof & Ticket Experience) ───────────────────────
// Evidence / summary / decisions surfaces powering TicketDetailModal's new tabs.
// All 4 routes below sit behind this router's existing `requireAdmin` (line ~22).

// ── Evidence (Visual Proof tab) ──────────────────────────────────────────
router.get('/api/admin/tickets/:id/evidence', async (req: Request, res: Response) => {
  try {
    const evidence = await getEvidenceForTicket(String(req.params.id));
    res.json({ evidence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Summary (Story tab) ──────────────────────────────────────────────────
router.get('/api/admin/tickets/:id/summary', async (req: Request, res: Response) => {
  try {
    const summary = await generateTicketSummary(String(req.params.id));
    res.json(summary);
  } catch (err: any) {
    if (err.message?.includes('not found')) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Decisions (Decisions tab) ────────────────────────────────────────────
router.get('/api/admin/tickets/:id/decisions', async (req: Request, res: Response) => {
  try {
    const decisions = await getDecisionsForTicket(String(req.params.id));
    res.json({ decisions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/tickets/:id/decisions', async (req: Request, res: Response) => {
  try {
    const { decision_type, rationale, linked_evidence_ids, actor_type, actor_id } = req.body;
    const decision = await recordDecision({
      ticketId: String(req.params.id),
      decisionType: decision_type,
      actorType: actor_type || 'human',
      actorId: actor_id || (req as any).user?.id || 'system',
      rationale,
      linkedEvidenceIds: linked_evidence_ids,
    });
    res.status(201).json(decision);
  } catch (err: any) {
    if (err instanceof DecisionRecordValidationError) {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

// ── ProofDesk Milestone 3 (Multi-Agent Work Graph) ──────────────────────────
// Work-unit CRUD, dependency edges, the unified Work Graph tab read, and retry.
// All routes below sit behind this router's existing `requireAdmin` (line ~25).

// ── Work units ────────────────────────────────────────────────────────────
router.get('/api/admin/tickets/:id/work-units', async (req: Request, res: Response) => {
  try {
    const workUnits = await listWorkUnitsForTicket(String(req.params.id));
    res.json({ workUnits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/tickets/:id/work-units', async (req: Request, res: Response) => {
  try {
    const workUnit = await createWorkUnit(String(req.params.id), req.body);
    res.status(201).json(workUnit);
  } catch (err: any) {
    if (err instanceof WorkGraphValidationError) {
      return res.status(400).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

// ── Dependency edges ─────────────────────────────────────────────────────
router.post(
  '/api/admin/tickets/:id/work-units/:workUnitId/dependencies',
  async (req: Request, res: Response) => {
    try {
      const dependency = await addWorkUnitDependency(String(req.params.workUnitId), req.body);
      res.status(201).json(dependency);
    } catch (err: any) {
      if (err instanceof WorkGraphValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// ── Unified Work Graph read (Work Graph tab) ────────────────────────────
router.get('/api/admin/tickets/:id/work-graph', async (req: Request, res: Response) => {
  try {
    const graph = await getWorkGraphForTicket(String(req.params.id));
    res.json(graph);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Retry (T008's retry/handoff lineage, wired to a route) ──────────────
router.post('/api/admin/tickets/:id/retry', async (req: Request, res: Response) => {
  try {
    const result = await retryFailedRun(String(req.params.id));
    if (result === null) {
      return res.status(404).json({ error: 'No failed run found to retry for this ticket' });
    }
    res.json({ retried: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
