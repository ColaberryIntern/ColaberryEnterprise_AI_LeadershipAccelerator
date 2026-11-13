/**
 * caseStudyServiceLinkGateFacts - "how many CONFIRMED service links does this case study have?", for the publish gate.
 *
 * The count is taken INSIDE the gov-contracts tenant (`lookupGovContractsContainer`), with the same tenancy
 * invariant as `caseStudyServiceLinkStore`: resolve that tenant's services first, then count only confirmed links
 * pointing into that set. `case_studies` has no tenant column, so a link another tenant confirmed must not satisfy
 * this tenant's rule.
 *
 * FAILS CLOSED, like `hireGateFacts`: if the tenant cannot be resolved or a query throws, the answer is
 * `{ confirmedCount: 0 }` and the gate refuses. A refusal can be retried by the admin; a publish let through on a
 * lookup failure cannot be taken back from a reader who saw it. Logged with an error_class either way.
 *
 * Models are lazy-loaded, so importing this module never initializes the ORM.
 */
import { Op } from 'sequelize';

export interface ServiceLinkGateFacts { confirmedCount: number }

/** Seam for tests: resolve the gov tenant id (null when the workspace is not configured). */
export type TenantResolver = () => Promise<string | null>;

async function govTenantId(): Promise<string | null> {
  const { lookupGovContractsContainer } = await import('../../scripts/lib/factoryDemoContainer');
  const container = await lookupGovContractsContainer();
  return container ? container.tenant.id : null;
}

function warn(errorClass: string, caseStudyId: string, message: string): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'case_study_service_link_facts_failed',
    outcome: 'failure', error_class: errorClass, context: { case_study_id: caseStudyId, message: message.slice(0, 200), fail_closed: true },
  }));
}

/** Count confirmed links from one case study into one tenant's services. Exported for the intake/route reuse and tests. */
export async function countConfirmedLinksInTenant(caseStudyId: string, tenantId: string): Promise<number> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const services = await ServiceOffering.findAll({ where: { tenant_id: tenantId }, attributes: ['id'] });
  const ids = services.map((s) => (s as unknown as { id: string }).id);
  if (!ids.length) return 0;
  return CaseStudyServiceLink.count({
    where: { case_study_id: caseStudyId, state: 'confirmed', service_offering_id: { [Op.in]: ids } },
  });
}

export async function serviceLinkGateFacts(
  caseStudyId: string, resolveTenant: TenantResolver = govTenantId,
): Promise<ServiceLinkGateFacts> {
  try {
    const tenantId = await resolveTenant();
    if (!tenantId) {
      warn('TenantUnresolved', caseStudyId, 'gov contracts workspace not configured');
      return { confirmedCount: 0 };
    }
    return { confirmedCount: await countConfirmedLinksInTenant(caseStudyId, tenantId) };
  } catch (err) {
    const name = (err as Error)?.name;
    warn(name && name !== 'Error' ? name : 'ServiceLinkFactsError', caseStudyId, String((err as Error)?.message ?? err));
    return { confirmedCount: 0 };
  }
}
