import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { LANES } from '../services/community/boardModel';
import { classifyError } from '../utils/errorClassifier';

/**
 * Colaberry Now's stream (Campus v20 N2, Basecamp C133). Participant-authed, behind the campus pilot; the viewer and their cohort
 * come ONLY from the token (the board's own scoping, loadBoardContext).
 *
 *   GET /api/portal/community/board/stream?lane=&q=&cursor=   one endless list, newest first, 20 at a time (pinned first on Everything)
 *   GET /api/portal/community/board/since?after=<post id>     posts by others newer than that post: the "n new posts" pill
 *   GET /api/portal/colaberry-now/happening                   the Happening-now strip (each part null when its source fails)
 */
export const StreamQuery = z.object({
  lane: z.enum(LANES).optional(),
  q: z.string().trim().max(120).optional(),
  cursor: z.string().max(120).optional(),
}).strict();
export const SinceQuery = z.object({ after: z.string().uuid() }).strict();

function fail(res: Response, event: string, err: unknown): void {
  const error_class = classifyError(err);
  console.error(JSON.stringify({ level: 'error', service: 'colaberry-now', event, outcome: 'failure', error_class, message: (err as Error)?.message?.slice(0, 200) ?? null }));
  res.status(500).json({ error: 'Colaberry Now is unavailable right now', error_class });
}
function gate(req: Request, res: Response): boolean {
  if (campusOnFor(req)) return true;
  res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' });
  return false;
}
const invalid = (res: Response) => res.status(400).json({ error: 'Invalid query', error_class: 'ValidationFailed' });

export async function getStreamRoute(req: Request, res: Response): Promise<void> {
  const p = StreamQuery.safeParse(req.query ?? {});
  if (!p.success) { invalid(res); return; }
  if (!gate(req, res)) return;
  try {
    const { getStream } = await import('../services/community/boardStreamService');
    res.json(await getStream(req.participant!.sub, { lane: p.data.lane ?? 'all', q: p.data.q, cursor: p.data.cursor || null }));
  } catch (err) { fail(res, 'colaberry_now_stream_failed', err); }
}

export async function getSinceRoute(req: Request, res: Response): Promise<void> {
  const p = SinceQuery.safeParse(req.query ?? {});
  if (!p.success) { invalid(res); return; }
  if (!gate(req, res)) return;
  try {
    const { getSince } = await import('../services/community/boardStreamService');
    res.json(await getSince(req.participant!.sub, p.data.after));
  } catch (err) { fail(res, 'colaberry_now_since_failed', err); }
}

export async function getHappeningRoute(req: Request, res: Response): Promise<void> {
  if (Object.keys(req.query ?? {}).length) { invalid(res); return; }
  if (!gate(req, res)) return;
  try {
    const { getHappening } = await import('../services/colaberryNow/happeningService');
    res.json(await getHappening(req.participant!.sub, req.participant!.cohort_id ?? null));
  } catch (err) { fail(res, 'colaberry_now_happening_failed', err); }
}

const router = Router();
router.get('/api/portal/community/board/stream', requireParticipant, getStreamRoute);
router.get('/api/portal/community/board/since', requireParticipant, getSinceRoute);
router.get('/api/portal/colaberry-now/happening', requireParticipant, getHappeningRoute);
export default router;
