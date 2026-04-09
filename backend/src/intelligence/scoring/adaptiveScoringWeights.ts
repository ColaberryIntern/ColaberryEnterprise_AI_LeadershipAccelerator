/**
 * Adaptive Scoring Weights — returns scoring multipliers based on project maturity.
 * At low maturity (0-1), weights favor foundational metrics (determinism, reliability).
 * At high maturity (3-5), weights shift toward automation, observability, production readiness.
 * Maturity level 2 weights match current hardcoded defaults (zero behavior change).
 *
 * Deterministic — no ML or LLM involved.
 */

export interface ScoringWeights {
  determinism: { multiplier: number; base: number };
  reliability: { multiplier: number; base: number };
  observability: { multiplier: number; base: number };
  ux_exposure: { multiplier: number; base: number };
  automation: { multiplier: number; base: number };
  production_readiness: { multiplier: number; base: number };
}

const WEIGHT_TABLE: Record<number, ScoringWeights> = {
  0: { // Not Started — heavily favor foundations
    determinism: { multiplier: 20, base: 30 },
    reliability: { multiplier: 18, base: 20 },
    observability: { multiplier: 5, base: 0 },
    ux_exposure: { multiplier: 10, base: 5 },
    automation: { multiplier: 8, base: 5 },
    production_readiness: { multiplier: 12, base: 10 },
  },
  1: { // Prototype — still foundational
    determinism: { multiplier: 18, base: 25 },
    reliability: { multiplier: 15, base: 15 },
    observability: { multiplier: 8, base: 0 },
    ux_exposure: { multiplier: 15, base: 8 },
    automation: { multiplier: 10, base: 5 },
    production_readiness: { multiplier: 12, base: 10 },
  },
  2: { // Functional — MATCHES CURRENT HARDCODED DEFAULTS
    determinism: { multiplier: 15, base: 20 },  // = Math.min(100, backend.length * 15 + 20)
    reliability: { multiplier: 10, base: 10 },
    observability: { multiplier: 10, base: 10 },
    ux_exposure: { multiplier: 20, base: 10 },   // = Math.min(100, frontend.length * 20 + 10)
    automation: { multiplier: 12, base: 10 },    // = Math.min(100, agents.length * 12 + bonus)
    production_readiness: { multiplier: 10, base: 10 },
  },
  3: { // Production — shift toward quality and observability
    determinism: { multiplier: 12, base: 15 },
    reliability: { multiplier: 12, base: 15 },
    observability: { multiplier: 15, base: 10 },
    ux_exposure: { multiplier: 18, base: 10 },
    automation: { multiplier: 15, base: 10 },
    production_readiness: { multiplier: 15, base: 15 },
  },
  4: { // Autonomous — automation and observability dominate
    determinism: { multiplier: 10, base: 10 },
    reliability: { multiplier: 10, base: 10 },
    observability: { multiplier: 18, base: 15 },
    ux_exposure: { multiplier: 15, base: 10 },
    automation: { multiplier: 20, base: 15 },
    production_readiness: { multiplier: 18, base: 15 },
  },
  5: { // Self-Optimizing — everything high, balanced
    determinism: { multiplier: 12, base: 15 },
    reliability: { multiplier: 12, base: 15 },
    observability: { multiplier: 15, base: 15 },
    ux_exposure: { multiplier: 15, base: 15 },
    automation: { multiplier: 18, base: 15 },
    production_readiness: { multiplier: 18, base: 15 },
  },
};

/**
 * Get scoring weights for a given maturity level.
 * Defaults to level 2 (current production behavior).
 */
export function getWeightsForMaturity(maturityLevel: number): ScoringWeights {
  const level = Math.max(0, Math.min(5, maturityLevel));
  return WEIGHT_TABLE[level] || WEIGHT_TABLE[2];
}
