import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit, { ipKeyGenerator, type Store } from 'express-rate-limit';
import { z } from 'zod';
import { isTimeZone } from '../services/hire/hireSlots';
import { bookingView, confirmBooking, type Gone } from '../services/placement/bookingService';
import { hashBookingToken, isPlausibleToken } from '../services/placement/bookingToken';

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
const Params = z.object({ token: z.string().refine(isPlausibleToken) }).strict();
const ViewQuery = z.object({ tz: z.string().max(64).refine(isTimeZone, 'tz').optional() }).strict();
export const ConfirmBody = z.object({
  slot: z.string().datetime(),
  tz: z.string().max(64).refine(isTimeZone, 'tz'),
  interviewers: z.array(z.string().trim().toLowerCase().email().max(254)).max(5).default([]),
}).strict();

const NOT_FOUND = 'This booking link is not valid.';
const TOO_MANY = { error: 'Too many requests. Please try again in a few minutes.' };
const GONE: Record<Gone, string> = {
  used: 'This booking link was already used to book a time.',
  expired: 'This booking link has expired. Reply to the email it came in and we will send a new one.',
  closed: 'This interview is no longer open for booking.',
};

function log(event: string, err: unknown): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable' }));
}

/**
 * A small, BOUNDED count of not_found answers per edge. It is consulted ONLY after the service answered not_found, so a
 * link that resolves (booked, used, expired or closed) is never blocked by it: when an edge's misses are spent, only
 * unknown links from that edge get 429. On this deployment req.ip is the Cloudflare edge node, not a person
 * (growthJourneyRateLimit.ts), which is exactly why this must never gate a real link. At most maxKeys entries: expired
 * windows are swept first, then the oldest key goes.
 */
export class MissCap {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly windowMs: number, private readonly max: number, private readonly maxKeys = 1000) {}

  /** Count one miss for key; true when key is now past its cap. */
  overCap(key: string, now: number = Date.now()): boolean {
    let e = this.hits.get(key);
    if (!e || now >= e.resetAt) {
      if (e) this.hits.delete(key);
      if (this.hits.size >= this.maxKeys) this.evict(now);
      e = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, e);
    }
    e.count += 1;
    return e.count > this.max;
  }

  get size(): number { return this.hits.size; }

  private evict(now: number): void {
    for (const [k, v] of this.hits) if (now >= v.resetAt) this.hits.delete(k);
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

const edgeKey = (bucket: string, req: Request): string => `edge:${bucket}|${ipKeyGenerator(req.ip ?? '')}`;

/** Unknown link: the uniform 404, or 429 once this edge's misses are spent. */
function notFound(misses: MissCap, bucket: string, req: Request, res: Response): void {
  if (misses.overCap(edgeKey(bucket, req))) { res.status(429).json(TOO_MANY); return; }
  res.status(404).json({ error: NOT_FOUND });
}

/** FIRST on both routes: a token that is not the shape we mint is the uniform 404 before any limiter, store or parser. */
function plausibleOr404(req: Request, res: Response, next: NextFunction): void {
  if (isPlausibleToken(req.params.token)) { next(); return; }
  res.set('Cache-Control', 'no-store');
  res.status(404).json({ error: NOT_FOUND });
}

export function getBooking(misses: MissCap): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    const p = Params.safeParse(req.params);
    if (!p.success) { res.status(404).json({ error: NOT_FOUND }); return; }
    const q = ViewQuery.safeParse(req.query);
    if (!q.success) { res.status(400).json({ error: 'tz must be a time zone such as America/New_York.' }); return; }
    try {
      const r = await bookingView(p.data.token, { tz: q.data.tz ?? null });
      if (r.status === 'not_found') { notFound(misses, 'booking-view', req, res); return; }
      if (r.status === 'gone') { res.status(410).json({ error: GONE[r.reason], reason: r.reason }); return; }
      res.status(200).json({ booking: r.view });
    } catch (err) {
      log('public_booking_view_failed', err);
      res.status(500).json({ error: 'Could not load the booking page. Try again in a moment.' });
    }
  };
}

export function postConfirm(misses: MissCap): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    const p = Params.safeParse(req.params);
    if (!p.success) { res.status(404).json({ error: NOT_FOUND }); return; }
    const b = ConfirmBody.safeParse(req.body ?? {});
    if (!b.success) { res.status(400).json({ error: 'Pick a time, your time zone, and at most 5 interviewer emails.', fields: b.error.issues.map((i) => i.path.join('.')).slice(0, 10) }); return; }
    try {
      const r = await confirmBooking(p.data.token, b.data);
      if (r.status === 'not_found') { notFound(misses, 'booking-confirm', req, res); return; }
      if (r.status === 'gone') { res.status(410).json({ error: GONE[r.reason], reason: r.reason }); return; }
      if (r.status === 'taken') { res.status(409).json({ error: 'That time was just taken. Pick another.', reason: 'taken' }); return; }
      if (r.status === 'arranging') { res.status(409).json({ error: 'Times are being arranged with the candidate. We will be in touch.', reason: 'arranging' }); return; }
      res.status(200).json({ booked: { startsAt: r.startsAt, minutes: r.minutes, roomPage: r.roomPage }, replay: r.replay });
    } catch (err) {
      log('public_booking_confirm_failed', err);
      res.status(500).json({ error: 'Could not book that time. Try again in a moment.' });
    }
  };
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

export interface BookingRouterOptions {
  /** A rate-limit store per limiter (tests pass a recording one); the library's MemoryStore by default. */
  makeStore?: () => Store;
}

/**
 * A factory, so each mounted pair owns its own rate-limit stores and miss caps (tests mount several); production mounts
 * the default. Order on both routes: (1) a token that is not the shape we mint is the uniform 404, touching nothing;
 * (2) a limiter per BOOKING LINK (the link's hash, never the token): page reads 60 a minute, confirms 5 per 15 minutes;
 * (3) the handler, where only a not_found answer counts against the edge's miss cap (views 300, confirms 100, per 15
 * minutes). There is NO limiter keyed on req.ip in front of the routes: req.ip is the Cloudflare edge here, so one person
 * spraying junk would otherwise block every real employer behind that PoP (growthJourneyRateLimit.ts). The CONFIRM
 * router is mounted BEFORE server.ts's global 5mb JSON parser (placementBoot INTEGRATION_ROUTERS, the routes that parse
 * their own body), so its 10kb cap really applies; the view router is a plain public router.
 */
export function createBookingRouters(opts: BookingRouterOptions = {}): { view: Router; confirm: Router; misses: { view: MissCap; confirm: MissCap } } {
  const limiter = (windowMs: number, max: number, bucket: string) =>
    rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: TOO_MANY, ...(opts.makeStore ? { store: opts.makeStore() } : {}),
      keyGenerator: (req) => `${bucket}|${hashBookingToken(String((req as Request).params.token ?? ''))}` });
  const misses = { view: new MissCap(15 * 60 * 1000, 300), confirm: new MissCap(15 * 60 * 1000, 100) };
  const view = Router();
  view.get('/api/public/booking/:token', plausibleOr404, limiter(60 * 1000, 60, 'booking-view'), getBooking(misses.view));
  const confirm = Router();
  confirm.post('/api/public/booking/:token/confirm', plausibleOr404, limiter(15 * 60 * 1000, 5, 'booking-confirm'), confirmBody, postConfirm(misses.confirm));
  return { view, confirm, misses };
}

export const bookingRouters = createBookingRouters();
