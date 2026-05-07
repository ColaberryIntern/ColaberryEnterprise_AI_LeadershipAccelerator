/**
 * remediationIntelligenceEngine — top-level coordinator. For a project +
 * BP, returns a unified RemediationIntelligenceReport with:
 *   - current clusters (issueClusterEngine)
 *   - recommended sequence (remediationSequencePlanner)
 *   - confidence per cluster (remediationConfidenceEngine + aggregates)
 *   - regression-prone warnings (regressionProneFixDetector)
 *
 * This is the function the routes + frontend hooks call. It is also the
 * function the live orchestration listener calls when an event triggers
 * a recompute — keeps the read+compute path in one place.
 *
 * Phase 10.5 §A.7.
 */

import { clusterOpenFeedback, type IssueCluster } from './issueClusterEngine';
import { planRemediationSequence, type RemediationSequencePlan } from './remediationSequencePlanner';
import { computeRemediationConfidence, type RemediationConfidence } from './remediationConfidenceEngine';
import { detectRegressionPronePatterns, type RegressionPronePattern } from './regressionProneFixDetector';
import { aggregateUXOutcomes } from './remediationEffectivenessAnalyzer';

export interface ClusterWithIntelligence {
  readonly cluster: IssueCluster;
  readonly confidence: RemediationConfidence;
  readonly is_regression_prone: boolean;
  readonly historical_success_rate: number;
}

export interface RemediationIntelligenceReport {
  readonly project_id: string;
  readonly capability_id: string;
  readonly clusters: ReadonlyArray<ClusterWithIntelligence>;
  readonly sequence: RemediationSequencePlan;
  readonly regression_prone: ReadonlyArray<RegressionPronePattern>;
  readonly overall_confidence: number;
  readonly summary: string;
  readonly generated_at: Date;
}

export async function buildRemediationIntelligenceReport(opts: {
  project_id: string;
  capability_id: string;
}): Promise<RemediationIntelligenceReport> {
  const generated_at = new Date();
  const [openRows, regressionResult, aggregate] = await Promise.all([
    fetchOpenFeedbackRows(opts.capability_id),
    detectRegressionPronePatterns({ project_id: opts.project_id, capability_id: opts.capability_id }),
    aggregateUXOutcomes({ project_id: opts.project_id, capability_id: opts.capability_id }),
  ]);

  const clusters = clusterOpenFeedback(openRows);
  const sequence = planRemediationSequence(clusters);

  const regressionSet = new Set(regressionResult.patterns.map(p => p.cluster_signature));
  const successByType = aggregate.historical_success_rate_by_type;

  const clusterWithIntelligence: ClusterWithIntelligence[] = clusters.map(c => {
    const historical_success_rate = successByType[c.cluster_type] ?? 50;
    const is_regression_prone = regressionSet.has(c.cluster_signature);
    const regression_risk = is_regression_prone ? 80 : Math.max(10, 100 - historical_success_rate);
    const unresolved_related_count = clusters
      .filter(other => other.cluster_signature !== c.cluster_signature && other.cluster_type === c.cluster_type)
      .reduce((acc, other) => acc + other.issue_count, 0);

    const confidence = computeRemediationConfidence({
      historical_success_rate,
      regression_risk,
      cognition_stability: aggregate.avg_cognition_delta != null ? Math.max(0, Math.min(100, 50 + aggregate.avg_cognition_delta)) : 50,
      behavioral_improvement: aggregate.avg_ux_debt_delta != null ? Math.max(0, Math.min(100, 50 + aggregate.avg_ux_debt_delta)) : 50,
      unresolved_related_count,
    });

    return { cluster: c, confidence, is_regression_prone, historical_success_rate };
  });

  const overall_confidence = clusterWithIntelligence.length === 0
    ? 100
    : Math.round(clusterWithIntelligence.reduce((s, c) => s + c.confidence.confidence, 0) / clusterWithIntelligence.length);

  const summary = buildSummary(clusters.length, regressionResult.patterns.length, overall_confidence);

  return {
    project_id: opts.project_id,
    capability_id: opts.capability_id,
    clusters: clusterWithIntelligence,
    sequence,
    regression_prone: regressionResult.patterns,
    overall_confidence,
    summary,
    generated_at,
  };
}

async function fetchOpenFeedbackRows(capabilityId: string): Promise<any[]> {
  try {
    const { default: UIElementFeedback } = await import('../../../models/UIElementFeedback');
    const { Op } = await import('sequelize');
    const rows = await UIElementFeedback.findAll({
      where: {
        capability_id: capabilityId,
        status: { [Op.in]: ['open', 'in_progress'] },
      },
    });
    return (rows as any[]).map(r => ({
      cluster_signature: r.cluster_signature ?? null,
      cluster_type: r.cluster_type ?? null,
      issue_type: r.issue_type ?? null,
      title: r.title ?? null,
      description: r.description ?? null,
      suggestion: r.suggestion ?? null,
      source_step: r.source_step ?? null,
      element_type: r.element_type ?? null,
      element_selector: r.element_selector ?? null,
      element_text: r.element_text ?? null,
      severity: r.severity ?? null,
      capability_id: r.capability_id,
      page_route: r.page_route ?? null,
    }));
  } catch (err: any) {
    console.warn('[remediationIntelligenceEngine] feedback read failed:', err?.message);
    return [];
  }
}

function buildSummary(clusterCount: number, regressionCount: number, overallConfidence: number): string {
  if (clusterCount === 0) return 'No open clusters — UX remediation surface is clear.';
  const parts: string[] = [];
  parts.push(`${clusterCount} active cluster${clusterCount === 1 ? '' : 's'}`);
  if (regressionCount > 0) parts.push(`${regressionCount} regression-prone signature${regressionCount === 1 ? '' : 's'}`);
  parts.push(`overall confidence ${overallConfidence}/100`);
  return parts.join(' · ') + '.';
}
