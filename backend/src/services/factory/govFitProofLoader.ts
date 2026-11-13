/**
 * govFitProofLoader - READ-ONLY: build the ProofContext the Gov Fit proof rules need (SV2.2).
 *
 * Uses the same reads as the evidence summary (serviceEvidenceLoad), so "what proves a service" has one definition:
 * a CONFIRMED link into this tenant's services, to a case study that is not archived.
 *
 * Tenancy: the tenant's services (every status) are resolved first and links are read only INTO that set, so
 * `confirmedServiceIds` can never name another tenant's service. Evidence is keyed only for the ACTIVE ids passed in
 * (fit only ever matches active services). Candidates are the newest CASE_STUDY_READ_LIMIT non-archived records plus
 * any linked record outside that window. Throws on a DB failure; the caller (govCapabilityFitWithProof) fails soft.
 */
import type { CapabilityEvidence } from './govCapabilityFit';
import type { ProofCandidate, ProofContext } from './govFitProofRules';
import { loadCaseStudyFacts, loadLinksInto, loadTenantServices } from './serviceEvidenceLoad';

export async function loadFitProofContext(tenantId: string, activeServiceIds: string[], now: Date = new Date()): Promise<ProofContext> {
  const year = now.getUTCFullYear();
  const tenantServiceIds = (await loadTenantServices(tenantId, 'all')).map((s) => s.id);
  const links = await loadLinksInto(tenantServiceIds, ['confirmed']);

  const facts = await loadCaseStudyFacts(null, year);
  const missing = [...new Set(links.map((l) => l.caseStudyId))].filter((id) => !facts.has(id));
  if (missing.length) for (const [id, f] of await loadCaseStudyFacts(missing, year)) facts.set(id, f);

  const active = new Set(activeServiceIds);
  const evidenceByService: Record<string, CapabilityEvidence[]> = {};
  const confirmedBy = new Map<string, string[]>();
  for (const l of links) {
    const f = facts.get(l.caseStudyId);
    if (!f) continue; // archived or gone: not evidence
    confirmedBy.set(l.caseStudyId, [...(confirmedBy.get(l.caseStudyId) ?? []), l.serviceId]);
    if (!active.has(l.serviceId)) continue;
    const list = evidenceByService[l.serviceId] ?? (evidenceByService[l.serviceId] = []);
    if (!list.some((e) => e.caseStudyId === f.id)) list.push({ caseStudyId: f.id, title: f.title, sourceKind: f.sourceKind });
  }

  const candidates: ProofCandidate[] = [...facts.values()].map((f) => ({
    caseStudyId: f.id, title: f.title, sourceKind: f.sourceKind,
    terms: [f.title, f.primaryCapability ?? '', f.industry ?? '', ...f.analysisTerms].filter(Boolean),
    confirmedServiceIds: [...new Set(confirmedBy.get(f.id) ?? [])],
  }));
  return { available: true, evidenceByService, candidates };
}
