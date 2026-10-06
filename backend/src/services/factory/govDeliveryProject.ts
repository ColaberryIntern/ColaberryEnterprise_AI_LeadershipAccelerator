/**
 * govDeliveryProject — gov pursuit STEP 6: on a bid-pursuit APPROVAL, create (or reuse) ONE
 * `government_public_sector` delivery project for the opportunity, carrying the two linked tracks
 * (`proposal` = the customer's requirements, `solution_build` = our solution), and map the reviewer's
 * ESTABLISHED requirements into the compliance matrix on both tracks.
 *
 * Governance + honesty:
 *  - Ships DARK behind FLAGS.govIngestion (ENABLE_GOV_INGESTION); the approval route calls this only when
 *    the flag is on, so deploying it changes nothing until it is deliberately switched on.
 *  - Creating the project NEVER authorizes or runs a build — buildAuthorization + factoryGenerate are untouched.
 *    The tracks ship `unassessed` and every requirement's `evidence_state` is `unassessed` (never fabricated).
 *  - Idempotent + atomic + REPLAY-SAFE: the project is resolved by a deterministic slug scoped to the fixed gov
 *    container (fail-closed if not configured), tracks are create-if-absent and requirements create-or-GUARDED-
 *    update (source-derived fields only), all in one transaction — so re-approving is a no-op that NEVER resets an
 *    existing track's owner / student-build link / status, or a requirement's human-assessed evidence. (Gov
 *    ingestion runs LIVE in prod, so a blind upsert here was erasing ownership/links/evidence on every re-approval.)
 *  - Reversible: deleting the `delivery_projects` row cascades the tracks/requirements away.
 */
import { sequelize } from '../../config/database';
import { factoryId } from './factoryIds';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import type { ContractRequirementAttributes } from '../../models/ContractRequirement';

const TRACK_TYPES = ['proposal', 'solution_build'] as const;

const GWS_RE = /^gws:([0-9a-f-]{36})$/i;

/**
 * Deterministic, tenant-unique project slug for an opportunity. A decoupled key `gws:<uuid>` maps to
 * `gov-<uuid>` (matching the Phase-1 start route's slug), any other canonical id is sanitized. `delivery_projects`
 * enforces unique `(tenant_id, slug)`, so this is the idempotency key for "one project per opportunity".
 */
export function govProjectSlug(canonicalOpportunityId: string): string {
  const gws = GWS_RE.exec(canonicalOpportunityId);
  if (gws) return `gov-${gws[1].toLowerCase()}`;
  return `gov-${canonicalOpportunityId.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.slice(0, 120).replace(/-+$/, '');
}

/**
 * Map one reviewer-ESTABLISHED requirement onto a `contract_requirements` row for both tracks. PURE + deterministic
 * (the id is `factoryId('contract_requirement', [deliveryProjectId, canonical_req_id])`, so a re-run upserts the
 * same row). Fabricates nothing: `evidence_state` is always `unassessed` (the factory has not assessed evidence),
 * and only fields the established requirement actually carries are copied. `human_confirmed` is true because the
 * reviewer explicitly established it. Returns null for a requirement with no id (skipped).
 */
export function toContractRequirementRow(deliveryProjectId: string, est: any): ContractRequirementAttributes | null {
  const canonicalReqId = String(est?.id ?? '').trim();
  if (!canonicalReqId) return null;
  return {
    id: factoryId('contract_requirement', [deliveryProjectId, canonicalReqId]),
    delivery_project_id: deliveryProjectId,
    canonical_req_id: canonicalReqId,
    statement: String(est?.text ?? ''),
    kind: String(est?.kind ?? 'compliance'),
    priority: est?.bindingStatus === 'binding_solicitation_requirement' ? 'must' : 'should',
    tracks: ['proposal', 'solution_build'],
    source_document: String(est?.sourceDocument ?? ''),
    amendment_version: '',
    section: String(est?.section ?? ''),
    extracted_text: String(est?.text ?? ''),
    interpretation: '',
    human_confirmed: true,
    evidence_state: 'unassessed', // never fabricate an evidence verdict here
    source_evidence: [],
  };
}

export interface EnsureGovTwoTrackProjectInput {
  /** The approved qualification version row id — its `delivery_project_id` is set to the project. */
  qualificationId: string;
  canonicalOpportunityId: string;
  established: any[];
  provenance?: { title?: string | null; agency?: string | null } | null;
  approverIdentityId?: string | null;
}

export interface EnsureGovTwoTrackProjectResult {
  deliveryProjectId: string;
  created: boolean;
  tracks: number;
  requirements: number;
}

export class GovContainerUnavailableError extends Error {
  constructor() { super('gov container not resolvable'); this.name = 'GovContainerUnavailableError'; }
}

/**
 * Create-or-reuse the gov delivery project + its two tracks, and map the established requirements onto it.
 * Idempotent and atomic. Throws GovContainerUnavailableError if the fixed gov container is not configured
 * (fail-closed, same posture as the routes). Never confers build authorization.
 */
export async function ensureGovTwoTrackProject(input: EnsureGovTwoTrackProjectInput): Promise<EnsureGovTwoTrackProjectResult> {
  const { default: DeliveryProject } = await import('../../models/DeliveryProject');
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const { default: ContractRequirement } = await import('../../models/ContractRequirement');
  const { default: GovQualification } = await import('../../models/GovQualification');

  const container = await lookupGovContractsContainer();
  if (!container) throw new GovContainerUnavailableError();

  const slug = govProjectSlug(input.canonicalOpportunityId);
  const name = String(input.provenance?.title || `Government pursuit ${input.canonicalOpportunityId}`).slice(0, 255);
  const established = Array.isArray(input.established) ? input.established : [];

  return sequelize.transaction(async (transaction) => {
    // Idempotency: one project per opportunity, scoped to the fixed gov container + the government class.
    let project: any = await DeliveryProject.findOne({
      where: { slug, tenant_id: container.tenant.id, organization_id: container.org.id, project_class: 'government_public_sector' },
      transaction,
    });
    let created = false;
    if (!project) {
      project = await DeliveryProject.create({
        engagement_id: container.engagement.id,
        tenant_id: container.tenant.id,
        organization_id: container.org.id,
        brand_id: null,
        name,
        slug,
        project_class: 'government_public_sector',
        status: 'discovery',
        created_by_identity_id: input.approverIdentityId || null,
      }, { transaction });
      created = true;
    }
    const deliveryProjectId = project.id as string;

    // Create-if-absent. A re-approval must NEVER reset an existing track's owner, student-build link, or status
    // (ingestion runs live in prod — a blind upsert here erased them). findOrCreate inserts only when missing.
    for (const trackType of TRACK_TYPES) {
      const trackId = factoryId('track', [deliveryProjectId, trackType]);
      await ContractTrack.findOrCreate({
        where: { id: trackId },
        defaults: {
          id: trackId,
          delivery_project_id: deliveryProjectId,
          track_type: trackType,
          status: 'unassessed',
          owner_identity_id: null,
          solution_student_project_id: null,
        },
        transaction,
      });
    }

    // Replay-safe requirements: create a new one, else GUARD the update to source-derived descriptive fields only.
    // The reviewer's evidence assessment (evidence_state / source_evidence / human_confirmed) is never overwritten
    // on an existing row — the established set refreshes WHAT a requirement says, not how far its evidence got.
    // Stale rows (absent from the new established set) are left in place: non-destructive; marking them superseded
    // needs an additive column and is a separate task.
    let requirements = 0;
    for (const est of established) {
      const row = toContractRequirementRow(deliveryProjectId, est);
      if (!row) continue;
      const existing = await ContractRequirement.findOne({ where: { id: row.id }, transaction });
      if (!existing) {
        await ContractRequirement.create(row, { transaction });
      } else {
        await ContractRequirement.update({
          statement: row.statement, kind: row.kind, priority: row.priority, tracks: row.tracks,
          source_document: row.source_document, section: row.section, extracted_text: row.extracted_text,
        }, { where: { id: row.id }, transaction });
      }
      requirements += 1;
    }

    await GovQualification.update({ delivery_project_id: deliveryProjectId }, { where: { id: input.qualificationId }, transaction });

    return { deliveryProjectId, created, tracks: TRACK_TYPES.length, requirements };
  });
}
