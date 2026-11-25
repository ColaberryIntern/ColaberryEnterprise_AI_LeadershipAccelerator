/**
 * Call completion (VS3.2): one provider-neutral shape for "a call ended", plus the exactly-once
 * claim every completion path uses before any side effect.
 *
 * WHY THE CLAIM EXISTS (audit 2026-11-24 of synthflowWebhookController): nothing stopped a redelivered
 * Synthflow completion from re-running every effect, so one call could produce a second timeline
 * entry, a second InteractionOutcome, a second transcript extraction (an OpenAI call) and a SECOND
 * TEXT MESSAGE to the lead. Vendors redeliver webhooks; that is normal, so the receiver must be
 * idempotent (CLAUDE.md: "works once but breaks on the second run" is broken).
 *
 * The claim is ONE conditional UPDATE on the call's communication_logs row:
 *   it records the completion only if that row has not already recorded a completion with the SAME
 *   call status. Postgres row locking makes it atomic: of two concurrent deliveries exactly one gets
 *   the row back (first delivery, run the effects); the other gets nothing (replay, skip them).
 * A different status (e.g. "failed" after "completed") is a new fact and is claimable.
 *
 * A transcript marked pending_review with a reason (a failed extraction, effectClaims.markTranscriptReview)
 * keeps that mark through any later delivery: only a successful extraction clears it.
 *
 * A null or very short transcript is never treated as a successful conversation: transcriptState
 * reports it as 'pending_review' so it is surfaced to a person instead of counted as done.
 */
import { QueryTypes } from 'sequelize';


export type CompletionProvider = 'synthflow' | 'conversation_relay' | 'openai_realtime';

export interface CallCompletion {
  provider: CompletionProvider;
  providerCallId: string;
  /** The vendor's own status word, kept verbatim (the dedupe key compares it). */
  status: string;
  completed: boolean;
  durationSeconds: number | null;
  transcript: string;
  recordingUrl: string;
  disposition: string;
  analysis: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Synthflow V2 nests most fields under body.call; older payloads put them at the top level. */
export function fromSynthflowPayload(body: unknown): CallCompletion | null {
  const b = obj(body);
  const call = obj(b.call);
  const id = str(call.call_id || b.call_id || call._id || b._id);
  if (!id) return null;
  const status = str(call.status || b.status);
  const d = Number(call.duration ?? b.duration);
  return {
    provider: 'synthflow', providerCallId: id, status, completed: status === 'completed',
    durationSeconds: Number.isFinite(d) && d >= 0 ? d : null,
    transcript: str(call.transcript || b.transcript), recordingUrl: str(call.recording_url || b.recording_url),
    disposition: str(call.end_call_reason || b.disposition), analysis: obj(b.analysis), metadata: obj(b.metadata),
  };
}

/** Below this many characters a transcript is not evidence that a conversation happened. */
export const MIN_TRANSCRIPT_CHARS = 20;

export type TranscriptState = 'present' | 'pending_review' | 'not_applicable';

export function transcriptState(c: Pick<CallCompletion, 'completed' | 'transcript'>): TranscriptState {
  if (!c.completed) return 'not_applicable';
  return c.transcript.trim().length >= MIN_TRANSCRIPT_CHARS ? 'present' : 'pending_review';
}

/** The provider_response fields a completion writes (completed_at is added by the claim). */
export function completionPatch(c: CallCompletion): Record<string, unknown> {
  return {
    call_status: c.status, duration: c.durationSeconds, transcript: c.transcript, recording_url: c.recordingUrl,
    end_call_reason: c.disposition, analysis: c.analysis, metadata: c.metadata, transcript_state: transcriptState(c),
  };
}

export interface ClaimResult { firstDelivery: boolean }

/**
 * Record a completion on its communication_logs row exactly once per (row, call status).
 * firstDelivery=true: this caller owns the side effects. false: a replay; the latest data is still
 * merged (a vendor may resend with a fuller payload) but completed_at and the effects are not redone.
 */
export async function claimCompletion(logId: string, c: CallCompletion): Promise<ClaimResult> {
  const { sequelize } = await import('../../../config/database'); // lazy: importing this module must not open a DB connection
  const patch = JSON.stringify(completionPatch(c));
  const status = c.completed ? 'delivered' : 'failed';
  const claimed = await sequelize.query<{ id: string }>(
    `UPDATE communication_logs
        SET status = :status,
            provider_response = COALESCE(provider_response, '{}'::jsonb) || (CAST(:patch AS jsonb) - CASE WHEN provider_response->>'transcript_state_reason' IS NOT NULL THEN 'transcript_state' ELSE '' END) || jsonb_build_object('completed_at', CAST(:completedAt AS text),
                 -- every status already claimed, so completed -> failed -> completed is not "first" twice
                 'claimed_statuses', COALESCE(provider_response->'claimed_statuses', CASE WHEN COALESCE(provider_response->>'completed_at', '') <> '' THEN jsonb_build_array(COALESCE(provider_response->>'call_status', '')) ELSE '[]'::jsonb END) || to_jsonb(CAST(:callStatus AS text)))
      WHERE id = :id
        AND NOT (COALESCE(provider_response->>'completed_at', '') <> '' AND COALESCE(provider_response->>'call_status', '') = :callStatus)
        AND NOT (COALESCE(provider_response->'claimed_statuses', '[]'::jsonb) @> to_jsonb(CAST(:callStatus AS text)))
      RETURNING id`,
    // completedAt is bound, not written as SQL text: a literal time format such as HH24:MI would be
    // parsed by Sequelize as :MI replacements.
    { replacements: { id: logId, status, patch, callStatus: c.status, completedAt: new Date().toISOString() }, type: QueryTypes.SELECT });
  if (claimed.length) return { firstDelivery: true };
  await sequelize.query(
    `UPDATE communication_logs SET provider_response = COALESCE(provider_response, '{}'::jsonb) || (CAST(:patch AS jsonb) - CASE WHEN provider_response->>'transcript_state_reason' IS NOT NULL THEN 'transcript_state' ELSE '' END) WHERE id = :id`,
    { replacements: { id: logId, patch }, type: QueryTypes.UPDATE });
  return { firstDelivery: false };
}
