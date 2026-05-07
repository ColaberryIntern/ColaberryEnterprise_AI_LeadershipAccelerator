/**
 * autoAnnotationGenerator — turn an LLM `highlight_regions` array into
 * persistable `VisualCritiqueItem`-shaped drafts.
 *
 * Pure: maps highlight-region kinds to critique kinds + severities and
 * generates pre-filled descriptions.
 *
 * Phase 7 §10.
 */
import type { MultimodalVisionAnalysis, MultimodalHighlight } from './visionResponseNormalizer';

export interface AutoAnnotationDraft {
  readonly kind: 'spacing' | 'alignment' | 'color' | 'typography' | 'interaction' | 'accessibility' | 'hierarchy' | 'responsiveness' | 'workflow' | 'copy';
  readonly severity: 'low' | 'medium' | 'high';
  readonly description: string;
  readonly region: { x: number; y: number; width: number; height: number };
  readonly source: 'auto_annotation';
}

const KIND_MAP: Record<string, { kind: AutoAnnotationDraft['kind']; baseSeverity: 'low' | 'medium' | 'high' }> = {
  cta_weakness: { kind: 'hierarchy', baseSeverity: 'high' },
  hierarchy_failure: { kind: 'hierarchy', baseSeverity: 'medium' },
  overload: { kind: 'interaction', baseSeverity: 'medium' },
  accessibility_gap: { kind: 'accessibility', baseSeverity: 'high' },
  alignment_break: { kind: 'alignment', baseSeverity: 'low' },
  contrast_issue: { kind: 'color', baseSeverity: 'medium' },
};

export function generateAutoAnnotations(
  multimodal: MultimodalVisionAnalysis,
  imageDimensions: { width: number; height: number },
): AutoAnnotationDraft[] {
  const drafts: AutoAnnotationDraft[] = [];
  for (const h of multimodal.highlight_regions) {
    const mapping = KIND_MAP[h.kind] || { kind: 'hierarchy' as const, baseSeverity: 'medium' as const };
    drafts.push({
      kind: mapping.kind,
      severity: mapping.baseSeverity,
      description: h.label || `Auto-annotated ${h.kind} region`,
      region: pctToPixels(h, imageDimensions),
      source: 'auto_annotation',
    });
  }
  return drafts;
}

function pctToPixels(h: MultimodalHighlight, dims: { width: number; height: number }) {
  return {
    x: Math.round((h.x_pct / 100) * dims.width),
    y: Math.round((h.y_pct / 100) * dims.height),
    width: Math.round((h.width_pct / 100) * dims.width),
    height: Math.round((h.height_pct / 100) * dims.height),
  };
}
