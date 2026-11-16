/**
 * serviceGapLoader - the reads the Gap Detector needs, tenant-scoped. Read-only.
 *
 *   loadCatalog(tenantId)      every service of THIS tenant (active, growth AND retired: retired is used only for
 *                              duplicate warnings, never offered to the model), with its confirmed-proof count
 *                              counted only over links into this tenant's services;
 *   loadEvidence(ids)          the case-study text the detector may read: the record's own summary fields, plus
 *                              EITHER the outside import's AI-extracted analysis (claims; the file is not re-read)
 *                              OR, for inside case studies, the latest snapshot's story (serviceGapSnapshotText).
 */
import { Op } from 'sequelize';
import { toStrArray } from '../serviceCatalog';
import { classifyCaseStudySource } from '../../caseStudy/caseStudySourceKind';
import type { CaseStudyEvidence, CatalogService, ServiceStatus } from './serviceGapTypes';
import { analysisFromSnapshot } from './serviceGapSnapshotText';

const plain = <T>(row: unknown): T => ((row as { get?: (o: { plain: true }) => T })?.get ? (row as { get: (o: { plain: true }) => T }).get({ plain: true }) : (row as T));
const strs = (v: unknown): string[] => (toStrArray(v) ?? []).filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());

export async function loadCatalog(tenantId: string): Promise<CatalogService[]> {
  const { default: ServiceOffering } = await import('../../../models/ServiceOffering');
  const { default: CaseStudyServiceLink } = await import('../../../models/CaseStudyServiceLink');
  const rows = (await ServiceOffering.findAll({ where: { tenant_id: tenantId } })).map((r) => plain<Record<string, unknown>>(r));
  const ids = rows.map((r) => String(r.id));
  const counts = new Map<string, number>();
  if (ids.length) {
    const links = await CaseStudyServiceLink.findAll({ where: { service_offering_id: { [Op.in]: ids }, state: 'confirmed' }, attributes: ['service_offering_id'] });
    for (const l of links) { const id = plain<{ service_offering_id: string }>(l).service_offering_id; counts.set(id, (counts.get(id) ?? 0) + 1); }
  }
  return rows.map((r) => {
    const status = (['active', 'growth', 'retired'].includes(String(r.status)) ? r.status : 'active') as ServiceStatus;
    return {
      id: String(r.id), name: String(r.name ?? ''), status,
      category: typeof r.category === 'string' ? r.category : null,
      description: typeof r.description === 'string' ? r.description : null,
      keywords: strs(r.keywords_json), naicsCodes: strs(r.naics_codes_json),
      confirmedProofCount: counts.get(String(r.id)) ?? 0,
    };
  });
}

type Analysis = NonNullable<CaseStudyEvidence['analysis']>;
function toAnalysis(a: unknown): Analysis | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    summary: s(o.summary), problem: s(o.problem), approach: s(o.approach),
    outcomes: strs(o.outcomes), capabilities: strs(o.capabilities), keywords: strs(o.keywords), techStack: strs(o.techStack),
  };
}

/** Non-archived case studies by id. Missing or archived ids are simply absent from the map. */
export async function loadEvidence(ids: string[]): Promise<Map<string, CaseStudyEvidence>> {
  const out = new Map<string, CaseStudyEvidence>();
  if (!ids.length) return out;
  const { default: CaseStudy } = await import('../../../models/CaseStudy');
  const { default: CaseStudyExternalImport } = await import('../../../models/CaseStudyExternalImport');
  const rows = await CaseStudy.findAll({ where: { id: { [Op.in]: ids }, status: { [Op.ne]: 'archived' }, archived_at: null } });
  const imports = await CaseStudyExternalImport.findAll({ where: { case_study_id: { [Op.in]: ids } }, order: [['created_at', 'DESC']] });
  const importBy = new Map<string, { analysis: unknown; analysis_error: string | null }>();
  for (const row of imports) {
    const i = plain<{ case_study_id: string; analysis: unknown; analysis_error: string | null }>(row);
    if (!importBy.has(i.case_study_id)) importBy.set(i.case_study_id, i);
  }
  const snapshotBy = await latestSnapshotAnalysis(ids.filter((id) => !importBy.has(id)));
  for (const row of rows) {
    const r = plain<{ id: string; title: string; status: string; source_type: string; industry: string | null; canonical_summary: string | null; primary_capability: string | null }>(row);
    const imp = importBy.get(r.id);
    out.set(r.id, {
      id: r.id, title: r.title, sourceKind: classifyCaseStudySource(r.source_type), status: r.status,
      industry: r.industry ?? null, canonicalSummary: r.canonical_summary ?? null, primaryCapability: r.primary_capability ?? null,
      analysis: imp ? toAnalysis(imp.analysis) : snapshotBy.get(r.id) ?? null, analysisError: imp?.analysis_error ?? null,
    });
  }
  return out;
}

/** Inside case studies: the story lives in the latest snapshot, not in `case_studies` (see serviceGapSnapshotText). */
async function latestSnapshotAnalysis(ids: string[]): Promise<Map<string, Analysis>> {
  const out = new Map<string, Analysis>();
  if (!ids.length) return out;
  const { default: CaseStudySnapshot } = await import('../../../models/CaseStudySnapshot');
  const snaps = await CaseStudySnapshot.findAll({ where: { case_study_id: { [Op.in]: ids } }, attributes: ['case_study_id', 'version', 'content'], order: [['version', 'DESC']] });
  for (const row of snaps) {
    const s = plain<{ case_study_id: string; content: unknown }>(row);
    if (out.has(s.case_study_id)) continue;
    const a = analysisFromSnapshot(s.content);
    if (a) out.set(s.case_study_id, a);
  }
  return out;
}
