/**
 * govOpportunityAlias — map an OP canonical opportunity id (op:gov:<hex>) to an EXISTING government delivery
 * project, recorded as its own fact. This link NEVER renames the project and NEVER creates or advances a
 * qualification; it only records the correspondence (mirrors DeliveryProjectSourceLink). The DB unique index
 * uq_gov_opp_alias_canonical enforces one-opportunity-to-one-project; this service surfaces that as an explicit
 * conflict instead of a raw constraint error, and is idempotent for the same (canonical, project) pair.
 */

export class AliasProjectNotFoundError extends Error { constructor(public deliveryProjectId: string) { super('delivery project not found for alias'); this.name = 'AliasProjectNotFoundError'; } }
export class AliasProjectNotGovernmentError extends Error { constructor() { super('alias target is not a government delivery project'); this.name = 'AliasProjectNotGovernmentError'; } }
export class AliasConflictError extends Error { constructor(public existingDeliveryProjectId: string) { super('canonical opportunity is already linked to a different project'); this.name = 'AliasConflictError'; } }

export interface LinkGovOpportunityInput {
  tenantId: string;
  deliveryProjectId: string;
  canonicalOpportunityId: string;
  linkedByIdentityId?: string | null;
  linkReason: string;
}

export interface GovOpportunityAliasDto {
  id: string;
  deliveryProjectId: string;
  canonicalOpportunityId: string;
  created: boolean; // false when an identical link already existed (idempotent replay)
}

/**
 * Idempotent, existence-checked link:
 *  1. The delivery project must EXIST, belong to the caller's tenant, and be a government project (no cross-tenant
 *     enumeration, no aliasing a student/commercial project). Failing any of these is a 404/409 at the route, not
 *     a silent create — this service never creates a project.
 *  2. If the canonical id is already linked:
 *       - to the SAME project -> return the existing alias with created:false (idempotent);
 *       - to a DIFFERENT project -> AliasConflictError (one opportunity, one project).
 *  3. Otherwise create the alias row (link_reason is required, so a link is always attributable).
 */
export async function linkGovOpportunity(input: LinkGovOpportunityInput): Promise<GovOpportunityAliasDto> {
  const { default: DeliveryProject } = await import('../../../models/DeliveryProject');
  const { default: GovOpportunityAlias } = await import('../../../models/GovOpportunityAlias');

  const project: any = await DeliveryProject.findByPk(input.deliveryProjectId);
  if (!project || project.tenant_id !== input.tenantId) throw new AliasProjectNotFoundError(input.deliveryProjectId);
  if (project.project_class !== 'government_public_sector') throw new AliasProjectNotGovernmentError();

  const existing: any = await GovOpportunityAlias.findOne({ where: { canonical_opportunity_id: input.canonicalOpportunityId } });
  if (existing) {
    if (existing.delivery_project_id !== input.deliveryProjectId) throw new AliasConflictError(existing.delivery_project_id);
    return { id: existing.id, deliveryProjectId: existing.delivery_project_id, canonicalOpportunityId: existing.canonical_opportunity_id, created: false };
  }

  const row: any = await GovOpportunityAlias.create({
    delivery_project_id: input.deliveryProjectId,
    canonical_opportunity_id: input.canonicalOpportunityId,
    linked_by_identity_id: input.linkedByIdentityId ?? null,
    link_reason: input.linkReason,
  });
  return { id: row.id, deliveryProjectId: row.delivery_project_id, canonicalOpportunityId: row.canonical_opportunity_id, created: true };
}

/** Look up the project a canonical opportunity is linked to (read-only), or null. */
export async function findAliasByCanonical(canonicalOpportunityId: string): Promise<GovOpportunityAliasDto | null> {
  const { default: GovOpportunityAlias } = await import('../../../models/GovOpportunityAlias');
  const row: any = await GovOpportunityAlias.findOne({ where: { canonical_opportunity_id: canonicalOpportunityId } });
  return row ? { id: row.id, deliveryProjectId: row.delivery_project_id, canonicalOpportunityId: row.canonical_opportunity_id, created: false } : null;
}
