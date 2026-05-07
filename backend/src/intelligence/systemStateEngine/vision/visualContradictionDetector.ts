/**
 * visualContradictionDetector — 8 visual cognition contradiction detectors.
 *
 * Output ContradictionFlag[] that the engine merges into its own
 * contradictions array. Detector kinds extend the existing
 * `ContradictionKind` union.
 *
 * Phase 6 §8.
 *
 * Detector roster:
 *   1. hidden_primary_cta
 *   2. inaccessible_critical_action
 *   3. workflow_dead_end
 *   4. visual_hierarchy_mismatch
 *   5. overloaded_action_zone
 *   6. orphan_navigation_path
 *   7. misleading_progression
 *   8. accessibility_vs_health_conflict
 */
import type { ContradictionFlag } from '../types/systemState.types';
import type { VisionAnalysisReport } from './visionAnalysisEngine';

export interface VisualContradictionInput {
  readonly project_id: string;
  readonly bp_id?: string | null;
  readonly route?: string;
  readonly vision: VisionAnalysisReport;
  readonly behavioral?: {
    readonly rage_clicks: number;
    readonly nav_loops: number;
    readonly form_retries: number;
    readonly abandonment_rate: number;
  };
  readonly accessibility_warnings_count?: number;
  /** When the page route is referenced by an active BP but the page has no
   * outbound navigation actions. */
  readonly is_dead_end?: boolean;
  /** Pages reachable from this one. Used for orphan detection. */
  readonly outbound_routes?: ReadonlyArray<string>;
  /** All declared routes in the project (for orphan detection). */
  readonly all_known_routes?: ReadonlyArray<string>;
}

export function detectVisualContradictions(input: VisualContradictionInput): ContradictionFlag[] {
  const flags: ContradictionFlag[] = [];
  const evidenceCommon = {
    project_id: input.project_id,
    capability_id: input.bp_id ?? undefined,
    evidence: { route: input.route ?? null },
  };

  // 1. hidden_primary_cta
  const hiddenCta = input.vision.cta.findings.find(f => f.kind === 'hidden_primary_cta');
  if (hiddenCta) {
    flags.push({
      kind: 'hidden_primary_cta',
      severity: hiddenCta.severity === 'high' ? 'warning' : 'info',
      message: hiddenCta.description,
      ...evidenceCommon,
      evidence: { ...evidenceCommon.evidence, cta_score: input.vision.cta.cta_score, primary_position: input.vision.cta.primary_position },
    });
  }

  // 2. inaccessible_critical_action
  // When a primary action exists but it's not focusable / unlabeled, accessibility blocks the flow.
  if (input.vision.cta.primary_label && input.vision.dom_semantic.missing_aria_labels.length > 0) {
    flags.push({
      kind: 'inaccessible_critical_action',
      severity: 'warning',
      message: `Primary action "${input.vision.cta.primary_label}" is present but ${input.vision.dom_semantic.missing_aria_labels.length} action(s) lack ARIA labels.`,
      ...evidenceCommon,
      evidence: { ...evidenceCommon.evidence, missing_labels: input.vision.dom_semantic.missing_aria_labels },
    });
  }

  // 3. workflow_dead_end
  if (input.is_dead_end) {
    flags.push({
      kind: 'workflow_dead_end',
      severity: 'warning',
      message: `Route ${input.route ?? '(unknown)'} is referenced by an active BP but has no outbound navigation.`,
      ...evidenceCommon,
    });
  }

  // 4. visual_hierarchy_mismatch
  const competing = input.vision.hierarchy.findings.find(f => f.kind === 'competing_primaries');
  if (competing) {
    flags.push({
      kind: 'visual_hierarchy_mismatch',
      severity: 'warning',
      message: competing.description,
      ...evidenceCommon,
      evidence: { ...evidenceCommon.evidence, competing_primaries: input.vision.hierarchy.competing_primaries },
    });
  }

  // 5. overloaded_action_zone
  const overloaded = input.vision.density.findings.find(f => f.kind === 'overloaded_action_zone');
  if (overloaded || input.vision.density.category === 'overloaded') {
    flags.push({
      kind: 'overloaded_action_zone',
      severity: 'warning',
      message: overloaded?.description ?? `Action density ${input.vision.density.density_per_100k_px}/100k px — overloaded.`,
      ...evidenceCommon,
      evidence: {
        ...evidenceCommon.evidence,
        action_count: input.vision.density.action_count,
        density: input.vision.density.density_per_100k_px,
        category: input.vision.density.category,
      },
    });
  }

  // 6. orphan_navigation_path
  if (input.outbound_routes && input.all_known_routes) {
    const known = new Set(input.all_known_routes);
    const orphans = input.outbound_routes.filter(r => !known.has(r));
    if (orphans.length > 0) {
      flags.push({
        kind: 'orphan_navigation_path',
        severity: 'warning',
        message: `${orphans.length} outbound link${orphans.length === 1 ? '' : 's'} from ${input.route ?? 'this page'} target unknown routes.`,
        ...evidenceCommon,
        evidence: { ...evidenceCommon.evidence, orphans: orphans.slice(0, 5) },
      });
    }
  }

  // 7. misleading_progression
  // Heading skip is a cheap proxy for "the page promises a flow it can't deliver."
  const skipFinding = input.vision.hierarchy.findings.find(f => f.kind === 'heading_skip');
  if (skipFinding) {
    flags.push({
      kind: 'misleading_progression',
      severity: 'info',
      message: `Heading hierarchy skips levels — readers may infer steps that don't exist. ${skipFinding.description}`,
      ...evidenceCommon,
      evidence: { ...evidenceCommon.evidence, heading_path: input.vision.hierarchy.heading_path },
    });
  }

  // 8. accessibility_vs_health_conflict
  // High accessibility warnings + high cognition score is a contradiction:
  // looks healthy but isn't usable for assistive tech.
  if (input.vision.cognition_score >= 75 && (input.accessibility_warnings_count ?? 0) >= 3) {
    flags.push({
      kind: 'accessibility_vs_health_conflict',
      severity: 'warning',
      message: `Page scores ${input.vision.cognition_score}/100 visually but carries ${input.accessibility_warnings_count} accessibility warnings.`,
      ...evidenceCommon,
      evidence: { ...evidenceCommon.evidence, cognition_score: input.vision.cognition_score, warnings: input.accessibility_warnings_count },
    });
  }

  // Behavioral surfaces: if telemetry shows rage_clicks or nav_loops, raise
  // the appropriate kind. Rage clicks → hidden_primary_cta or inaccessible.
  if (input.behavioral) {
    if (input.behavioral.rage_clicks >= 5) {
      flags.push({
        kind: 'hidden_primary_cta',
        severity: 'warning',
        message: `${input.behavioral.rage_clicks} rage clicks recorded on ${input.route ?? 'this page'} — users repeatedly clicking the same area suggests a non-responsive or hidden CTA.`,
        ...evidenceCommon,
        evidence: { ...evidenceCommon.evidence, rage_clicks: input.behavioral.rage_clicks, source: 'behavioral' },
      });
    }
    if (input.behavioral.nav_loops >= 3) {
      flags.push({
        kind: 'workflow_dead_end',
        severity: 'warning',
        message: `${input.behavioral.nav_loops} navigation loops detected — users couldn't progress from ${input.route ?? 'this page'}.`,
        ...evidenceCommon,
        evidence: { ...evidenceCommon.evidence, nav_loops: input.behavioral.nav_loops, source: 'behavioral' },
      });
    }
  }

  return flags;
}
