import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure, sendValidated } from '../campusRoutes';
import { actorOf } from './commsHubEventRoutes';
import { listBoard } from '../../services/commsHub/board/messageBoard';
import { activityFeed } from '../../services/commsHub/board/activityFeed';
import { readHubSettings, setSendingPaused, SettingsInputError, updateHubSettings } from '../../services/commsHub/board/hubSettings';
import { ActivityResponse, BoardQuery, BoardResponse, PauseBody, SettingsBody, SettingsView } from '../../services/commsHub/board/boardSchemas';
// Importing the counters registers the Today tiles that messages and settings own.
import '../../services/commsHub/board/boardCounters';

/**
 * Today and Schedule & history (CH7.4), under /api/admin/comms-hub: the message board, the safety
 * controls (pause, quiet hours, alert recipients, test cohort) and the activity log. Every route is
 * gated 'comms_hub' and Zod-first; a refused input is a 400 with a sentence, a failure a plain 500.
 */
const gate = requireSection('comms_hub');
const router = Router();
const base = '/api/admin/comms-hub';

function bad(res: Response, err: z.ZodError): void {
  res.status(400).json({ error: err.issues[0]?.message ?? 'That was not valid.', error_class: 'ValidationError' });
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof SettingsInputError) { res.status(400).json({ error: err.message, error_class: 'ValidationError' }); return; }
  logFailure(event, err);
  res.status(500).json({ error: 'That did not work. Try again.' });
}

export async function boardRoute(req: Request, res: Response): Promise<void> {
  const q = BoardQuery.safeParse(req.query);
  if (!q.success) { bad(res, q.error); return; }
  try {
    const rows = await listBoard({ scope: q.data.scope, status: q.data.status ? q.data.status.split(',') : null, channel: q.data.channel ?? null, event_id: q.data.event_id ?? null, limit: q.data.limit });
    sendValidated(res, BoardResponse, { rows }, 'comms_hub_board');
  } catch (err) { fail(res, err, 'comms_hub_board_failed'); }
}

export async function getSettingsRoute(_req: Request, res: Response): Promise<void> {
  try { sendValidated(res, SettingsView, await readHubSettings(), 'comms_hub_settings'); } catch (err) { fail(res, err, 'comms_hub_settings_read_failed'); }
}

export async function putSettingsRoute(req: Request, res: Response): Promise<void> {
  const b = SettingsBody.safeParse(req.body ?? {});
  if (!b.success) { bad(res, b.error); return; }
  try { sendValidated(res, SettingsView, await updateHubSettings(b.data, actorOf(req)), 'comms_hub_settings'); } catch (err) { fail(res, err, 'comms_hub_settings_write_failed'); }
}

export async function pauseRoute(req: Request, res: Response): Promise<void> {
  const b = PauseBody.safeParse(req.body ?? {});
  if (!b.success) { bad(res, b.error); return; }
  try { sendValidated(res, SettingsView, await setSendingPaused(b.data.paused, actorOf(req)), 'comms_hub_settings'); } catch (err) { fail(res, err, 'comms_hub_pause_failed'); }
}

const ActivityQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }).strict();
export async function activityRoute(req: Request, res: Response): Promise<void> {
  const q = ActivityQuery.safeParse(req.query);
  if (!q.success) { bad(res, q.error); return; }
  try { sendValidated(res, ActivityResponse, { activity: await activityFeed(q.data.limit ?? 20) }, 'comms_hub_activity'); } catch (err) { fail(res, err, 'comms_hub_activity_failed'); }
}

router.get(`${base}/board`, gate, boardRoute);
router.get(`${base}/settings`, gate, getSettingsRoute);
router.put(`${base}/settings`, gate, putSettingsRoute);
router.post(`${base}/settings/pause`, gate, pauseRoute);
router.get(`${base}/activity`, gate, activityRoute);

export default router;
