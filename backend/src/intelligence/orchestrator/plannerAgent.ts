// ─── Planner Agent ────────────────────────────────────────────────────────
// Interprets a user question or detected problem and creates a multi-agent
// execution plan. Determines which specialist agents must run, in what order,
// and whether results need Critic validation.

import { classifyIntent, Intent } from '../assistant/intentClassifier';
import { hasAgent } from '../agents/agentRegistry';

// ─── Types ───────────────────────────────────────────────────────────────

export interface AgentStep {
  agent: string;
  inputs: Record<string, any>;
  /** Steps that must complete before this one. Empty = can run in parallel. */
  depends_on?: string[];
}

export interface ExecutionPlan {
  steps: AgentStep[];
  intent: Intent;
  estimated_complexity: 'simple' | 'moderate' | 'complex';
  requires_critic: boolean;
}

// ─── Intent → Agent Mapping ──────────────────────────────────────────────

const INTENT_AGENTS: Record<string, string[]> = {
  campaign_analysis: ['SQLAgent', 'InsightAgent', 'VisualizationAgent'],
  lead_analysis: ['SQLAgent', 'InsightAgent', 'VisualizationAgent'],
  student_analysis: ['SQLAgent', 'InsightAgent', 'VisualizationAgent'],
  agent_analysis: ['SQLAgent', 'InsightAgent', 'VisualizationAgent'],
  anomaly_detection: ['SQLAgent', 'MLAgent', 'InsightAgent', 'VisualizationAgent'],
  forecast_request: ['SQLAgent', 'MLAgent', 'InsightAgent', 'VisualizationAgent'],
  comparison: ['SQLAgent', 'InsightAgent', 'VisualizationAgent'],
  root_cause_analysis: ['SQLAgent', 'MLAgent', 'VectorSearchAgent', 'InsightAgent', 'VisualizationAgent'],
  text_search: ['VectorSearchAgent', 'InsightAgent'],
  general_insight: ['SQLAgent', 'InsightAgent', 'VisualizationAgent'],
};

// Intents that benefit from Critic validation
const CRITIC_INTENTS = new Set<string>([
  'anomaly_detection',
  'forecast_request',
  'root_cause_analysis',
]);

// ─── Plan Builder ────────────────────────────────────────────────────────

/**
 * Create a multi-agent execution plan for the given question.
 */
export async function createPlan(
  question: string,
  entityType?: string,
  context?: { knowledgeGraph?: boolean; vectorMemory?: boolean },
): Promise<ExecutionPlan> {
  // Step 1: Classify intent
  const { intent, confidence } = await classifyIntent(question, entityType);

  // Step 2: Determine which agents to invoke
  const agentNames = INTENT_AGENTS[intent] || INTENT_AGENTS.general_insight;
  const validAgents = agentNames.filter((name) => hasAgent(name));

  // Step 3: Optionally add memory/knowledge agents
  if (context?.vectorMemory && hasAgent('VectorSearchAgent') && !validAgents.includes('VectorSearchAgent')) {
    validAgents.unshift('VectorSearchAgent');
  }

  // Step 4: Build dependency graph
  const steps: AgentStep[] = [];
  const dataAgents: string[] = []; // agents that produce raw data (SQL, ML, Vector)

  for (const name of validAgents) {
    if (['SQLAgent', 'MLAgent', 'VectorSearchAgent'].includes(name)) {
      // Data agents run in parallel (no dependencies)
      steps.push({ agent: name, inputs: { question, entity_type: entityType } });
      dataAgents.push(name);
    } else if (name === 'InsightAgent') {
      // Insight depends on all data agents
      steps.push({ agent: name, inputs: { question }, depends_on: [...dataAgents] });
    } else if (name === 'VisualizationAgent') {
      // Visualization depends on Insight
      steps.push({ agent: name, inputs: {}, depends_on: ['InsightAgent'] });
    } else {
      steps.push({ agent: name, inputs: { question } });
    }
  }

  // Always add NarrativeAgent at the end
  if (hasAgent('NarrativeAgent') && !validAgents.includes('NarrativeAgent')) {
    steps.push({
      agent: 'NarrativeAgent',
      inputs: { question },
      depends_on: ['InsightAgent'],
    });
  }

  // Step 5: Determine complexity
  const complexity = steps.length <= 3
    ? 'simple'
    : steps.length <= 5
      ? 'moderate'
      : 'complex';

  // Step 6: Determine if Critic is needed
  const requiresCritic = CRITIC_INTENTS.has(intent) || confidence < 0.7 || complexity === 'complex';

  return {
    steps,
    intent,
    estimated_complexity: complexity,
    requires_critic: requiresCritic,
  };
}
