/**
 * Strategy Templates — predefined system archetypes that influence initial
 * priorities and recommended execution paths. Applied as priority bonuses
 * in the execution engine without changing the base template conditions.
 */
import { ProfileName } from './executionProfiles';

export type StrategyName = 'saas' | 'internal_tool' | 'marketplace' | 'api_platform' | 'default';

export interface StrategyTemplate {
  name: StrategyName;
  label: string;
  description: string;
  /** Priority bonuses per step_key (+/- added to base template priority) */
  priority_overrides: Record<string, number>;
  /** Recommended execution profile for this strategy */
  recommended_profile: ProfileName;
  /** Steps to highlight in the UI as initial focus */
  initial_focus: string[];
}

export const STRATEGIES: Record<StrategyName, StrategyTemplate> = {
  saas: {
    name: 'saas',
    label: 'SaaS Application',
    description: 'Multi-tenant, user-facing product — UX and observability matter most',
    priority_overrides: {
      add_frontend: 20,
      add_monitoring: 15,
      optimize_performance: 10,
      add_agents: -5,
    },
    recommended_profile: 'production',
    initial_focus: ['build_backend', 'add_frontend', 'add_monitoring'],
  },

  internal_tool: {
    name: 'internal_tool',
    label: 'Internal Tool',
    description: 'Employee-facing business tool — automation and reliability over UX polish',
    priority_overrides: {
      add_agents: 15,
      improve_reliability: 10,
      add_frontend: -10,
      optimize_performance: -5,
    },
    recommended_profile: 'mvp',
    initial_focus: ['build_backend', 'add_database', 'add_agents'],
  },

  marketplace: {
    name: 'marketplace',
    label: 'Marketplace / Platform',
    description: 'Two-sided platform — frontend, search, and performance are critical',
    priority_overrides: {
      add_frontend: 20,
      optimize_performance: 15,
      add_monitoring: 10,
      implement_requirements: 5,
    },
    recommended_profile: 'production',
    initial_focus: ['build_backend', 'add_frontend', 'optimize_performance'],
  },

  api_platform: {
    name: 'api_platform',
    label: 'API Platform',
    description: 'Developer-facing API — backend reliability and documentation over UI',
    priority_overrides: {
      build_backend: 15,
      improve_reliability: 20,
      add_monitoring: 15,
      add_frontend: -20,
      add_agents: -10,
    },
    recommended_profile: 'production',
    initial_focus: ['build_backend', 'add_database', 'improve_reliability'],
  },

  default: {
    name: 'default',
    label: 'General Purpose',
    description: 'Balanced approach — no priority overrides',
    priority_overrides: {},
    recommended_profile: 'production',
    initial_focus: ['build_backend', 'implement_requirements'],
  },
};

export function getStrategy(name?: string): StrategyTemplate {
  if (name && name in STRATEGIES) return STRATEGIES[name as StrategyName];
  return STRATEGIES.default;
}
