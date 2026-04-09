/**
 * Execution Profiles — control validation strictness, completion thresholds,
 * and allowed actions per deployment context. The 'production' profile matches
 * all current hardcoded defaults, so existing behavior is preserved.
 */
import { RegressionThresholds, DEFAULT_THRESHOLDS } from '../verification/verificationConfig';

export type ProfileName = 'mvp' | 'production' | 'enterprise' | 'autonomous';

export interface ExecutionProfile {
  name: ProfileName;
  label: string;
  description: string;
  completion_thresholds: {
    reqCoverage: number;
    qualityScore: number;
    requiredLayers: string[];
  };
  /** Maturity level required for mode completion (L2=MVP, L3=Production, L4=Enterprise, L5=Autonomous) */
  completion_maturity_threshold: number;
  /** Step keys allowed in this mode. null = all allowed. */
  allowed_action_keys: string[] | null;
  regression_thresholds: RegressionThresholds;
  quality_gate_enabled: boolean;
  quality_gate_coverage_min: number;
  structural_check_mode: 'skip' | 'warn' | 'block';
  max_parallel_steps: number;
}

export const PROFILES: Record<ProfileName, ExecutionProfile> = {
  mvp: {
    name: 'mvp',
    label: 'MVP Mode',
    description: 'Fast iteration — lower thresholds, skip structural checks, focus on getting it working',
    completion_thresholds: {
      reqCoverage: 60,
      qualityScore: 40,
      requiredLayers: ['backend'],
    },
    completion_maturity_threshold: 2, // L2 Functional
    allowed_action_keys: null,
    regression_thresholds: {
      ...DEFAULT_THRESHOLDS,
      reqCoverage_min_delta: -10,
      qualityScore_min_delta: -10,
    },
    quality_gate_enabled: false,
    quality_gate_coverage_min: 0,
    structural_check_mode: 'skip',
    max_parallel_steps: 3,
  },

  production: {
    name: 'production',
    label: 'Production Mode',
    description: 'Balanced — standard thresholds, warn on structural issues, quality gate enabled',
    completion_thresholds: {
      reqCoverage: 90,
      qualityScore: 70,
      requiredLayers: ['backend', 'frontend', 'models'],
    },
    completion_maturity_threshold: 3, // L3 Production
    allowed_action_keys: null,
    regression_thresholds: DEFAULT_THRESHOLDS,
    quality_gate_enabled: true,
    quality_gate_coverage_min: 10,
    structural_check_mode: 'warn',
    max_parallel_steps: 2,
  },

  enterprise: {
    name: 'enterprise',
    label: 'Enterprise Mode',
    description: 'Strict — high thresholds, block on structural issues, full verification required',
    completion_thresholds: {
      reqCoverage: 95,
      qualityScore: 85,
      requiredLayers: ['backend', 'frontend', 'models', 'agents'],
    },
    completion_maturity_threshold: 4, // L4 Autonomous
    allowed_action_keys: null,
    regression_thresholds: {
      ...DEFAULT_THRESHOLDS,
      reqCoverage_min_delta: -2,
      qualityScore_min_delta: -3,
      maturityLevel_min_delta: 0,
    },
    quality_gate_enabled: true,
    quality_gate_coverage_min: 15,
    structural_check_mode: 'block',
    max_parallel_steps: 1,
  },

  autonomous: {
    name: 'autonomous',
    label: 'Autonomous Mode',
    description: 'Full self-operation — all layers, high quality, agent-driven execution',
    completion_thresholds: {
      reqCoverage: 98,
      qualityScore: 90,
      requiredLayers: ['backend', 'frontend', 'models', 'agents'],
    },
    completion_maturity_threshold: 5, // L5 Self-Optimizing
    allowed_action_keys: null,
    regression_thresholds: {
      ...DEFAULT_THRESHOLDS,
      reqCoverage_min_delta: -1,
      qualityScore_min_delta: -2,
      maturityLevel_min_delta: 0,
    },
    quality_gate_enabled: true,
    quality_gate_coverage_min: 15,
    structural_check_mode: 'block',
    max_parallel_steps: 1,
  },
};

export function getProfile(name?: string): ExecutionProfile {
  if (name && name in PROFILES) return PROFILES[name as ProfileName];
  return PROFILES.production;
}
