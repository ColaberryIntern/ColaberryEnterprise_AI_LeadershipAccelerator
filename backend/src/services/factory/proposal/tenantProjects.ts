/**
 * tenantProjects — the tenant's set of delivery projects, for cross-contract need identity (spec §B, decision #1).
 *
 * A need's identity is its dossier target (a tenant-canonical fact key, or a reference/personnel slot), not the
 * project it was raised in. So "the same question" can be open on several of a tenant's bids at once. This resolves,
 * for the project a human is answering in, the OTHER delivery projects on the same tenant — the siblings whose open
 * gaps carrying the same `need_key` should be closed when the question is answered once.
 *
 * Tenant is read from the project's own latest GovQualification (the delivery project does not itself carry a tenant;
 * the qualification that spawned it does). Pure of SQL: it drives the Sequelize model the caller hands it, which keeps
 * it unit-testable with a mocked model and lets `resolveProjectNeed` reuse the import it already lazy-loads.
 */

type QualRow = { tenant_id?: string | null; delivery_project_id?: string | null };

/** The slice of the GovQualification model this helper drives — kept minimal so it is trivially mockable in tests. */
export interface QualificationReader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findOne: (opts: any) => Promise<QualRow | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findAll: (opts: any) => Promise<QualRow[]>;
}

/** PURE: distinct sibling ids from the tenant's qualification rows — every delivery project except the current one. */
export function siblingIdsFromRows(rows: QualRow[], currentProjectId: string): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    const id = r?.delivery_project_id;
    if (id && id !== currentProjectId) ids.add(id);
  }
  return [...ids];
}

/**
 * The OTHER delivery projects on the tenant that owns `deliveryProjectId`. Empty when the project has no qualification,
 * no tenant, or no siblings. Fail-soft: any read error yields an empty list (propagation is best-effort — a failure
 * here must never fail the answer it rides on).
 */
export async function siblingDeliveryProjectIds(
  deliveryProjectId: string,
  GovQualification: QualificationReader,
): Promise<string[]> {
  if (!deliveryProjectId) return [];
  try {
    const current = await GovQualification.findOne({
      where: { delivery_project_id: deliveryProjectId },
      order: [['version', 'DESC']],
    });
    const tenantId = current?.tenant_id;
    if (!tenantId) return [];
    const rows = await GovQualification.findAll({
      where: { tenant_id: tenantId },
      attributes: ['delivery_project_id'],
    });
    return siblingIdsFromRows(rows ?? [], deliveryProjectId);
  } catch {
    return [];
  }
}
