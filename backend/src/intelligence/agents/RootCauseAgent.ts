// ─── Root Cause Agent ────────────────────────────────────────────────────────
// Investigates detected problems using activity logs, knowledge graph, vector
// memory, and optionally the Python ML proxy for root cause analysis.

import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import { getKnowledgeGraph } from '../knowledge/knowledgeGraph';
import { getVectorMemory } from '../memory/vectorMemory';
import { intelligenceProxy } from '../../services/intelligenceProxyService';
import { registerAgent } from './agentRegistry';
import type { DetectedProblem } from './ProblemDiscoveryAgent';
import { Op } from 'sequelize';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RootCauseResult {
  problem: DetectedProblem;
  root_causes: string[];
  related_entities: string[];
  similar_past_cases: Array<{ content: string; similarity: number }>;
  confidence: number; // 0-1
  reasoning: string;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/**
 * Investigate a detected problem and determine likely root causes.
 */
export async function investigateProblem(
  problem: DetectedProblem,
  traceId: string,
): Promise<RootCauseResult> {
  const rootCauses: string[] = [];
  const relatedEntities: string[] = [];
  let confidence = 0.5;

  // 1. Check activity logs for correlated events (last 48h)
  try {
    const recentLogs = await AiAgentActivityLog.findAll({
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        result: 'failed',
      },
      order: [['created_at', 'DESC']],
      limit: 20,
      attributes: ['agent_id', 'action', 'details', 'created_at'],
    });

    if (recentLogs.length > 0) {
      const failedActions = recentLogs.map((l) => l.get('action') as string);
      const uniqueActions = [...new Set(failedActions)];
      if (uniqueActions.length > 0) {
        rootCauses.push(`Correlated failures in last 48h: ${uniqueActions.slice(0, 3).join(', ')}`);
        confidence += 0.1;
      }
    }
  } catch {
    // Activity log table may not exist yet
  }

  // 2. Query knowledge graph for related entities
  try {
    const kg = await getKnowledgeGraph();
    const entityId = problem.entity_id || problem.entity_type || '';
    if (entityId) {
      const related = kg.getRelated(entityId, 2);
      for (const node of related.slice(0, 5)) {
        relatedEntities.push(`${node.type}:${node.label}`);
      }

      // Trace impact path
      const impact = kg.traceImpact(entityId);
      if (impact.affected.length > 0) {
        rootCauses.push(`Impact propagation path: ${impact.edges.map((e) => `${e.source}→${e.target}`).slice(0, 3).join(', ')}`);
        confidence += 0.05;
      }
    }
  } catch {
    // KG may not be built yet
  }

  // 3. Search vector memory for similar past cases
  const similarCases: Array<{ content: string; similarity: number }> = [];
  try {
    const memory = getVectorMemory();
    const results = await memory.search(problem.description, 'investigation', 5);
    for (const r of results) {
      if (r.similarity && r.similarity > 0.6) {
        similarCases.push({ content: r.content, similarity: r.similarity });
        confidence += 0.05;
      }
    }

    if (similarCases.length > 0) {
      rootCauses.push(`Similar past case found (${Math.round(similarCases[0].similarity * 100)}% match)`);
    }
  } catch {
    // Memory search may fail if proxy down
  }

  // 4. Try Python ML root cause (optional, best-effort)
  try {
    const response = await intelligenceProxy.getRootCause({
      problem_type: problem.type,
      metrics: problem.metrics,
    });
    if (response?.data?.root_causes) {
      rootCauses.push(...(response.data.root_causes as string[]).slice(0, 3));
      confidence += 0.15;
    }
  } catch {
    // Python proxy unavailable — continue with deterministic analysis
  }

  // 5. Apply deterministic rules based on problem type
  switch (problem.type) {
    case 'agent_failure':
      rootCauses.push('Check agent configuration and dependencies');
      if (problem.metrics?.error_count > 10) {
        rootCauses.push('Persistent failure pattern — may require code fix or dependency update');
      }
      break;
    case 'conversion_drop':
      rootCauses.push('Check campaign targeting and content quality');
      rootCauses.push('Review recent campaign configuration changes');
      break;
    case 'error_spike':
      rootCauses.push('Check system resource utilization and external service availability');
      break;
    case 'engagement_decline':
      rootCauses.push('Review content relevance and delivery timing');
      break;
  }

  // Clamp confidence
  confidence = Math.min(1, Math.max(0, confidence));

  const reasoning = [
    `Investigated: ${problem.description}`,
    `Found ${rootCauses.length} potential root cause(s)`,
    `${relatedEntities.length} related entities identified`,
    `${similarCases.length} similar past case(s) found`,
    `Confidence: ${Math.round(confidence * 100)}%`,
  ].join('. ');

  return {
    problem,
    root_causes: rootCauses,
    related_entities: relatedEntities,
    similar_past_cases: similarCases,
    confidence,
    reasoning,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'RootCauseAgent',
  category: 'operations',
  description: 'Root cause analysis via activity logs, knowledge graph, and vector memory',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    return {
      agent_name: 'RootCauseAgent',
      campaigns_processed: 0,
      actions_taken: [],
      errors: [],
      duration_ms: Date.now() - start,
    };
  },
});
