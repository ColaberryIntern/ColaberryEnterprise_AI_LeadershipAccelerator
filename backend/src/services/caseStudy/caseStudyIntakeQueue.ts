/**
 * caseStudyIntakeQueue - THE definition of "Intake" (package spec 1C).
 *
 *   Intake = every case study with ZERO `confirmed` links into the caller's tenant's services, whatever its status,
 *            except archived ones.
 *
 * Pending suggestions do NOT count as linked: a suggestion is a keyword match nobody has agreed with, and a record
 * leaves Intake only when a person confirms a link (or proposes a service from it, which confirms one).
 *
 * TENANCY, same invariant as `caseStudyServiceLinkStore`: `case_studies` carries no tenant, so the tenant's services
 * are resolved FIRST and only links pointing into that set are read. A link another tenant confirmed therefore does
 * not take a record out of THIS tenant's Intake, and another tenant's service names never appear in a suggestion.
 * Links to a retired service still count as confirmed: that link was a true decision, matching how the link store
 * reads retired services.
 *
 * READ-ONLY. Bounded to the newest 500 records. Models are lazy-loaded, so importing this module never initializes
 * the ORM.
 */
import { Op } from 'sequelize';
import { classifyCaseStudySource, CaseStudySourceKind } from './caseStudySourceKind';

export const INTAKE_LIMIT = 500;

export interface IntakeSuggestion {
  linkId: string;
  serviceId: string;
  serviceName: string;
  matchScore: number | null;
  rationale: string | null;
}

export interface IntakeItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  sourceType: string;
  sourceKind: CaseStudySourceKind;
  industry: string | null;
  createdAt: Date | null;
  /** Outside records only: the keywords the AI analysis extracted. */
  keywords: string[];
  /** Outside records only: set when the draft needs manual details. */
  analysisError: string | null;
  /** Tenant-scoped pending suggestions, strongest first. */
  suggestions: IntakeSuggestion[];
}

const plain = <T>(row: unknown): T => ((row as { get?: () => T })?.get ? (row as { get: () => T }).get() : (row as T));

/** The tenant's service ids (any status) -> name. */
async function tenantServiceNames(tenantId: string): Promise<Map<string, string>> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const rows = await ServiceOffering.findAll({ where: { tenant_id: tenantId } });
  return new Map(rows.map((r) => { const s = plain<{ id: string; name: string }>(r); return [s.id, s.name]; }));
}

/** Ids of case studies that have at least one confirmed link into the tenant's services. */
export async function confirmedCaseStudyIds(serviceIds: string[]): Promise<Set<string>> {
  if (!serviceIds.length) return new Set();
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const links = await CaseStudyServiceLink.findAll({
    where: { service_offering_id: { [Op.in]: serviceIds }, state: 'confirmed' },
    attributes: ['case_study_id'],
  });
  return new Set(links.map((l) => plain<{ case_study_id: string }>(l).case_study_id));
}

export async function listIntakeCaseStudies(input: { tenantId: string }): Promise<IntakeItem[]> {
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const { default: CaseStudyExternalImport } = await import('../../models/CaseStudyExternalImport');

  const services = await tenantServiceNames(input.tenantId);
  const serviceIds = [...services.keys()];
  const linked = await confirmedCaseStudyIds(serviceIds);

  const where: Record<string | symbol, unknown> = { status: { [Op.ne]: 'archived' }, archived_at: null };
  if (linked.size) where.id = { [Op.notIn]: [...linked] };
  const records = await CaseStudy.findAll({ where, order: [['created_at', 'DESC']], limit: INTAKE_LIMIT });
  if (!records.length) return [];
  const ids = records.map((r) => plain<{ id: string }>(r).id);

  const suggestionRows = serviceIds.length
    ? await CaseStudyServiceLink.findAll({
      where: { case_study_id: { [Op.in]: ids }, service_offering_id: { [Op.in]: serviceIds }, state: 'suggested' },
    })
    : [];
  const imports = await CaseStudyExternalImport.findAll({ where: { case_study_id: { [Op.in]: ids } } });

  const suggestionsBy = new Map<string, IntakeSuggestion[]>();
  for (const row of suggestionRows) {
    const l = plain<{ id: string; case_study_id: string; service_offering_id: string; match_score: number | null; rationale: string | null }>(row);
    const list = suggestionsBy.get(l.case_study_id) ?? [];
    list.push({ linkId: l.id, serviceId: l.service_offering_id, serviceName: services.get(l.service_offering_id) ?? '(unknown service)',
      matchScore: l.match_score ?? null, rationale: l.rationale ?? null });
    suggestionsBy.set(l.case_study_id, list);
  }
  const importBy = new Map<string, { keywords: string[]; analysisError: string | null }>();
  for (const row of imports) {
    const i = plain<{ case_study_id: string; analysis: { keywords?: unknown } | null; analysis_error: string | null }>(row);
    const kw = Array.isArray(i.analysis?.keywords) ? (i.analysis?.keywords as unknown[]).filter((k): k is string => typeof k === 'string') : [];
    importBy.set(i.case_study_id, { keywords: kw, analysisError: i.analysis_error ?? null });
  }

  return records.map((row) => {
    const r = plain<{ id: string; title: string; slug: string; status: string; source_type: string; industry: string | null; created_at?: Date }>(row);
    const imp = importBy.get(r.id);
    return {
      id: r.id, title: r.title, slug: r.slug, status: r.status, sourceType: r.source_type,
      sourceKind: classifyCaseStudySource(r.source_type), industry: r.industry ?? null, createdAt: r.created_at ?? null,
      keywords: imp?.keywords ?? [], analysisError: imp?.analysisError ?? null,
      suggestions: (suggestionsBy.get(r.id) ?? []).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0) || a.serviceName.localeCompare(b.serviceName)),
    };
  });
}
