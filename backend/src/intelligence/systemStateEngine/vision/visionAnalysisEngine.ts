/**
 * visionAnalysisEngine — orchestrator for the vision/ analyzers.
 *
 * Takes a DOM snapshot + optional viewport + optional screenshot reference
 * and produces a single combined report covering hierarchy, density, CTA,
 * DOM semantics, and screenshot semantic hints.
 *
 * Pure: composes the underlying pure analyzers. No I/O.
 *
 * Phase 6 §1.
 */
import { analyzeDOMSemantics, type DOMNode, type DOMSemanticReport } from './domSemanticAnalyzer';
import { analyzeVisualHierarchy, type HierarchyReport } from './visualHierarchyAnalyzer';
import { analyzeLayoutDensity, type DensityReport } from './layoutDensityAnalyzer';
import { analyzeCTAProminence, type CTAReport } from './ctaProminenceAnalyzer';
import { analyzeScreenshot, type ScreenshotAnalysis, type ScreenshotAnalysisInput } from './screenshotSemanticAnalyzer';

export interface VisionAnalysisInput {
  readonly dom: DOMNode | null;
  readonly viewport?: { width: number; height: number };
  readonly screenshot?: ScreenshotAnalysisInput | null;
}

export interface VisionAnalysisReport {
  readonly hierarchy: HierarchyReport;
  readonly density: DensityReport;
  readonly cta: CTAReport;
  readonly dom_semantic: DOMSemanticReport;
  readonly screenshot: ScreenshotAnalysis | null;
  /** Composite UX cognition score 0-100 — high = healthy interface. */
  readonly cognition_score: number;
  readonly summary: string;
}

export function runVisionAnalysis(input: VisionAnalysisInput): VisionAnalysisReport {
  const hierarchy = analyzeVisualHierarchy(input.dom);
  const density = analyzeLayoutDensity(input.dom, input.viewport);
  const cta = analyzeCTAProminence(input.dom, input.viewport);
  const dom_semantic = analyzeDOMSemantics(input.dom);
  const screenshot = input.screenshot ? analyzeScreenshot(input.screenshot) : null;

  // Composite cognition score: weighted blend.
  const cognition_score = Math.round(
    hierarchy.hierarchy_score * 0.35 +
    cta.cta_score * 0.30 +
    density.density_health * 0.25 +
    (dom_semantic.semantic_warnings.length === 0 ? 100 : Math.max(0, 100 - dom_semantic.semantic_warnings.length * 15)) * 0.10,
  );

  const parts: string[] = [];
  parts.push(`hierarchy ${hierarchy.hierarchy_score}/100`);
  parts.push(`CTA ${cta.cta_score}/100`);
  parts.push(`density ${density.density_health}/100 (${density.category})`);
  if (dom_semantic.semantic_warnings.length > 0) parts.push(`${dom_semantic.semantic_warnings.length} semantic warnings`);
  const summary = parts.join(' · ');

  return {
    hierarchy,
    density,
    cta,
    dom_semantic,
    screenshot,
    cognition_score,
    summary,
  };
}
