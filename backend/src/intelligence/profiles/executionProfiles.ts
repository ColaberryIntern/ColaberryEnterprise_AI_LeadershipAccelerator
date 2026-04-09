/**
 * Execution Profiles — control validation strictness, completion thresholds,
 * and allowed actions per deployment context. The 'production' profile matches
 * all current hardcoded defaults, so existing behavior is preserved.
 */
import { RegressionThresholds, DEFAULT_THRESHOLDS } from '../verification/verificationConfig';

export type ProfileName = 'mvp' | 'production' | 'enterprise';

export interface ExecutionProfile {
  name: ProfileName;
  label: string;
  description: string;
  completion_thresholds: {
    reqCoverage: number;
    qualityScore: number;
    requiredLayers: string[]; // 'backend' | 'frontend' | 'models' | 'agents'
  };
  regression_thresholds: RegressionThresholds;
  quality_gate_enabled: boolean;
  quality_gate_coverage_min: number; // below this, quality steps are blocked
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
      reqCoverage: 90,       // current hardcoded default
      qualityScore: 70,      // current hardcoded default
      requiredLayers: ['backend', 'frontend', 'models'],
    },
    regression_thresholds: DEFAULT_THRESHOLDS,
    quality_gate_enabled: true,
    quality_gate_coverage_min: 10, // current hardcoded default
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
    regression_thresholds: {
      ...DEFAULT_THRESHOLDS,
      reqCoverage_min_delta: -2,
      qualityScore_min_delta: -3,
      maturityLevel_min_delta: 0, // never allow ANY maturity drop
    },
    quality_gate_enabled: true,
    quality_gate_coverage_min: 15,
    structural_check_mode: 'block',
    max_parallel_steps: 1,
  },
};

export function getProfile(name?: string): ExecutionProfile {
  if (name && name in PROFILES) return PROFILES[name as ProfileName];
  return PROFILES.production; // default preserves current behavior
}
