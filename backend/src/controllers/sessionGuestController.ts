/**
 * sessionGuestController.ts — PUBLIC endpoints for Open House guests (name +
 * email, no login). Only sessions titled "Open House" accept guests; the pass
 * returned by join is session-scoped and grants voting only (see
 * sessionGuestService.ts). Inputs are validated with zod; malformed input is a
 * 400 and never reaches the service.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { castGuestVote, getGuestState, GuestError, joinAsGuest, assertGuestSession } from '../services/sessionGuestService';
import { PollLockedError } from '../services/sessionLiveStateService';
import { renderGuestJoinPage } from '../services/guestJoinPage';

const JoinBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
});
const VoteBody = z.object({
  poll_key: z.string().min(1).max(200),
  choice: z.number().int().min(0).max(25),
});
const SessionParam = z.string().uuid();

function passFrom(req: Request): string | undefined {
  const h = req.headers['x-guest-pass'];
  return typeof h === 'string' && h ? h : undefined;
}

function fail(res: Response, err: unknown, next: NextFunction) {
  if (err instanceof GuestError) return res.status(err.status).json({ error: err.message });
  if (err instanceof PollLockedError) return res.status(409).json({ error: 'Voting is locked for this question' });
  return next(err);
}

/** GET /api/portal/sessions/:id/join — the phone page (HTML). */
export async function handleGuestJoinPage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).type('text').send('Not found');
    const { title } = await assertGuestSession(req.params.id as string);
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    );
    res.type('html').send(renderGuestJoinPage(req.params.id as string, title));
  } catch (err) {
    if (err instanceof GuestError) return res.status(err.status).type('text').send(err.message);
    next(err);
  }
}

/** POST /api/portal/sessions/:id/guest-join {name, email} → {pass, name, matched}. */
export async function handleGuestJoin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    const body = JoinBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Please enter your name and a valid email' });
    res.json(await joinAsGuest(req.params.id as string, body.data.name, body.data.email));
  } catch (err) { fail(res, err, next); }
}

/** GET /api/portal/sessions/:id/guest-state (X-Guest-Pass) → the question on screen. */
export async function handleGuestState(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    res.json(await getGuestState(req.params.id as string, passFrom(req)));
  } catch (err) { fail(res, err, next); }
}

/** POST /api/portal/sessions/:id/guest-vote (X-Guest-Pass) {poll_key, choice}. */
export async function handleGuestVote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    const body = VoteBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'poll_key and choice are required' });
    await castGuestVote(req.params.id as string, passFrom(req), body.data.poll_key, body.data.choice);
    res.json({ success: true, choice: body.data.choice });
  } catch (err) { fail(res, err, next); }
}
