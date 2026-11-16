import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { HumanNeed } from './proposalReviewTypes';
import { collectProjectNeeds } from './collectProjectNeeds';
import { routeNeedResolution, type NeedSubmission, type ResolveActor } from './resolveNeed';
import { cleanFactKey } from './proposalFactKey';

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
  // A grouped record (reference/personnel) summarizes to its primary field (client / name).
  const rec = payload.record;
  if (rec && typeof rec === 'object') {
    const r = rec as Record<string, unknown>;
    const primary = r.client ?? r.name;
    return typeof primary === 'string' && primary ? primary : JSON.stringify(rec);
  }
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

  // Close the loop (Dossier Phase 3): a fact-kind need routes to the company library, so the answer becomes a
  // REUSABLE, tenant-wide fact the agent can cite on the next bid, not just a one-off gap resolution. Approved only
  // when the approver answered (routeNeedResolution's status); an intern's answer lands as a pending Dossier fact a
  // human approves. Best-effort: the need is already resolved above, so a library write failure must not fail the answer.
  if (routed.store === 'library') {
    try {
      const { default: GovQualification } = await import('../../../models/GovQualification');
      const q: any = await GovQualification.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
      if (q?.tenant_id) {
        const { addCompanyFact } = await import('./govCompanyLibrary');
        await addCompanyFact(
          q.tenant_id,
          { key: cleanFactKey(routed.key, need.ask), value: String((routed.payload as { value?: unknown }).value ?? summary), source: 'answered in proposal studio', category: 'general', approved: routed.status === 'approved' },
          null,
        );
      }
    } catch { /* best-effort; the need is resolved, the library is a bonus */ }
  }

  // Same close-the-loop rail for a GROUPED record: a past-performance reference or a key person answered as one unit
  // lands as a tenant-wide library record the agent cites whole, so it never fragments into Client/Scope/Period facts
  // and is reusable on the next bid. Approved iff the approver answered; an intern's record is a pending Dossier entry.
  // Best-effort for the same reason as the fact path above.
  if (routed.store === 'library_record') {
    try {
      const { default: GovQualification } = await import('../../../models/GovQualification');
      const q: any = await GovQualification.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
      if (q?.tenant_id) {
        const rt = (routed.payload as { recordType?: unknown }).recordType;
        const rec = ((routed.payload as { record?: unknown }).record ?? {}) as Record<string, unknown>;
        const approved = routed.status === 'approved';
        if (rt === 'reference') {
          const { addCompanyReference } = await import('./govCompanyLibrary');
          await addCompanyReference(q.tenant_id, { ...rec, approved }, null);
        } else if (rt === 'personnel') {
          const { addCompanyPersonnel } = await import('./govCompanyLibrary');
          await addCompanyPersonnel(
            q.tenant_id,
            { name: String(rec.name ?? ''), role: (rec.role as string) ?? null, resumeHtml: (rec.resumeHtml as string) ?? null, approved },
            null,
          );
        }
      }
    } catch { /* best-effort; the need is resolved, the library record is a bonus */ }
  }

  // Answer-once across the tenant's other contracts (spec §B, decision #1). A need's identity is its dossier target,
  // so the SAME question can be open on several of the tenant's bids at once. Closing it here closes its open twin on
  // every sibling bid — the question drops off each project's "Needs you" list the moment it is answered once. We do
  // NOT resume those siblings' documents: only the current project eager-rebuilds (the route's resumeUnblocked). The
  // sibling payload is flagged { propagated, rebuild_pending } so a later rebuild can tell the answer arrived off-bid.
  // Best-effort, like the library writes above: the current project's answer is already recorded, so a failure is silent.
  try {
    const { default: GovQualification } = await import('../../../models/GovQualification');
    const { siblingDeliveryProjectIds } = await import('./tenantProjects');
    const siblings = await siblingDeliveryProjectIds(deliveryProjectId, GovQualification as unknown as Parameters<typeof siblingDeliveryProjectIds>[1]);
    if (siblings.length) {
      // Explicit IN with GENERATED positional binds — never `= ANY($1)` with an array bind, which has malformed the
      // array and crash-looped prod before. $1 need_key, $2 answer, $3 payload, $4.. the sibling delivery-project ids.
      const placeholders = siblings.map((_, i) => `$${i + 4}`).join(', ');
      const propagated = JSON.stringify({ ...payload, propagated: true, rebuild_pending: true, source_project: deliveryProjectId });
      await sequelize.query(
        `UPDATE gov_proposal_document_gaps
            SET resolution = 'answered', answer = $2, resolution_payload = $3::jsonb, resolved_at = NOW()
          WHERE need_key = $1 AND resolution = 'open' AND delivery_project_id IN (${placeholders})`,
        { bind: [key, summary, propagated, ...siblings], type: QueryTypes.UPDATE },
      );
    }
  } catch { /* best-effort; the current project's answer is already recorded */ }

  return {
    status: 200,
    body: { resolved: key, store: routed.store, status: routed.status, unblocked: unblockedDocKeys(need) },
  };
}
