// ─── Prompt Optimization Agent ───────────────────────────────────────────────
// Finds low-confidence outputs and repeated failures. Uses LLM to propose
// improved prompts. Proposals are stored (NOT applied directly).

import AgentPerformanceMetric from '../../models/AgentPerformanceMetric';
import { getVectorMemory } from '../memory/vectorMemory';
import { registerAgent } from '../agents/agentRegistry';
import { Op } from 'sequelize';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PromptProposal {
  agent_name: string;
  issue: string;
  current_behavior: string;
  proposed_change: string;
  expected_improvement: string;
  status: 'proposed' | 'testing' | 'adopted' | 'rejected';
}

export interface PromptOptimizationReport {
  proposals: PromptProposal[];
  agents_analyzed: number;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Analyze agent outputs for prompt optimization opportunities.
 */
export async function analyzePromptQuality(): Promise<PromptOptimizationReport> {
  const proposals: PromptProposal[] = [];

  // Find agents with low success rates or low confidence
  const recentMetrics = await AgentPerformanceMetric.findAll({
    where: {
      period_end: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      execution_count: { [Op.gte]: 3 },
    },
    order: [['success_rate', 'ASC']],
    limit: 20,
  }).catch(() => []);

  const analyzed = new Set<string>();

  for (const metric of recentMetrics) {
    const agentName = metric.get('agent_name') as string;
    if (analyzed.has(agentName)) continue;
    analyzed.add(agentName);

    const successRate = metric.get('success_rate') as number || 0;
    const avgConfidence = metric.get('avg_confidence') as number | null;
    const failureCount = metric.get('failure_count') as number || 0;
    const executionCount = metric.get('execution_count') as number || 0;

    // Low success rate
    if (successRate < 0.7 && executionCount >= 5) {
      proposals.push({
        agent_name: agentName,
        issue: `Low success rate: ${Math.round(successRate * 100)}% (${failureCount} failures in ${executionCount} runs)`,
        current_behavior: `Agent fails ${Math.round((1 - successRate) * 100)}% of the time`,
        proposed_change: 'Review error patterns and add defensive checks or retry logic',
        expected_improvement: 'Reduce failure rate by 30-50%',
        status: 'proposed',
      });
    }

    // Low confidence outputs
    if (avgConfidence !== null && avgConfidence < 0.5) {
      proposals.push({
        agent_name: agentName,
        issue: `Low confidence outputs: avg ${Math.round(avgConfidence * 100)}%`,
        current_behavior: 'Agent produces uncertain results that may not be actionable',
        proposed_change: 'Narrow scope or add more context to agent inputs',
        expected_improvement: 'Increase average confidence to >70%',
        status: 'proposed',
      });
    }
  }

  // Check for repeated failure patterns in vector memory
  try {
    const memory = getVectorMemory();
    const failurePatterns = await memory.search('repeated failure pattern', 'investigation', 5);

    for (const pattern of failurePatterns) {
      if (pattern.similarity && pattern.similarity > 0.7) {
        const agentName = pattern.metadata?.agent_name as string;
        if (agentName && !analyzed.has(agentName)) {
          proposals.push({
            agent_name: agentName,
            issue: `Recurring failure pattern: ${pattern.content.slice(0, 100)}`,
            current_behavior: 'Same failure repeating across executions',
            proposed_change: 'Address root cause of recurring failure',
            expected_improvement: 'Eliminate recurring failure pattern',
            status: 'proposed',
          });
        }
      }
    }
  } catch {
    // Memory search may fail
  }

  // Store proposals in vector memory for tracking
  if (proposals.length > 0) {
    try {
      const memory = getVectorMemory();
      await memory.store('experiment', `Prompt optimization proposals: ${proposals.map((p) => `${p.agent_name}: ${p.issue}`).join('; ')}`, {
        type: 'prompt_proposals',
        count: proposals.length,
        agents: proposals.map((p) => p.agent_name),
      });
    } catch {
      // Non-critical
    }
  }

  return {
    proposals,
    agents_analyzed: analyzed.size,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'PromptOptimizationAgent',
  category: 'meta',
  description: 'Detect weak reasoning patterns and propose prompt improvements',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const report = await analyzePromptQuality();
      return {
        agent_name: 'PromptOptimizationAgent',
        campaigns_processed: 0,
        entities_processed: report.agents_analyzed,
        actions_taken: report.proposals.map((p) => ({
          campaign_id: 'system',
          action: 'prompt_proposal',
          reason: `${p.agent_name}: ${p.issue}`,
          confidence: 0.6,
          before_state: null,
          after_state: { proposed_change: p.proposed_change, expected: p.expected_improvement } as any,
          result: 'success' as const,
          entity_type: 'system' as const,
        })),
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'PromptOptimizationAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
