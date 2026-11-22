import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit, { type Store } from 'express-rate-limit';
import { z } from 'zod';
import { logFailure, sendValidated } from './campusRoutes';
import { signedLink } from './placementRoomRoutes';
import { addNote, employerGuide, MAX_NOTE_CHARS, MAX_NOTES, type GuideFail } from '../services/placement/roomGuide';

/**
 * Career Prep v27, CP9.1 (kit F5): the employer room page's side panel, the interview guide and private notes
 * (services/placement/roomGuide.ts). Only the employer's signed room link opens them; no candidate route returns a note.
 *
 *   GET  /api/public/room/:interviewId/guide?e=<end ms>&t=<sig>   { guide: { company, role, questions, notes } }
 *   POST /api/public/room/:interviewId/notes?e=&t=                { key: <uuid per Save>, body: 1 to 2000 characters }
 *                                                                  201 the new note; 200 the same Save again (replay)
 * Order, like the room routes: (1) the signed link FIRST (401 not valid / expired), (2) a limiter per LINK (never
 * req.ip, the Cloudflare edge), (3) the POST's OWN 16kb JSON parser (this router mounts before server.ts's global 5mb
 * one, placementBoot INTEGRATION_ROUTERS), (4) Zod, (5) the handler. Answers: moved 410, not booked 410, unknown 404,
 * notes full 409. Never cached. No answer here carries the meeting provider's link (no field for it exists).
 */
const Id = z.object({ interviewId: z.string().uuid() }).strict();
export const NoteBody = z.object({ key: z.string().uuid(), body: z.string().trim().min(1).max(MAX_NOTE_CHARS) }).strict();

const Note = z.object({ id: z.string(), body: z.string(), at: z.string().datetime() }).strict();
const GuideShape = z.object({ company: z.string().nullable(), role: z.string().nullable(), questions: z.array(z.string()).nullable(), notes: z.array(Note) }).strict();
export const GuideResponse = z.object({ guide: GuideShape }).strict();
export const NoteResponse = z.object({ note: Note, replay: z.boolean(), guide: GuideShape }).strict();

const TOO_MANY = { error: 'Too many requests. Please try again in a few minutes.' };

function fail(res: Response, r: GuideFail | { status: 'full' }): void {
  if (r.status === 'moved') { res.status(410).json({ error: 'This interview was moved to a new time. Use the link in the newest email.', reason: 'moved' }); return; }
  if (r.status === 'not_booked') { res.status(410).json({ error: 'This interview is not booked right now.', reason: 'not_booked' }); return; }
  if (r.status === 'full') { res.status(409).json({ error: `This interview already has ${MAX_NOTES} notes, the most it can hold.`, reason: 'full' }); return; }
  res.status(404).json({ error: 'Not found' });
}

/** The POST's own JSON parser, its errors answered as JSON (too large 413, unreadable 400). */
const smallJson = express.json({ limit: '16kb' });
function noteJson(req: Request, res: Response, next: NextFunction): void {
  smallJson(req, res, (err?: unknown) => {
    if (!err) { next(); return; }
    const status = (err as { status?: number })?.status === 413 ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'That note is too long.' : 'Send the note as JSON.' });
  });
}

const endOf = (req: Request) => Number((req.query as { e: string }).e);

const viewGuide: RequestHandler = async (req, res) => {
  const p = Id.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'interviewId must be an interview id.' }); return; }
  try {
    const r = await employerGuide(p.data.interviewId, endOf(req));
    if (r.status === 'ok') sendValidated(res, GuideResponse, { guide: r.guide }, 'placement_room_guide'); else fail(res, r);
  } catch (err) {
    logFailure('placement_room_guide_failed', err);
    res.status(500).json({ error: 'Could not load the interview guide. Try again in a moment.' });
  }
};

const saveNote: RequestHandler = async (req, res) => {
  const p = Id.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'interviewId must be an interview id.' }); return; }
  const b = NoteBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: `A note needs a key and 1 to ${MAX_NOTE_CHARS} characters of text.` }); return; }
  try {
    const r = await addNote(p.data.interviewId, endOf(req), b.data.key, b.data.body);
    if (r.status !== 'ok') { fail(res, r); return; }
    res.status(r.replay ? 200 : 201);
    sendValidated(res, NoteResponse, { note: r.note, replay: r.replay, guide: r.guide }, 'placement_room_note');
  } catch (err) {
    logFailure('placement_room_note_failed', err);
    res.status(500).json({ error: 'Could not save the note. Try again in a moment.' });
  }
};

export interface GuideRouterOptions { now?: () => Date; makeStore?: () => Store }

/** A factory, so each mount owns its limiter stores and clock (tests inject both); production mounts the default. */
export function createRoomGuideRouter(opts: GuideRouterOptions = {}): Router {
  const now = opts.now ?? (() => new Date());
  const limiter = (windowMs: number, max: number, bucket: string) =>
    rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: TOO_MANY, ...(opts.makeStore ? { store: opts.makeStore() } : {}),
      keyGenerator: (req) => `${bucket}|${String((req as Request).params.interviewId)}|${String((req as Request).query.e)}` });
  const r = Router();
  r.get('/api/public/room/:interviewId/guide', signedLink(now), limiter(60 * 1000, 60, 'room-guide'), viewGuide);
  r.post('/api/public/room/:interviewId/notes', signedLink(now), limiter(15 * 60 * 1000, 30, 'room-notes'), noteJson, saveNote);
  return r;
}

export const roomGuideRouter = createRoomGuideRouter();
