/**
 * liveChatController.ts: HTTP for the class live chat (services/liveChat).
 *   GET  /api/portal/sessions/:id/guest-chat                 X-Guest-Pass -> {messages}
 *   POST /api/portal/sessions/:id/guest-chat                 X-Guest-Pass {text} -> {message}
 *   GET  /api/portal/sessions/:id/chat-escalations           deck kit token or admin -> {escalations}
 *   POST /api/portal/sessions/:id/chat-escalations/:eid      deck kit token or admin {choice: 0..2 | "skip"}
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { GuestError } from '../services/sessionGuestService';
import {
  listChatForGuest, postChatAsGuest, listEscalationsForPresenter, answerEscalation, postAsInstructor,
} from '../services/liveChat/liveChatService';

const SessionParam = z.string().uuid();
const PostBody = z.object({ text: z.string() });
const AnswerBody = z.object({
  choice: z.union([z.number().int().min(0).max(2), z.literal('skip')]).optional(),
  text: z.string().max(2000).optional(),
}).refine((b) => b.choice !== undefined || (typeof b.text === 'string' && b.text.trim().length > 0));
const InstructorPostBody = z.object({ text: z.string().max(2000), question: z.string().max(2000).optional() });

function passFrom(req: Request): string | undefined {
  const h = req.headers['x-guest-pass'];
  return typeof h === 'string' && h ? h : undefined;
}

function fail(res: Response, err: unknown, next: NextFunction) {
  if (err instanceof GuestError) return res.status(err.status).json({ error: err.message });
  return next(err);
}

export async function handleGuestChatList(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    res.json(await listChatForGuest(req.params.id as string, passFrom(req)));
  } catch (err) { fail(res, err, next); }
}

export async function handleGuestChatPost(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    const body = PostBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Write a message' });
    res.json(await postChatAsGuest(req.params.id as string, passFrom(req), body.data.text));
  } catch (err) { fail(res, err, next); }
}

export async function handleChatEscalationsList(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    res.json(await listEscalationsForPresenter(req.params.id as string));
  } catch (err) { fail(res, err, next); }
}

export async function handleChatEscalationAnswer(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success || !SessionParam.safeParse(req.params.eid).success) {
      return res.status(404).json({ error: 'Not found' });
    }
    const body = AnswerBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Choose an answer or skip' });
    res.json(await answerEscalation(req.params.id as string, req.params.eid as string, body.data.choice, body.data.text));
  } catch (err) { fail(res, err, next); }
}

/** POST /api/portal/sessions/:id/chat-post (deck kit token or admin) {text, question?}: the instructor posts. */
export async function handleChatInstructorPost(req: Request, res: Response, next: NextFunction) {
  try {
    if (!SessionParam.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
    const body = InstructorPostBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Write an answer' });
    res.json(await postAsInstructor(req.params.id as string, body.data.text, body.data.question));
  } catch (err) { fail(res, err, next); }
}
