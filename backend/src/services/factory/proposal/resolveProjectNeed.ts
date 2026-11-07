import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { HumanNeed } from './proposalReviewTypes';
import { collectProjectNeeds } from './collectProjectNeeds';
import { routeNeedResolution, type NeedSubmission, type ResolveActor } from './resolveNeed';

/**
 * resolveProjectNeed — "a human answers one open need" end to end (v3 §V1.4; the POST `/needs/:key/resolve`
 * body). It finds the still-open need by key, validates + routes the submission with {@link routeNeedResolution}
 * (the pure, tested core), then records the routed answer durably on the gaps table: it closes the open gap(s)
 * carrying that `need_key`, or, for a finding-derived need that has no gap row, inserts an `answered` gap that
 * carries the need and its answer. Either way the need then drops off {@link collectProjectNeeds} (which excludes
 * keys with a recorded resolution) and the answer is auditable. Returns the HTTP status + body for the route.
 */

/** PURE: the distinct documents a need unblocks, from its `usedIn`. */
export function unblockedDocKeys(need: HumanNeed): string[] {
  const seen = new Set<string>();
  for (const u of need.usedIn || []) {
    if (u && typeof u.docKey === 'string' && u.docKey) seen.add(u.docKey);
  }
  return [...seen];
}

/** PURE: a short human-readable summary of the answer, for the gap `answer` TEXT column. */
export function answerSummary(payload: Record<string, unknown>): string {
  const v = payload.value ?? payload.decision ?? payload.fileRef ?? payload.signatureRef;
  if (typeof payload.confirmed === 'boolean') return payload.confirmed ? 'confirmed' : 'declined';
  return typeof v === 'string' && v ? v : JSON.stringify(payload);
}

export interface ResolveResult {
  status: number;
  body: Record<string, unknown>;
}

export async function resolveProjectNeed(
  deliveryProjectId: string,
  key: string,
  submission: NeedSubmission,
  actor: ResolveActor,
): Promise<ResolveResult> {
  if (!deliveryProjectId || !key) {
    return { status: 400, body: { error: 'projectId and key are required', error_class: 'ValidationError' } };
  }

  let need: HumanNeed | undefined;
  try {
    const open = await collectProjectNeeds(deliveryProjectId);
    need = open.find((n) => n.key === key);
  } catch {
    return { status: 500, body: { error: 'Could not load the need.', error_class: 'NeedsLoadFailed' } };
  }
  if (!need) {
    // Already resolved, or never existed — idempotent: a second resolve of the same key is a no-op 404.
    return { status: 404, body: { error: 'That need is not open (already resolved or unknown).', error_class: 'NeedNotOpen' } };
  }

  const routed = routeNeedResolution(need, submission, actor);
  if (!routed.ok) {
    return { status: 400, body: { error: routed.error, error_class: 'NeedResolutionInvalid' } };
  }

  const payload = { ...routed.payload, store: routed.store, status: routed.status };
  const summary = answerSummary(routed.payload);
  const docKey = need.usedIn?.[0]?.docKey || 'project';
  const sectionKey = need.usedIn?.[0]?.sectionKey || 'project';

  try {
    const [, meta] = await sequelize.query(
      `UPDATE gov_proposal_document_gaps
          SET resolution = 'answered', answer = $3, resolution_payload = $4::jsonb, resolved_at = NOW()
        WHERE delivery_project_id = $1 AND need_key = $2 AND resolution = 'open'`,
      { bind: [deliveryProjectId, key, summary, JSON.stringify(payload)], type: QueryTypes.UPDATE },
    );
    const updated = typeof meta === 'number' ? meta : (meta as any)?.rowCount ?? 0;

    if (!updated) {
      // Finding-derived need with no gap row: record the resolution as an answered gap so it persists + drops off.
      await sequelize.query(
        `INSERT INTO gov_proposal_document_gaps
           (delivery_project_id, doc_key, section_key, question, why, resolution, answer, need, need_key, resolution_payload, resolved_at)
         VALUES ($1, $2, $3, $4, $5, 'answered', $6, $7::jsonb, $8, $9::jsonb, NOW())`,
        {
          bind: [deliveryProjectId, docKey, sectionKey, need.ask, need.why ?? null, summary, JSON.stringify(need), key, JSON.stringify(payload)],
          type: QueryTypes.INSERT,
        },
      );
    }
  } catch (err) {
    return { status: 500, body: { error: 'The answer could not be recorded.', error_class: 'NeedResolvePersistFailed' } };
  }

  return {
    status: 200,
    body: { resolved: key, store: routed.store, status: routed.status, unblocked: unblockedDocKeys(need) },
  };
}
