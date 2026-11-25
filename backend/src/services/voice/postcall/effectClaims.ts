/**
 * Per-effect claims on a call's communication_logs row (VS3.2).
 *
 * claimCompletion (completion.ts) records THAT a call ended, once per status. Each downstream effect
 * (timeline entry, transcript extraction) is claimed separately here, so effects are independent of
 * the order things arrive in: the transcript may land before or after Twilio's status callback, and
 * each effect still runs exactly once.
 *
 * A claim is a lease, stored at metadata.postcall.<effect> = { state, at }:
 *   absent                      -> claimable
 *   claimed, younger than LEASE  -> someone is doing it: not claimable
 *   claimed, older than LEASE    -> presumed lost (process died, DB response lost): claimable again
 *   done                         -> never claimable again
 * The claim is one conditional UPDATE (atomic under concurrency). markEffectDone takes an optional
 * transaction so a DB-only effect (the timeline row) commits together with its done mark: then a
 * crash can never leave the effect written but unmarked.
 */
import { QueryTypes, type Transaction } from 'sequelize';

export type PostCallEffect = 'timeline' | 'extraction';
export const EFFECT_LEASE_MS = 10 * 60 * 1000;

async function db() {
  return (await import('../../../config/database')).sequelize; // lazy: importing must not open a DB connection
}

export async function claimEffect(logId: string, effect: PostCallEffect, now: Date = new Date()): Promise<boolean> {
  const sequelize = await db();
  const staleBefore = new Date(now.getTime() - EFFECT_LEASE_MS).toISOString();
  const rows = await sequelize.query<{ id: string }>(
    `UPDATE communication_logs
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{postcall}',
              COALESCE(metadata->'postcall', '{}'::jsonb) || jsonb_build_object(CAST(:effect AS text), jsonb_build_object('state', 'claimed', 'at', CAST(:at AS text))))
      WHERE id = :id
        AND (metadata->'postcall'->:effect IS NULL
             OR (metadata->'postcall'->:effect->>'state' = 'claimed' AND metadata->'postcall'->:effect->>'at' < :staleBefore))
      RETURNING id`,
    { replacements: { id: logId, effect, at: now.toISOString(), staleBefore }, type: QueryTypes.SELECT });
  return rows.length === 1;
}

export async function markEffectDone(logId: string, effect: PostCallEffect, transaction?: Transaction): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE communication_logs
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{postcall}',
              COALESCE(metadata->'postcall', '{}'::jsonb) || jsonb_build_object(CAST(:effect AS text), jsonb_build_object('state', 'done', 'at', CAST(:at AS text))))
      WHERE id = :id`,
    { replacements: { id: logId, effect, at: new Date().toISOString() }, type: QueryTypes.UPDATE, transaction });
}

/** Give a claim back after a failed attempt, so the next delivery or the sweep can retry at once. */
export async function releaseEffect(logId: string, effect: PostCallEffect): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE communication_logs SET metadata = metadata #- ARRAY['postcall', CAST(:effect AS text)]
      WHERE id = :id AND metadata->'postcall'->:effect->>'state' = 'claimed'`,
    { replacements: { id: logId, effect }, type: QueryTypes.UPDATE });
}
