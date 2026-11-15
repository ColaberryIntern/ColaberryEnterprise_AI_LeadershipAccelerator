/**
 * proposalProofCaseStudies — load the tenant's OWN delivered case studies as proof points for the Proposal Studio
 * drafter. These are the confirmed (a human agreed), non-archived case studies linked to the tenant's ACTIVE services
 * — the same evidence the Gov Fit step counts — mapped to the anonymized `GroundingCaseStudy` shape.
 *
 * WHY: the drafter was grounding only on approved facts + uploaded source excerpts, so every past-performance /
 * "what projects have you done" need became a human question even though our case-study library already answered it.
 * This feeds that library in. It never leaks a real client name: `GroundingCaseStudy` carries title/industry/outcome
 * only (case studies are anonymized by design); named, assertable clients come from the references loader instead.
 *
 * READ-ONLY, tenant-scoped (service ids are resolved for THIS tenant first and only links into those are read, the
 * same tenancy invariant serviceEvidenceLoad documents). Best-effort callers wrap this; it returns [] rather than throw.
 */
import { loadTenantServices, loadLinksInto, loadCaseStudyFacts, loadHeadlineMetrics } from '../serviceEvidenceLoad';
import type { GroundingCaseStudy } from './proposalGrounding';

/** Keep the proof block bounded so it never crowds out requirements/section plans in the prompt. */
export const PROOF_CASE_STUDY_CAP = 12;

export async function loadProofCaseStudies(tenantId: string, cap: number = PROOF_CASE_STUDY_CAP): Promise<GroundingCaseStudy[]> {
  const services = await loadTenantServices(tenantId, 'active');
  const serviceIds = services.map((s) => s.id);
  if (!serviceIds.length) return [];

  const links = await loadLinksInto(serviceIds, ['confirmed']);
  const ids = Array.from(new Set(links.map((l) => l.caseStudyId)));
  if (!ids.length) return [];

  const currentYear = new Date().getUTCFullYear();
  const facts = await loadCaseStudyFacts(ids, currentYear);
  const metrics = await loadHeadlineMetrics(ids);

  const out: GroundingCaseStudy[] = [];
  for (const id of ids) {
    const f = facts.get(id);
    if (!f) continue; // archived or missing — not something a bid should lean on
    const m = metrics.get(id) ?? null;
    out.push({
      title: f.title,
      industry: f.industry,
      year: f.year,
      capability: f.primaryCapability,
      metricLabel: m?.label ?? null,
      metricValue: m?.value ?? null,
      metricVerified: m?.verified ?? false,
    });
  }
  // Newest first (a recent, relevant project reads stronger), then cap.
  out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return out.slice(0, Math.max(0, cap));
}
