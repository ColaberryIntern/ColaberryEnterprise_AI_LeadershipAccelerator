/**
 * finderDelta - before/after for one proposed case study. PURE, and the SAME formula Our Services shows
 * (scoreServiceEvidence), so the "after" number is what the page will read once the case study is confirmed.
 * Stated assumption, shown with the number: the new case study is an INSIDE one, confirmed on the service, dated this
 * year; no new industry is counted (we do not know it yet), so the real gain can only be equal or higher.
 */
import { scoreServiceEvidence } from '../serviceEvidenceScore';
import type { Need, ProfileDelta } from './finderTypes';

export const DELTA_ASSUMPTION = 'Assumes it is built from our own repo, confirmed on this service and dated this year; a new industry would add 4 more.';

export function profileDelta(need: Need, currentYear: number): ProfileDelta | null {
  const e = need.evidence;
  if (!e) return null;
  const after = scoreServiceEvidence({
    insideCount: e.insideCount + 1, outsideCount: e.outsideCount,
    newestEvidenceYear: Math.max(e.newestEvidenceYear ?? currentYear, currentYear),
    distinctIndustries: e.industries, currentYear,
  });
  return {
    before: { score: e.score, tier: e.tier, insideCount: e.insideCount },
    after: { score: after.score, tier: after.tier, insideCount: e.insideCount + 1 },
    scoreChange: after.score - e.score,
    tierChange: after.tier !== e.tier,
    openOpportunities: e.openOpportunityMatches,
    firstProof: e.insideCount + e.outsideCount === 0,
    fitGapsAnswered: need.fitGaps.length,
    assumption: DELTA_ASSUMPTION,
  };
}
