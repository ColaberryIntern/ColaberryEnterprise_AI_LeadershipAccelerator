/**
 * Golden Path Library — predefined execution sequences built from the 10 action
 * templates. Selected based on maturity level and strategy. Provides estimated
 * timings and parallelization opportunities.
 */
import { StrategyName } from '../profiles/strategyTemplates';

export interface GoldenPathStep {
  key: string;
  prompt_target: string;
  estimated_minutes: number;
  can_parallelize_with: string[];
  prerequisite_steps: string[];
}

export interface GoldenPath {
  id: string;
  name: string;
  description: string;
  steps: GoldenPathStep[];
  applicability: {
    min_maturity: number;
    max_maturity: number;
    required_layers: string[];
    strategy_affinity: StrategyName[];
  };
  version: string;
  estimated_total_minutes: number;
}

export const GOLDEN_PATHS: GoldenPath[] = [
  {
    id: 'gp_greenfield',
    name: 'Greenfield Build',
    description: 'New process from scratch — build all layers sequentially, then implement requirements',
    steps: [
      { key: 'build_backend', prompt_target: 'backend_improvement', estimated_minutes: 30, can_parallelize_with: [], prerequisite_steps: [] },
      { key: 'add_database', prompt_target: 'add_database', estimated_minutes: 20, can_parallelize_with: ['add_frontend', 'add_agents'], prerequisite_steps: ['build_backend'] },
      { key: 'add_frontend', prompt_target: 'frontend_exposure', estimated_minutes: 25, can_parallelize_with: ['add_database', 'add_agents'], prerequisite_steps: ['build_backend'] },
      { key: 'add_agents', prompt_target: 'agent_enhancement', estimated_minutes: 20, can_parallelize_with: ['add_database', 'add_frontend'], prerequisite_steps: ['build_backend'] },
      { key: 'implement_requirements', prompt_target: 'requirement_implementation', estimated_minutes: 40, can_parallelize_with: [], prerequisite_steps: ['build_backend'] },
      { key: 'verify_requirements', prompt_target: 'verify_requirements', estimated_minutes: 20, can_parallelize_with: [], prerequisite_steps: ['implement_requirements'] },
      { key: 'optimize_performance', prompt_target: 'optimize_performance', estimated_minutes: 20, can_parallelize_with: [], prerequisite_steps: ['implement_requirements'] },
    ],
    applicability: {
      min_maturity: 0, max_maturity: 0,
      required_layers: [],
      strategy_affinity: ['saas', 'internal_tool', 'marketplace', 'api_platform', 'default'],
    },
    version: '1.0.0',
    estimated_total_minutes: 175,
  },
  {
    id: 'gp_extend',
    name: 'Extend Existing System',
    description: 'Project has infrastructure — focus on requirement coverage and quality',
    steps: [
      { key: 'implement_requirements', prompt_target: 'requirement_implementation', estimated_minutes: 40, can_parallelize_with: [], prerequisite_steps: [] },
      { key: 'verify_requirements', prompt_target: 'verify_requirements', estimated_minutes: 20, can_parallelize_with: ['improve_reliability'], prerequisite_steps: ['implement_requirements'] },
      { key: 'improve_reliability', prompt_target: 'improve_reliability', estimated_minutes: 25, can_parallelize_with: ['verify_requirements', 'add_monitoring'], prerequisite_steps: [] },
      { key: 'add_monitoring', prompt_target: 'monitoring_gap', estimated_minutes: 20, can_parallelize_with: ['improve_reliability'], prerequisite_steps: [] },
      { key: 'optimize_performance', prompt_target: 'optimize_performance', estimated_minutes: 20, can_parallelize_with: [], prerequisite_steps: ['implement_requirements'] },
    ],
    applicability: {
      min_maturity: 1, max_maturity: 3,
      required_layers: ['backend'],
      strategy_affinity: ['saas', 'internal_tool', 'marketplace', 'api_platform', 'default'],
    },
    version: '1.0.0',
    estimated_total_minutes: 125,
  },
  {
    id: 'gp_polish',
    name: 'Polish & Harden',
    description: 'System is mostly built — focus on quality, agents, and production readiness',
    steps: [
      { key: 'enhance_agents', prompt_target: 'agent_enhancement', estimated_minutes: 25, can_parallelize_with: ['add_monitoring'], prerequisite_steps: [] },
      { key: 'add_monitoring', prompt_target: 'monitoring_gap', estimated_minutes: 20, can_parallelize_with: ['enhance_agents'], prerequisite_steps: [] },
      { key: 'improve_reliability', prompt_target: 'improve_reliability', estimated_minutes: 25, can_parallelize_with: [], prerequisite_steps: [] },
      { key: 'optimize_performance', prompt_target: 'optimize_performance', estimated_minutes: 20, can_parallelize_with: [], prerequisite_steps: ['improve_reliability'] },
    ],
    applicability: {
      min_maturity: 3, max_maturity: 5,
      required_layers: ['backend', 'frontend'],
      strategy_affinity: ['saas', 'internal_tool', 'marketplace', 'api_platform', 'default'],
    },
    version: '1.0.0',
    estimated_total_minutes: 90,
  },
  {
    id: 'gp_api_first',
    name: 'API-First Build',
    description: 'Backend and reliability focus — skip frontend, emphasize API quality',
    steps: [
      { key: 'build_backend', prompt_target: 'backend_improvement', estimated_minutes: 30, can_parallelize_with: [], prerequisite_steps: [] },
      { key: 'add_database', prompt_target: 'add_database', estimated_minutes: 20, can_parallelize_with: [], prerequisite_steps: ['build_backend'] },
      { key: 'implement_requirements', prompt_target: 'requirement_implementation', estimated_minutes: 40, can_parallelize_with: [], prerequisite_steps: ['build_backend'] },
      { key: 'improve_reliability', prompt_target: 'improve_reliability', estimated_minutes: 25, can_parallelize_with: ['add_monitoring'], prerequisite_steps: ['build_backend'] },
      { key: 'add_monitoring', prompt_target: 'monitoring_gap', estimated_minutes: 20, can_parallelize_with: ['improve_reliability'], prerequisite_steps: ['build_backend'] },
    ],
    applicability: {
      min_maturity: 0, max_maturity: 2,
      required_layers: [],
      strategy_affinity: ['api_platform'],
    },
    version: '1.0.0',
    estimated_total_minutes: 135,
  },
];

/**
 * Select the best golden path based on current system state and strategy.
 * Returns null if no path matches.
 */
export function selectGoldenPath(
  maturityLevel: number,
  hasLayers: { backend: boolean; frontend: boolean },
  strategy?: StrategyName
): GoldenPath | null {
  const candidates = GOLDEN_PATHS.filter(p => {
    if (maturityLevel < p.applicability.min_maturity) return false;
    if (maturityLevel > p.applicability.max_maturity) return false;
    // Check required layers
    for (const layer of p.applicability.required_layers) {
      if (layer === 'backend' && !hasLayers.backend) return false;
      if (layer === 'frontend' && !hasLayers.frontend) return false;
    }
    // Strategy affinity (if specified)
    if (strategy && !p.applicability.strategy_affinity.includes(strategy)) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Prefer strategy-specific paths, then most specific maturity match
  candidates.sort((a, b) => {
    const aSpecific = strategy && a.applicability.strategy_affinity.length < 5 ? 1 : 0;
    const bSpecific = strategy && b.applicability.strategy_affinity.length < 5 ? 1 : 0;
    if (aSpecific !== bSpecific) return bSpecific - aSpecific;
    // Prefer tighter maturity range
    const aRange = a.applicability.max_maturity - a.applicability.min_maturity;
    const bRange = b.applicability.max_maturity - b.applicability.min_maturity;
    return aRange - bRange;
  });

  return candidates[0];
}
