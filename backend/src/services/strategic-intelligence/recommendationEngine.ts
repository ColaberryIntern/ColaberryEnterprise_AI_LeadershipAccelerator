// ─── Recommendation Engine ───────────────────────────────────────────────────
// Converts inferences into structured advisory recommendations.
// All recommendations are advisory only — no auto-execution.
// Stored in existing ReportingInsight model.

import { StrategicInference } from './strategicInferenceEngine';
import { StrategicMetrics } from './metricCollector';
import { v4 as uuid } from 'uuid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StrategicRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  domain: string;
  summary: string;
  recommendation: string;
  projectedImpact: string;
  confidence: number;
  requiresApproval: boolean;
}

// ─── Priority Mapping ───────────────────────────────────────────────────────

function inferPriority(confidence: number, domain: string): StrategicRecommendation['priority'] {
  if (confidence >= 0.8 && (domain === 'revenue' || domain === 'operations')) return 'critical';
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function projectImpact(inference: StrategicInference, metrics: StrategicMetrics): string {
  switch (inference.domain) {
    case 'revenue':
      return `Potential revenue protection: pipeline value at $${metrics.opportunities.pipelineValue.toLocaleString()}`;
    case 'funnel':
      return `Affects ${metrics.funnel.totalLeads} leads in pipeline with ${metrics.funnel.conversionRate}% conversion`;
    case 'campaign':
      return `Impact on ${metrics.campaign.activeCampaigns} active campaigns`;
    case 'operations':
      return `${metrics.operations.erroredAgents} agents affected, ${metrics.operations.errors24h} errors in 24h`;
    default:
      return 'Impact assessment requires further investigation';
  }
}

// ─── Generator ──────────────────────────────────────────────────────────────

export async function generateRecommendations(
  inferences: StrategicInference[],
  metrics: StrategicMetrics,
): Promise<StrategicRecommendation[]> {
  const recommendations: StrategicRecommendation[] = [];

  for (const inference of inferences) {
    recommendations.push({
      id: uuid(),
      priority: inferPriority(inference.confidence, inference.domain),
      domain: inference.domain,
      summary: inference.hypothesis,
      recommendation: inference.suggestedAction,
      projectedImpact: projectImpact(inference, metrics),
      confidence: inference.confidence,
      requiresApproval: true, // Always advisory
    });
  }

  // Sort by priority: critical > high > medium > low
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

// ─── Persist to ReportingInsight ────────────────────────────────────────────

export async function persistRecommendations(
  recommendations: StrategicRecommendation[],
): Promise<void> {
  if (recommendations.length === 0) return;

  try {
    const ReportingInsight = (await import('../../models/ReportingInsight')).default;

    for (const rec of recommendations) {
      // Map priority to numeric scores
      const urgencyMap = { critical: 0.95, high: 0.8, medium: 0.6, low: 0.3 };
      const impactMap = { critical: 0.9, high: 0.75, medium: 0.5, low: 0.25 };

      await ReportingInsight.create({
        scope_type: 'system',
        scope_id: 'strategic-intelligence',
        scope_name: 'Strategic Intelligence',
        insight_type: 'opportunity',
        category: rec.domain,
        title: rec.summary,
        description: rec.recommendation,
        confidence: rec.confidence,
        impact: impactMap[rec.priority],
        urgency: urgencyMap[rec.priority],
        data_strength: rec.confidence,
        final_score: rec.confidence * impactMap[rec.priority],
        status: 'active',
        metadata: {
          strategic_intelligence: true,
          projected_impact: rec.projectedImpact,
          priority: rec.priority,
          requires_approval: rec.requiresApproval,
        },
      } as any).catch(() => {});
    }

    console.log(`[RecommendationEngine] Persisted ${recommendations.length} recommendations`);
  } catch (err: any) {
    console.error('[RecommendationEngine] Failed to persist:', err.message);
  }
}
