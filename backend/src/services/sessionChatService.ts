import { Op, type WhereOptions } from 'sequelize';
import LiveSession from '../models/LiveSession';
import SessionChatMessage from '../models/SessionChatMessage';

/**
 * The live-class chat thread.
 *
 * WHY THIS FILE CHANGED NOW. `GET /api/portal/sessions/:id/chat` has existed for months with
 * NO READER ANYWHERE — students wrote into it through "Ask a question" and only the
 * instructor's deck ever saw the result. The desktop live workspace (DOC 04's
 * "Chat/Builder Room") is its first consumer, and two things that never mattered while
 * nothing read it matter the moment something does:
 *
 *  1. IT RETURNED THE WHOLE ROW, `enrollment_id` included, to every classmate. Harmless while
 *     unread; a needless identifier handed to forty people the instant a reader exists. The
 *     response is now a declared projection of the four fields a thread needs.
 *  2. IT RETURNED THE OLDEST HUNDRED MESSAGES, not the newest. `limit` with `ORDER BY ASC`
 *     takes from the front, so a class that passed a hundred lines would have shown a thread
 *     frozen on its first hour with no new message ever arriving. Read DESC, reversed for
 *     display.
 *
 * `since` is caller-supplied and reaches a timestamp comparison, so an unparseable value is
 * ignored rather than passed down to fail as a 500 mid-class.
 */

/** The fields a chat reader needs. `enrollment_id` is deliberately NOT among them. */
export interface SessionChatMessageView {
  id: string;
  sender_name: string;
  content: string;
  /** ISO-8601. Rendered as a clock time by the client, which owns the viewer's timezone. */
  created_at: string;
}

export interface SessionChatThread {
  messages: SessionChatMessageView[];
  /** Distinct senders in the last 30 seconds — "who is talking", not "who is here". */
  active_count: number;
}

/** The newest N. A live class thread is a tail, not an archive. */
const THREAD_LIMIT = 100;

const ACTIVE_WINDOW_MS = 30_000;

/** Longest message the writer accepts. Mirrored on the client so it can say so first. */
export const MAX_CHAT_LENGTH = 500;

/**
 * Normalize an instant for the wire. The driver hands back a `Date` for a timestamptz, but a
 * raw read or a stubbed test can hand back the string it read; an unparseable value is passed
 * through rather than blanked, because losing the only ordering signal is worse than an odd
 * label.
 */
function iso(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

/** A `since` we can safely compare against, or undefined to mean "the whole tail". */
function validSince(since?: string): Date | undefined {
  if (!since) return undefined;
  const parsed = new Date(since);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function getSessionChatMessages(
  sessionId: string,
  cohortId: string,
  since?: string,
): Promise<SessionChatThread | null> {
  // The thread is cohort-scoped at the session, not per message: a viewer outside the cohort
  // gets 404 and never learns the session exists.
  const session = await LiveSession.findOne({ where: { id: sessionId, cohort_id: cohortId } });
  if (!session) return null;

  const after = validSince(since);
  const where: WhereOptions = after
    ? { session_id: sessionId, created_at: { [Op.gt]: after } }
    : { session_id: sessionId };

  const rows = await SessionChatMessage.findAll({
    where,
    attributes: ['id', 'sender_name', 'content', 'created_at'],
    order: [['created_at', 'DESC']],
    limit: THREAD_LIMIT,
  });

  const messages: SessionChatMessageView[] = rows
    .map((m) => ({
      id: m.id,
      sender_name: m.sender_name,
      content: m.content,
      created_at: iso(m.created_at),
    }))
    // Read newest-first for the limit; displayed oldest-first, which is how a thread reads.
    .reverse();

  const recent = await SessionChatMessage.findAll({
    where: {
      session_id: sessionId,
      created_at: { [Op.gt]: new Date(Date.now() - ACTIVE_WINDOW_MS) },
    },
    attributes: ['enrollment_id'],
  });

  return {
    messages,
    active_count: new Set(recent.map((m) => m.enrollment_id)).size,
  };
}

export async function postSessionChatMessage(
  sessionId: string,
  enrollmentId: string,
  cohortId: string,
  senderName: string,
  content: string
) {
  // Validate content length
  if (content.length > MAX_CHAT_LENGTH) {
    throw new Error(`Message content must be ${MAX_CHAT_LENGTH} characters or fewer`);
  }

  // Verify session belongs to cohort
  const session = await LiveSession.findOne({ where: { id: sessionId, cohort_id: cohortId } });
  if (!session) return null;

  // Create message
  const message = await SessionChatMessage.create({
    session_id: sessionId,
    enrollment_id: enrollmentId,
    sender_name: senderName,
    content,
  });

  return message;
}
