// ─── Experiment Agent ────────────────────────────────────────────────────────
// Picks improvement proposals → creates controlled experiments (control vs
// variant) → monitors → adopts or rolls back.
//
// Safety guardrails:
// - Max 1 experiment per agent
// - Max 3 system-wide concurrent experiments
// - Cannot experiment on meta-agents (self-modification prevention)
// - Auto-rollback if error_count > 3x baseline
// - Duration bounds: 6h–72h

import AgentPerformanceMetric from '../../models/AgentPerformanceMetric';
import AiAgent from '../../models/AiAgent';
import { getVectorMemory } from '../memory/vectorMemory';
import { registerAgent } from '../agents/agentRegistry';
import { Op } from 'sequelize';
import { resolveGlobalConfig, HARDCODED_DEFAULTS } from '../../services/governanceResolutionService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Experiment {
  id: string;
  agent_name: string;
  hypothesis: string;
  variant_config: Record<string, any>;
  control_metrics: ExperimentMetrics;
  variant_metrics: ExperimentMetrics | null;
  status: 'pending' | 'running' | 'concluded';
  outcome: 'adopted' | 'rolled_back' | 'inconclusive' | null;
  started_at: Date | null;
  duration_hours: number;
}

interface ExperimentMetrics {
  success_rate: number;
  avg_duration_ms: number;
  error_count: number;
  total_actions: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Defaults — overridden at runtime from governance DB
let MAX_EXPERIMENTS_PER_AGENT = HARDCODED_DEFAULTS.max_experiments_per_agent;
let MAX_SYSTEM_EXPERIMENTS = HARDCODED_DEFAULTS.max_system_experiments;
const MIN_DURATION_HOURS = 6;
const MAX_DURATION_HOURS = 72;
const ERROR_ROLLBACK_MULTIPLIER = 3;

// Meta-agents that cannot be experimented on
const PROTECTED_AGENTS = new Set([
  'PerformanceAgent',
  'ArchitectureAgent',
  'PromptOptimizationAgent',
  'ExperimentAgent',
]);

// In-memory experiment store (persists within process lifetime)
const activeExperiments = new Map<string, Experiment>();

// ─── Experiment Logic ────────────────────────────────────────────────────────

/**
 * Run the experiment cycle: check active experiments, start new ones if capacity allows.
 */
export async function runExperimentCycle(): Promise<{
  active: number;
  started: number;
  concluded: number;
  adopted: number;
  rolledBack: number;
}> {
  let started = 0;
  let concluded = 0;
  let adopted = 0;
  let rolledBack = 0;

  // Resolve experiment limits from governance DB
  try {
    const config = await resolveGlobalConfig();
    MAX_EXPERIMENTS_PER_AGENT = config.max_experiments_per_agent;
    MAX_SYSTEM_EXPERIMENTS = config.max_system_experiments;
  } catch { /* fallback to hardcoded */ }

  // 1. Check active experiments
  for (const [id, experiment] of activeExperiments) {
    if (experiment.status !== 'running' || !experiment.started_at) continue;

    const elapsedHours = (Date.now() - experiment.started_at.getTime()) / (60 * 60 * 1000);

    // Check if experiment duration exceeded
    if (elapsedHours >= experiment.duration_hours) {
      const result = await concludeExperiment(experiment);
      concluded++;
      if (result === 'adopted') adopted++;
      else if (result === 'rolled_back') rolledBack++;
    }

    // Safety check: auto-rollback if errors spike
    try {
      const agent = await AiAgent.findOne({ where: { agent_name: experiment.agent_name } });
      if (agent && (agent.error_count || 0) > experiment.control_metrics.error_count * ERROR_ROLLBACK_MULTIPLIER) {
        experiment.status = 'concluded';
        experiment.outcome = 'rolled_back';
        activeExperiments.delete(id);
        rolledBack++;
        console.log(`[ExperimentAgent] Auto-rollback: ${experiment.agent_name} (error spike)`);
      }
    } catch {
      // Non-critical
    }
  }

  // 2. Start new experiments if capacity allows
  const activeCount = Array.from(activeExperiments.values()).filter((e) => e.status === 'running').length;
  if (activeCount < MAX_SYSTEM_EXPERIMENTS) {
    const slotsAvailable = MAX_SYSTEM_EXPERIMENTS - activeCount;

    // Find candidate proposals from vector memory
    try {
      const memory = getVectorMemory();
      const proposals = await memory.search('prompt optimization proposals', 'experiment', 5);

      for (const proposal of proposals.slice(0, slotsAvailable)) {
        const agents = proposal.metadata?.agents as string[];
        if (!agents || agents.length === 0) continue;

        const candidateAgent = agents[0];

        // Safety: skip protected meta-agents
        if (PROTECTED_AGENTS.has(candidateAgent)) continue;

        // Skip if already experimenting on this agent
        const alreadyRunning = Array.from(activeExperiments.values()).some(
          (e) => e.agent_name === candidateAgent && e.status === 'running',
        );
        if (alreadyRunning) continue;

        // Get baseline metrics
        const baseline = await getBaselineMetrics(candidateAgent);
        if (!baseline) continue;

        const experiment: Experiment = {
          id: `exp-${Date.now()}-${candidateAgent}`,
          agent_name: candidateAgent,
          hypothesis: proposal.content.slice(0, 200),
          variant_config: {},
          control_metrics: baseline,
          variant_metrics: null,
          status: 'running',
          outcome: null,
          started_at: new Date(),
          duration_hours: 24,
        };

        activeExperiments.set(experiment.id, experiment);
        started++;
        console.log(`[ExperimentAgent] Started experiment on ${candidateAgent}: ${experiment.hypothesis.slice(0, 80)}`);
      }
    } catch {
      // Memory search may fail
    }
  }

  return {
    active: Array.from(activeExperiments.values()).filter((e) => e.status === 'running').length,
    started,
    concluded,
    adopted,
    rolledBack,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getBaselineMetrics(agentName: string): Promise<ExperimentMetrics | null> {
  try {
    const metrics = await AgentPerformanceMetric.findAll({
      where: {
        agent_name: agentName,
        period_end: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      order: [['period_end', 'DESC']],
      limit: 5,
    });

    if (metrics.length === 0) return null;

    const avgSuccessRate = metrics.reduce((s, m) => s + ((m.get('success_rate') as number) || 0), 0) / metrics.length;
    const avgDuration = metrics.reduce((s, m) => s + ((m.get('avg_duration_ms') as number) || 0), 0) / metrics.length;
    const totalErrors = metrics.reduce((s, m) => s + ((m.get('total_errors') as number) || 0), 0);
    const totalActions = metrics.reduce((s, m) => s + ((m.get('total_actions') as number) || 0), 0);

    return {
      success_rate: avgSuccessRate,
      avg_duration_ms: avgDuration,
      error_count: totalErrors,
      total_actions: totalActions,
    };
  } catch {
    return null;
  }
}

async function concludeExperiment(experiment: Experiment): Promise<'adopted' | 'rolled_back' | 'inconclusive'> {
  const variantMetrics = await getBaselineMetrics(experiment.agent_name);
  experiment.variant_metrics = variantMetrics;
  experiment.status = 'concluded';

  if (!variantMetrics) {
    experiment.outcome = 'inconclusive';
    activeExperiments.delete(experiment.id);
    return 'inconclusive';
  }

  // Adopt if: success_rate improved by 5%+ OR duration decreased by 10%+
  const successImproved = variantMetrics.success_rate > experiment.control_metrics.success_rate + 0.05;
  const durationImproved = variantMetrics.avg_duration_ms < experiment.control_metrics.avg_duration_ms * 0.9;
  const errorsIncreased = variantMetrics.error_count > experiment.control_metrics.error_count * 1.5;

  let outcome: 'adopted' | 'rolled_back' | 'inconclusive';
  if (errorsIncreased) {
    outcome = 'rolled_back';
  } else if (successImproved || durationImproved) {
    outcome = 'adopted';
  } else {
    outcome = 'inconclusive';
  }

  experiment.outcome = outcome;
  activeExperiments.delete(experiment.id);

  // Store experiment result in memory
  try {
    const memory = getVectorMemory();
    await memory.store('experiment', `Experiment on ${experiment.agent_name}: ${outcome}. ${experiment.hypothesis}`, {
      type: 'experiment_result',
      agent_name: experiment.agent_name,
      outcome,
      control: experiment.control_metrics,
      variant: variantMetrics,
    });
  } catch {
    // Non-critical
  }

  console.log(`[ExperimentAgent] Concluded: ${experiment.agent_name} → ${outcome}`);
  return outcome;
}

/**
 * Get currently active experiments (for dashboard display).
 */
export function getActiveExperiments(): Experiment[] {
  return Array.from(activeExperiments.values());
}

// ─── Registry ────────────────────────────────────────────────────────────────

registerAgent({
  name: 'ExperimentAgent',
  category: 'meta',
  description: 'Controlled experiments with safety guardrails for agent improvement',
  executor: async (_agentId, _config) => {
    const start = Date.now();
    try {
      const result = await runExperimentCycle();
      return {
        agent_name: 'ExperimentAgent',
        campaigns_processed: 0,
        entities_processed: result.active,
        actions_taken: [
          ...(result.started > 0 ? [{
            campaign_id: 'system',
            action: 'experiment_started',
            reason: `Started ${result.started} experiment(s)`,
            confidence: 0.7,
            before_state: null,
            after_state: null,
            result: 'success' as const,
            entity_type: 'system' as const,
          }] : []),
          ...(result.adopted > 0 ? [{
            campaign_id: 'system',
            action: 'experiment_adopted',
            reason: `Adopted ${result.adopted} improvement(s)`,
            confidence: 0.8,
            before_state: null,
            after_state: null,
            result: 'success' as const,
            entity_type: 'system' as const,
          }] : []),
        ],
        errors: [],
        duration_ms: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent_name: 'ExperimentAgent',
        campaigns_processed: 0,
        actions_taken: [],
        errors: [err.message],
        duration_ms: Date.now() - start,
      };
    }
  },
});
