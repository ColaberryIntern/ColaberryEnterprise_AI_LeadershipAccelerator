/**
 * User Context Service
 *
 * Detects whether an enrollment is in GUIDED_DISCOVERY (cold) or FAST_TRACK (warm) mode
 * based on variable completeness, and builds a context mode block for prompt injection.
 */

import * as variableService from './variableService';
import { Enrollment } from '../models';

// ─── Types ──────────────────────────────────────────────────────────

export type ContextMode = 'GUIDED_DISCOVERY' | 'FAST_TRACK';

export interface UserContextState {
  mode: ContextMode;
  variables_filled: number;
  variables_total: number;
  completeness_ratio: number;
  missing_critical: string[];
  has_intake: boolean;
  has_strategy_data: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────

const CRITICAL_VARIABLES = [
  'industry', 'company_name', 'role', 'goal', 'ai_maturity_level',
];

const WARM_USER_VARIABLES = [
  'identified_use_case', 'strategic_priority', 'transformation_timeline',
  'budget_range', 'team_size', 'current_ai_tools',
];

const ALL_TRACKED_VARIABLES = [...CRITICAL_VARIABLES, ...WARM_USER_VARIABLES];

const FAST_TRACK_THRESHOLD = 0.6; // 60% of tracked vars filled
const MIN_WARM_VARS = 3;          // at least 3 warm-user vars present

// ─── Detection ──────────────────────────────────────────────────────

export async function detectContextMode(enrollmentId: string): Promise<UserContextState> {
  const vars = await variableService.getAllVariables(enrollmentId);

  const filledCritical = CRITICAL_VARIABLES.filter(k => vars[k]?.trim());
  const filledWarm = WARM_USER_VARIABLES.filter(k => vars[k]?.trim());
  const missingCritical = CRITICAL_VARIABLES.filter(k => !vars[k]?.trim());

  const totalFilled = filledCritical.length + filledWarm.length;
  const completenessRatio = totalFilled / ALL_TRACKED_VARIABLES.length;

  const hasStrategyData = filledWarm.length >= MIN_WARM_VARS;

  let hasIntake = false;
  try {
    const enrollment = await Enrollment.findByPk(enrollmentId, {
      attributes: ['intake_completed'],
    });
    hasIntake = enrollment?.intake_completed === true;
  } catch { /* non-critical */ }

  const mode: ContextMode =
    completenessRatio >= FAST_TRACK_THRESHOLD && hasStrategyData
      ? 'FAST_TRACK'
      : 'GUIDED_DISCOVERY';

  return {
    mode,
    variables_filled: totalFilled,
    variables_total: ALL_TRACKED_VARIABLES.length,
    completeness_ratio: Math.round(completenessRatio * 100) / 100,
    missing_critical: missingCritical,
    has_intake: hasIntake,
    has_strategy_data: hasStrategyData,
  };
}

// ─── Prompt Block Builder ───────────────────────────────────────────

export function buildContextModeBlock(state: UserContextState): string {
  if (state.mode === 'FAST_TRACK') {
    return [
      '=== CONTEXT MODE ===',
      'Mode: FAST_TRACK',
      'The learner has pre-existing strategy data. Reference their specific goals, use case, and',
      'priorities directly. Skip introductory exploration and dive into actionable, personalized content.',
      'Build on their identified use case and strategic priorities.',
      `Variables filled: ${state.variables_filled}/${state.variables_total} (${Math.round(state.completeness_ratio * 100)}%)`,
    ].join('\n');
  }

  return [
    '=== CONTEXT MODE ===',
    'Mode: GUIDED_DISCOVERY',
    'The learner is new and exploring. Use open-ended questions, provide more background context,',
    'and guide them through discovering their AI strategy. Avoid assuming prior knowledge of their',
    'specific situation.',
    `Variables filled: ${state.variables_filled}/${state.variables_total} (${Math.round(state.completeness_ratio * 100)}%)`,
    state.missing_critical.length > 0
      ? `Missing critical context: ${state.missing_critical.join(', ')}`
      : '',
  ].filter(Boolean).join('\n');
}
