/**
 * Per-effect claims on a call's communication_logs row (VS3.2).
 *
 * claimCompletion (completion.ts) records THAT a call ended, once per status. Each downstream effect
 * (timeline entry, transcript extraction) is claimed separately here, so effects are independent of
 * the order things arrive in, and a failed effect can be retried without ever running twice.
 *
 * A claim lives at metadata.postcall.<effect> = { state, at, attempts }:
 *   absent or released            -> claimable, while attempts < MAX_EFFECT_ATTEMPTS
 *   claimed, younger than LEASE    -> someone is doing it: not claimable
 *   claimed, older than LEASE      -> presumed lost (process died, DB response lost): claimable
 *   done                           -> never claimable again
 * Every successful claim adds one attempt; release keeps the count, so a failing effect stops after
 * MAX_EFFECT_ATTEMPTS (bounded retry, no infinite loop) and stays visible as pending review.
 *
 * Each claim is one conditional UPDATE (atomic under concurrency). markEffectDone takes an optional
 * transaction so a DB-only effect (the timeline row) commits together with its done mark.
 */
import { QueryTypes, type Transaction } from 'sequelize';

export type PostCallEffect = 'timeline' | 'extraction';
export const EFFECT_LEASE_MS = 10 * 60 * 1000;
export const MAX_EFFECT_ATTEMPTS = 3;

async function db() {
  return (await import('../../../config/database')).sequelize; // lazy: importing must not open a DB connection
}

export async function claimEffect(logId: string, effect: PostCallEffect, now: Date = new Date()): Promise<boolean> {
  const sequelize = await db();
  const staleBefore = new Date(now.getTime() - EFFECT_LEASE_MS).toISOString();
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE communication_logs
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{postcall}',
              COALESCE(metadata->'postcall', '{}'::jsonb) || jsonb_build_object(CAST(:effect AS text), jsonb_build_object(
                'state', 'claimed', 'at', CAST(:at AS text),
                'attempts', COALESCE((metadata #>> ARRAY['postcall', :effect, 'attempts'])::int, 0) + 1)))
      WHERE id = :id
        AND COALESCE((metadata #>> ARRAY['postcall', :effect, 'attempts'])::int, 0) < :max
        AND (metadata #> ARRAY['postcall', :effect] IS NULL
             OR metadata #>> ARRAY['postcall', :effect, 'state'] = 'released'
             OR (metadata #>> ARRAY['postcall', :effect, 'state'] = 'claimed' AND metadata #>> ARRAY['postcall', :effect, 'at'] < :staleBefore))
      RETURNING id`,
    { replacements: { id: logId, effect, at: now.toISOString(), staleBefore, max: MAX_EFFECT_ATTEMPTS }, type: QueryTypes.SELECT });
  return rows.length === 1;
}

export async function markEffectDone(logId: string, effect: PostCallEffect, transaction?: Transaction): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE communication_logs
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{postcall}',
              COALESCE(metadata->'postcall', '{}'::jsonb) || jsonb_build_object(CAST(:effect AS text), jsonb_build_object(
                'state', 'done', 'at', CAST(:at AS text),
                'attempts', COALESCE((metadata #>> ARRAY['postcall', :effect, 'attempts'])::int, 1))))
      WHERE id = :id`,
    { replacements: { id: logId, effect, at: new Date().toISOString() }, type: QueryTypes.UPDATE, transaction });
}

/** Give a claim back after a failed attempt. The attempt count is kept, so retries are bounded. */
export async function releaseEffect(logId: string, effect: PostCallEffect): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE communication_logs
        SET metadata = jsonb_set(metadata, ARRAY['postcall', CAST(:effect AS text), 'state'], '"released"'::jsonb)
      WHERE id = :id AND metadata #>> ARRAY['postcall', :effect, 'state'] = 'claimed'`,
    { replacements: { id: logId, effect }, type: QueryTypes.UPDATE });
}

/**
 * A transcript that could not be turned into lead data is surfaced to a person: the log's
 * provider_response.transcript_state becomes 'pending_review' with the reason. It is never left
 * reading 'present' as if the work were done.
 */
export async function markTranscriptReview(logId: string, reason: string): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE communication_logs
        SET provider_response = COALESCE(provider_response, '{}'::jsonb)
              || jsonb_build_object('transcript_state', 'pending_review', 'transcript_state_reason', CAST(:reason AS text))
      WHERE id = :id`,
    { replacements: { id: logId, reason: reason.slice(0, 100) }, type: QueryTypes.UPDATE });
}

/** Extraction succeeded (possibly on a retry): the transcript is no longer awaiting review. */
export async function clearTranscriptReview(logId: string): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE communication_logs
        SET provider_response = (COALESCE(provider_response, '{}'::jsonb) - 'transcript_state_reason') || '{"transcript_state": "present"}'::jsonb
      WHERE id = :id AND provider_response->>'transcript_state_reason' IS NOT NULL`,
    { replacements: { id: logId }, type: QueryTypes.UPDATE });
}
