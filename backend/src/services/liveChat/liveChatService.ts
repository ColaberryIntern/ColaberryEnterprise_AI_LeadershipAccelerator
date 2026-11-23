/**
 * liveChatService.ts: the class live chat's rules (2026-11-23).
 *
 * Attendees (a valid guest pass for this class) read and post; the instructor's presenter window
 * (deck kit token) reads escalations and answers them. Names in the chat are redacted to
 * "First L." like everywhere else this class shows names.
 *
 * Failure modes: bad pass -> 401; empty or over-long message -> 400; posting faster than one
 * message every 2 seconds, or more than 60 in a class -> 429; an escalation already answered ->
 * 409 (two presenter windows, or a double click). The assistant runs after the post is saved and
 * cannot fail it (liveChatAgent.ts).
 */
import { GuestError, verifyGuestPass } from '../sessionGuestService';
import { findGuest } from '../sessionGuestStore';
import { formatDisplayName } from '../sessionPresenceService';
import { insertMessage, listMessages, listPendingEscalations, resolveEscalation, type ChatEscalation, type ChatMessage } from './liveChatStore';
import { ASSISTANT_NAME, handleAttendeeMessage } from './liveChatAgent';

export const CHAT_LIMITS = { chars: 500, perGuest: 60, minGapMs: 2000 } as const;

const recent = new Map<string, { n: number; last: number }>();
/** For tests only. */
export function resetChatCounters(): void { recent.clear(); }

async function requireGuest(sessionId: string, pass: string | undefined) {
  const gid = verifyGuestPass(pass, sessionId);
  const guest = gid ? await findGuest(sessionId, gid) : null;
  if (!guest) throw new GuestError(401, 'Please join again');
  return guest;
}

export async function listChatForGuest(sessionId: string, pass: string | undefined): Promise<{ messages: ChatMessage[] }> {
  await requireGuest(sessionId, pass);
  return { messages: await listMessages(sessionId) };
}

export async function postChatAsGuest(
  sessionId: string, pass: string | undefined, text: unknown,
  runAgent: (sid: string, m: ChatMessage) => Promise<unknown> = handleAttendeeMessage,
): Promise<{ message: ChatMessage }> {
  const guest = await requireGuest(sessionId, pass);
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content || content.length > CHAT_LIMITS.chars) throw new GuestError(400, `Write a message (up to ${CHAT_LIMITS.chars} characters)`);

  const key = `${sessionId}:${guest.id}`;
  const now = Date.now();
  const r = recent.get(key) || { n: 0, last: 0 };
  if (now - r.last < CHAT_LIMITS.minGapMs) throw new GuestError(429, 'One moment, then send again.');
  if (r.n >= CHAT_LIMITS.perGuest) throw new GuestError(429, 'You have reached the chat limit for this class.');
  recent.set(key, { n: r.n + 1, last: now });

  const message = await insertMessage(sessionId, 'attendee', formatDisplayName(guest.name), content, { guestId: guest.id });
  // Fire and forget: the assistant must never hold up, or fail, the attendee's post.
  void runAgent(sessionId, message);
  return { message };
}

export async function listEscalationsForPresenter(sessionId: string): Promise<{ escalations: ChatEscalation[] }> {
  return { escalations: await listPendingEscalations(sessionId) };
}

/** Name on a message the instructor posts himself (a typed answer). */
export const INSTRUCTOR_NAME = 'Ali';

/**
 * Close an escalation. `choice` is an option index (0-2) or 'skip' (answered out loud, or not
 * needed); `text` is the instructor's own typed answer and wins over `choice`. A chosen option posts
 * as the class assistant, a typed answer under the instructor's name; both are addressed to the asker.
 */
export async function answerEscalation(sessionId: string, escalationId: string, choice: unknown, text?: unknown): Promise<{ posted: boolean }> {
  const typed = typeof text === 'string' ? text.trim() : '';
  if (typed.length > CHAT_LIMITS.chars) throw new GuestError(400, `Keep the answer under ${CHAT_LIMITS.chars} characters`);
  const skip = !typed && choice === 'skip';
  const idx = !typed && typeof choice === 'number' && Number.isInteger(choice) && choice >= 0 && choice < 3 ? choice : null;
  if (!typed && !skip && idx === null) throw new GuestError(400, 'Choose an answer, type one, or skip');
  const row = await resolveEscalation(sessionId, escalationId, skip ? 'skipped' : 'answered', idx);
  if (!row) throw new GuestError(409, 'Already answered');
  if (skip) return { posted: false };
  const answer = typed || (Array.isArray(row.options) ? row.options : [])[idx as number];
  if (!answer) return { posted: false };
  const body = row.asked_by ? `@${row.asked_by} ${answer}` : answer;
  await insertMessage(sessionId, 'assistant', typed ? INSTRUCTOR_NAME : ASSISTANT_NAME, body, { replyTo: row.message_id });
  return { posted: true };
}

/**
 * The instructor posts to the class chat directly, e.g. a typed answer to a PRIVATE question. The
 * private question is shown with the answer, never with who asked it.
 */
export async function postAsInstructor(sessionId: string, text: unknown, question?: unknown): Promise<{ posted: boolean }> {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t || t.length > CHAT_LIMITS.chars) throw new GuestError(400, `Write an answer (up to ${CHAT_LIMITS.chars} characters)`);
  const q = typeof question === 'string' ? question.trim().slice(0, CHAT_LIMITS.chars) : '';
  await insertMessage(sessionId, 'assistant', INSTRUCTOR_NAME, q ? `Q: ${q}\nA: ${t}` : t);
  return { posted: true };
}
