import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure } from '../campusRoutes';
import { LivePanelError, prepareLive, readIngest, readLivePanel, runLiveCommand } from '../../services/commsHub/live/livePanel';
import { actorOf } from './commsHubEventRoutes';

/**
 * The event's Live panel (CH5.2), under /api/admin/comms-hub/events/:id/live. Gated 'comms_hub' like
 * the rest of the hub (Jackie and Taiwo), calling the broadcast services directly. The ingest route
 * is the only place the stream key leaves the server: no-store, and the key is never logged.
 */
const Params = z.object({ id: z.string().uuid() }).strict();
const PrepareBody = z.object({ starts_at: z.string().datetime().nullable().optional() }).strict();
const CommandBody = z.object({ command: z.enum(['go_live', 'end', 'return_to_scheduled']), expected_version: z.number().int().nonnegative() }).strict();

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof LivePanelError) { res.status(err.status).json({ error: err.message, reason: err.reason }); return; }
  // The error itself, never the request: a body here could only be a command, but the rule is simple.
  logFailure(event, err);
  res.status(500).json({ error: 'Something went wrong with the live stream. Try again.' });
}

export async function panelRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  try { res.json(await readLivePanel(p.data.id)); } catch (err) { fail(res, err, 'comms_hub_live_panel_failed'); }
}

export async function prepareRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  const b = PrepareBody.safeParse(req.body ?? {});
  if (!p.success || !b.success) { res.status(400).json({ error: 'Say which event (and optionally which date).' }); return; }
  try { res.json(await prepareLive(p.data.id, b.data.starts_at ? new Date(b.data.starts_at) : null, actorOf(req))); } catch (err) { fail(res, err, 'comms_hub_live_prepare_failed'); }
}

export async function commandRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  const b = CommandBody.safeParse(req.body ?? {});
  if (!p.success || !b.success) { res.status(400).json({ error: 'Say which command (go_live, end, return_to_scheduled) and the version you saw.' }); return; }
  try { res.json(await runLiveCommand(p.data.id, b.data.command, b.data.expected_version, actorOf(req))); } catch (err) { fail(res, err, 'comms_hub_live_command_failed'); }
}

export async function ingestRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  res.set('Cache-Control', 'no-store');
  try { res.json(await readIngest(p.data.id)); } catch (err) { fail(res, err, 'comms_hub_live_ingest_failed'); }
}

const gate = requireSection('comms_hub');
const router = Router();
router.get('/api/admin/comms-hub/events/:id/live', gate, panelRoute);
router.post('/api/admin/comms-hub/events/:id/live/prepare', gate, prepareRoute);
router.post('/api/admin/comms-hub/events/:id/live/command', gate, commandRoute);
router.get('/api/admin/comms-hub/events/:id/live/ingest', gate, ingestRoute);

export default router;
