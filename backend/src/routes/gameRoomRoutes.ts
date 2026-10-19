import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { makeParticipantLimiter } from './participantLimiter';
import { GAMES } from '../services/gameRoom/gameRoomRules';
import { timeFor, startRun, beat, submitScore, leaderboard } from '../services/gameRoom/gameRoomService';

/**
 * The Game Room (Colaberry Campus C10). Participant-authed per route; read-only "view as" tokens are refused on every POST by
 * requireParticipant; behind the campus pilot (403 CampusNotEnabled); per-participant limits. The client never sends a duration:
 * play time is measured by the server between a run's own beats (gameRoomService). Never writes learning points.
 */
const GameEnum = z.enum(GAMES);
const StartBody = z.object({ game: GameEnum }).strict();
const BeatBody = z.object({ run_id: z.string().uuid() }).strict();
const ScoreBody = z.object({ run_id: z.string().uuid(), score: z.number().int().min(0).max(10_000_000) }).strict();
const BoardQuery = z.object({ game: GameEnum }).strict();

export const TimeResponse = z.object({ used_s: z.number().int().nonnegative(), cap_s: z.number().int(), left_s: z.number().int().nonnegative(), resets_at: z.string() }).strict();
export const StartResponse = z.object({ run_id: z.string(), left_s: z.number().int().nonnegative() }).strict();
export const BeatResponse = z.object({ left_s: z.number().int().nonnegative() }).strict();
export const ScoreResponse = z.object({ score: z.number().int(), seconds_used: z.number().int(), replayed: z.boolean() }).strict();
export const BoardResponse = z.object({
  week_start: z.string(),
  rows: z.array(z.object({ rank: z.number().int(), name: z.string(), score: z.number().int(), you: z.boolean() }).strict()),
}).strict();

function sendValidated<T>(res: Response, schema: z.ZodType<T>, body: T, event: string): void {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'production') throw new Error(`ContractViolation: ${event} ` + parsed.error.message);
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: `${event}_contract_violation`, outcome: 'failure', error_class: 'ContractViolation' }));
  }
  res.json(body);
}

const REFUSALS: Record<string, number> = { CapReached: 403, RunExpired: 403, RunClosed: 409, RunNotFound: 404, ScoreRejected: 400 };

/** One handler shape for every route: validate, gate, run, map refusals, log the rest as 500. */
function route<B>(schema: z.ZodType<B> | null, from: 'body' | 'query', event: string,
  run: (req: Request, input: B) => Promise<unknown>, out: z.ZodType<unknown>) {
  return async (req: Request, res: Response): Promise<void> => {
    let input = undefined as unknown as B;
    if (schema) {
      const parsed = schema.safeParse((from === 'body' ? req.body : req.query) ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Invalid request', error_class: 'ValidationFailed' }); return; }
      input = parsed.data;
    }
    if (!campusOnFor(req)) { res.status(403).json({ error: 'The Game Room opens with the campus', error_class: 'CampusNotEnabled' }); return; }
    try {
      sendValidated(res, out, await run(req, input), event);
    } catch (err) {
      const e = err as { name?: string; message?: string; error_class?: string };
      if (e?.name === 'GameRoomError' && e.error_class && REFUSALS[e.error_class]) {
        res.status(REFUSALS[e.error_class]).json({ error: e.message, error_class: e.error_class });
        return;
      }
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: `${event}_failed`, outcome: 'failure',
        error_class: e?.name || 'UnknownError', context: { message: String(e?.message ?? '').slice(0, 200) } }));
      res.status(500).json({ error: 'The Game Room is unavailable right now', error_class: 'GameRoomUnavailable' });
    }
  };
}

const me = (req: Request) => req.participant!.sub;
const cohort = (req: Request) => (req.participant?.cohort_id as string | null | undefined) ?? null;

const router = Router();
router.get('/api/portal/game-room/time', requireParticipant, route(null, 'query', 'game_room_time', (req) => timeFor(me(req)), TimeResponse));
router.post('/api/portal/game-room/start', requireParticipant, makeParticipantLimiter('game-start', 10),
  route(StartBody, 'body', 'game_room_start', (req, b) => startRun(me(req), cohort(req), b.game), StartResponse));
router.post('/api/portal/game-room/beat', requireParticipant, makeParticipantLimiter('game-beat', 30),
  route(BeatBody, 'body', 'game_room_beat', (req, b) => beat(me(req), b.run_id), BeatResponse));
router.post('/api/portal/game-room/scores', requireParticipant, makeParticipantLimiter('game-score', 10),
  route(ScoreBody, 'body', 'game_room_score', (req, b) => submitScore(me(req), b.run_id, b.score), ScoreResponse));
router.get('/api/portal/game-room/scores', requireParticipant,
  route(BoardQuery, 'query', 'game_room_board', (req, q) => leaderboard(me(req), cohort(req), q.game), BoardResponse));

export default router;
