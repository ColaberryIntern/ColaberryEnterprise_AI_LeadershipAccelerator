/**
 * serviceGapOpportunities - the page feed: the latest recommendation for every case study CURRENTLY in intake,
 * stale-flagged, plus counters, ranked clusters and the latest batch run. Read-only; never calls the model.
 * A case study that leaves intake (linked) drops out, so counters always describe the live backlog.
 */
import { listIntakeCaseStudies } from '../../caseStudy/caseStudyIntakeQueue';
import { latestAnalyses } from './serviceGapAnalysis';
import { latestRun, type GapRunView } from './serviceGapBatch';
import { clusterRecommendations, countRecommendations, type GapCluster, type GapCounters } from './serviceGapCluster';
import { loadCatalog, loadEvidence } from './serviceGapLoader';
import { caseStudyFingerprint, catalogFingerprint } from './serviceGapRetrieval';
import type { GapAnalysisView } from './serviceGapTypes';

export interface GapOpportunities {
  generatedAt: string;
  intakeCount: number;
  counters: GapCounters;
  clusters: GapCluster[];
  byCaseStudy: Record<string, GapAnalysisView>;
  run: GapRunView | null;
}

export async function buildOpportunities(tenantId: string): Promise<GapOpportunities> {
  const intake = await listIntakeCaseStudies({ tenantId });
  const ids = intake.map((i) => i.id);
  const [catalog, evidence, run] = await Promise.all([loadCatalog(tenantId), loadEvidence(ids), latestRun(tenantId)]);
  const catalogFp = catalogFingerprint(catalog);
  const current = new Map(Array.from(evidence.values()).map((e) => [e.id, { caseFp: caseStudyFingerprint(e), catalogFp }] as const));
  const latest = await latestAnalyses(tenantId, current);
  return {
    generatedAt: new Date().toISOString(), intakeCount: ids.length,
    counters: countRecommendations(ids, latest),
    clusters: clusterRecommendations(Array.from(latest.values())),
    byCaseStudy: Object.fromEntries(latest.entries()),
    run,
  };
}
