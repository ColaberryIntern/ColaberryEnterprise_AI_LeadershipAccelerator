/**
 * serviceEvidenceLoad - the READ-ONLY database reads behind "which case studies prove which service".
 *
 * Shared by the evidence summary feed (SV2.1) and the Gov Fit proof step (SV2.2), so the two can never disagree about
 * what counts as evidence. Every function only reads.
 *
 * TENANCY (same invariant as caseStudyServiceLinkStore / caseStudyIntakeQueue): `case_studies` has no tenant column,
 * so one record can be linked by two tenants. Callers resolve the tenant's services FIRST and pass those ids here;
 * links are only ever read WHERE service_offering_id IN (that set), so another tenant's link or service name can
 * never be returned through a shared case study.
 *
 * WHAT COUNTS AS EVIDENCE: a `confirmed` link (a human agreed) to a case study that is not archived (status
 * 'archived' or archived_at set). An archived record is not something a bid should lean on.
 *
 * EVIDENCE YEAR: the outside analysis `year` when it is a plausible integer (1990..current+1), else the year of
 * `approved_at`, else the year of `created_at`. Inside records have no "year" column; approval is when the claim was
 * last stood behind.
 *
 * Models are lazy-loaded inside each function so importing this module never initializes the ORM. Bounded reads.
 */
import { Op } from 'sequelize';
import { classifyCaseStudySource, CaseStudySourceKind } from '../caseStudy/caseStudySourceKind';

export const CASE_STUDY_READ_LIMIT = 500;

export interface ServiceFact {
  id: string; name: string; category: string | null; status: 'active' | 'growth' | 'retired';
  keywords: string[]; naicsCodes: string[]; createdAt: Date | null;
}
export interface LinkFact { caseStudyId: string; serviceId: string; state: 'confirmed' | 'suggested'; decidedAt: Date | null }
export interface CaseStudyFact {
  id: string; title: string; slug: string | null; status: string | null; sourceKind: CaseStudySourceKind;
  industry: string | null; year: number | null; primaryCapability: string | null;
  /** Outside records only: the AI analysis keywords + capabilities (empty for inside records). */
  analysisTerms: string[];
}
export interface HeadlineMetric { label: string; value: string | null; verified: boolean }

const plain = <T>(row: unknown): T => ((row as { get?: () => T })?.get ? (row as { get: () => T }).get() : (row as T));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const yearOf = (d: unknown): number | null => {
  if (!d) return null;
  const t = new Date(d as string).getTime();
  return Number.isFinite(t) ? new Date(t).getUTCFullYear() : null;
};

/** Plausible analysis year, else null. */
export function analysisYear(v: unknown, currentYear: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 1990 && n <= currentYear + 1 ? n : null;
}

/** Every service the tenant owns (filtered by status unless 'all'), oldest first so ordering is stable. */
export async function loadTenantServices(tenantId: string, status: 'active' | 'growth' | 'all' = 'all'): Promise<ServiceFact[]> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const where: Record<string, unknown> = { tenant_id: tenantId };
  if (status !== 'all') where.status = status;
  const rows = await ServiceOffering.findAll({ where, order: [['created_at', 'ASC'], ['id', 'ASC']] });
  return rows.map((r) => {
    const s = plain<Record<string, unknown>>(r);
    return {
      id: String(s.id), name: String(s.name), category: (s.category as string | null) ?? null,
      status: (s.status as ServiceFact['status']) ?? 'active',
      keywords: strs(s.keywords_json), naicsCodes: strs(s.naics_codes_json),
      createdAt: s.created_at ? new Date(s.created_at as string) : null,
    };
  });
}

/** Confirmed (and optionally suggested) links pointing INTO the given service ids. Never reads any other link. */
export async function loadLinksInto(serviceIds: string[], states: Array<'confirmed' | 'suggested'> = ['confirmed']): Promise<LinkFact[]> {
  if (!serviceIds.length) return [];
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const rows = await CaseStudyServiceLink.findAll({
    where: { service_offering_id: { [Op.in]: serviceIds }, state: { [Op.in]: states } },
  });
  const allowed = new Set(serviceIds);
  return rows.map((r) => plain<Record<string, unknown>>(r))
    // Belt and braces: a fake or a future query change that returned an outside row is still filtered here.
    .filter((l) => allowed.has(String(l.service_offering_id)))
    .map((l) => ({
      caseStudyId: String(l.case_study_id), serviceId: String(l.service_offering_id),
      state: l.state as LinkFact['state'], decidedAt: l.decided_at ? new Date(l.decided_at as string) : null,
    }));
}

/**
 * Non-archived case studies, by id (when `ids` is given) or the newest CASE_STUDY_READ_LIMIT (when null), with the
 * outside analysis folded in. Archived records are simply absent from the result.
 */
export async function loadCaseStudyFacts(ids: string[] | null, currentYear: number): Promise<Map<string, CaseStudyFact>> {
  const out = new Map<string, CaseStudyFact>();
  if (ids && !ids.length) return out;
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const { default: CaseStudyExternalImport } = await import('../../models/CaseStudyExternalImport');
  const where: Record<string | symbol, unknown> = { status: { [Op.ne]: 'archived' }, archived_at: null };
  if (ids) where.id = { [Op.in]: ids };
  const rows = await CaseStudy.findAll({ where, order: [['created_at', 'DESC']], limit: CASE_STUDY_READ_LIMIT });
  if (!rows.length) return out;
  const found = rows.map((r) => plain<Record<string, unknown>>(r));
  const imports = await CaseStudyExternalImport.findAll({ where: { case_study_id: { [Op.in]: found.map((r) => String(r.id)) } } });
  const analysisBy = new Map<string, Record<string, unknown>>();
  for (const row of imports) {
    const i = plain<{ case_study_id: string; analysis: Record<string, unknown> | null }>(row);
    if (i.analysis) analysisBy.set(i.case_study_id, i.analysis);
  }
  for (const r of found) {
    const id = String(r.id);
    const a = analysisBy.get(id);
    out.set(id, {
      id, title: String(r.title ?? ''), slug: (r.slug as string | null) ?? null, status: (r.status as string | null) ?? null,
      sourceKind: classifyCaseStudySource(r.source_type), industry: (r.industry as string | null) || (a?.industry as string | null) || null,
      year: analysisYear(a?.year, currentYear) ?? yearOf(r.approved_at) ?? yearOf(r.created_at),
      primaryCapability: (r.primary_capability as string | null) ?? null,
      analysisTerms: [...strs(a?.keywords), ...strs(a?.capabilities)],
    });
  }
  return out;
}

/**
 * Headline metric per case study: the inside `is_headline` metric when one exists (verified = it has a verified_at),
 * else the first outside-analysis metric, which is ALWAYS unverified (an outside document's claim).
 */
export async function loadHeadlineMetrics(ids: string[]): Promise<Map<string, HeadlineMetric>> {
  const out = new Map<string, HeadlineMetric>();
  if (!ids.length) return out;
  const { default: CaseStudyMetric } = await import('../../models/CaseStudyMetric');
  const { default: CaseStudyExternalImport } = await import('../../models/CaseStudyExternalImport');
  const metrics = await CaseStudyMetric.findAll({ where: { case_study_id: { [Op.in]: ids }, is_headline: true } });
  for (const row of metrics) {
    const m = plain<{ case_study_id: string; label: string; value_display: string | null; verified_at: Date | null }>(row);
    if (!out.has(m.case_study_id)) out.set(m.case_study_id, { label: m.label, value: m.value_display ?? null, verified: !!m.verified_at });
  }
  const imports = await CaseStudyExternalImport.findAll({ where: { case_study_id: { [Op.in]: ids.filter((i) => !out.has(i)) } } });
  for (const row of imports) {
    const i = plain<{ case_study_id: string; analysis: { metrics?: unknown } | null }>(row);
    const first = Array.isArray(i.analysis?.metrics) ? (i.analysis?.metrics as Array<Record<string, unknown>>)[0] : null;
    if (first && typeof first.label === 'string') {
      out.set(i.case_study_id, { label: first.label, value: typeof first.value === 'string' ? first.value : null, verified: false });
    }
  }
  return out;
}
