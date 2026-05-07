/**
 * multimodalContradictionResolver — surfaces inconsistencies between
 * LLM vision analysis, heuristic vision analysis, behavioral telemetry,
 * and the declared UI map.
 *
 * 7 detectors:
 *   1. visual_vs_dom_conflict
 *   2. aesthetic_vs_accessibility_conflict
 *   3. multimodal_hierarchy_mismatch
 *   4. screenshot_vs_telemetry_drift
 *   5. behavioral_vs_visual_conflict
 *   6. regression_without_manifest
 *   7. unresolved_visual_regression
 *
 * Pure: takes structured inputs, returns ContradictionFlag[].
 *
 * Phase 7 §11.
 */
import type { ContradictionFlag } from '../types/systemState.types';
import type { MultimodalVisionAnalysis } from './visionResponseNormalizer';
import type { VisionAnalysisReport } from '../vision/visionAnalysisEngine';

export interface MultimodalContradictionInput {
  readonly project_id: string;
  readonly bp_id?: string | null;
  readonly route?: string;
  readonly multimodal: MultimodalVisionAnalysis;
  readonly heuristic?: VisionAnalysisReport | null;
  /** Behavioral aggregate for this route. */
  readonly behavioral?: {
    readonly rage_clicks: number;
    readonly nav_loops: number;
    readonly form_abandons: number;
    readonly abandonment_rate: number;
  };
  /** UI map declared this route as containing these actions. */
  readonly declared_actions?: ReadonlyArray<string>;
  /** Whether a regression was detected vs the previous snapshot. */
  readonly has_recent_regression?: boolean;
  /** True if the previous snapshot also flagged a regression on this route. */
  readonly regression_persisted_from_previous?: boolean;
  /** Whether any manifest in the last 7 days touched files matching this route. */
  readonly recent_manifest_touched_route?: boolean;
}

export function detectMultimodalContradictions(input: MultimodalContradictionInput): ContradictionFlag[] {
  const flags: ContradictionFlag[] = [];
  const common = {
    project_id: input.project_id,
    capability_id: input.bp_id ?? undefined,
    evidence: { route: input.route ?? null } as Record<string, unknown>,
  };

  // 1. visual_vs_dom_conflict — LLM cognition disagrees materially with heuristic
  if (input.heuristic && input.multimodal.source === 'llm' && input.multimodal.confidence >= 60) {
    const llm = input.multimodal.cognition_score;
    const heur = input.heuristic.cognition_score;
    if (Math.abs(llm - heur) >= 25) {
      flags.push({
        kind: 'visual_vs_dom_conflict',
        severity: 'warning',
        message: `LLM rates page cognition ${llm}/100 but DOM heuristics rate it ${heur}/100 — a ${Math.abs(llm - heur)}-point gap.`,
        ...common,
        evidence: { ...common.evidence, llm_score: llm, heuristic_score: heur, llm_confidence: input.multimodal.confidence },
      });
    }
  }

  // 2. aesthetic_vs_accessibility_conflict
  if (input.multimodal.aesthetic_harmony_score >= 75 && input.multimodal.accessibility_score <= 50) {
    flags.push({
      kind: 'aesthetic_vs_accessibility_conflict',
      severity: 'warning',
      message: `Page is visually polished (${input.multimodal.aesthetic_harmony_score}/100 aesthetic) but accessibility-failing (${input.multimodal.accessibility_score}/100).`,
      ...common,
      evidence: { ...common.evidence, aesthetic: input.multimodal.aesthetic_harmony_score, accessibility: input.multimodal.accessibility_score },
    });
  }

  // 3. multimodal_hierarchy_mismatch
  if (input.heuristic && input.multimodal.source === 'llm') {
    const llmH = input.multimodal.visual_hierarchy_score;
    const heurH = input.heuristic.hierarchy.hierarchy_score;
    if (Math.abs(llmH - heurH) >= 30) {
      flags.push({
        kind: 'multimodal_hierarchy_mismatch',
        severity: 'info',
        message: `LLM rates visual hierarchy ${llmH}/100 but DOM weight tiers say ${heurH}/100. Likely a styling/structure mismatch worth investigating.`,
        ...common,
        evidence: { ...common.evidence, llm_hierarchy: llmH, heuristic_hierarchy: heurH },
      });
    }
  }

  // 4. screenshot_vs_telemetry_drift — declared actions in UI map don't match what LLM
  // detected as primary action candidates.
  if (input.declared_actions && input.declared_actions.length > 0 && input.multimodal.source === 'llm' && input.multimodal.confidence >= 60) {
    const declared = new Set(input.declared_actions.map(a => a.toLowerCase()));
    // LLM doesn't return action labels directly, but suggested_improvements often reference them.
    // Heuristic check: if LLM mentions an action in suggested_improvements titles that's NOT in declared_actions.
    const llmReferenced = new Set<string>();
    for (const s of input.multimodal.suggested_improvements) {
      const lower = s.title.toLowerCase();
      // Pull single-word action names out of sentences (rough)
      const m = lower.match(/(save|cancel|submit|delete|edit|apply|create|continue|next|back|export|import|run|build|verify)/);
      if (m) llmReferenced.add(m[1]);
    }
    const undeclared = Array.from(llmReferenced).filter(a => !declared.has(a));
    if (undeclared.length > 0) {
      flags.push({
        kind: 'screenshot_vs_telemetry_drift',
        severity: 'info',
        message: `LLM references action${undeclared.length > 1 ? 's' : ''} (${undeclared.join(', ')}) not declared in the UI map for ${input.route ?? 'this route'}.`,
        ...common,
        evidence: { ...common.evidence, undeclared, declared: Array.from(declared) },
      });
    }
  }

  // 5. behavioral_vs_visual_conflict — page looks healthy but users struggle
  if (input.behavioral && input.multimodal.cognition_score >= 75) {
    const stress = input.behavioral.rage_clicks + input.behavioral.nav_loops + input.behavioral.form_abandons;
    if (stress >= 5 || input.behavioral.abandonment_rate >= 60) {
      flags.push({
        kind: 'behavioral_vs_visual_conflict',
        severity: 'warning',
        message: `Page scores ${input.multimodal.cognition_score}/100 visually but users show stress: ${input.behavioral.rage_clicks} rage clicks, ${input.behavioral.nav_loops} loops, ${input.behavioral.form_abandons} abandons.`,
        ...common,
        evidence: { ...common.evidence, cognition: input.multimodal.cognition_score, behavioral: input.behavioral },
      });
    }
  }

  // 6. regression_without_manifest
  if (input.has_recent_regression && !input.recent_manifest_touched_route) {
    flags.push({
      kind: 'regression_without_manifest',
      severity: 'warning',
      message: `${input.route ?? 'A route'} regressed visually but no manifest in the last 7 days declares a change to it.`,
      ...common,
    });
  }

  // 7. unresolved_visual_regression
  if (input.has_recent_regression && input.regression_persisted_from_previous) {
    flags.push({
      kind: 'unresolved_visual_regression',
      severity: 'error',
      message: `${input.route ?? 'A route'} is regressed for the second consecutive snapshot. Address before further feature work.`,
      ...common,
    });
  }

  return flags;
}
