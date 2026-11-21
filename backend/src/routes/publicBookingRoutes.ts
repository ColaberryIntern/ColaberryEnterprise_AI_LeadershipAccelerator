import express, { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { isTimeZone } from '../services/hire/hireSlots';
import { bookingView, confirmBooking, type Gone } from '../services/placement/bookingService';
import { hashBookingToken } from '../services/placement/bookingToken';

/**
 * Career Prep v27, CP8.2 (kit F4 step 3): the public booking API behind hire.refactored.ai/book/?t=<token>. No login: the
 * token is the key (bookingService.ts). Mounted through boot/placementBoot.ts with the other public routes.
 *
 *   GET  /api/public/booking/:token?tz=<booker zone>   the page's data; never the learner's email or phone
 *   POST /api/public/booking/:token/confirm            { slot, tz, interviewers }: book one open time
 *
 * Answers: unknown token 404 (one uniform message, so nothing can be probed); used, expired or no longer open 410 with a
 * plain reason; a time just taken, or the learner not taking bookings, 409; bad input 400. Never cached. The confirm
 * returns the consent-room PAGE link only, never the meeting provider's link (that comes from the room routes, T22).
 */
const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
const Params = z.object({ token: TOKEN }).strict();
const ViewQuery = z.object({ tz: z.string().max(64).refine(isTimeZone, 'tz').optional() }).strict();
export const ConfirmBody = z.object({
  slot: z.string().datetime(),
  tz: z.string().max(64).refine(isTimeZone, 'tz'),
  interviewers: z.array(z.string().trim().toLowerCase().email().max(254)).max(5).default([]),
}).strict();

const NOT_FOUND = 'This booking link is not valid.';
const GONE: Record<Gone, string> = {
  used: 'This booking link was already used to book a time.',
  expired: 'This booking link has expired. Reply to the email it came in and we will send a new one.',
  closed: 'This interview is no longer open for booking.',
};

function log(event: string, err: unknown): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable' }));
}

export async function getBooking(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(404).json({ error: NOT_FOUND }); return; }
  const q = ViewQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'tz must be a time zone such as America/New_York.' }); return; }
  try {
    const r = await bookingView(p.data.token, { tz: q.data.tz ?? null });
    if (r.status === 'not_found') { res.status(404).json({ error: NOT_FOUND }); return; }
    if (r.status === 'gone') { res.status(410).json({ error: GONE[r.reason], reason: r.reason }); return; }
    res.status(200).json({ booking: r.view });
  } catch (err) {
    log('public_booking_view_failed', err);
    res.status(500).json({ error: 'Could not load the booking page. Try again in a moment.' });
  }
}

export async function postConfirm(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(404).json({ error: NOT_FOUND }); return; }
  const b = ConfirmBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: 'Pick a time, your time zone, and at most 5 interviewer emails.', fields: b.error.issues.map((i) => i.path.join('.')).slice(0, 10) }); return; }
  try {
    const r = await confirmBooking(p.data.token, b.data);
    if (r.status === 'not_found') { res.status(404).json({ error: NOT_FOUND }); return; }
    if (r.status === 'gone') { res.status(410).json({ error: GONE[r.reason], reason: r.reason }); return; }
    if (r.status === 'taken') { res.status(409).json({ error: 'That time was just taken. Pick another.', reason: 'taken' }); return; }
    if (r.status === 'arranging') { res.status(409).json({ error: 'Times are being arranged with the candidate. We will be in touch.', reason: 'arranging' }); return; }
    res.status(200).json({ booked: { startsAt: r.startsAt, minutes: r.minutes, roomPage: r.roomPage }, replay: r.replay });
  } catch (err) {
    log('public_booking_confirm_failed', err);
    res.status(500).json({ error: 'Could not book that time. Try again in a moment.' });
  }
}

/** The confirm's own JSON parser, capped at 10kb, its errors answered as JSON (too large 413, unreadable 400). */
const smallJson = express.json({ limit: '10kb' });
function confirmBody(req: Request, res: Response, next: NextFunction): void {
  smallJson(req, res, (err?: unknown) => {
    if (!err) { next(); return; }
    const status = (err as { status?: number })?.status === 413 ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'Request too large.' : 'Send the booking as JSON.' });
  });
}

/**
 * A factory, so each mounted pair owns its own rate-limit stores (tests mount several); production mounts the default.
 * Per BOOKING LINK (the link's hash; req.ip is the Cloudflare edge here): the page read 60 a minute, the confirm 5 per
 * 15 minutes; plus edge-wide caps (600 a minute, 100 per 15 minutes) so made-up links cannot be sprayed without bound. The CONFIRM router is mounted BEFORE server.ts's global 5mb JSON parser (placementBoot
 * INTEGRATION_ROUTERS, the routes that parse their own body), so its 10kb cap really applies; the view router is a
 * plain public router.
 */
export function createBookingRouters(): { view: Router; confirm: Router } {
  const tooMany = { error: 'Too many requests. Please try again in a few minutes.' };
  const limiter = (windowMs: number, max: number, key: (req: Request) => string) =>
    rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: tooMany, keyGenerator: (req) => key(req as Request) });
  // Per BOOKING LINK, not per IP: on this deployment req.ip is the Cloudflare edge node (growthJourneyRateLimit.ts),
  // so an IP key would make every booker behind one PoP share a budget. The key is the link's HASH (never the token).
  const perLink = (bucket: string) => (req: Request) => `${bucket}|${hashBookingToken(String(req.params.token ?? ''))}`;
  // Plus a generous edge-wide cap, labelled as what it is, so a spray of made-up links is still bounded.
  const perEdge = (bucket: string) => (req: Request) => `edge:${bucket}|${ipKeyGenerator(req.ip ?? '')}`;
  const view = Router();
  view.get('/api/public/booking/:token', limiter(60 * 1000, 600, perEdge('booking-view')), limiter(60 * 1000, 60, perLink('booking-view')), getBooking);
  const confirm = Router();
  confirm.post('/api/public/booking/:token/confirm', limiter(15 * 60 * 1000, 100, perEdge('booking-confirm')), limiter(15 * 60 * 1000, 5, perLink('booking-confirm')),
    confirmBody, postConfirm);
  return { view, confirm };
}

export const bookingRouters = createBookingRouters();
