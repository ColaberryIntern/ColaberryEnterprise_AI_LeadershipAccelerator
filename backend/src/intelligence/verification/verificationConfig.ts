/**
 * Verification Configuration — configurable thresholds for regression detection,
 * structural checks, and quality gates. Replaces hardcoded values throughout the system.
 */

export interface RegressionThresholds {
  /** Minimum allowed coverage delta (negative = regression). Default: -5 */
  reqCoverage_min_delta: number;
  /** Minimum allowed readiness delta. Default: -3 */
  readiness_min_delta: number;
  /** Minimum allowed quality delta. Default: -5 */
  qualityScore_min_delta: number;
  /** Minimum allowed maturity level delta. Default: -1 (never allow level drop) */
  maturityLevel_min_delta: number;
  /** Maximum failure rate before flagging. Default: 0.10 */
  failureRate_max: number;
  /** Maximum avg response time (ms) before flagging. Default: 500 */
  slowPath_max_ms: number;
}

export const DEFAULT_THRESHOLDS: RegressionThresholds = {
  reqCoverage_min_delta: -5,
  readiness_min_delta: -3,
  qualityScore_min_delta: -5,
  maturityLevel_min_delta: -1,
  failureRate_max: 0.10,
  slowPath_max_ms: 500,
};

export interface StructuralCheckConfig {
  /** How to handle structural check failures: skip, warn, or block */
  mode: 'skip' | 'warn' | 'block';
  /** Run behavioral checks (L3 — agent execution stats)? Adds latency. */
  include_behavioral: boolean;
  /** Run contract validation against promised files? */
  validate_contracts: boolean;
}

export const DEFAULT_STRUCTURAL_CONFIG: StructuralCheckConfig = {
  mode: 'warn',
  include_behavioral: true,
  validate_contracts: true,
};
