/**
 * govOpportunityVetting — derive each gov opportunity's "approval level" from its qualification record so the
 * discovery page (/admin/gov-opportunities) can show where an opportunity sits on the vetting ladder and filter
 * to vetted ones.
 *
 * NOT a new table. A feed row joins to its `gov_qualifications` record by canonical = 'gws:' + uuid — the exact
 * key the "Qualify" action writes (see AdminGovOpportunitiesPage) — and that record's `decision` plus the advisory
 * `requirements_json.approval` already express the stage. One source of truth, so the page badge can never drift
 * from the real qualification state.
 */
import type { QualificationDecision } from './govQualification';

export type VettingStage =
  | 'not_vetted'          // no active qualification for this opportunity yet
  | 'in_review'           // a qualification exists, decision pending_review
  | 'needs_requirements'  // decision needs_evidence (requirements not yet established)
  | 'awaiting_approval'   // a second-admin approval request is open (no terminal decision yet)
  | 'rfi'                 // decision rfi_response (an approval outcome, not a build pursuit)
  | 'vetted'              // decision approved_bid_pursuit
  | 'no_bid';             // decision no_bid

export interface OpportunityVetting {
  stage: VettingStage;
  decision: QualificationDecision | null;
  /** requirements_json.approval.status when a second-admin approval has been requested, else null. */
  approvalStatus: string | null;
}

const NOT_VETTED: OpportunityVetting = { stage: 'not_vetted', decision: null, approvalStatus: null };

/** The canonical opportunity id for a feed uuid — mirrors the Qualify link ('gws:' + uuid) in the discovery page. */
export const canonicalForUuid = (uuid: string): string => `gws:${uuid}`;

/**
 * PURE. Map one ACTIVE qualification record (or null) to its vetting stage.
 *
 * Order is load-bearing: a terminal decision (vetted / rfi / no_bid) wins over an open approval request, which
 * wins over the earlier review stages. An unknown-or-absent decision with no approval reads as not_vetted.
 */
export function deriveVettingStage(
  rec: { decision?: unknown; requirements_json?: unknown } | null | undefined,
): OpportunityVetting {
  if (!rec) return NOT_VETTED;
  const decision = (typeof rec.decision === 'string' ? rec.decision : null) as QualificationDecision | null;
  const rj = rec.requirements_json && typeof rec.requirements_json === 'object'
    ? (rec.requirements_json as Record<string, unknown>) : null;
  const approval = rj && rj.approval && typeof rj.approval === 'object'
    ? (rj.approval as Record<string, unknown>) : null;
  const approvalStatus = approval && typeof approval.status === 'string' ? (approval.status as string) : null;

  if (decision === 'approved_bid_pursuit') return { stage: 'vetted', decision, approvalStatus };
  if (decision === 'rfi_response') return { stage: 'rfi', decision, approvalStatus };
  if (decision === 'no_bid') return { stage: 'no_bid', decision, approvalStatus };
  if (approvalStatus === 'pending') return { stage: 'awaiting_approval', decision, approvalStatus };
  if (decision === 'needs_evidence') return { stage: 'needs_requirements', decision, approvalStatus };
  if (decision === 'pending_review') return { stage: 'in_review', decision, approvalStatus };
  return { stage: decision ? 'in_review' : 'not_vetted', decision, approvalStatus };
}

/** Most-advanced stage wins when a canonical has several active qualifications (different bidding entities). */
const STAGE_RANK: Record<VettingStage, number> = {
  not_vetted: 0, no_bid: 1, in_review: 2, needs_requirements: 3, awaiting_approval: 4, rfi: 5, vetted: 6,
};

/**
 * Bulk-load the vetting stage for a set of opportunity canonicals in one query. Best-effort: returns an empty map
 * on any error so discovery never breaks because this join failed. NEVER throws.
 */
export async function loadVettingByCanonical(
  tenantId: string,
  canonicals: string[],
): Promise<Map<string, OpportunityVetting>> {
  const out = new Map<string, OpportunityVetting>();
  const unique = Array.from(new Set((canonicals || []).filter(Boolean)));
  if (!tenantId || unique.length === 0) return out;
  try {
    const { default: GovQualification } = await import('../../models/GovQualification');
    const rows: any[] = await GovQualification.findAll({
      where: { tenant_id: tenantId, canonical_opportunity_id: unique, status: 'active' },
      attributes: ['canonical_opportunity_id', 'decision', 'requirements_json'],
    });
    for (const r of rows) {
      const canon = String(r.canonical_opportunity_id);
      const v = deriveVettingStage(r);
      const prev = out.get(canon);
      if (!prev || STAGE_RANK[v.stage] >= STAGE_RANK[prev.stage]) out.set(canon, v);
    }
  } catch {
    return new Map();
  }
  return out;
}
