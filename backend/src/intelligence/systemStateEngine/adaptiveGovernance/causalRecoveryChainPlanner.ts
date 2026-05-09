/**
 * causalRecoveryChainPlanner — Phase 17. Sequenced recovery workflow
 * planner that ORCHESTRATES existing Phase 13-16 primitives. NOT a
 * new mutation capability.
 *
 * Architectural commitment (per the Phase 17 stress-test):
 *   - The planner emits an ordered list of `CausalRecoveryStep`s that
 *     each map to existing API endpoints.
 *   - It does NOT introduce new mutation classes or new behaviors.
 *   - It does NOT autonomously execute the chain — operators do.
 *
 * Step kinds (per the addendum):
 *   - contain_root             → containMutationCascade(intent_class)
 *   - rollback_target          → POST /api/portal/.../mutation/:id/rollback
 *   - recalibrate_trust        → admin recalibration endpoint
 *   - reenable_governance      → setAutomationMode(target_mode)
 *   - suppress_propagation_branch → operator-driven freeze
 *   - monitor_only             → no-op observation
 */

import type {
  RootCauseAnalysis, ContradictionPropagationProfile,
  ValidationArbitrationResult,
} from '../causality/causalityTypes';
import type { CausalStabilityForecast } from './adaptiveGovernanceTypes';
import type { CausalRecoveryChain, CausalRecoveryStep, RecoveryStepKind } from './adaptiveGovernanceTypes';
import { MAX_RECOVERY_CHAIN_STEPS } from './adaptiveGovernanceTypes';

export interface BuildRecoveryChainInput {
  readonly project_id: string;
  readonly root_cause: RootCauseAnalysis;
  readonly propagation: ContradictionPropagationProfile;
  readonly forecast: CausalStabilityForecast | null;
  readonly latest_arbitration?: ValidationArbitrationResult | null;
  readonly trigger_summary: string;
}

export function buildCausalRecoveryChain(input: BuildRecoveryChainInput): CausalRecoveryChain {
  const steps: CausalRecoveryStep[] = [];
  let estimatedMinutes = 0;

  // 1. Contain the root if root_cause analysis surfaced any with reasonable confidence.
  const topRoot = input.root_cause.identified_roots.find(r => r.attribution.root_cause_confidence >= 50);
  if (topRoot) {
    const intent = (topRoot.node.payload as any)?.mutation_class ?? 'POLICY_NUDGE';
    steps.push(makeStep(steps.length, 'contain_root', intent,
      `Top root ${topRoot.node.node_id} confidence ${topRoot.attribution.root_cause_confidence}/100.`,
      `POST /api/portal/project/governance/mutation/contain { intent_class: "${intent}" }`));
    estimatedMinutes += 5;
  }

  // 2. Rollback the leaf target (if a mutation root exists).
  if (topRoot && topRoot.node.kind === 'mutation') {
    steps.push(makeStep(steps.length, 'rollback_target', topRoot.node.node_id,
      `Roll back the identified mutation target (operator-confirmed).`,
      `POST /api/portal/project/governance/mutation/${topRoot.node.node_id}/rollback`));
    estimatedMinutes += 10;
  }

  // 3. Suppress propagation branch when contradiction density is high.
  const worstHotspot = input.propagation.hotspots[0];
  if (worstHotspot && worstHotspot.count >= 3) {
    steps.push(makeStep(steps.length, 'suppress_propagation_branch', worstHotspot.subject_id,
      `Subject ${worstHotspot.subject_id} carries ${worstHotspot.count} contradictions (worst severity ${worstHotspot.worst_severity}).`,
      null));
    estimatedMinutes += 5;
  }

  // 4. Recalibrate trust when latest arbitration was escalated.
  if (input.latest_arbitration?.escalation_required) {
    steps.push(makeStep(steps.length, 'recalibrate_trust', `arbitration:${input.latest_arbitration.mutation_id}`,
      `Last arbitration escalated (risk ${input.latest_arbitration.arbitration_risk}).`,
      `POST /api/admin/governance/adaptive/recalibrate`));
    estimatedMinutes += 5;
  }

  // 5. Re-enable governance mode after stabilization, but only if the
  //    forecast says signals are improving.
  const allImproving = input.forecast && input.forecast.entries.every(e => e.direction !== 'degrading');
  if (allImproving) {
    steps.push(makeStep(steps.length, 'reenable_governance', input.project_id,
      `Forecast shows no degrading signals; safe to lift supervised mode.`,
      `POST /api/portal/project/governance/automation-mode { mode: "autonomous" }`));
    estimatedMinutes += 5;
  } else {
    steps.push(makeStep(steps.length, 'monitor_only', input.project_id,
      `At least one signal is still degrading; monitor for one window before re-enabling.`,
      null));
    estimatedMinutes += 30;
  }

  // Truncate at MAX_RECOVERY_CHAIN_STEPS just in case.
  const trimmed = steps.slice(0, MAX_RECOVERY_CHAIN_STEPS);

  return {
    project_id: input.project_id,
    trigger_summary: input.trigger_summary,
    steps: trimmed,
    total_steps: trimmed.length,
    estimated_recovery_minutes: estimatedMinutes,
    built_at: new Date().toISOString(),
  };
}

function makeStep(index: number, kind: RecoveryStepKind, subject: string, rationale: string, api_path: string | null): CausalRecoveryStep {
  return { index, kind, subject, rationale, api_path };
}

export const _MAX_RECOVERY_CHAIN_STEPS_FOR_TESTS = MAX_RECOVERY_CHAIN_STEPS;
