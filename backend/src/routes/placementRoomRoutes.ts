import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit, { type Store } from 'express-rate-limit';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireCareerPrep } from './careerPrepRoutes';
import { logFailure, sendValidated } from './campusRoutes';
import { checkRoomLink } from '../services/placement/roomLink';
import { decide, openRoom, type Caller, type RoomResult } from '../services/placement/roomService';

/**
 * Career Prep v27, CP9.1 (kit F5): the interview room's data. THE ONLY ROUTES that may return the meeting provider's
 * join link (`room.join.url`), and only when roomService says so (booked, at the booked time, inside the window, after
 * the caller's own decision, recording read-back matching consent). Mounted through boot/placementBoot.ts.
 *
 *   candidate  GET  /api/portal/career-prep/room/:interviewId            participant session + Career Prep; own only (404)
 *              POST /api/portal/career-prep/room/:interviewId/consent    { decision: 'consent' | 'decline' }
 *   employer   GET  /api/public/room/:interviewId?e=<end ms>&t=<sig>    the signed link from the booking email (roomLink.ts)
 *              POST /api/public/room/:interviewId/consent?e=&t=          same body
 * Employer order: (1) the link is checked FIRST, no store or database touched: not signed by us for this interview and
 * end time = 401 "not valid"; a genuine link past the end + 2 hours = 401 "has expired"; (2) a limiter per LINK (never
 * req.ip, the Cloudflare edge here); (3) the handler. Answers: not open yet 403 (with opensAt), moved 410, not booked or
 * ended 410, meeting not ready 409, bad input 400. Never cached.
 */
const Id = z.object({ interviewId: z.string().uuid() }).strict();
const NoQuery = z.object({}).strict();
const LinkQuery = z.object({ e: z.string().regex(/^\d{1,15}$/), t: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const DecisionBody = z.object({ decision: z.enum(['consent', 'decline']) }).strict();

const iso = z.string().datetime();
export const RoomResponse = z.object({ room: z.object({
  interviewId: z.string().uuid(), you: z.enum(['candidate', 'employer']), company: z.string().nullable(), role: z.string().nullable(),
  startsAt: iso, endsAt: iso, opensAt: iso, yourDecision: z.enum(['consent', 'decline']).nullable(),
  consent: z.object({ consented: z.number().int().min(0), of: z.number().int().positive(), declined: z.boolean(), label: z.string() }).strict(),
  recording: z.object({ status: z.enum(['off', 'starting', 'on', 'declined', 'unavailable', 'failed']), note: z.string().nullable() }).strict(),
  join: z.object({ status: z.enum(['decide_first', 'starting', 'withheld', 'ready']), url: z.string().url().nullable(), reason: z.string().nullable() }).strict(),
}).strict() }).strict();

const LINK_INVALID = 'This room link is not valid.';
const LINK_EXPIRED = 'This link has expired.';
const TOO_MANY = { error: 'Too many requests. Please try again in a few minutes.' };

/** One mapping from the service's answer to HTTP, shared by all four routes. */
export function answer(res: Response, r: RoomResult): void {
  switch (r.status) {
    case 'ok': sendValidated(res, RoomResponse, { room: r.view }, 'placement_room'); return;
    case 'not_open': res.status(403).json({ error: 'The room opens 10 minutes before the interview.', opensAt: r.opensAt }); return;
    case 'moved': res.status(410).json({ error: 'This interview was moved to a new time. Use the link in the newest email.', reason: 'moved' }); return;
    case 'not_booked': res.status(410).json({ error: 'This interview is not booked right now.', reason: 'not_booked' }); return;
    case 'ended': res.status(410).json({ error: 'This interview has ended.', reason: 'ended' }); return;
    case 'not_ready': res.status(409).json({ error: 'The meeting is still being set up. Try again in a minute.', reason: 'not_ready' }); return;
    default: res.status(404).json({ error: 'Not found' });
  }
}

export interface RoomRouterOptions { now?: () => Date; makeStore?: () => Store }

function handler(kind: 'view' | 'decide', caller: (req: Request, res: Response) => Caller | null, now: () => Date): RequestHandler {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const p = Id.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'interviewId must be an interview id.' }); return; }
    const c = caller(req, res);
    if (!c) return;
    const b = kind === 'decide' ? DecisionBody.safeParse(req.body ?? {}) : null;
    if (b && !b.success) { res.status(400).json({ error: "decision must be 'consent' or 'decline'." }); return; }
    try {
      answer(res, b?.success ? await decide(c, p.data.interviewId, b.data.decision, now()) : await openRoom(c, p.data.interviewId, now()));
    } catch (err) {
      logFailure(`placement_room_${kind}_failed`, err);
      res.status(500).json({ error: 'Could not load the interview room. Try again in a moment.' });
    }
  };
}

const candidate = (req: Request, res: Response): Caller | null => {
  if (!NoQuery.safeParse(req.query).success) { res.status(400).json({ error: 'This room takes no query parameters.' }); return null; }
  return { party: 'candidate', enrollmentId: req.participant!.sub };
};
const employer = (req: Request): Caller => ({ party: 'employer', endMs: Number((req.query as { e: string }).e) });

/** FIRST on the employer routes: the signed link, checked with no store, limiter or database touched. */
function signedLink(now: () => Date): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    const q = LinkQuery.safeParse(req.query);
    const id = String(req.params.interviewId ?? '');
    const check = q.success ? checkRoomLink({ i: id, e: q.data.e, t: q.data.t, now: now() }) : 'invalid';
    if (check === 'ok') { next(); return; }
    res.status(401).json({ error: check === 'expired' ? LINK_EXPIRED : LINK_INVALID, reason: check });
  };
}

/** A factory, so each mount owns its limiter stores and clock (tests inject both); production mounts the default. */
export function createRoomRouters(opts: RoomRouterOptions = {}): { candidate: Router; employer: Router } {
  const now = opts.now ?? (() => new Date());
  const limiter = (windowMs: number, max: number, bucket: string) =>
    rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: TOO_MANY, ...(opts.makeStore ? { store: opts.makeStore() } : {}),
      keyGenerator: (req) => `${bucket}|${String((req as Request).params.interviewId)}|${String((req as Request).query.e)}` });
  const cand = Router();
  cand.get('/api/portal/career-prep/room/:interviewId', requireParticipant, requireCareerPrep, handler('view', candidate, now));
  cand.post('/api/portal/career-prep/room/:interviewId/consent', requireParticipant, requireCareerPrep, handler('decide', candidate, now));
  const emp = Router();
  emp.get('/api/public/room/:interviewId', signedLink(now), limiter(60 * 1000, 60, 'room-view'), handler('view', employer, now));
  emp.post('/api/public/room/:interviewId/consent', signedLink(now), limiter(15 * 60 * 1000, 20, 'room-decide'), handler('decide', employer, now));
  return { candidate: cand, employer: emp };
}

export const roomRouters = createRoomRouters();
