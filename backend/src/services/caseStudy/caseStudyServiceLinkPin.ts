/**
 * caseStudyServiceLinkPin - put ONE specific service on a case study's Intake card as a SUGGESTION.
 *
 * Why it exists: the AI Service Gap Detector can recommend a service the keyword suggestor did not propose. "Use
 * existing" must then put that service in front of the person, but it must NOT confirm it - only the Link click
 * (the existing decide route) confirms. So this writes a `suggested` row and nothing else:
 *   - the case study must exist and not be archived (404 otherwise);
 *   - the service must be THIS tenant's and active or growth (404 otherwise: never a retired or foreign service);
 *   - INSERT ... ON CONFLICT DO NOTHING on the (case study, service) pair: idempotent, race-safe, and a row a person
 *     already decided (confirmed or rejected) is never touched. The caller gets that row back with its real state.
 */
import { Op } from 'sequelize';
import type { CaseStudyServiceLinkState } from '../../models/CaseStudyServiceLink';
import { CaseStudyNotFoundError } from './caseStudyServiceLinkStore';

export class ServiceNotSuggestableError extends Error {
  constructor() { super('That service is not an active or growth service in this workspace.'); this.name = 'ServiceNotSuggestableError'; }
}

export interface PinnedLink { id: string; state: CaseStudyServiceLinkState; serviceId: string; created: boolean }

export async function suggestLinkForService(input: {
  tenantId: string; caseStudyId: string; serviceId: string; suggestedBy: string; rationale: string | null;
}): Promise<PinnedLink> {
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');

  const cs = await CaseStudy.findOne({ where: { id: input.caseStudyId, status: { [Op.ne]: 'archived' }, archived_at: null } });
  if (!cs) throw new CaseStudyNotFoundError(input.caseStudyId);
  const svc = await ServiceOffering.findOne({ where: { id: input.serviceId, tenant_id: input.tenantId, status: { [Op.in]: ['active', 'growth'] } } });
  if (!svc) throw new ServiceNotSuggestableError();

  const where = { case_study_id: input.caseStudyId, service_offering_id: input.serviceId };
  const before = await CaseStudyServiceLink.findOne({ where });
  if (!before) {
    await CaseStudyServiceLink.bulkCreate([{
      ...where, state: 'suggested' as CaseStudyServiceLinkState, rationale: input.rationale ? input.rationale.slice(0, 500) : null,
      match_score: null, suggested_by: input.suggestedBy,
    }] as never, { ignoreDuplicates: true });
  }
  const row = await CaseStudyServiceLink.findOne({ where });
  if (!row) throw new Error('link row missing after insert');
  const r = row.get({ plain: true }) as { id: string; state: CaseStudyServiceLinkState };
  return { id: r.id, state: r.state, serviceId: input.serviceId, created: !before };
}
