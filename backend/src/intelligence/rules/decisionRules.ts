/**
 * Canonical Decision Rules — declarative representation of all deterministic
 * rules in the execution engine. For auditability and admin display.
 * Does NOT replace engine logic — mirrors it for transparency.
 */

export interface DecisionRule {
  id: string;
  name: string;
  category: 'completion' | 'quality_gate' | 'action_selection' | 'priority' | 'safety';
  condition: string; // human-readable
  severity: 'enforced' | 'recommended' | 'informational';
}

export const CANONICAL_RULES: DecisionRule[] = [
  // ── Completion Rules ──
  {
    id: 'COMPLETE_001',
    name: 'Process Completion',
    category: 'completion',
    condition: 'reqCoverage >= {profile.reqCoverage} AND qualityScore >= {profile.qualityScore} AND all required layers exist',
    severity: 'enforced',
  },
  {
    id: 'COMPLETE_002',
    name: 'Additive-Only Resync',
    category: 'completion',
    condition: 'Already-matched requirements are NEVER re-evaluated or demoted',
    severity: 'enforced',
  },

  // ── Quality Gate Rules ──
  {
    id: 'GATE_001',
    name: 'Quality Step Guard',
    category: 'quality_gate',
    condition: 'Block quality steps (monitoring, reliability, performance, agents, verify) when reqCoverage < {profile.quality_gate_coverage_min}',
    severity: 'enforced',
  },
  {
    id: 'GATE_002',
    name: 'Project-Level Layer Detection',
    category: 'quality_gate',
    condition: 'Skip "Build Backend/Frontend/Agents" when the project repo already has these layers',
    severity: 'enforced',
  },

  // ── Action Selection Rules ──
  {
    id: 'ACTION_001',
    name: 'Backend Before Everything',
    category: 'action_selection',
    condition: 'build_backend has highest priority (100). All other steps blocked if no backend exists',
    severity: 'enforced',
  },
  {
    id: 'ACTION_002',
    name: 'Requirements Before Quality',
    category: 'action_selection',
    condition: 'implement_requirements (priority 65) fires before quality steps (priority 30-60) when coverage < 80%',
    severity: 'enforced',
  },
  {
    id: 'ACTION_003',
    name: 'Completed Steps Filter',
    category: 'action_selection',
    condition: 'Only accept VALID_STEP_KEYS in completed_steps. Corrupt keys silently ignored.',
    severity: 'enforced',
  },

  // ── Priority Rules ──
  {
    id: 'PRIORITY_001',
    name: 'Penalize Existing Implementation',
    category: 'priority',
    condition: 'Processes with files get -20 pts/file (max -300). Processes with backend get additional -100.',
    severity: 'enforced',
  },
  {
    id: 'PRIORITY_002',
    name: 'Boost Not-Started',
    category: 'priority',
    condition: 'Processes with zero files and >0 requirements get +200 priority boost',
    severity: 'enforced',
  },
  {
    id: 'PRIORITY_003',
    name: 'Foundation First',
    category: 'priority',
    condition: 'Processes shared by other processes via depends_on edges get +15 pts per dependency',
    severity: 'recommended',
  },

  // ── Safety Rules ──
  {
    id: 'SAFETY_001',
    name: 'Safety Net',
    category: 'safety',
    condition: 'If process is NOT complete but all actions filtered out, force-show the most relevant action',
    severity: 'enforced',
  },
  {
    id: 'SAFETY_002',
    name: 'Auto-Complete on Zero Change',
    category: 'safety',
    condition: 'When resync verifies 0 missing files, auto-complete ALL infrastructure/quality steps to prevent infinite cycling',
    severity: 'enforced',
  },
  {
    id: 'SAFETY_003',
    name: 'Regression Detection',
    category: 'safety',
    condition: 'After every resync, compare before/after metrics. Flag regressions exceeding configured thresholds.',
    severity: 'enforced',
  },

  // ── Steering Rules ──
  {
    id: 'STEER_001',
    name: 'Human Priority Boost',
    category: 'priority',
    condition: 'User-created or priority-boosted processes get +50 priority bonus in ranking',
    severity: 'enforced',
  },
  {
    id: 'STEER_002',
    name: 'Steering Reversibility',
    category: 'safety',
    condition: 'All NLP steering actions must be logged in steering_actions table and reversible',
    severity: 'enforced',
  },
  {
    id: 'STEER_003',
    name: 'Mode Transition Safety',
    category: 'safety',
    condition: 'Cannot downgrade mode if process has already passed the higher threshold maturity level',
    severity: 'enforced',
  },
  {
    id: 'STEER_004',
    name: 'NLP Classification Only',
    category: 'action_selection',
    condition: 'LLM is used ONLY for intent classification. All execution decisions are deterministic.',
    severity: 'enforced',
  },
];

/** Get all rules, optionally filtered by category */
export function getRules(category?: DecisionRule['category']): DecisionRule[] {
  if (category) return CANONICAL_RULES.filter(r => r.category === category);
  return CANONICAL_RULES;
}
