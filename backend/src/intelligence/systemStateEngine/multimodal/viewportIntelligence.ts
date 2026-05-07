/**
 * viewportIntelligence — compares vision reports across viewports for the
 * same route and flags viewport-specific friction.
 *
 * Pure: takes per-viewport reports, returns findings.
 *
 * Phase 7 §14.
 */
import type { VisionAnalysisReport } from '../vision/visionAnalysisEngine';
import type { MultimodalVisionAnalysis } from './visionResponseNormalizer';

export type ViewportLabel = 'desktop' | 'tablet' | 'mobile';

export interface PerViewportReport {
  readonly viewport: ViewportLabel;
  readonly heuristic: VisionAnalysisReport;
  readonly multimodal?: MultimodalVisionAnalysis | null;
}

export interface ViewportFinding {
  readonly viewport: ViewportLabel;
  readonly kind: 'mobile_only_overload' | 'mobile_below_fold_cta' | 'tablet_density_spike' | 'cross_viewport_inconsistency' | 'mobile_accessibility_drop';
  readonly severity: 'low' | 'medium' | 'high';
  readonly description: string;
}

export interface ViewportIntelligenceReport {
  readonly findings: ReadonlyArray<ViewportFinding>;
  readonly cognition_by_viewport: Readonly<Record<ViewportLabel, number | null>>;
  readonly worst_viewport: ViewportLabel | null;
}

export function compareViewports(reports: ReadonlyArray<PerViewportReport>): ViewportIntelligenceReport {
  const byViewport = new Map<ViewportLabel, PerViewportReport>();
  for (const r of reports) byViewport.set(r.viewport, r);

  const findings: ViewportFinding[] = [];
  const cognition_by_viewport: Record<ViewportLabel, number | null> = {
    desktop: byViewport.get('desktop')?.heuristic.cognition_score ?? null,
    tablet: byViewport.get('tablet')?.heuristic.cognition_score ?? null,
    mobile: byViewport.get('mobile')?.heuristic.cognition_score ?? null,
  };

  const desktop = byViewport.get('desktop');
  const mobile = byViewport.get('mobile');
  const tablet = byViewport.get('tablet');

  // Mobile-only overload
  if (mobile && (!desktop || desktop.heuristic.density.category !== 'overloaded')
      && mobile.heuristic.density.category === 'overloaded') {
    findings.push({
      viewport: 'mobile',
      kind: 'mobile_only_overload',
      severity: 'high',
      description: 'Mobile viewport overloaded while desktop is comfortable — likely missing responsive collapse/grouping.',
    });
  }

  // Mobile below-fold CTA
  if (mobile && mobile.heuristic.cta.primary_position === 'below_fold'
      && desktop && desktop.heuristic.cta.primary_position === 'above_fold') {
    findings.push({
      viewport: 'mobile',
      kind: 'mobile_below_fold_cta',
      severity: 'high',
      description: 'Primary CTA above-fold on desktop but below-fold on mobile — known conversion drop.',
    });
  }

  // Tablet density spike
  if (tablet && tablet.heuristic.density.category === 'overloaded'
      && desktop && desktop.heuristic.density.category !== 'overloaded'
      && mobile && mobile.heuristic.density.category !== 'overloaded') {
    findings.push({
      viewport: 'tablet',
      kind: 'tablet_density_spike',
      severity: 'medium',
      description: 'Tablet viewport overloaded while desktop and mobile are not — unusual pattern, audit responsive breakpoints.',
    });
  }

  // Cross-viewport cognition inconsistency
  const scores = [desktop?.heuristic.cognition_score, tablet?.heuristic.cognition_score, mobile?.heuristic.cognition_score]
    .filter((n): n is number => typeof n === 'number');
  if (scores.length >= 2) {
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    if (max - min >= 30) {
      const worstViewport = (Object.entries(cognition_by_viewport)
        .filter(([, v]) => v === min)[0]?.[0]) as ViewportLabel | undefined;
      findings.push({
        viewport: worstViewport ?? 'mobile',
        kind: 'cross_viewport_inconsistency',
        severity: 'medium',
        description: `Cognition varies ${max - min} points across viewports. ${worstViewport} is the weakest.`,
      });
    }
  }

  // Mobile accessibility drop
  if (mobile && desktop) {
    const mobileA11y = mobile.multimodal?.accessibility_score ?? mobile.heuristic.dom_semantic.missing_aria_labels.length === 0 ? 100 : 60;
    const desktopA11y = desktop.multimodal?.accessibility_score ?? desktop.heuristic.dom_semantic.missing_aria_labels.length === 0 ? 100 : 60;
    if (typeof mobileA11y === 'number' && typeof desktopA11y === 'number' && desktopA11y - mobileA11y >= 20) {
      findings.push({
        viewport: 'mobile',
        kind: 'mobile_accessibility_drop',
        severity: 'high',
        description: 'Accessibility score drops materially on mobile vs desktop — touch target or focus order issue likely.',
      });
    }
  }

  // Worst viewport: lowest cognition
  let worst_viewport: ViewportLabel | null = null;
  let worstScore = 101;
  for (const v of ['desktop', 'tablet', 'mobile'] as ViewportLabel[]) {
    const score = cognition_by_viewport[v];
    if (typeof score === 'number' && score < worstScore) {
      worstScore = score;
      worst_viewport = v;
    }
  }

  return {
    findings,
    cognition_by_viewport,
    worst_viewport,
  };
}
