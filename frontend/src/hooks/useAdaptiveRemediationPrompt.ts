import { useMemo } from 'react';
import type { RemediationIntelligenceReport } from './useRemediationIntelligence';

export interface AdaptiveClusterPayload {
  cluster_type: string;
  historical_success_rate: number;
  regression_prone_patterns: Array<{ cluster_signature: string; recommended_alternative: string }>;
  sequence_position: { position: number; total: number; reason: string } | null;
  confidence: { confidence: number; tier: 'low' | 'moderate' | 'high'; reasons: string[] };
}

export interface AdaptivePromptDecision {
  /** 'ui_fix_adaptive' when there's enough adaptive context; else 'ui_fix_bulk'. */
  target: 'ui_fix_adaptive' | 'ui_fix_bulk';
  /** The extraContext.adaptiveRemediation payload to send when target is adaptive. */
  adaptiveContext: { clusters: AdaptiveClusterPayload[] } | undefined;
  /** Why we picked this target — useful for telemetry / debugging. */
  reason: string;
}

/**
 * Phase 11 — derives the adaptive context payload from the remediation
 * intelligence report. Returns:
 *   - target: 'ui_fix_adaptive' when at least one cluster maps to the
 *     issues being fixed; else 'ui_fix_bulk' (avoids degrading prompts
 *     on cold projects).
 *   - adaptiveContext: per-cluster array shape that promptGenerator's
 *     buildRemediationContextBlock renders as `## Cluster N` subsections.
 */
export function useAdaptiveRemediationPrompt(opts: {
  report: RemediationIntelligenceReport | null;
  stepKey: string | null;
  issues: Array<{ cluster_signature?: string | null; cluster_type?: string | null; source_step?: string | null }>;
}): AdaptivePromptDecision {
  return useMemo(() => {
    const { report, stepKey, issues } = opts;
    if (!report || !report.clusters || report.clusters.length === 0) {
      return { target: 'ui_fix_bulk', adaptiveContext: undefined, reason: 'No remediation intelligence data — falling back to ui_fix_bulk.' };
    }
    // Identify the cluster_signatures present in the issue set.
    const issueSignatures = new Set<string>();
    for (const i of issues) {
      if (i.cluster_signature) issueSignatures.add(i.cluster_signature);
    }
    let candidates = report.clusters.filter(c => issueSignatures.has(c.cluster.cluster_signature));
    if (candidates.length === 0 && stepKey) {
      // Fall back to clusters of types associated with this step
      candidates = report.clusters.filter(c => stepKey === 'layout_hierarchy' && c.cluster.cluster_type === 'hierarchy'
        || stepKey === 'usability' && (c.cluster.cluster_type === 'workflow' || c.cluster.cluster_type === 'accessibility')
        || stepKey === 'mobile_responsiveness' && (c.cluster.cluster_type === 'spacing' || c.cluster.cluster_type === 'workflow'));
    }
    if (candidates.length === 0) {
      return { target: 'ui_fix_bulk', adaptiveContext: undefined, reason: 'No clusters cover the active step — falling back to ui_fix_bulk.' };
    }
    const regressionByKey = new Map(report.regression_prone.map(p => [p.cluster_signature, p]));
    const sequencePositionByKey = new Map(report.sequence.ordered_clusters.map(p => [p.cluster_signature, p]));
    const total = report.sequence.ordered_clusters.length;
    const adaptiveClusters: AdaptiveClusterPayload[] = candidates.map(c => {
      const regressionForThisCluster = report.regression_prone.filter(p => p.cluster_signature === c.cluster.cluster_signature);
      const seq = sequencePositionByKey.get(c.cluster.cluster_signature);
      return {
        cluster_type: c.cluster.cluster_type,
        historical_success_rate: c.historical_success_rate,
        regression_prone_patterns: regressionForThisCluster.map(p => ({
          cluster_signature: p.cluster_signature,
          recommended_alternative: p.recommended_alternative,
        })),
        sequence_position: seq ? { position: seq.position, total, reason: seq.reason } : null,
        confidence: { confidence: c.confidence.confidence, tier: c.confidence.tier, reasons: c.confidence.reasons },
      };
    });
    void regressionByKey; // explicit no-op so unused-import warning stays clear
    return {
      target: 'ui_fix_adaptive',
      adaptiveContext: { clusters: adaptiveClusters },
      reason: `Adaptive prompt activated — ${adaptiveClusters.length} cluster(s) covered.`,
    };
  }, [opts]);
}
