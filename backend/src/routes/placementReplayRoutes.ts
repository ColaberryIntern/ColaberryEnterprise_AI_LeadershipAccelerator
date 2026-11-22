import { Router, type Request, type RequestHandler, type Response } from 'express';
import rateLimit, { type Store } from 'express-rate-limit';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireCareerPrep } from './careerPrepRoutes';
import { logFailure, sendValidated } from './campusRoutes';
import { signedLink } from './placementRoomRoutes';
import { candidateReplay, checkRecordingLink, employerReplay } from '../services/placement/replayView';
import { storedRecording } from '../services/placement/replayStore';
import { roomProvider } from '../services/placement/roomProvider';

/**
 * Career Prep v27, CP9.2 (kit F5 "replay"): a held interview's replay (services/placement/replayView.ts).
 *
 *   candidate  GET /api/portal/career-prep/replays/:interviewId         participant + Career Prep; own only (404). The
 *                                                                         status, score and per-question feedback.
 *   employer   GET /api/public/room/:interviewId/replay?e=&t=            the signed room link (checked FIRST, 401), then a
 *                                                                         limiter per link. Status, recording, their notes;
 *                                                                         NEVER the candidate's feedback (strict schema).
 *   recording  GET /api/public/replays/:interviewId/recording?x=&t=      the one-hour path the two answers above carry
 *                                                                         (signature first, 401), per-link limit, then the
 *                                                                         MP4 streamed from Zoom through our server.
 * No answer carries the meeting provider's link or Zoom's download location. Never cached.
 */
const Id = z.object({ interviewId: z.string().uuid() }).strict();
const NoQuery = z.object({}).strict();
const RecQuery = z.object({ x: z.string().regex(/^\d{1,15}$/), t: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

const iso = z.string().datetime();
const Part = z.object({ score: z.number().int().min(0).max(100), value: z.string(), target: z.string() }).strict();
const Question = z.object({
  n: z.number().int().positive(), question: z.string().nullable(), answer: z.string(), at: z.number().int().min(0), seconds: z.number().int().min(0),
  pace: Part.nullable(), fillers: Part.nullable(),
  content: z.object({ score: z.number().int().min(0).max(100), covered: z.number().int().min(0), of: z.number().int().positive() }).strict().nullable(),
}).strict();
const RecPath = z.string().regex(/^\/api\/public\/replays\/[0-9a-f-]{36}\/recording\?x=\d+&t=[A-Za-z0-9_-]{43}$/).nullable();
const head = { interviewId: z.string().uuid(), company: z.string().nullable(), role: z.string().nullable(), startsAt: iso.nullable(), note: z.string(), recording: RecPath };
export const CandidateReplayResponse = z.object({ replay: z.object({ ...head,
  status: z.enum(['not_held', 'not_recorded', 'waiting', 'scored', 'no_score', 'unavailable']), score: z.number().int().min(0).max(100).nullable(),
  questions: z.array(Question).max(15) }).strict() }).strict();
export const EmployerReplayResponse = z.object({ replay: z.object({ ...head,
  status: z.enum(['not_held', 'not_recorded', 'waiting', 'recorded', 'unavailable']),
  notes: z.array(z.object({ id: z.string(), body: z.string(), at: iso }).strict()) }).strict() }).strict();

const TOO_MANY = { error: 'Too many requests. Please try again in a few minutes.' };
const LOAD_FAILED = 'Could not load the replay. Try again in a moment.';

const candidateView: RequestHandler = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const p = Id.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'interviewId must be an interview id.' }); return; }
  if (!NoQuery.safeParse(req.query).success) { res.status(400).json({ error: 'The replay takes no query parameters.' }); return; }
  try {
    const r = await candidateReplay(req.participant!.sub, p.data.interviewId, new Date());
    if (!r) { res.status(404).json({ error: 'Not found' }); return; }
    sendValidated(res, CandidateReplayResponse, { replay: r }, 'placement_replay_candidate');
  } catch (err) {
    logFailure('placement_replay_candidate_failed', err);
    res.status(500).json({ error: LOAD_FAILED });
  }
};

function employerView(now: () => Date): RequestHandler {
  return async (req, res) => {
    const p = Id.safeParse(req.params);
    if (!p.success) { res.status(400).json({ error: 'interviewId must be an interview id.' }); return; }
    try {
      const r = await employerReplay(p.data.interviewId, Number((req.query as { e: string }).e), now());
      if (r.status === 'ok') { sendValidated(res, EmployerReplayResponse, { replay: r.replay }, 'placement_replay_employer'); return; }
      if (r.status === 'not_found') { res.status(404).json({ error: 'Not found' }); return; }
      res.status(410).json({ error: r.status === 'moved' ? 'This interview was moved to a new time. Use the link in the newest email.' : 'This interview is not booked right now.', reason: r.status });
    } catch (err) {
      logFailure('placement_replay_employer_failed', err);
      res.status(500).json({ error: LOAD_FAILED });
    }
  };
}

/** FIRST on the recording route: the one-hour signature, with no store, limiter or database touched. */
function signedRecording(now: () => Date): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const q = RecQuery.safeParse(req.query);
    const check = q.success ? checkRecordingLink({ i: String(req.params.interviewId ?? ''), x: q.data.x, t: q.data.t, now: now() }) : 'invalid';
    if (check === 'ok') { next(); return; }
    res.status(401).json({ error: check === 'expired' ? 'This recording link has expired. Open the replay again.' : 'This recording link is not valid.', reason: check });
  };
}

export interface ReplayRouterOptions { now?: () => Date; makeStore?: () => Store; stream?: typeof roomProvider.streamRecording }

function recording(stream: typeof roomProvider.streamRecording): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const rec = await storedRecording(String(req.params.interviewId));
      if (!rec) { res.status(404).json({ error: 'There is no recording to play.' }); return; }
      const body = await stream(rec);
      res.status(200).set({ 'Content-Type': 'video/mp4', ...(rec.sizeBytes ? { 'Content-Length': String(rec.sizeBytes) } : {}) });
      body.on('error', (err) => { logFailure('placement_replay_stream_broke', err); res.destroy(); });
      body.pipe(res);
    } catch (err) {
      logFailure('placement_replay_recording_failed', err);
      if (!res.headersSent) res.status(502).json({ error: 'Could not reach the recording. Try again in a moment.' });
    }
  };
}

/** A factory, so each mount owns its limiter stores, clock and stream (tests inject them); production mounts the default. */
export function createReplayRouters(opts: ReplayRouterOptions = {}): { candidate: Router; public: Router } {
  const now = opts.now ?? (() => new Date());
  const limiter = (windowMs: number, max: number, bucket: string, part: 'e' | 'x') =>
    rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: TOO_MANY, ...(opts.makeStore ? { store: opts.makeStore() } : {}),
      keyGenerator: (req) => `${bucket}|${String((req as Request).params.interviewId)}|${String((req as Request).query[part])}` });
  const cand = Router();
  cand.get('/api/portal/career-prep/replays/:interviewId', requireParticipant, requireCareerPrep, candidateView);
  const pub = Router();
  pub.get('/api/public/room/:interviewId/replay', signedLink(now), limiter(60 * 1000, 60, 'room-replay', 'e'), employerView(now));
  pub.get('/api/public/replays/:interviewId/recording', signedRecording(now), limiter(15 * 60 * 1000, 30, 'replay-recording', 'x'),
    recording(opts.stream ?? ((rec) => roomProvider.streamRecording(rec))));
  return { candidate: cand, public: pub };
}

export const replayRouters = createReplayRouters();
