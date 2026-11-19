/**
 * sessionGuestController.ts — PUBLIC endpoints for guests (name + email, no
 * login). Two doors share them: the Open House join page (sessions with
 * `guest_access` on) and, with `via: 'checkin'`, the class QR check-in on any
 * class not explicitly closed to guests. The pass returned by join is
 * session-scoped and grants only the live loop — read the screen, vote, set a
 * status, ask a question (see sessionGuestService.ts). Inputs are validated
 * with zod; malformed input is a 400 and never reaches the service. None of
 * these endpoints sends an email or a text to anyone.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  castGuestVote, getGuestState, GuestError, joinAsGuest, assertGuestSession, setGuestPulseFor, askAsGuest, MAX_GUEST_QUESTION,
} from '../services/sessionGuestService';
import { PollLockedError } from '../services/sessionLiveStateService';
import { renderGuestJoinPage } from '../services/guestJoinPage';

const JoinBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  via: z.literal('checkin').optional(),
});
const AskBody = z.object({ text: z.string().trim().min(1).max(MAX_GUEST_QUESTION) });
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
    res.json(await joinAsGuest(req.params.id as string, body.data.name, body.data.email, { via: body.data.via }));
  } catch (err) { fail(res, err, next); }
}

/** POST /api/portal/sessions/:id/guest-pulse (X-Guest-Pass) {state}. */
export async function handleGuestPulse(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    const state = await setGuestPulseFor(req.params.id as string, passFrom(req), req.body?.state);
    res.json({ success: true, state });
  } catch (err) { fail(res, err, next); }
}

/** POST /api/portal/sessions/:id/guest-ask (X-Guest-Pass) {text}. */
export async function handleGuestAsk(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    const body = AskBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: `Write a question (up to ${MAX_GUEST_QUESTION} characters)` });
    await askAsGuest(req.params.id as string, passFrom(req), body.data.text);
    res.json({ success: true });
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
