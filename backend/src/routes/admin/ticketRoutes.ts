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

const router = Router();

// ── List with filters ────────────────────────────────────────────────────
router.get('/tickets', async (req: Request, res: Response) => {
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
router.get('/tickets/board', async (req: Request, res: Response) => {
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
router.get('/tickets/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getTicketStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Detail with activities ───────────────────────────────────────────────
router.get('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const result = await getTicketById(String(req.params.id));
    if (!result) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create ───────────────────────────────────────────────────────────────
router.post('/tickets', async (req: Request, res: Response) => {
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
router.patch('/tickets/:id', async (req: Request, res: Response) => {
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
router.patch('/tickets/:id/status', async (req: Request, res: Response) => {
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
router.patch('/tickets/:id/assign', async (req: Request, res: Response) => {
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
router.post('/tickets/:id/comment', async (req: Request, res: Response) => {
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
router.post('/tickets/:id/dispatch', async (req: Request, res: Response) => {
  try {
    const result = await dispatchTicketToAgent(String(req.params.id));
    if (!result) return res.json({ message: 'No matching agent found', dispatched: false });
    res.json({ dispatched: true, agent: result.agent_name, result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
