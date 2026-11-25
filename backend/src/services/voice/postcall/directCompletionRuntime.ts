/**
 * Production wiring for direct-engine post-call (VS3.2): the real DirectDeps, the in-process
 * transcript hand-off, and the reconciliation sweep.
 *
 * Transcript hand-off: the relay session hands its transcript over when it ends; it is held in
 * memory (bounded: 500 calls, 30 minutes) until post-call stores it on the call's communication log.
 * A process restart in between loses it, and the call is then recorded with transcript_state
 * 'pending_review' rather than counted as a conversation (documented limit; no transcript is ever
 * written to a log line or a file).
 *
 * Sweep: reconcileDirectCompletions finds ended, non-test calls (2 minutes to 24 hours old) whose
 * completion was never recorded, and processes them. Bounded per run; safe to run concurrently with
 * the live triggers because every write is claimed.
 */
import { QueryTypes } from 'sequelize';
import { claimCompletion } from './completion';
import { MAX_EFFECT_ATTEMPTS, claimEffect, clearTranscriptReview, markEffectDone, markTranscriptReview, releaseEffect } from './effectClaims';
import { processDirectCompletion, type DirectCallRow, type DirectDeps } from './directCompletion';

const TTL_MS = 30 * 60 * 1000;
const MAX_HELD = 500;
const held = new Map<string, { text: string; at: number }>();

export function rememberTranscript(callId: string, text: string, now = Date.now()): void {
  for (const [k, v] of held) if (now - v.at > TTL_MS) held.delete(k);
  while (held.size >= MAX_HELD) held.delete(held.keys().next().value as string);
  held.set(callId, { text, at: now });
}

export function transcriptFor(callId: string, now = Date.now()): string {
  const h = held.get(callId);
  return h && now - h.at <= TTL_MS ? h.text : '';
}

const log = (line: Record<string, unknown>): void => {
  const out = JSON.stringify({ timestamp: new Date().toISOString(), ...line });
  if (line.level === 'error' || line.level === 'warn') console.warn(out); else console.log(out);
};

async function db() { return (await import('../../../config/database')).sequelize; }

export function productionDirectDeps(): DirectDeps {
  return {
    loadCall: async (callId) => {
      const s = await db();
      const rows = await s.query<DirectCallRow>(
        'SELECT id, engine, state, lead_id, provider_call_id, test_mode, human_answered, duration_seconds, purpose, direction FROM voice_calls WHERE id = :callId',
        { replacements: { callId }, type: QueryTypes.SELECT });
      return rows[0] ?? null;
    },
    ensureLog: async (call, logId) => {
      const s = await db();
      await s.transaction(async (transaction) => {
        await s.query(
          `INSERT INTO communication_logs (id, lead_id, channel, direction, delivery_mode, status, provider, provider_message_id, metadata, created_at)
           VALUES (:logId, :leadId, 'voice', :direction, 'live', 'pending', :engine, :sid, CAST(:meta AS jsonb), NOW())
           ON CONFLICT (id) DO NOTHING`,
          { replacements: { logId, direction: call.direction ?? 'outbound', leadId: call.lead_id, engine: call.engine, sid: call.provider_call_id, meta: JSON.stringify({ source: 'voice-studio', voice_call_id: call.id, purpose: call.purpose }) }, transaction });
        await s.query('UPDATE voice_calls SET communication_log_id = :logId, updated_at = NOW() WHERE id = :id AND communication_log_id IS NULL',
          { replacements: { logId, id: call.id }, transaction });
      });
      return logId;
    },
    claimCompletion, claimEffect: (id, e) => claimEffect(id, e), releaseEffect, markEffectDone: (id, e) => markEffectDone(id, e),
    writeTimeline: async (logId, leadId, subject, body, meta) => {
      const s = await db();
      const { Activity } = await import('../../../models');
      await s.transaction(async (transaction) => {
        await Activity.create({ lead_id: leadId, admin_user_id: null, type: 'call', subject, body: body || null, metadata: meta } as never, { transaction });
        await markEffectDone(logId, 'timeline', transaction);
      });
    },
    extract: async (leadId, transcript, providerCallId) => {
      const { processCallTranscript } = await import('../../callTranscriptProcessor');
      await processCallTranscript(leadId, transcript, providerCallId);
    },
    leadFirstName: async (leadId) => {
      const { Lead } = await import('../../../models');
      const lead = await Lead.findByPk(leadId);
      return String((lead as unknown as { name?: string } | null)?.name ?? 'Lead');
    },
    transcriptFor: (callId) => transcriptFor(callId),
    storedTranscript: async (logId) => {
      const s = await db();
      const rows = await s.query<{ t: string | null }>("SELECT provider_response->>'transcript' AS t FROM communication_logs WHERE id = :logId", { replacements: { logId }, type: QueryTypes.SELECT });
      return rows[0]?.t ?? '';
    },
    markTranscriptReview, clearTranscriptReview,
    log,
  };
}

/** Fire-and-forget entry point for live triggers. Never throws. */
export function completeDirectCall(callId: string): void {
  processDirectCompletion(callId, productionDirectDeps()).catch((e: Error) =>
    log({ level: 'error', service: 'voice-postcall', event: 'voice_postcall_failed', outcome: 'failure', error_class: e.name || 'Error', call_id: callId }));
}

export const SWEEP_LIMIT = 20;

/** Process ended, non-test calls whose completion was never recorded. Returns how many it processed. */
export async function reconcileDirectCompletions(limit = SWEEP_LIMIT): Promise<number> {
  const s = await db();
  const rows = await s.query<{ id: string }>(
    `SELECT c.id FROM voice_calls c LEFT JOIN communication_logs l ON l.id = c.communication_log_id
      WHERE c.test_mode = FALSE AND c.engine IN ('conversation_relay', 'openai_realtime')
        AND c.state IN ('completed','busy','no_answer','failed','canceled')
        AND c.ended_at < NOW() - INTERVAL '2 minutes' AND c.ended_at > NOW() - INTERVAL '24 hours'
        AND (l.id IS NULL OR COALESCE(l.provider_response->>'completed_at', '') = ''
             OR l.metadata->'postcall'->'timeline'->>'state' IN ('claimed', 'released')
             -- a failed extraction (released, attempts left) is retried here, not lost
             OR (l.metadata->'postcall'->'extraction'->>'state' IN ('claimed', 'released')
                 AND COALESCE((l.metadata->'postcall'->'extraction'->>'attempts')::int, 0) < :maxAttempts))
      ORDER BY c.ended_at LIMIT :limit`,
    { replacements: { limit, maxAttempts: MAX_EFFECT_ATTEMPTS }, type: QueryTypes.SELECT });
  const deps = productionDirectDeps();
  let n = 0;
  for (const r of rows) {
    try { await processDirectCompletion(r.id, deps); n += 1; } catch (e) {
      log({ level: 'error', service: 'voice-postcall', event: 'voice_postcall_sweep_failed', outcome: 'failure', error_class: (e as Error).name || 'Error', call_id: r.id });
    }
  }
  return n;
}
