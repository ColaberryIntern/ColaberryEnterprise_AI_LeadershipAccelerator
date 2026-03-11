// ─── Growth Experiment Agent ─────────────────────────────────────────────────
// Proposes A/B tests from uncertain recommendations. Tracks experiment
// lifecycle: proposed → running → concluded.

import IntelligenceDecision from '../../models/IntelligenceDecision';
import { getVectorMemory } from '../memory/vectorMemory';
import { registerAgent } from './agentRegistry';
import { Op } from 'sequelize';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExperimentProposal {
  hypothesis: string;
  control: string;
  variant: string;
  metric: string;
  duration_hours: number;
  traffic_split: number;
  source_decision_id?: string;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Generate experiment proposals from uncertain decisions.
 */
export async function proposeGrowthExperiments(): Promise<ExperimentProposal[]> {
  const proposals: ExperimentProposal[] = [];

  // Find proposed decisions with moderate confidence that could benefit from testing
  try {
    const uncertainDecisions = await IntelligenceDecision.findAll({
      where: {
        execution_status: 'proposed',
        confidence_score: { [Op.between]: [40, 70] },
      },
      order: [['timestamp', 'DESC']],
      limit: 5,
    });

    for (const decision of uncertainDecisions) {
      const action = decision.get('recommended_action') as string;
      const problem = decision.get('problem_detected') as string;
      const impact = decision.get('impact_estimate') as Record<string, any> | null;

      proposals.push({
        hypothesis: `${action} will improve ${impact?.metric || 'target metric'} for: ${problem}`,
        control: 'Current configuration (no change)',
        variant: `Apply ${action}`,
        metric: impact?.metric || 'conversion_rate',
        duration_hours: 48,
        traffic_split: 0.5,
        source_decision_id: decision.get('decision_id') as string,
      });
    }
  } catch {
    // Decision table may not exist yet
  }

  // Also check vector memory for recurring issues without clear solutions
  try {
    const memory = getVectorMemory();
    const recurringIssues = await memory.search('recurring problem no clear solution', 'investigation', 3);

    for (const issue of recurringIssues) {
      if (issue.similarity && issue.similarity > 0.5) {
        proposals.push({
          hypothesis: `Testing alternative approach for: ${issue.content.slice(0, 100)}`,
          control: 'Current approach',
          variant: 'Alternative approach based on similar case analysis',
          metric: 'error_rate',
          duration_hours: 72,
          traffic_split: 0.3,
        });
      }
    }
  } catch {
    // Memory search may fail
  }

  return proposals;
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'GrowthExperimentAgent',
  category: 'strategy',
  description: 'Propose A/B tests from uncertain recommendations',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const proposals = await proposeGrowthExperiments();
      return {
        agent_name: 'GrowthExperimentAgent',
        campaigns_processed: 0,
        entities_processed: proposals.length,
        actions_taken: proposals.map((p) => ({
          campaign_id: p.source_decision_id || 'system',
          action: 'propose_experiment',
          reason: p.hypothesis,
          confidence: 0.6,
          before_state: null,
          after_state: p as any,
          result: 'success' as const,
          entity_type: 'system' as const,
        })),
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'GrowthExperimentAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
