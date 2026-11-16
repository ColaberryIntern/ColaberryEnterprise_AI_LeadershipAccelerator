/**
 * serviceGapValidate - turns the model's raw JSON into a `GapRecommendation` the system can trust. PURE.
 *
 * The model recommends; this module decides what is ALLOWED to be recommended:
 *   - every service the model names must be one of the candidate refs we gave it (S1..Sn); anything else is dropped,
 *     so neither the model nor a document it read can point at another tenant's service or an invented one;
 *   - service names/statuses come from OUR catalog, never from the model's text;
 *   - the decision must agree with the target's real status (an "existing" target that is Growth becomes LINK_GROWTH,
 *     a "growth" target that is Active becomes MATCH_EXISTING; no valid target -> INSUFFICIENT_EVIDENCE);
 *   - PROPOSE_NEW is guarded against catalog bloat: an exact namesake becomes a match to that service; a very high
 *     overlap with an existing service becomes MATCH_EXISTING; a retired namesake or a similar name is flagged;
 *   - research-only work never gets better than LOW confidence;
 *   - every string/array is clamped; codes are format-checked and labeled unverified.
 * Throws `GapMalformedOutput` only when the decision itself is unreadable.
 */
import {
  GAP_DECISIONS, MATURITY_LEVELS, type CaseStudyEvidence, type CatalogService, type Confidence, type GapCandidate,
  type GapDecision, type GapEvidenceRef, type GapRecommendation, type Maturity, type ProposedServiceDraft,
} from './serviceGapTypes';
import { nameSimilarity, normalizeName } from './serviceGapRetrieval';

export class GapMalformedOutput extends Error { constructor(m: string) { super(m); this.name = 'GapMalformedOutput'; } }

/** PROPOSE_NEW is overridden to MATCH_EXISTING at or above both of these overlaps with one existing service. */
export const OVERLAP_GUARD = { capability: 80, buyerProblem: 70 };
export const SIMILAR_NAME_AT = 0.5;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {});
const str = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, n) : null;
};
const list = (v: unknown, max: number, len: number): string[] => {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const s = str(x, len);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
};
const pct = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
};

export interface ValidateContext {
  /** Ref (S1..Sn) -> the candidate service we sent, with its retrieval score. */
  refs: Map<string, CatalogService & { retrievalScore: number }>;
  /** The tenant's WHOLE catalog, retired included (duplicate checks only). */
  catalog: CatalogService[];
  evidence: CaseStudyEvidence;
}

const fitOf = (c: GapCandidate): number => Math.round(0.5 * c.capabilityOverlap + 0.3 * c.buyerProblemOverlap + 0.2 * c.deliverableOverlap);

export function readinessScore(maturity: Maturity, ev: CaseStudyEvidence): number {
  const base: Record<Maturity, number> = { client_deployed: 80, internally_validated: 60, implemented_demo: 45, research_concept: 20, unknown: 25 };
  const outcomes = ev.analysis?.outcomes.length ?? 0;
  return Math.max(0, Math.min(100, base[maturity] + Math.min(20, outcomes * 5) - (ev.analysisError ? 20 : 0)));
}

function candidatesFrom(raw: unknown, refs: ValidateContext['refs']): GapCandidate[] {
  const out: GapCandidate[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const o = obj(c);
    const svc = refs.get(String(o.ref ?? '').trim().toUpperCase());
    if (!svc || out.some((x) => x.serviceId === svc.id)) continue;
    out.push({
      serviceId: svc.id, serviceName: svc.name, status: svc.status, retrievalScore: svc.retrievalScore,
      capabilityOverlap: pct(o.capabilityOverlap), buyerProblemOverlap: pct(o.buyerProblemOverlap), deliverableOverlap: pct(o.deliverableOverlap),
      missingCapabilities: list(o.missingCapabilities, 6, 120), reason: str(o.reason, 400) ?? '',
    });
    if (out.length >= 3) break;
  }
  return out.sort((a, b) => fitOf(b) - fitOf(a));
}

export function finalizeRecommendation(raw: unknown, ctx: ValidateContext): GapRecommendation {
  const r = obj(raw);
  const decisionRaw = String(r.decision ?? '').trim().toUpperCase();
  if (!(GAP_DECISIONS as readonly string[]).includes(decisionRaw)) throw new GapMalformedOutput(`unknown decision "${decisionRaw.slice(0, 40)}"`);
  let decision = decisionRaw as GapDecision;
  const reasonCodes = list(r.reasonCodes, 8, 60).map((c) => c.toLowerCase().replace(/[^a-z0-9_]+/g, '_'));
  const maturity = ((MATURITY_LEVELS as readonly string[]).includes(String(r.maturity)) ? r.maturity : 'unknown') as Maturity;
  const candidates = candidatesFrom(r.candidates, ctx.refs);
  let target = ctx.refs.get(String(r.targetRef ?? '').trim().toUpperCase()) ?? null;
  const duplicateWarnings: string[] = [];
  let verdict = str(r.verdict, 300) ?? '';

  // Decision vs the target's REAL status.
  if (decision === 'MATCH_EXISTING' || decision === 'EXPAND_EXISTING' || decision === 'LINK_GROWTH') {
    if (!target) { decision = 'INSUFFICIENT_EVIDENCE'; reasonCodes.push('target_not_in_catalog'); }
    else if (target.status === 'growth' && decision !== 'LINK_GROWTH') { decision = 'LINK_GROWTH'; reasonCodes.push('target_is_growth'); }
    else if (target.status === 'active' && decision === 'LINK_GROWTH') { decision = 'MATCH_EXISTING'; reasonCodes.push('target_is_active'); }
  }

  // Expansion needs actual proposed changes; otherwise it is a plain match.
  const ex = obj(r.expansion);
  const expansionFields = { descriptionAddition: str(ex.descriptionAddition, 600), keywordsToAdd: list(ex.keywordsToAdd, 12, 60), scopeChange: str(ex.scopeChange, 600) };
  if (decision === 'EXPAND_EXISTING' && !expansionFields.descriptionAddition && !expansionFields.keywordsToAdd.length && !expansionFields.scopeChange) {
    decision = 'MATCH_EXISTING'; reasonCodes.push('expansion_without_changes');
  }

  const ps = obj(r.proposedService);
  const proposedName = str(ps.name, 200);
  let duplicateRiskScore: number | null = null;
  if (decision === 'PROPOSE_NEW') {
    const g = proposalGuard(proposedName, candidates, ctx);
    reasonCodes.push(...g.reasonCodes);
    duplicateWarnings.push(...g.duplicateWarnings);
    duplicateRiskScore = g.duplicateRiskScore;
    if (g.decision) { decision = g.decision; target = g.target; verdict = g.verdict ?? verdict; }
  }

  const existingFitScore = candidates.length ? Math.max(...candidates.map(fitOf)) : null;
  const noveltyScore = Math.round(0.6 * pct(r.capabilityNovelty) + 0.4 * (100 - (existingFitScore ?? 0)));
  const evidenceReadinessScore = readinessScore(maturity, ctx.evidence);
  let confidence: Confidence = 'medium';
  if ((decision === 'MATCH_EXISTING' || decision === 'LINK_GROWTH') && (existingFitScore ?? 0) >= 70) confidence = 'high';
  if (maturity === 'research_concept' || evidenceReadinessScore < 35 || decision === 'INSUFFICIENT_EVIDENCE') confidence = 'low';
  if (maturity === 'research_concept' && decision === 'PROPOSE_NEW') reasonCodes.push('research_only');

  return {
    decision, verdict: verdict || defaultVerdict(decision, target?.name ?? null, proposedName),
    target: target && decision !== 'PROPOSE_NEW' && decision !== 'INSUFFICIENT_EVIDENCE' ? { serviceId: target.id, serviceName: target.name, status: target.status } : null,
    maturity, serviceFamily: str(r.serviceFamily, 120), candidates,
    scores: { existingFitScore, noveltyScore, evidenceReadinessScore, duplicateRiskScore, commercialPotentialScore: null },
    confidence,
    proposedService: decision === 'PROPOSE_NEW' && proposedName ? draftFrom(ps, proposedName) : null,
    expansion: decision === 'EXPAND_EXISTING' && target ? { serviceId: target.id, serviceName: target.name, ...expansionFields } : null,
    duplicateWarnings: duplicateWarnings.slice(0, 5), alternativesConsidered: alternativesFrom(r.alternativesConsidered),
    missingInformation: list(r.missingInformation, 6, 200), evidence: evidenceFrom(r.evidence),
    reasonCodes: Array.from(new Set(reasonCodes)).slice(0, 10),
  };
}

type Target = (CatalogService & { retrievalScore: number }) | null;

/**
 * PROPOSE_NEW guards. A draft needs a name; an exact namesake becomes a match to it; near-total overlap with one
 * service becomes a match to it; otherwise the proposal stands, with duplicate warnings and a duplicate-risk score.
 * `decision` is set only when the proposal is overridden.
 */
function proposalGuard(name: string | null, candidates: GapCandidate[], ctx: ValidateContext): {
  decision: GapDecision | null; target: Target; verdict: string | null; reasonCodes: string[]; duplicateWarnings: string[]; duplicateRiskScore: number | null;
} {
  const none = { target: null, verdict: null, duplicateWarnings: [] as string[], duplicateRiskScore: null };
  if (!name || name.length < 2) return { ...none, decision: 'INSUFFICIENT_EVIDENCE', reasonCodes: ['proposal_without_name'] };
  const norm = normalizeName(name);
  const namesake = ctx.catalog.find((s) => normalizeName(s.name) === norm);
  if (namesake && namesake.status !== 'retired') {
    return { ...none, decision: namesake.status === 'growth' ? 'LINK_GROWTH' : 'MATCH_EXISTING', target: { ...namesake, retrievalScore: 0 },
      verdict: `The proposed service already exists as "${namesake.name}".`, reasonCodes: ['duplicate_name'] };
  }
  const best = candidates[0];
  if (best && best.capabilityOverlap >= OVERLAP_GUARD.capability && best.buyerProblemOverlap >= OVERLAP_GUARD.buyerProblem) {
    return { ...none, decision: best.status === 'growth' ? 'LINK_GROWTH' : 'MATCH_EXISTING',
      target: Array.from(ctx.refs.values()).find((s) => s.id === best.serviceId) ?? null,
      verdict: `"${best.serviceName}" already covers this (high overlap), so no new service is proposed.`, reasonCodes: ['high_overlap_guard'] };
  }
  const duplicateWarnings: string[] = [];
  let worst = 0;
  for (const s of ctx.catalog) {
    const sim = nameSimilarity(name, s.name);
    worst = Math.max(worst, sim);
    if (s.status === 'retired' && normalizeName(s.name) === norm) duplicateWarnings.push(`A retired service has this name ("${s.name}"); creating it would be refused. Rename it or reinstate the retired one.`);
    else if (sim >= SIMILAR_NAME_AT) duplicateWarnings.push(`Similar to existing ${s.status} service "${s.name}".`);
  }
  return { decision: null, target: null, verdict: null, reasonCodes: [], duplicateWarnings, duplicateRiskScore: Math.round(worst * 100) };
}

function draftFrom(ps: Obj, name: string): ProposedServiceDraft {
  return {
    name, category: str(ps.category, 120), buyerValue: str(ps.buyerValue, 400), scope: str(ps.scope, 800),
    deliverables: list(ps.deliverables, 8, 160), targetBuyer: str(ps.targetBuyer, 200), differentiators: list(ps.differentiators, 6, 200),
    keywords: list(ps.keywords, 20, 60).map((k) => k.toLowerCase()),
    // Filter BEFORE capping: clamping first would turn a 7-digit string into a "valid" 6-digit code.
    naicsSuggestionsUnverified: list(ps.naics, 20, 32).filter((c) => /^\d{6}$/.test(c)).slice(0, 8),
    pscSuggestionsUnverified: list(ps.psc, 20, 32).map((c) => c.toUpperCase()).filter((c) => /^[A-Z0-9]{4}$/.test(c)).slice(0, 8),
    suggestedStatus: 'growth',
  };
}

/** Nothing the model says is a confirmed fact: outside material is a claim, the rest is inference. */
function evidenceFrom(raw: unknown): GapEvidenceRef[] {
  const out: GapEvidenceRef[] = [];
  for (const e of Array.isArray(raw) ? raw : []) {
    const o = obj(e); const text = str(o.text, 300);
    if (text) out.push({ kind: o.kind === 'document_claim' ? 'document_claim' : 'inference', text });
    if (out.length >= 6) break;
  }
  return out;
}

function alternativesFrom(raw: unknown): Array<{ decision: GapDecision; whyNot: string }> {
  return (Array.isArray(raw) ? raw : []).map(obj)
    .filter((a) => (GAP_DECISIONS as readonly string[]).includes(String(a.decision)) && str(a.whyNot, 300))
    .slice(0, 4).map((a) => ({ decision: a.decision as GapDecision, whyNot: str(a.whyNot, 300) as string }));
}

export function defaultVerdict(d: GapDecision, target: string | null, proposed: string | null): string {
  switch (d) {
    case 'MATCH_EXISTING': return `Link to ${target}.`;
    case 'EXPAND_EXISTING': return `Expand ${target} to cover this.`;
    case 'LINK_GROWTH': return `Existing Growth service ${target} covers this.`;
    case 'PROPOSE_NEW': return `Propose ${proposed}.`;
    default: return 'Need more case-study detail before deciding.';
  }
}

/** The recommendation recorded when the detector abstains before calling a model (thin or unreadable source). */
export function insufficientRecommendation(ev: CaseStudyEvidence, reasonCode: string, missing: string[]): GapRecommendation {
  return {
    decision: 'INSUFFICIENT_EVIDENCE', verdict: 'Need more case-study detail before deciding.', target: null, maturity: 'unknown',
    serviceFamily: null, candidates: [], confidence: 'low',
    scores: { existingFitScore: null, noveltyScore: 0, evidenceReadinessScore: readinessScore('unknown', ev), duplicateRiskScore: null, commercialPotentialScore: null },
    proposedService: null, expansion: null, duplicateWarnings: [], alternativesConsidered: [], missingInformation: missing,
    evidence: [], reasonCodes: [reasonCode],
  };
}
