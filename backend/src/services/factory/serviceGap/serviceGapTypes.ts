/**
 * serviceGapTypes - the contract of the AI Service Gap Detector (Services Upgrade GD1).
 *
 * The detector answers, per unlinked case study: "does this belong to a service we already offer, should an existing
 * service be widened, does a Growth service already cover it, does it justify a NEW service, or is there not enough
 * to say?" It RECOMMENDS. It never creates, links, promotes, publishes or edits anything; every mutation stays on the
 * existing human-click routes (decide link, propose-service, PATCH service, promote).
 *
 * Every score here is a HEURISTIC index (0-100) with a written definition, not a probability. `confidence` is
 * qualitative. `commercialPotentialScore` is null until grounded opportunity demand is wired (null = unknown, never 0).
 */
import { z } from 'zod';

export const GAP_DECISIONS = ['MATCH_EXISTING', 'EXPAND_EXISTING', 'LINK_GROWTH', 'PROPOSE_NEW', 'INSUFFICIENT_EVIDENCE'] as const;
export type GapDecision = typeof GAP_DECISIONS[number];

export const MATURITY_LEVELS = ['research_concept', 'implemented_demo', 'internally_validated', 'client_deployed', 'unknown'] as const;
export type Maturity = typeof MATURITY_LEVELS[number];

export type ServiceStatus = 'active' | 'growth' | 'retired';
export type Confidence = 'high' | 'medium' | 'low';

/** Bumping this invalidates every cached analysis (it is part of the idempotency key). */
export const GAP_PROMPT_VERSION = 'service-gap-v2';

/** One catalog service as the detector sees it (tenant-scoped by the loader). */
export interface CatalogService {
  id: string;
  name: string;
  status: ServiceStatus;
  category: string | null;
  description: string | null;
  keywords: string[];
  naicsCodes: string[];
  confirmedProofCount: number;
}

/** One case study's evidence as the detector sees it. Outside fields are document CLAIMS, never verified facts. */
export interface CaseStudyEvidence {
  id: string;
  title: string;
  sourceKind: 'inside' | 'outside';
  status: string;
  industry: string | null;
  canonicalSummary: string | null;
  primaryCapability: string | null;
  analysis: {
    summary: string | null; problem: string | null; approach: string | null;
    outcomes: string[]; capabilities: string[]; keywords: string[]; techStack: string[];
  } | null;
  analysisError: string | null;
}

export interface GapCandidate {
  serviceId: string;
  serviceName: string;
  status: ServiceStatus;
  /** Deterministic keyword/token overlap, 0-100 (retrieval stage). */
  retrievalScore: number;
  /** Model-judged overlaps, 0-100 each. Heuristic. */
  capabilityOverlap: number;
  buyerProblemOverlap: number;
  deliverableOverlap: number;
  missingCapabilities: string[];
  reason: string;
}

export interface ProposedServiceDraft {
  name: string;
  category: string | null;
  buyerValue: string | null;
  scope: string | null;
  deliverables: string[];
  targetBuyer: string | null;
  differentiators: string[];
  keywords: string[];
  /** Unverified suggestions: must be checked against official NAICS/PSC definitions before any procurement claim. */
  naicsSuggestionsUnverified: string[];
  pscSuggestionsUnverified: string[];
  /** A proposed service always enters the catalog as Growth. */
  suggestedStatus: 'growth';
}

export interface ExpansionDraft {
  serviceId: string;
  serviceName: string;
  descriptionAddition: string | null;
  keywordsToAdd: string[];
  scopeChange: string | null;
}

export interface GapScores {
  /** Best weighted overlap with an existing (active or growth) service: .5 capability + .3 buyer problem + .2 deliverables. */
  existingFitScore: number | null;
  /** How different the capability is from the catalog: .6 model novelty + .4 (100 - existingFit). */
  noveltyScore: number;
  /** How solid the source is: maturity base + up to 20 for stated outcomes, minus 20 when extraction failed. */
  evidenceReadinessScore: number;
  /** PROPOSE_NEW only: highest name similarity to any catalog service (incl. retired), x100. Null otherwise. */
  duplicateRiskScore: number | null;
  /** Null until grounded live-opportunity demand is wired. Never inferred. */
  commercialPotentialScore: null;
}

export interface GapEvidenceRef { kind: 'document_claim' | 'confirmed_fact' | 'inference'; text: string }

export interface GapRecommendation {
  decision: GapDecision;
  verdict: string;
  target: { serviceId: string; serviceName: string; status: ServiceStatus } | null;
  maturity: Maturity;
  serviceFamily: string | null;
  candidates: GapCandidate[];
  scores: GapScores;
  confidence: Confidence;
  proposedService: ProposedServiceDraft | null;
  expansion: ExpansionDraft | null;
  duplicateWarnings: string[];
  alternativesConsidered: Array<{ decision: GapDecision; whyNot: string }>;
  missingInformation: string[];
  evidence: GapEvidenceRef[];
  reasonCodes: string[];
}

/** API view of one stored analysis. */
export interface GapAnalysisView {
  id: string;
  caseStudyId: string;
  status: 'ok' | 'insufficient' | 'failed';
  decision: GapDecision | null;
  recommendation: GapRecommendation | null;
  error: string | null;
  errorClass: string | null;
  stale: boolean;
  promptVersion: string;
  modelVersion: string;
  analyzedAt: string;
  reviewState: 'open' | 'accepted' | 'dismissed';
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export const reviewBody = z.object({
  state: z.enum(['accepted', 'dismissed']),
  note: z.string().trim().max(500).nullish(),
}).strict();
