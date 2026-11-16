/**
 * serviceGapCluster - group case-study recommendations into service OPPORTUNITIES. PURE.
 *
 * One candidate service family, many case studies - never one new service per case study:
 *   - recommendations aimed at an existing service (match / expand / growth) group by that service;
 *   - PROPOSE_NEW recommendations group when their proposed name or service family is similar (token Jaccard >= 0.5,
 *     transitive), and the cluster takes the name of its best-evidenced member;
 *   - INSUFFICIENT_EVIDENCE stays out of clusters (it is counted as "needs review").
 * Ranking (heuristic, documented): distinctiveness (mean novelty) .30 + evidence (mean readiness) .30
 * + reuse (25 per case study, max 100) .25 - duplicate risk (max) .15. Commercial demand is NOT in the rank until
 * it is grounded in real opportunity ids.
 */
import { nameSimilarity } from './serviceGapRetrieval';
import type { GapAnalysisView, GapDecision } from './serviceGapTypes';

export const CLUSTER_SIMILARITY = 0.5;

export interface GapCluster {
  key: string;
  kind: 'new_service' | 'existing_service';
  decision: GapDecision;
  title: string;
  serviceId: string | null;
  caseStudyIds: string[];
  analysisIds: string[];
  rank: number;
  meanNovelty: number;
  meanReadiness: number;
  maxDuplicateRisk: number | null;
  duplicateWarnings: string[];
  anyStale: boolean;
}

const mean = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

function rankOf(c: Omit<GapCluster, 'rank'>): number {
  const reuse = Math.min(100, c.caseStudyIds.length * 25);
  return Math.round(0.3 * c.meanNovelty + 0.3 * c.meanReadiness + 0.25 * reuse - 0.15 * (c.maxDuplicateRisk ?? 0));
}

function build(key: string, kind: GapCluster['kind'], members: GapAnalysisView[]): GapCluster {
  const recs = members.map((m) => m.recommendation!);
  const best = members.slice().sort((a, b) => b.recommendation!.scores.evidenceReadinessScore - a.recommendation!.scores.evidenceReadinessScore)[0].recommendation!;
  const dup = recs.map((r) => r.scores.duplicateRiskScore).filter((x): x is number => x != null);
  const decisions = recs.map((r) => r.decision);
  const decision = kind === 'new_service' ? 'PROPOSE_NEW'
    : decisions.includes('EXPAND_EXISTING') ? 'EXPAND_EXISTING' : decisions.includes('LINK_GROWTH') ? 'LINK_GROWTH' : 'MATCH_EXISTING';
  const base = {
    key, kind, decision: decision as GapDecision,
    title: kind === 'new_service' ? best.proposedService?.name ?? best.serviceFamily ?? 'Proposed service' : best.target?.serviceName ?? 'Service',
    serviceId: kind === 'existing_service' ? best.target?.serviceId ?? null : null,
    caseStudyIds: members.map((m) => m.caseStudyId), analysisIds: members.map((m) => m.id),
    meanNovelty: mean(recs.map((r) => r.scores.noveltyScore)), meanReadiness: mean(recs.map((r) => r.scores.evidenceReadinessScore)),
    maxDuplicateRisk: dup.length ? Math.max(...dup) : null,
    duplicateWarnings: Array.from(new Set(recs.flatMap((r) => r.duplicateWarnings))).slice(0, 5),
    anyStale: members.some((m) => m.stale),
  };
  return { ...base, rank: rankOf(base) };
}

/** Only open (not dismissed / accepted) recommendations with a usable decision are clustered. */
export function clusterRecommendations(views: GapAnalysisView[]): GapCluster[] {
  const live = views.filter((v) => v.recommendation && v.reviewState === 'open' && v.decision && v.decision !== 'INSUFFICIENT_EVIDENCE');
  const byService = new Map<string, GapAnalysisView[]>();
  const proposals: GapAnalysisView[] = [];
  for (const v of live) {
    const t = v.recommendation!.target;
    if (v.decision === 'PROPOSE_NEW') proposals.push(v);
    else if (t) byService.set(t.serviceId, [...(byService.get(t.serviceId) ?? []), v]);
  }
  const clusters: GapCluster[] = Array.from(byService.entries()).map(([id, ms]) => build(`svc:${id}`, 'existing_service', ms));

  // Union-find over proposals by name / family similarity.
  const label = (v: GapAnalysisView): string[] => [v.recommendation!.proposedService?.name, v.recommendation!.serviceFamily].filter((x): x is string => !!x);
  const parent = proposals.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < proposals.length; i += 1) {
    for (let j = i + 1; j < proposals.length; j += 1) {
      const similar = label(proposals[i]).some((a) => label(proposals[j]).some((b) => nameSimilarity(a, b) >= CLUSTER_SIMILARITY));
      if (similar) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, GapAnalysisView[]>();
  proposals.forEach((v, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), v]); });
  for (const ms of groups.values()) clusters.push(build(`new:${ms.map((m) => m.caseStudyId).sort()[0]}`, 'new_service', ms));

  return clusters.sort((a, b) => b.rank - a.rank || b.caseStudyIds.length - a.caseStudyIds.length || a.title.localeCompare(b.title));
}

export interface GapCounters {
  analyzed: number; notAnalyzed: number; stale: number; failed: number;
  newServiceProposals: number; expandExisting: number; matchExisting: number; linkGrowth: number; needsReview: number;
}

/** Counters over the CURRENT intake population (`intakeIds`), not historical rows. */
export function countRecommendations(intakeIds: string[], latest: Map<string, GapAnalysisView>): GapCounters {
  const c: GapCounters = { analyzed: 0, notAnalyzed: 0, stale: 0, failed: 0, newServiceProposals: 0, expandExisting: 0, matchExisting: 0, linkGrowth: 0, needsReview: 0 };
  for (const id of intakeIds) {
    const v = latest.get(id);
    if (!v) { c.notAnalyzed += 1; continue; }
    if (v.stale) c.stale += 1;
    if (v.status === 'failed') { c.failed += 1; c.needsReview += 1; continue; }
    c.analyzed += 1;
    if (v.decision === 'PROPOSE_NEW') c.newServiceProposals += 1;
    else if (v.decision === 'EXPAND_EXISTING') c.expandExisting += 1;
    else if (v.decision === 'MATCH_EXISTING') c.matchExisting += 1;
    else if (v.decision === 'LINK_GROWTH') c.linkGrowth += 1;
    else c.needsReview += 1;
  }
  return c;
}
