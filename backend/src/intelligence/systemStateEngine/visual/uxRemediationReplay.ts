/**
 * uxRemediationReplay — pure manifest builder for the before/after replay
 * surface. Server-side stays cheap: assembles a manifest of screenshot
 * URLs + overlay regions + delta summary; the frontend canvas does the
 * actual visual compositing.
 *
 * Why no server-side image diff: avoids pixelmatch/sharp as another
 * optional dep, browser scales with the user's machine, and the
 * semantic regions from visualCritiqueEngine give us DOM-bbox overlays
 * (more useful than pixel diffs).
 *
 * Phase 10.5 §F.
 */

export interface ReplayOverlayRegion {
  /** Absolute or repo-relative path to the bbox (one per resolved cluster). */
  readonly cluster_signature: string;
  readonly cluster_type: string;
  readonly bbox: { x: number; y: number; width: number; height: number } | null;
  readonly status: 'resolved' | 'unresolved' | 'regressed';
  readonly note: string;
}

export interface ReplayManifest {
  readonly outcome_id: string;
  readonly capability_id: string;
  readonly cluster_signature: string;
  readonly before_url: string | null;
  readonly after_url: string | null;
  readonly captured_at: string;        // ISO
  readonly overlay_regions: ReadonlyArray<ReplayOverlayRegion>;
  readonly delta_summary: {
    readonly cognition_delta: number | null;
    readonly ux_debt_delta: number | null;
    readonly behavioral_delta: number | null;
    readonly friction_delta: number | null;
    readonly issues_resolved_count: number;
    readonly issues_regressed_count: number;
  };
  readonly summary: string;
  readonly notes: ReadonlyArray<string>;
}

export interface SemanticRegionInput {
  readonly cluster_signature: string;
  readonly cluster_type: string;
  readonly bbox: { x: number; y: number; width: number; height: number } | null;
  readonly resolved: boolean;
  readonly regressed: boolean;
}

export function buildReplayManifest(input: {
  outcome_id: string;
  capability_id: string;
  cluster_signature: string;
  before_screenshot_url: string | null;
  after_screenshot_url: string | null;
  captured_at: Date;
  semantic_regions: ReadonlyArray<SemanticRegionInput>;
  delta_summary: ReplayManifest['delta_summary'];
}): ReplayManifest {
  const overlay_regions: ReplayOverlayRegion[] = input.semantic_regions.map(r => ({
    cluster_signature: r.cluster_signature,
    cluster_type: r.cluster_type,
    bbox: r.bbox,
    status: r.regressed ? 'regressed' : r.resolved ? 'resolved' : 'unresolved',
    note: r.regressed
      ? `${r.cluster_type} cluster regressed in this region.`
      : r.resolved
        ? `${r.cluster_type} cluster resolved in this region.`
        : `${r.cluster_type} cluster still has unresolved issues here.`,
  }));

  const notes: string[] = [];
  if (!input.before_screenshot_url) notes.push('No before-screenshot was captured for this cluster — overlay will render after-only.');
  if (!input.after_screenshot_url) notes.push('No after-screenshot is available yet — replay will show before-only.');
  if (input.delta_summary.issues_regressed_count > 0) notes.push(`${input.delta_summary.issues_regressed_count} issue(s) regressed during this remediation.`);

  const dResolved = input.delta_summary.issues_resolved_count;
  const dRegressed = input.delta_summary.issues_regressed_count;
  const summary = dRegressed === 0
    ? `Resolved ${dResolved} issue${dResolved === 1 ? '' : 's'} in cluster ${input.cluster_signature}.`
    : `Resolved ${dResolved} but ${dRegressed} regressed — review the before/after carefully.`;

  return {
    outcome_id: input.outcome_id,
    capability_id: input.capability_id,
    cluster_signature: input.cluster_signature,
    before_url: input.before_screenshot_url,
    after_url: input.after_screenshot_url,
    captured_at: input.captured_at.toISOString(),
    overlay_regions,
    delta_summary: input.delta_summary,
    summary,
    notes,
  };
}
