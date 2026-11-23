/**
 * liveChatStore.ts: SQL for the class live chat (tables in db/ensureLiveSessionSchema.ts).
 * Parameterized queries only. Every read is scoped to one session.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export interface ChatMessage {
  id: string;
  kind: 'guest' | 'assistant';
  display_name: string;
  content: string;
  reply_to: string | null;
  created_at: string;
}

export interface ChatEscalation {
  id: string;
  message_id: string;
  question: string;
  options: string[];
  asked_by: string;
  created_at: string;
}

export async function insertMessage(
  sessionId: string, kind: 'guest' | 'assistant', displayName: string, content: string,
  opts: { guestId?: string | null; replyTo?: string | null } = {},
): Promise<ChatMessage> {
  const [row] = await sequelize.query<ChatMessage>(
    `INSERT INTO session_live_chat (session_id, kind, guest_id, display_name, content, reply_to, created_at)
     VALUES (:sid, :kind, :gid, :name, :content, :reply, NOW())
     RETURNING id, kind, display_name, content, reply_to, created_at`,
    { replacements: { sid: sessionId, kind, gid: opts.guestId ?? null, name: displayName, content, reply: opts.replyTo ?? null }, type: QueryTypes.SELECT },
  );
  return row;
}

/** The last `limit` messages of the class, oldest first. */
export async function listMessages(sessionId: string, limit = 150): Promise<ChatMessage[]> {
  const rows = await sequelize.query<ChatMessage>(
    `SELECT id, kind, display_name, content, reply_to, created_at FROM (
       SELECT id, kind, display_name, content, reply_to, created_at FROM session_live_chat
        WHERE session_id = :sid ORDER BY created_at DESC LIMIT :lim
     ) t ORDER BY created_at ASC`,
    { replacements: { sid: sessionId, lim: limit }, type: QueryTypes.SELECT },
  );
  return rows;
}

export async function insertEscalation(sessionId: string, messageId: string, question: string, options: string[]): Promise<void> {
  await sequelize.query(
    `INSERT INTO session_chat_escalations (session_id, message_id, question, options, status, created_at)
     VALUES (:sid, :mid, :q, CAST(:opts AS JSONB), 'pending', NOW())
     ON CONFLICT (message_id) DO NOTHING`,
    { replacements: { sid: sessionId, mid: messageId, q: question, opts: JSON.stringify(options) }, type: QueryTypes.INSERT },
  );
}

export async function listPendingEscalations(sessionId: string): Promise<ChatEscalation[]> {
  return sequelize.query<ChatEscalation>(
    `SELECT e.id, e.message_id, e.question, e.options, m.display_name AS asked_by, e.created_at
       FROM session_chat_escalations e JOIN session_live_chat m ON m.id = e.message_id
      WHERE e.session_id = :sid AND e.status = 'pending'
      ORDER BY e.created_at ASC LIMIT 20`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
}

/**
 * Close one escalation, atomically: only a PENDING row moves, so a double click (or two presenter
 * windows) resolves it once. Returns the row when this call resolved it, else null.
 */
export async function resolveEscalation(
  sessionId: string, escalationId: string, status: 'answered' | 'skipped', chosen: number | null,
): Promise<{ message_id: string; options: string[]; asked_by: string | null } | null> {
  const rows = await sequelize.query<{ message_id: string; options: string[]; asked_by: string | null }>(
    `UPDATE session_chat_escalations SET status = :status, chosen = :chosen, resolved_at = NOW()
      WHERE id = :eid AND session_id = :sid AND status = 'pending'
      RETURNING message_id, options, (SELECT display_name FROM session_live_chat m WHERE m.id = session_chat_escalations.message_id) AS asked_by`,
    { replacements: { status, chosen, eid: escalationId, sid: sessionId }, type: QueryTypes.SELECT },
  );
  return rows[0] || null;
}
