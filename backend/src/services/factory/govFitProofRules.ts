/**
 * govFitProofRules - PURE post-rules that make the Gov Fit step cite proof (Services Upgrade SV2.2, package 1G).
 *
 * Applied AFTER the model's capabilities have passed sanitizeCapabilities (which this never weakens):
 *
 *   1. EVIDENCE on every "have": the matched service's confirmed case studies (at most EVIDENCE_MAX, inside first).
 *      An empty array is an honest "no case study is linked to this service yet".
 *   2. DOWNGRADE (only when `requireProof` is true - FLAGS.govFitRequireProof, default OFF): a "have" whose matched
 *      service has ZERO confirmed case studies becomes "partial" with downgradeReason "service has no linked case
 *      study" and downgradedFrom "have". Never applied when proof could not be loaded (`available: false`): a DB
 *      hiccup must not quietly turn every "have" into "partial".
 *   3. POSSIBLE PROOF on every "partial"/"new": case studies NOT confirmed for the capability's matched service whose
 *      terms overlap the capability's name + why by at least MIN_OVERLAP distinct meaningful words. Deterministic
 *      keyword overlap; no extra LLM call. `linkedElsewhere` says the record is already confirmed for another of
 *      this tenant's services.
 *
 * Additive only: id, name, why, rationale and matchedServiceId are never changed, and no service id is ever invented.
 * Idempotent: applying the rules to their own output returns the same output.
 */
import type { CapabilityEvidence, CapabilityItem, PossibleProof } from './govCapabilityFit';

export const DOWNGRADE_REASON = 'service has no linked case study';
export const EVIDENCE_MAX = 5;
export const POSSIBLE_PROOF_MAX = 3;
export const MIN_OVERLAP = 2;

export interface ProofCandidate {
  caseStudyId: string;
  title: string;
  sourceKind: 'inside' | 'outside';
  /** Free text the record is about: title, primary capability, industry, outside-analysis keywords/capabilities. */
  terms: string[];
  /** This tenant's services the record is CONFIRMED for. */
  confirmedServiceIds: string[];
}

export interface ProofContext {
  /** false when the proof could not be loaded: no evidence/possibleProof fields are attached and nothing is downgraded. */
  available: boolean;
  evidenceByService: Record<string, CapabilityEvidence[]>;
  candidates: ProofCandidate[];
}

export const EMPTY_PROOF: ProofContext = Object.freeze({ available: false, evidenceByService: {}, candidates: [] }) as ProofContext;

/** Words that carry no signal about WHICH capability a text is about. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'their', 'there', 'into', 'onto', 'over', 'under',
  'will', 'must', 'shall', 'should', 'would', 'could', 'can', 'may', 'are', 'was', 'were', 'been', 'being', 'has', 'have',
  'had', 'not', 'but', 'any', 'all', 'each', 'other', 'such', 'than', 'then', 'also', 'more', 'most', 'via', 'per', 'its',
  'our', 'your', 'they', 'them', 'who', 'what', 'when', 'where', 'which', 'while', 'within', 'across', 'including', 'include',
  'based', 'using', 'used', 'use', 'new', 'need', 'needs', 'needed', 'provide', 'provides', 'providing', 'support', 'supports',
  'service', 'services', 'system', 'systems', 'solution', 'solutions', 'capability', 'capabilities', 'ability', 'able',
  'program', 'project', 'projects', 'work', 'scope', 'bid', 'contract', 'requirement', 'requirements', 'city', 'county',
  'state', 'agency', 'vendor', 'proposal', 'deliver', 'delivery', 'management', 'manage', 'team', 'staff', 'case', 'study',
]);

/** Lowercased meaningful words, with a simple plural fold ("dashboards" -> "dashboard"). */
export function meaningfulTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    const w = raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    if (!STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

const kindRank = (k: 'inside' | 'outside'): number => (k === 'inside' ? 0 : 1);

/** Case studies that may prove a gap, strongest overlap first, inside before outside, then title. */
export function findPossibleProof(cap: Pick<CapabilityItem, 'name' | 'why' | 'matchedServiceId'>, candidates: ProofCandidate[], max = POSSIBLE_PROOF_MAX): PossibleProof[] {
  const capTokens = meaningfulTokens(`${cap.name ?? ''} ${cap.why ?? ''}`);
  if (capTokens.size === 0) return [];
  const hits: PossibleProof[] = [];
  for (const c of candidates) {
    if (cap.matchedServiceId && c.confirmedServiceIds.includes(cap.matchedServiceId)) continue; // already its proof
    const theirs = meaningfulTokens(c.terms.join(' '));
    const matchedTerms = [...capTokens].filter((t) => theirs.has(t)).sort();
    if (matchedTerms.length < MIN_OVERLAP) continue;
    hits.push({ caseStudyId: c.caseStudyId, title: c.title, sourceKind: c.sourceKind, matchedTerms, linkedElsewhere: c.confirmedServiceIds.length > 0 });
  }
  return hits
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || kindRank(a.sourceKind) - kindRank(b.sourceKind)
      || a.title.localeCompare(b.title) || a.caseStudyId.localeCompare(b.caseStudyId))
    .slice(0, Math.max(0, max));
}

export function applyFitProofRules(caps: CapabilityItem[], proof: ProofContext, opts: { requireProof: boolean }): CapabilityItem[] {
  return (Array.isArray(caps) ? caps : []).map((original) => {
    // Start from the item without the fields these rules own, so a second application recomputes the same values.
    const { evidence: _e, possibleProof: _p, ...cap } = original; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!proof.available) return cap;
    if (cap.assessment === 'have') {
      const evidence = (cap.matchedServiceId ? proof.evidenceByService[cap.matchedServiceId] ?? [] : [])
        .slice().sort((a, b) => kindRank(a.sourceKind) - kindRank(b.sourceKind) || a.title.localeCompare(b.title)).slice(0, EVIDENCE_MAX);
      if (opts.requireProof && evidence.length === 0) {
        const downgraded: CapabilityItem = { ...cap, assessment: 'partial', downgradedFrom: 'have', downgradeReason: DOWNGRADE_REASON };
        return { ...downgraded, possibleProof: findPossibleProof(downgraded, proof.candidates) };
      }
      return { ...cap, evidence };
    }
    return { ...cap, possibleProof: findPossibleProof(cap, proof.candidates) };
  });
}
