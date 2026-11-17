/**
 * finderNeeds - what proof we are short of, from our own evidence summary. PURE; no model.
 *
 * One Need per live service, scored by how much a new inside case study would matter:
 *   evidence tier    none 40, thin 30, emerging 12, proven 0
 *   Gov demand       6 per open opportunity matching the service, capped at 30
 *   live proposals   10 per Partly/New capability matched to the service, capped at 30
 *   Growth           15 when it has under two confirmed case studies (one more firms the family up)
 *   stale            8 when the newest proof is old
 * Plus one Need per Partly/New capability that matched NO service (a gap with nothing to point at).
 */
import type { EvidenceSummary, EvidenceService, FitGap } from '../serviceEvidenceSummaryTypes';
import type { Need } from './finderTypes';
import { tokenSet } from './finderText';

export const NEED_WEIGHTS = Object.freeze({
  tier: { none: 40, thin: 30, emerging: 12, proven: 0 } as Record<string, number>,
  perOpportunity: 6, opportunityCap: 30, perFitGap: 10, fitGapCap: 30, growthShort: 15, stale: 8,
});

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function serviceNeed(s: EvidenceService, gaps: FitGap[], stale: Set<string>): Need {
  const reasons: string[] = [];
  let score = NEED_WEIGHTS.tier[s.evidenceTier] ?? 0;
  const proofs = s.insideCount + s.outsideCount;
  if (s.evidenceTier === 'none') reasons.push('No confirmed case study yet');
  else if (s.evidenceTier === 'thin') reasons.push(`Thin proof: evidence score ${s.evidenceScore} of 100`);
  else if (s.evidenceTier === 'emerging') reasons.push(`Emerging proof: evidence score ${s.evidenceScore} of 100`);
  const opps = s.openOpportunityMatches ?? 0;
  if (opps > 0) {
    score += Math.min(NEED_WEIGHTS.opportunityCap, NEED_WEIGHTS.perOpportunity * opps);
    reasons.push(`${plural(opps, 'open Gov opportunity', 'open Gov opportunities')} match this service${proofs ? '' : ' with no proof behind it'}`);
  }
  if (gaps.length) {
    score += Math.min(NEED_WEIGHTS.fitGapCap, NEED_WEIGHTS.perFitGap * gaps.length);
    reasons.push(`${plural(gaps.length, 'live proposal capability', 'live proposal capabilities')} rated Partly/New`);
  }
  if (s.status === 'growth' && proofs < 2) { score += NEED_WEIGHTS.growthShort; reasons.push(`Growth service with ${plural(proofs, 'case study', 'case studies')}`); }
  if (stale.has(s.id)) { score += NEED_WEIGHTS.stale; reasons.push('Newest proof is old'); }
  return {
    kind: 'service', id: s.id, name: s.name, status: s.status === 'retired' ? null : s.status, description: null,
    tokens: [...tokenSet(s.name, s.category, ...s.keywords)],
    needScore: score, reasons,
    evidence: {
      insideCount: s.insideCount, outsideCount: s.outsideCount, newestEvidenceYear: s.newestEvidenceYear,
      industries: s.industries.length, score: s.evidenceScore, tier: s.evidenceTier, openOpportunityMatches: s.openOpportunityMatches,
    },
    fitGaps: gaps.map((g) => ({ title: g.title, name: g.name, assessment: g.assessment, closeDate: g.closeDate })),
  };
}

export function buildNeeds(summary: EvidenceSummary, descriptions: ReadonlyMap<string, string | null> = new Map()): Need[] {
  const gaps = summary.decideNow.openFitGaps.items;
  const stale = new Set(summary.decideNow.staleServices.ids);
  const live = summary.services.filter((s) => s.status !== 'retired');
  const needs = live.map((s) => {
    const n = serviceNeed(s, gaps.filter((g) => g.matchedServiceId === s.id), stale);
    const d = descriptions.get(s.id) ?? null;
    return d ? { ...n, description: d, tokens: [...new Set([...n.tokens, ...tokenSet(d)])] } : n;
  });
  // A Partly/New capability no service covers: one Need per distinct capability name.
  const seen = new Set<string>();
  for (const g of gaps.filter((x) => !x.matchedServiceId)) {
    const key = g.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const same = gaps.filter((x) => !x.matchedServiceId && x.name.trim().toLowerCase() === key);
    needs.push({
      kind: 'capability', id: `capability:${key}`, name: g.name, status: null, description: null,
      tokens: [...tokenSet(g.name)],
      needScore: 25 + Math.min(NEED_WEIGHTS.fitGapCap, NEED_WEIGHTS.perFitGap * same.length),
      reasons: [`${plural(same.length, 'live proposal', 'live proposals')} need "${g.name}" and no service covers it`],
      evidence: null,
      fitGaps: same.map((x) => ({ title: x.title, name: x.name, assessment: x.assessment, closeDate: x.closeDate })),
    });
  }
  return needs.sort((a, b) => b.needScore - a.needScore || a.name.localeCompare(b.name));
}
