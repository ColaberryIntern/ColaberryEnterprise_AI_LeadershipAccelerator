/**
 * govDossier - the global, cross-project dossier (M4-T2).
 *
 * A gov answer is NOT stored per project: when a fact/reference/person is answered, resolveProjectNeed
 * writes it into the tenant-scoped company library (gov_company_facts / _references / _personnel) and
 * propagates it to the tenant's sibling bids. So the "store" already exists and is cross-project.
 *
 * This module is the READ side: given a gov delivery project, resolve its tenant and return the
 * tenant-wide APPROVED library. Because the dossier keys on the tenant (the company), an answer
 * written while working one bid is read back on every other bid of the same company - that is the
 * cross-project guarantee. Only approved rows are returned (an intern's unapproved answer stays
 * pending until a human approves it), and dedup is the library's own (facts are keyed).
 *
 * Read-only and fail-soft: a missing tenant or an empty/unavailable library yields an empty dossier,
 * never an error.
 */
import GovQualification from '../../../models/GovQualification';
import { approvedGroundingFacts, approvedReferences, approvedPersonnel } from './govCompanyLibrary';

export interface GovDossier {
  tenantId: string | null;
  facts: string[];
  references: Awaited<ReturnType<typeof approvedReferences>>;
  personnel: Awaited<ReturnType<typeof approvedPersonnel>>;
}

/** Resolve the tenant (company) that owns a gov delivery project, from its latest qualification version. */
export async function tenantForDeliveryProject(deliveryProjectId: string): Promise<string | null> {
  if (!deliveryProjectId) return null;
  const q = await GovQualification.findOne({
    where: { delivery_project_id: deliveryProjectId },
    order: [['version', 'DESC']],
  }) as { tenant_id?: string | null } | null;
  return q?.tenant_id ?? null;
}

/**
 * The cross-project dossier for a gov project: the tenant-wide approved facts, references, and
 * personnel. Empty (not an error) when the project has no tenant or an empty/unavailable library.
 */
export async function getGovDossier(deliveryProjectId: string): Promise<GovDossier> {
  const tenantId = await tenantForDeliveryProject(deliveryProjectId).catch(() => null);
  if (!tenantId) return { tenantId: null, facts: [], references: [], personnel: [] };
  const [facts, references, personnel] = await Promise.all([
    approvedGroundingFacts(tenantId).catch(() => [] as string[]),
    approvedReferences(tenantId).catch(() => [] as GovDossier['references']),
    approvedPersonnel(tenantId).catch(() => [] as GovDossier['personnel']),
  ]);
  return { tenantId, facts, references, personnel };
}
