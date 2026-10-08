/**
 * govProposalAmendment — the dates/messages/amendment inbox (P4) + its load-bearing effect.
 *
 * THE INVALIDATION RAIL: recording an entry of kind `amendment` whose `affects` lists requirement ids flips every
 * proposal response for one of those requirements that was `reviewed` or `approved` back to `revision_required` —
 * a material change to the requirement means the already-signed-off answer must be re-examined. This is the
 * honesty of "a material amendment invalidates affected readiness": you cannot keep an approved answer to a
 * requirement that just changed. A `message` entry (or an amendment with no `affects`) records context and
 * invalidates nothing. Idempotent per (delivery_project_id, amendment_key); invalidation is naturally idempotent
 * (a response already in revision_required is not matched again).
 */
import { Op } from 'sequelize';
import GovProposalAmendment, { type GovProposalAmendmentAttributes, type ProposalAmendmentKind } from '../../models/GovProposalAmendment';
import GovProposalResponse from '../../models/GovProposalResponse';

export interface AmendmentView {
  id: string;
  amendmentKey: string;
  kind: ProposalAmendmentKind;
  summary: string;
  affects: string[];
  provenance: string | null;
  observedAt: string | null;
  invalidatedCount: number;
  createdAt: string | null;
}

export class AmendmentError extends Error {
  constructor(message: string, readonly reason: string) { super(message); this.name = 'AmendmentError'; }
}

function toView(row: GovProposalAmendmentAttributes): AmendmentView {
  return {
    id: String(row.id),
    amendmentKey: row.amendment_key,
    kind: row.kind,
    summary: row.summary,
    affects: Array.isArray(row.affects) ? row.affects.map((a: any) => String(a)) : [],
    provenance: row.provenance ?? null,
    observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
    invalidatedCount: Number(row.invalidated_count ?? 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Invalidate the readiness of every response for an affected requirement: a `reviewed` or `approved` answer flips
 * to `revision_required`. Returns how many were flipped. A `draft`/`revision_required` answer is left as-is (it is
 * already open), and a requirement with no authored response flips nothing.
 */
export async function invalidateResponsesForRequirements(deliveryProjectId: string, requirementIds: string[]): Promise<number> {
  const ids = (Array.isArray(requirementIds) ? requirementIds : []).map((x) => String(x).trim()).filter(Boolean);
  if (!deliveryProjectId || ids.length === 0) return 0;
  const [count] = await GovProposalResponse.update(
    { status: 'revision_required', updated_at: new Date() },
    { where: { delivery_project_id: deliveryProjectId, requirement_id: { [Op.in]: ids }, status: { [Op.in]: ['reviewed', 'approved'] } } },
  );
  return Number(count ?? 0);
}

export interface RecordAmendmentInput {
  deliveryProjectId: string;
  amendmentKey: string;
  kind?: ProposalAmendmentKind;
  summary: string;
  affects?: string[];
  provenance?: string | null;
  observedAt?: string | null;
  recordedByIdentityId?: string | null;
}

/** Record an amendment/message in the inbox and run its invalidation. Idempotent upsert by (project, key). */
export async function recordProposalAmendment(input: RecordAmendmentInput): Promise<AmendmentView> {
  const deliveryProjectId = String(input.deliveryProjectId ?? '').trim();
  const amendmentKey = String(input.amendmentKey ?? '').trim();
  const summary = String(input.summary ?? '').trim();
  const kind: ProposalAmendmentKind = input.kind === 'message' ? 'message' : 'amendment';
  if (!deliveryProjectId || !amendmentKey) throw new AmendmentError('Missing project/amendment identifiers.', 'bad_input');
  if (!summary) throw new AmendmentError('A summary is required.', 'no_summary');
  const affects = kind === 'amendment'
    ? (Array.isArray(input.affects) ? input.affects.map((x) => String(x).trim()).filter(Boolean) : [])
    : []; // a message never carries affects — it invalidates nothing
  const provenance = input.provenance ? String(input.provenance).trim() || null : null;
  const observedAt = input.observedAt ? new Date(input.observedAt) : null;
  const recordedBy = input.recordedByIdentityId ? String(input.recordedByIdentityId).trim() || null : null;

  // Run the invalidation FIRST so the recorded count reflects the effect this entry had.
  const invalidatedCount = affects.length ? await invalidateResponsesForRequirements(deliveryProjectId, affects) : 0;

  const existing: any = await GovProposalAmendment.findOne({ where: { delivery_project_id: deliveryProjectId, amendment_key: amendmentKey } });
  if (existing) {
    await existing.update({ kind, summary, affects, provenance, observed_at: observedAt, recorded_by_identity_id: recordedBy, invalidated_count: invalidatedCount });
    return toView(existing.get({ plain: true }) as GovProposalAmendmentAttributes);
  }
  try {
    const row = await GovProposalAmendment.create({
      delivery_project_id: deliveryProjectId, amendment_key: amendmentKey, kind, summary, affects,
      provenance, observed_at: observedAt, recorded_by_identity_id: recordedBy, invalidated_count: invalidatedCount,
    });
    return toView(row.get({ plain: true }) as GovProposalAmendmentAttributes);
  } catch (err) {
    const raced: any = await GovProposalAmendment.findOne({ where: { delivery_project_id: deliveryProjectId, amendment_key: amendmentKey } });
    if (!raced) throw err;
    await raced.update({ kind, summary, affects, provenance, observed_at: observedAt, recorded_by_identity_id: recordedBy, invalidated_count: invalidatedCount });
    return toView(raced.get({ plain: true }) as GovProposalAmendmentAttributes);
  }
}

/** The inbox for a delivery project, newest first. */
export async function listProposalAmendments(deliveryProjectId: string): Promise<AmendmentView[]> {
  if (!deliveryProjectId) return [];
  const rows = await GovProposalAmendment.findAll({ where: { delivery_project_id: deliveryProjectId }, order: [['created_at', 'DESC']] });
  return rows.map((r) => toView(r.get({ plain: true }) as GovProposalAmendmentAttributes));
}
