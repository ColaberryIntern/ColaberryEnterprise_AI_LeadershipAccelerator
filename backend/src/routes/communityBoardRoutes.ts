import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { getBoard } from '../services/community/boardService';
import { markSeen } from '../services/community/boardSeen';
import { LANES } from '../services/community/boardModel';
import { classifyError } from '../utils/errorClassifier';

/**
 * The Community Board API (Campus v14 B1, Basecamp C65 / C66). Participant-authed per route and behind the campus pilot, like every
 * campus route; the viewer and their cohort come ONLY from the token (boardService scopes exactly like GET /community/posts).
 *
 *   GET  /api/portal/community/board?lane=&q=&older_cursor=&counts_only=1   the board in sections (counts_only: no posts, for badges)
 *   POST /api/portal/community/board/seen { post_id?, at?, migrate? }       mark the board (or one of your posts) seen; idempotent
 *
 * `migrate` carries the browser's old localStorage value once (it never moves a server mark). Read-only "view as" tokens are refused
 * for POSTs by requireParticipant, so a staff preview never marks anything seen for the learner.
 */
export const BoardQuerySchema = z.object({
  lane: z.enum(LANES).optional(),
  q: z.string().trim().max(120).optional(),
  older_cursor: z.string().max(120).optional(),
  counts_only: z.enum(['1', 'true']).optional(),
}).strict();

export const SeenBodySchema = z.object({
  post_id: z.string().uuid().optional(),
  at: z.string().datetime({ offset: true }).optional(),
  migrate: z.boolean().optional(),
}).strict().refine((b) => !b.migrate || (!!b.at && !b.post_id), { message: 'migrate needs at and no post_id' });

function fail(res: Response, event: string, err: unknown): void {
  const error_class = classifyError(err);
  console.error(JSON.stringify({ level: 'error', service: 'community-board', event, outcome: 'failure', error_class, message: (err as Error)?.message?.slice(0, 200) ?? null }));
  res.status(500).json({ error: 'The board is unavailable right now', error_class });
}

export async function getBoardRoute(req: Request, res: Response): Promise<void> {
  const parsed = BoardQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid query', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  const q = parsed.data;
  try {
    res.json(await getBoard(req.participant!.sub, {
      lane: q.lane ?? 'all', q: q.q, olderCursor: q.older_cursor ?? null, countsOnly: !!q.counts_only,
    }));
  } catch (err) { fail(res, 'community_board_read_failed', err); }
}

export async function postSeenRoute(req: Request, res: Response): Promise<void> {
  const parsed = SeenBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  const b = parsed.data;
  try {
    const seen_at = await markSeen(req.participant!.sub, b.post_id ? `post:${b.post_id}` : 'board', b.at, !!b.migrate);
    res.json({ seen_at });
  } catch (err) { fail(res, 'community_board_seen_failed', err); }
}

const router = Router();
router.get('/api/portal/community/board', requireParticipant, getBoardRoute);
router.post('/api/portal/community/board/seen', requireParticipant, postSeenRoute);
export default router;
