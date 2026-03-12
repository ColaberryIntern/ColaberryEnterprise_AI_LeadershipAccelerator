// ─── Intelligence Agent Registry ──────────────────────────────────────────
// Typed in-memory registry mapping agent names to executor functions.
// Agents are registered at module load time; the registry is queried by
// the Planner Agent, Autonomous Engine, and AI COO to dispatch work.

import type { AgentExecutionResult } from '../../services/agents/types';

export type AgentCategory = 'intelligence' | 'operations' | 'strategy' | 'memory' | 'meta' | 'reporting';

export interface IntelligenceAgentEntry {
  name: string;
  category: AgentCategory;
  executor: (agentId: string, config: Record<string, any>) => Promise<AgentExecutionResult>;
  description: string;
}

const INTELLIGENCE_AGENTS = new Map<string, IntelligenceAgentEntry>();

/**
 * Register an intelligence agent in the in-memory registry.
 */
export function registerAgent(agent: IntelligenceAgentEntry): void {
  INTELLIGENCE_AGENTS.set(agent.name, agent);
}

/**
 * Look up a registered agent by name.
 */
export function getAgent(name: string): IntelligenceAgentEntry | undefined {
  return INTELLIGENCE_AGENTS.get(name);
}

/**
 * Return all agents in a given category.
 */
export function getAgentsByCategory(category: AgentCategory): IntelligenceAgentEntry[] {
  return Array.from(INTELLIGENCE_AGENTS.values()).filter((a) => a.category === category);
}

/**
 * Return every registered agent.
 */
export function listAllAgents(): IntelligenceAgentEntry[] {
  return Array.from(INTELLIGENCE_AGENTS.values());
}

/**
 * Check whether an agent is registered.
 */
export function hasAgent(name: string): boolean {
  return INTELLIGENCE_AGENTS.has(name);
}

/**
 * Return a count of registered agents, optionally filtered by category.
 */
export function agentCount(category?: AgentCategory): number {
  if (!category) return INTELLIGENCE_AGENTS.size;
  return getAgentsByCategory(category).length;
}

// ─── Lazy Registration ─────────────────────────────────────────────────────
// Intelligence-layer wrapper agents around existing assistant pipeline steps.
// These are thin shims that allow the Planner to reference pipeline steps
// uniformly through the registry. The actual logic lives in assistant/*.ts.

import { classifyIntent } from '../assistant/intentClassifier';
import { executeSQLQueries } from '../assistant/sqlExecutor';
import { executeML } from '../assistant/mlExecutor';
import { executeVectorSearch } from '../assistant/vectorExecutor';
import { buildContext } from '../assistant/contextBuilder';
import { selectVisualizations } from '../assistant/chartSelector';
import { generateFollowups } from '../assistant/followupGenerator';

function wrapPipelineStep(
  name: string,
  description: string,
  fn: () => Promise<any>,
): IntelligenceAgentEntry {
  return {
    name,
    category: 'intelligence',
    description,
    executor: async (_agentId, _config) => {
      const start = Date.now();
      try {
        await fn();
        return { agent_name: name, campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: Date.now() - start };
      } catch (err: any) {
        return { agent_name: name, campaigns_processed: 0, actions_taken: [], errors: [err.message], duration_ms: Date.now() - start };
      }
    },
  };
}

// Register intelligence pipeline wrappers
// These are thin shims — the actual logic is invoked by the assistant pipeline.
// The lambdas use stub args; wrapPipelineStep swallows errors gracefully.
registerAgent(wrapPipelineStep('IntentAgent', 'Classify user intent from natural language', () => classifyIntent('', undefined)));
registerAgent(wrapPipelineStep('SQLAgent', 'Execute SQL queries against business tables', () => executeSQLQueries(null as any, null as any, '', undefined)));
registerAgent(wrapPipelineStep('MLAgent', 'Invoke ML models for anomaly/forecast/risk', () => executeML([], undefined)));
registerAgent(wrapPipelineStep('VectorSearchAgent', 'Semantic vector search via Python proxy', () => executeVectorSearch([], '', undefined)));
registerAgent(wrapPipelineStep('InsightAgent', 'Build structured context and extract insights', () => Promise.resolve(buildContext(null as any, [], [], [], '', undefined))));
registerAgent(wrapPipelineStep('VisualizationAgent', 'Select chart types for data visualization', () => Promise.resolve(selectVisualizations(null as any, [], [], []))));
registerAgent(wrapPipelineStep('NarrativeAgent', 'Generate narrative from analysis context', () => generateFollowups(null as any, '', undefined, '')));
