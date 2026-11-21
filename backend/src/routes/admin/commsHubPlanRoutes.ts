import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure } from '../campusRoutes';
import { PLAN_KINDS, readPlan, setPlan } from '../../services/commsHub/messages/promotionPlan';
import { MessageRuleError } from '../../services/commsHub/messages/approvals';
import { DraftModelError } from '../../services/commsHub/messages/drafting';
import type { CommsHubPlanKind } from '../../models/CommsHubMessage';
import { actorOf } from './commsHubEventRoutes';

/**
 * The event's promotion plan (CH6.4), under /api/admin/comms-hub/events/:id/plan. PUT saves which
 * rows are ticked and drafts the messages that are due (each in needs_approval, never approved here).
 */
const Params = z.object({ id: z.string().uuid() }).strict();
const Body = z.object({ kinds: z.array(z.enum(PLAN_KINDS as [CommsHubPlanKind, ...CommsHubPlanKind[]])).max(4) }).strict();

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof MessageRuleError) { res.status(err.status).json({ error: err.message, reason: err.reason }); return; }
  if (err instanceof DraftModelError) { res.status(502).json({ error: `${err.message} The ticks were saved; press Draft these messages again.`, reason: 'model' }); return; }
  logFailure(event, err);
  res.status(500).json({ error: 'The promotion plan did not save. Try again.' });
}

export async function getPlanRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  try { res.json(await readPlan(p.data.id)); } catch (err) { fail(res, err, 'comms_hub_plan_read_failed'); }
}

export async function putPlanRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  const b = Body.safeParse(req.body ?? {});
  if (!p.success || !b.success) { res.status(400).json({ error: 'Send the rows to tick: announcement, reminder, starting_soon, recording_thanks.' }); return; }
  try {
    const { plan, result } = await setPlan(p.data.id, b.data.kinds, actorOf(req));
    res.json({ ...plan, result });
  } catch (err) { fail(res, err, 'comms_hub_plan_set_failed'); }
}

const gate = requireSection('comms_hub');
const router = Router();
router.get('/api/admin/comms-hub/events/:id/plan', gate, getPlanRoute);
router.put('/api/admin/comms-hub/events/:id/plan', gate, putPlanRoute);

export default router;
