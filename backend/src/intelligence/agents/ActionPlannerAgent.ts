// ─── Action Planner Agent ────────────────────────────────────────────────────
// Maps root causes to safe, executable actions from an allowlist.
// Checks vector memory for past action outcomes to improve recommendations.

import { getVectorMemory } from '../memory/vectorMemory';
import { registerAgent } from './agentRegistry';
import type { RootCauseResult } from './RootCauseAgent';
import type { SafeAction } from '../../models/IntelligenceDecision';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActionRecommendation {
  action: SafeAction;
  description: string;
  parameters: Record<string, any>;
  expected_impact: string;
  reversible: boolean;
  past_success_rate?: number; // 0-1, from memory
}

// ─── Action Mapping Rules ────────────────────────────────────────────────────

interface ActionRule {
  problem_types: string[];
  root_cause_patterns: RegExp[];
  action: SafeAction;
  description: string;
  default_params: Record<string, any>;
  expected_impact: string;
  reversible: boolean;
}

const ACTION_RULES: ActionRule[] = [
  {
    problem_types: ['agent_failure'],
    root_cause_patterns: [/agent.*config/i, /configuration/i],
    action: 'update_agent_config',
    description: 'Update agent configuration to fix detected issue',
    default_params: { reset_error_count: true },
    expected_impact: 'Agent resumes normal operation',
    reversible: true,
  },
  {
    problem_types: ['agent_failure'],
    root_cause_patterns: [/schedule/i, /timing/i, /persistent.*failure/i],
    action: 'modify_agent_schedule',
    description: 'Modify agent schedule to reduce contention or retry later',
    default_params: { backoff_minutes: 30 },
    expected_impact: 'Reduced error rate from scheduling conflicts',
    reversible: true,
  },
  {
    problem_types: ['conversion_drop'],
    root_cause_patterns: [/campaign.*config/i, /targeting/i, /content.*quality/i],
    action: 'update_campaign_config',
    description: 'Adjust campaign configuration to improve conversion',
    default_params: {},
    expected_impact: 'Conversion rate recovery within 24-48h',
    reversible: true,
  },
  {
    problem_types: ['conversion_drop'],
    root_cause_patterns: [/lead.*scor/i, /scoring/i],
    action: 'adjust_lead_scoring',
    description: 'Recalibrate lead scoring weights based on recent data',
    default_params: { recalibrate: true },
    expected_impact: 'Better lead prioritization, improved conversion',
    reversible: true,
  },
  {
    problem_types: ['conversion_drop', 'engagement_decline'],
    root_cause_patterns: [/content.*relevance/i, /delivery.*timing/i, /uncertain/i],
    action: 'launch_ab_test',
    description: 'Launch A/B test to validate improvement hypothesis',
    default_params: { test_duration_hours: 48, traffic_split: 0.5 },
    expected_impact: 'Data-driven decision within 48h',
    reversible: true,
  },
  {
    problem_types: ['error_spike', 'kpi_anomaly'],
    root_cause_patterns: [/campaign/i, /spike/i],
    action: 'pause_campaign',
    description: 'Temporarily pause campaign to stop error propagation',
    default_params: { pause_duration_hours: 4 },
    expected_impact: 'Error rate drops immediately',
    reversible: true,
  },
];

// ─── Planner Logic ───────────────────────────────────────────────────────────

/**
 * Generate action recommendations from root cause analysis results.
 */
export async function planActions(
  rootCause: RootCauseResult,
): Promise<ActionRecommendation[]> {
  const recommendations: ActionRecommendation[] = [];
  const memory = getVectorMemory();

  for (const rule of ACTION_RULES) {
    // Check if problem type matches
    if (!rule.problem_types.includes(rootCause.problem.type)) continue;

    // Check if any root cause matches the pattern
    const matched = rootCause.root_causes.some((rc) =>
      rule.root_cause_patterns.some((pattern) => pattern.test(rc)),
    );
    if (!matched) continue;

    // Look up past success rate for this action
    let pastSuccessRate: number | undefined;
    try {
      const pastResults = await memory.search(`Action "${rule.action}" succeeded`, 'insight', 10);
      if (pastResults.length > 0) {
        const successes = pastResults.filter((r) => r.metadata?.success === true).length;
        pastSuccessRate = pastResults.length > 0 ? successes / pastResults.length : undefined;
      }
    } catch {
      // Memory unavailable — skip
    }

    recommendations.push({
      action: rule.action,
      description: rule.description,
      parameters: { ...rule.default_params },
      expected_impact: rule.expected_impact,
      reversible: rule.reversible,
      past_success_rate: pastSuccessRate,
    });
  }

  // If no rules matched, suggest a safe default (A/B test)
  if (recommendations.length === 0 && rootCause.confidence < 0.7) {
    recommendations.push({
      action: 'launch_ab_test',
      description: 'Low confidence in root cause — run A/B test to validate hypothesis',
      parameters: { test_duration_hours: 48, traffic_split: 0.5 },
      expected_impact: 'Gather data to confirm or refute hypothesis',
      reversible: true,
    });
  }

  return recommendations;
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'ActionPlannerAgent',
  category: 'operations',
  description: 'Maps root causes to safe executable actions from an allowlist',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    return {
      agent_name: 'ActionPlannerAgent',
      campaigns_processed: 0,
      actions_taken: [],
      errors: [],
      duration_ms: Date.now() - start,
    };
  },
});
