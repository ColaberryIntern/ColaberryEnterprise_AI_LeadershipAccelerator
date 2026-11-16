import api from '../utils/api';

/**
 * serviceGapApi - client for the AI Service Gap Detector (backend: routes/admin/serviceGapRoutes.ts). The detector
 * only RECOMMENDS; every write a person makes from a recommendation goes through existing routes (decide link,
 * propose-service, update service). `pinServiceSuggestion` adds a SUGGESTED link only; the Link click confirms it.
 * Types mirror backend/src/services/factory/serviceGap/serviceGapTypes.ts.
 */
export type GapDecision = 'MATCH_EXISTING' | 'EXPAND_EXISTING' | 'LINK_GROWTH' | 'PROPOSE_NEW' | 'INSUFFICIENT_EVIDENCE';
export type Maturity = 'research_concept' | 'implemented_demo' | 'internally_validated' | 'client_deployed' | 'unknown';
type ServiceStatus = 'active' | 'growth' | 'retired';

export interface GapCandidate {
  serviceId: string; serviceName: string; status: ServiceStatus; retrievalScore: number;
  capabilityOverlap: number; buyerProblemOverlap: number; deliverableOverlap: number; missingCapabilities: string[]; reason: string;
}
export interface ProposedServiceDraft {
  name: string; category: string | null; buyerValue: string | null; scope: string | null; deliverables: string[];
  targetBuyer: string | null; differentiators: string[]; keywords: string[];
  naicsSuggestionsUnverified: string[]; pscSuggestionsUnverified: string[]; suggestedStatus: 'growth';
}
/** A work-performed NAICS code from the backend's closed list, marked against the matched service. Unverified. */
export interface NaicsSuggestion { code: string; title: string; onTarget: boolean }
export interface ExpansionDraft {
  serviceId: string; serviceName: string; descriptionAddition: string | null; keywordsToAdd: string[]; scopeChange: string | null;
  /** Absent on analyses stored before prompt service-gap-v3. */
  naicsToAdd?: string[];
}
export interface GapScores {
  existingFitScore: number | null; noveltyScore: number; evidenceReadinessScore: number; duplicateRiskScore: number | null; commercialPotentialScore: null;
}
export interface GapRecommendation {
  decision: GapDecision; verdict: string; target: { serviceId: string; serviceName: string; status: ServiceStatus } | null;
  maturity: Maturity; serviceFamily: string | null; candidates: GapCandidate[]; scores: GapScores; confidence: 'high' | 'medium' | 'low';
  proposedService: ProposedServiceDraft | null; expansion: ExpansionDraft | null; duplicateWarnings: string[];
  alternativesConsidered: Array<{ decision: GapDecision; whyNot: string }>; missingInformation: string[];
  evidence: Array<{ kind: 'document_claim' | 'confirmed_fact' | 'inference'; text: string }>; reasonCodes: string[];
  /** Absent on analyses stored before prompt service-gap-v3. */
  naics?: NaicsSuggestion[]; naicsWarnings?: string[];
}
export interface GapAnalysis {
  id: string; caseStudyId: string; status: 'ok' | 'insufficient' | 'failed'; decision: GapDecision | null;
  recommendation: GapRecommendation | null; error: string | null; errorClass: string | null; stale: boolean;
  promptVersion: string; modelVersion: string; analyzedAt: string;
  reviewState: 'open' | 'accepted' | 'dismissed'; reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null;
}
export interface GapCluster {
  key: string; kind: 'new_service' | 'existing_service'; decision: GapDecision; title: string; serviceId: string | null;
  caseStudyIds: string[]; analysisIds: string[]; rank: number; meanNovelty: number; meanReadiness: number;
  maxDuplicateRisk: number | null; duplicateWarnings: string[]; anyStale: boolean;
}
export interface GapCounters {
  analyzed: number; notAnalyzed: number; stale: number; failed: number;
  newServiceProposals: number; expandExisting: number; matchExisting: number; linkGrowth: number; needsReview: number;
}
export interface GapRun {
  id: string; status: 'running' | 'completed' | 'failed'; total: number; analyzed: number; reused: number; failed: number;
  lastError: string | null; startedBy: string | null; startedAt: string; finishedAt: string | null;
}
export interface GapOpportunities {
  generatedAt: string; intakeCount: number; counters: GapCounters; clusters: GapCluster[];
  byCaseStudy: Record<string, GapAnalysis>; run: GapRun | null;
}

const BASE = '/api/admin/factory';

export async function getGapOpportunities(): Promise<GapOpportunities> {
  return (await api.get(`${BASE}/service-gap-opportunities`)).data;
}
export async function analyzeCaseStudyGap(caseStudyId: string, force = false): Promise<GapAnalysis> {
  return (await api.post(`${BASE}/case-studies/${caseStudyId}/service-gap-analysis`, force ? { force: true } : {})).data.analysis;
}
/** 202 -> the new run; 409 -> the run already in progress (returned, not thrown). */
export async function startGapBatch(): Promise<GapRun> {
  try { return (await api.post(`${BASE}/service-gap-analysis/batch`)).data.run; } catch (e) {
    const r = (e as { response?: { status?: number; data?: { run?: GapRun } } }).response;
    if (r?.status === 409 && r.data?.run) return r.data.run;
    throw e;
  }
}
export async function getLatestGapRun(): Promise<GapRun | null> {
  return (await api.get(`${BASE}/service-gap-analysis/runs/latest`)).data.run;
}
export async function reviewGapAnalysis(id: string, state: 'accepted' | 'dismissed', note?: string): Promise<GapAnalysis> {
  return (await api.post(`${BASE}/service-gap-analyses/${id}/review`, { state, note: note ?? null })).data.analysis;
}
export async function pinServiceSuggestion(caseStudyId: string, serviceId: string, rationale: string | null): Promise<{ id: string; state: 'suggested' | 'confirmed' | 'rejected' }> {
  return (await api.post(`${BASE}/case-studies/${caseStudyId}/service-links/pin`, { serviceId, rationale })).data.link;
}
