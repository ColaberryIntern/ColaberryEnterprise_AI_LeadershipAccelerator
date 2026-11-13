/**
 * serviceProposal - grow the Our Services catalog from case studies (package spec 1D, 1E).
 *
 *   proposeServiceFromCaseStudy - a person looks at a case study in Intake, decides it proves a service the catalog
 *     does not have yet, and names it. In ONE transaction: the service is created as `growth` (created_by = actor)
 *     and a `confirmed` link from the case study to it is written (decided_by = actor). The person naming the
 *     service IS the human decision, so this confirmation is not an auto-confirm.
 *   promoteServiceOffering - `growth` -> `active`, only by a person and only with proof (Ali, 2026-11-13: at least
 *     one confirmed case study + a human click). Growth services stay out of Fit until then (Ali, 2026-10-16).
 *
 * IDEMPOTENCY. Propose is keyed on (tenant, lower(name)): a transaction-scoped advisory lock serialises two
 * proposals of the same name, and an existing service of that name is linked instead of duplicated
 * (`existing: true`). No unique index is added to `service_offerings`, because production may already hold two
 * services with one name and a unique index would then fail at boot. The link reuses the pair's existing row (the
 * table's unique pair index), so a second propose writes nothing. Promote is a no-op on an active service.
 *
 * Failure-first: (1) any failure rolls the whole transaction back - no service without its link, no link without
 * its service; (2) no retry here - the caller re-runs, which is safe because both operations are idempotent;
 * (3) recovery: re-run, or retire a mistaken growth service with the existing retire route; (4) handled: unknown
 * or archived case study, a retired namesake, a cross-tenant service id, a concurrent duplicate proposal, a promote
 * with no (or only archived) proof. Not handled: the database being down - the caller gets the error.
 *
 * Models and the connection are lazy-loaded, so importing this module never initializes the ORM.
 */
import { Op, fn, col, where as sqlWhere } from 'sequelize';
import { toServiceOfferingDto, toStrArray } from './serviceCatalog';
import type { CaseStudyServiceLinkAttributes } from '../../models/CaseStudyServiceLink';

export type ServiceProposalErrorClass = 'CaseStudyNotFound' | 'ServiceNotFound' | 'ServiceRetired' | 'PromotionRefused';

export class ServiceProposalError extends Error {
  constructor(public errorClass: ServiceProposalErrorClass, message: string, public httpStatus: 404 | 409) {
    super(message);
    this.name = 'ServiceProposalError';
  }
}

export interface ProposeServiceInput {
  tenantId: string;
  caseStudyId: string;
  name: string;
  category?: string | null;
  description?: string | null;
  keywords?: string[];
  naicsCodes?: string[];
  actor: string;
}

export interface ProposeServiceResult {
  // The DTO shape is owned by serviceCatalog.toServiceOfferingDto (typed `any` there by repo convention).
  service: ReturnType<typeof toServiceOfferingDto>;
  existing: boolean;
  link: { id: string; state: 'confirmed'; changed: boolean };
  prefilledFromAnalysis: { keywords: boolean; naicsCodes: boolean };
}

const clean = (s: string | null | undefined, n: number): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, n) : null;
};

function log(event: string, outcome: 'success' | 'failure', ctx: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'success' ? 'info' : 'warn', service: 'backend',
    event, outcome, ...(errorClass ? { error_class: errorClass } : {}), context: ctx });
  if (outcome === 'success') console.log(line); else console.warn(line);
}

/** Keywords / NAICS from the case study's outside-import analysis, when it has one. */
async function analysisPrefill(caseStudyId: string): Promise<{ keywords: string[]; naics: string[] }> {
  const { default: CaseStudyExternalImport } = await import('../../models/CaseStudyExternalImport');
  const row = await CaseStudyExternalImport.findOne({ where: { case_study_id: caseStudyId } });
  const a = (row?.analysis ?? {}) as { keywords?: unknown; suggestedNaics?: unknown };
  return { keywords: toStrArray(a.keywords) ?? [], naics: toStrArray(a.suggestedNaics) ?? [] };
}

export async function proposeServiceFromCaseStudy(input: ProposeServiceInput): Promise<ProposeServiceResult> {
  const { sequelize } = await import('../../config/database');
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');

  const name = clean(input.name, 200) as string;
  const record = await CaseStudy.findByPk(input.caseStudyId);
  if (!record || record.status === 'archived' || record.archived_at) {
    throw new ServiceProposalError('CaseStudyNotFound', 'That case study was not found (or is archived).', 404);
  }
  const prefill = (input.keywords === undefined || input.naicsCodes === undefined) ? await analysisPrefill(input.caseStudyId) : null;
  const keywords = input.keywords ?? prefill?.keywords ?? [];
  const naics = input.naicsCodes ?? prefill?.naics ?? [];

  const result = await sequelize.transaction(async (transaction) => {
    // Serialise proposals of the same name in the same tenant; released at COMMIT/ROLLBACK.
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext($1))',
      { bind: [`service-propose:${input.tenantId}:${name.toLowerCase()}`], transaction });
    let service = await ServiceOffering.findOne({
      where: { tenant_id: input.tenantId, [Op.and]: [sqlWhere(fn('lower', col('name')), name.toLowerCase())] },
      order: [['created_at', 'ASC']], transaction,
    });
    if (service && service.status === 'retired') {
      throw new ServiceProposalError('ServiceRetired', `A retired service is already named "${service.name}". Choose another name.`, 409);
    }
    const existing = Boolean(service);
    if (!service) {
      service = await ServiceOffering.create({
        tenant_id: input.tenantId, name, status: 'growth', created_by: input.actor,
        category: clean(input.category, 120), description: clean(input.description, 2000),
        keywords_json: toStrArray(keywords), naics_codes_json: toStrArray(naics),
      }, { transaction });
    }
    const now = new Date();
    const prior = await CaseStudyServiceLink.findOne({
      where: { case_study_id: input.caseStudyId, service_offering_id: service.id }, transaction,
    });
    let linkId: string;
    let changed = true;
    if (!prior) {
      const created = await CaseStudyServiceLink.create({
        case_study_id: input.caseStudyId, service_offering_id: service.id, state: 'confirmed',
        rationale: 'Proposed as a new service from this case study.', match_score: null,
        suggested_by: `propose-service:${input.actor}`, decided_by: input.actor, decided_at: now, created_at: now, updated_at: now,
        // Cast: the model's attributes interface marks `id` required (DB-defaulted), the same reason the link store
        // casts its bulkCreate rows. Every NOT NULL column is supplied here.
      } as unknown as CaseStudyServiceLinkAttributes, { transaction });
      linkId = created.id;
    } else if (prior.state !== 'confirmed') {
      // A suggestion (or an earlier rejection) for this pair: the person just chose this service for this record.
      await prior.update({ state: 'confirmed', decided_by: input.actor, decided_at: now, updated_at: now }, { transaction });
      linkId = prior.id;
    } else {
      linkId = prior.id;
      changed = false;
    }
    return { service, existing, linkId, changed };
  });

  log('service_proposed', 'success', {
    tenant_id: input.tenantId, case_study_id: input.caseStudyId, service_id: result.service.id,
    existing: result.existing, link_changed: result.changed,
  });
  return {
    service: toServiceOfferingDto(result.service),
    existing: result.existing,
    link: { id: result.linkId, state: 'confirmed', changed: result.changed },
    prefilledFromAnalysis: {
      keywords: !result.existing && input.keywords === undefined && keywords.length > 0,
      naicsCodes: !result.existing && input.naicsCodes === undefined && naics.length > 0,
    },
  };
}

export const PROMOTION_REFUSED_MESSAGE =
  'This service has no confirmed case study yet. Link at least one case study to it, then promote it.';

export async function promoteServiceOffering(input: { tenantId: string; serviceId: string; actor: string }): Promise<{
  service: ReturnType<typeof toServiceOfferingDto>; promoted: boolean; confirmedCaseStudies: number;
}> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const { default: CaseStudy } = await import('../../models/CaseStudy');

  const service = await ServiceOffering.findOne({ where: { id: input.serviceId, tenant_id: input.tenantId } });
  if (!service) throw new ServiceProposalError('ServiceNotFound', 'That service was not found in this workspace.', 404);
  if (service.status === 'retired') {
    throw new ServiceProposalError('ServiceRetired', 'A retired service cannot be promoted.', 409);
  }

  const links = await CaseStudyServiceLink.findAll({ where: { service_offering_id: service.id, state: 'confirmed' }, attributes: ['case_study_id'] });
  const ids = links.map((l) => l.case_study_id);
  // Proof must still exist: a confirmed link to an archived case study is history, not evidence.
  const confirmedCaseStudies = ids.length
    ? await CaseStudy.count({ where: { id: { [Op.in]: ids }, status: { [Op.ne]: 'archived' }, archived_at: null } })
    : 0;

  if (service.status === 'active') return { service: toServiceOfferingDto(service), promoted: false, confirmedCaseStudies };
  if (confirmedCaseStudies < 1) {
    log('service_promotion_refused', 'failure', { tenant_id: input.tenantId, service_id: service.id }, 'PromotionRefused');
    throw new ServiceProposalError('PromotionRefused', PROMOTION_REFUSED_MESSAGE, 409);
  }
  // Conditional update: only a row still in 'growth' moves, so two clicks cannot race into a double transition.
  const [affected] = await ServiceOffering.update({ status: 'active' }, { where: { id: service.id, tenant_id: input.tenantId, status: 'growth' } });
  await service.reload();
  // `promoted` reports what THIS call did: 0 rows means another click (or a retire) got there first.
  const promoted = affected > 0;
  log('service_promoted', 'success', { tenant_id: input.tenantId, service_id: service.id, confirmed_case_studies: confirmedCaseStudies, promoted });
  return { service: toServiceOfferingDto(service), promoted, confirmedCaseStudies };
}
