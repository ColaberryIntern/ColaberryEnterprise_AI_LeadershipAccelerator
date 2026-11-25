import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { RecapSummary } from './recapContent';

/** Data access for the recap tables (schema: db/ensureWeeklyLiveRecapSchema.ts). Typed at each call site. */
export interface SessionInfo { id: string; title: string; session_date: string; start_time: string; kit_config_json: unknown; description: string | null }
export interface RecapRow { session_id: string; summary: RecapSummary | null; next_event_url: string | null; test_sent_at: Date | null }
export type SendStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
export const MAX_SEND_ATTEMPTS = 3;

export async function getSession(sessionId: string): Promise<SessionInfo | null> {
  const r = await sequelize.query<SessionInfo>(
    'SELECT id, title, session_date, start_time, kit_config_json, description FROM live_sessions WHERE id = :sid',
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return r[0] || null;
}

export async function getRecap(sessionId: string): Promise<RecapRow | null> {
  const r = await sequelize.query<RecapRow>(
    'SELECT session_id, summary, next_event_url, test_sent_at FROM weekly_live_recaps WHERE session_id = :sid',
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return r[0] || null;
}

export async function upsertRecap(sessionId: string, patch: { summary?: RecapSummary; nextEventUrl?: string | null }): Promise<void> {
  await sequelize.query(
    `INSERT INTO weekly_live_recaps (session_id, summary, next_event_url)
       VALUES (:sid, CAST(:summary AS JSONB), :url)
     ON CONFLICT (session_id) DO UPDATE SET
       summary = COALESCE(CAST(:summary AS JSONB), weekly_live_recaps.summary),
       next_event_url = CASE WHEN :urlSet THEN :url ELSE weekly_live_recaps.next_event_url END,
       -- Any change to what goes out voids the earlier test copy (Ali's pre-approval is a test of
       -- the FINAL content), so the real send is locked again until a new test is sent.
       test_sent_at = CASE
         WHEN CAST(:summary AS JSONB) IS DISTINCT FROM NULL AND CAST(:summary AS JSONB) IS DISTINCT FROM weekly_live_recaps.summary THEN NULL
         WHEN :urlSet AND :url IS DISTINCT FROM weekly_live_recaps.next_event_url THEN NULL
         ELSE weekly_live_recaps.test_sent_at END,
       updated_at = NOW()`,
    { replacements: {
      sid: sessionId,
      summary: patch.summary ? JSON.stringify(patch.summary) : null,
      url: patch.nextEventUrl ?? null,
      urlSet: patch.nextEventUrl !== undefined,
    } },
  );
}

export async function markTestSent(sessionId: string): Promise<void> {
  await sequelize.query('UPDATE weekly_live_recaps SET test_sent_at = NOW(), updated_at = NOW() WHERE session_id = :sid', { replacements: { sid: sessionId } });
}

/** Insert one row per recipient or skip; existing rows are untouched (the idempotency key). */
export async function ensureSendRows(sessionId: string, rows: { guestId: string; emailLower: string; status: 'queued' | 'skipped'; skipReason?: string }[]): Promise<void> {
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO weekly_live_recap_sends (session_id, guest_id, email_lower, status, skip_reason)
         VALUES (:sid, :gid, :em, :st, :why) ON CONFLICT (session_id, email_lower) DO NOTHING`,
      { replacements: { sid: sessionId, gid: r.guestId, em: r.emailLower, st: r.status, why: r.skipReason ?? null } },
    );
  }
}

/** Atomically claim a row for sending. Returns false if it was sent, is in flight, or ran out of attempts. */
export async function claimSend(sessionId: string, emailLower: string): Promise<boolean> {
  const r = await sequelize.query<{ id: string }>(
    `UPDATE weekly_live_recap_sends SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
      WHERE session_id = :sid AND email_lower = :em AND status IN ('queued', 'failed') AND attempts < :max
      RETURNING id`,
    { replacements: { sid: sessionId, em: emailLower, max: MAX_SEND_ATTEMPTS }, type: QueryTypes.SELECT },
  );
  return r.length === 1;
}

export async function finishSend(sessionId: string, emailLower: string, ok: boolean, info: { messageId?: string; errorClass?: string }): Promise<void> {
  await sequelize.query(
    `UPDATE weekly_live_recap_sends
        SET status = :st, message_id = :mid, error_class = :ec, sent_at = CASE WHEN :ok THEN NOW() ELSE sent_at END, updated_at = NOW()
      WHERE session_id = :sid AND email_lower = :em`,
    { replacements: { st: ok ? 'sent' : 'failed', mid: info.messageId ?? null, ec: info.errorClass ?? null, ok, sid: sessionId, em: emailLower } },
  );
}

export async function sendCounts(sessionId: string): Promise<Record<SendStatus, number>> {
  const r = await sequelize.query<{ status: SendStatus; n: string }>(
    'SELECT status, COUNT(*) AS n FROM weekly_live_recap_sends WHERE session_id = :sid GROUP BY status',
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  const out: Record<SendStatus, number> = { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const x of r) out[x.status] = Number(x.n);
  return out;
}

export async function sentEmails(sessionId: string): Promise<Set<string>> {
  const r = await sequelize.query<{ email_lower: string }>(
    "SELECT email_lower FROM weekly_live_recap_sends WHERE session_id = :sid AND status = 'sent'",
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return new Set(r.map((x) => x.email_lower));
}

export async function addOptOut(emailLower: string): Promise<void> {
  await sequelize.query('INSERT INTO weekly_live_recap_optouts (email_lower) VALUES (:em) ON CONFLICT (email_lower) DO NOTHING', { replacements: { em: emailLower } });
}
