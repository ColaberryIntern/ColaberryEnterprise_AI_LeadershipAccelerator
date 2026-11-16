/**
 * proposalProofBacking — assemble the citable proof for the proposal PROOF judge.
 *
 * WHY: the proof check (documentChecksAI.aiProof) marks each claim "backed" ONLY if the supplied backing supports it.
 * Until now runProposalDocumentChecks passed `backingRefs: []`, so the judge was always told "(no backing provided)"
 * and every substantive claim scored as unbacked — even after the Dossier was filled. The drafter already grounds on
 * the dossier (runReviewCycle.gather); this gives the JUDGE the same proof, so rejudge and the in-cycle judge both
 * verify claims against what we actually hold. A claim with no backing still fails — that is correct — but a claim a
 * real reference or case study DOES support now passes.
 *
 * It resolves the tenant exactly like the drafter (the delivery project's latest qualification) and loads the SAME
 * approved facts / references / personnel / confirmed case studies, then flattens them with groundingToBackingRefs so
 * the judge sees the same proof set, worded the same way. Total + best-effort: any failure yields [] so scoring never
 * breaks, and it does NO embedding retrieval (source excerpts are not citable backing), so it is cheap to run on
 * every check iteration.
 */
import { buildGrounding, groundingToBackingRefs } from './proposalGrounding';

export async function collectProofBacking(deliveryProjectId: string): Promise<string[]> {
  try {
    const { default: GovQualification } = await import('../../../models/GovQualification');
    const q: any = await GovQualification.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
    const tenantId: string | null = q?.tenant_id ?? null;
    if (!tenantId) return [];

    const lib = await import('./govCompanyLibrary');
    let facts: string[] = [];
    let references: Awaited<ReturnType<typeof lib.approvedReferences>> = [];
    let personnel: Awaited<ReturnType<typeof lib.approvedPersonnel>> = [];
    let caseStudies: Parameters<typeof buildGrounding>[0]['caseStudies'] = [];
    // Each loader in its own try so one failing source never drops the proof the others loaded.
    try { facts = await lib.approvedGroundingFacts(tenantId); } catch { /* best-effort */ }
    try { references = await lib.approvedReferences(tenantId); } catch { /* best-effort */ }
    try { personnel = await lib.approvedPersonnel(tenantId); } catch { /* best-effort */ }
    try { const { loadProofCaseStudies } = await import('./proposalProofCaseStudies'); caseStudies = await loadProofCaseStudies(tenantId); } catch { /* best-effort */ }

    const g = buildGrounding({ document: { title: '', requirements: [], sections: [] }, approvedFacts: facts, references, personnel, caseStudies });
    return groundingToBackingRefs(g);
  } catch {
    return [];
  }
}
