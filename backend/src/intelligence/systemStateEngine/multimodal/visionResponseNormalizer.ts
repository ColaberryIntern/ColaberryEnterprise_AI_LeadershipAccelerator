/**
 * visionResponseNormalizer — coerce a raw GPT-4o JSON response into the
 * `MultimodalVisionAnalysis` shape consumed downstream.
 *
 * Tolerates partial / malformed responses. Missing scores default to 0,
 * not undefined — keeps downstream math stable.
 *
 * Phase 7 §1.
 */

export interface MultimodalHighlight {
  readonly kind: 'cta_weakness' | 'hierarchy_failure' | 'overload' | 'accessibility_gap' | 'alignment_break' | 'contrast_issue' | string;
  readonly x_pct: number;
  readonly y_pct: number;
  readonly width_pct: number;
  readonly height_pct: number;
  readonly label: string;
}

export interface MultimodalSuggestion {
  readonly title: string;
  readonly body: string;
  readonly expected_ux_impact: number;
  readonly kind: string;
}

export interface MultimodalVisionAnalysis {
  readonly source: 'llm' | 'rule_based' | 'cached';
  readonly overall_assessment: string;
  readonly cognition_score: number;
  readonly visual_hierarchy_score: number;
  readonly cta_prominence_score: number;
  readonly aesthetic_harmony_score: number;
  readonly workflow_intuitiveness_score: number;
  readonly accessibility_score: number;
  readonly observations: ReadonlyArray<string>;
  readonly concerns: ReadonlyArray<string>;
  readonly suggested_improvements: ReadonlyArray<MultimodalSuggestion>;
  readonly highlight_regions: ReadonlyArray<MultimodalHighlight>;
  readonly confidence: number;
  readonly raw_response?: string;
}

export function normalizeVisionResponse(raw: unknown, source: 'llm' | 'rule_based' | 'cached' = 'llm'): MultimodalVisionAnalysis {
  // If raw is a string, attempt JSON.parse.
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      // Strip code-block fencing if present.
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      obj = JSON.parse(cleaned);
    } catch {
      return fallback(source, typeof raw === 'string' ? raw : '');
    }
  }
  if (!obj || typeof obj !== 'object') return fallback(source);

  const obsRaw = Array.isArray(obj.observations) ? obj.observations : [];
  const concRaw = Array.isArray(obj.concerns) ? obj.concerns : [];
  const sugRaw = Array.isArray(obj.suggested_improvements) ? obj.suggested_improvements : [];
  const hlRaw = Array.isArray(obj.highlight_regions) ? obj.highlight_regions : [];

  return {
    source,
    overall_assessment: stringField(obj.overall_assessment, ''),
    cognition_score: clamp(obj.cognition_score),
    visual_hierarchy_score: clamp(obj.visual_hierarchy_score),
    cta_prominence_score: clamp(obj.cta_prominence_score),
    aesthetic_harmony_score: clamp(obj.aesthetic_harmony_score),
    workflow_intuitiveness_score: clamp(obj.workflow_intuitiveness_score),
    accessibility_score: clamp(obj.accessibility_score),
    observations: obsRaw.map((o: unknown) => stringField(o, '').slice(0, 240)).filter(Boolean),
    concerns: concRaw.map((c: unknown) => stringField(c, '').slice(0, 240)).filter(Boolean),
    suggested_improvements: sugRaw
      .map((s: any): MultimodalSuggestion => ({
        title: stringField(s?.title, '').slice(0, 200),
        body: stringField(s?.body, '').slice(0, 1000),
        expected_ux_impact: clamp(s?.expected_ux_impact),
        kind: stringField(s?.kind, 'general'),
      }))
      .filter((s: MultimodalSuggestion) => !!s.title),
    highlight_regions: hlRaw
      .map((h: any): MultimodalHighlight => ({
        kind: stringField(h?.kind, 'unknown'),
        x_pct: pct(h?.x_pct),
        y_pct: pct(h?.y_pct),
        width_pct: pct(h?.width_pct),
        height_pct: pct(h?.height_pct),
        label: stringField(h?.label, '').slice(0, 200),
      }))
      .filter((h: MultimodalHighlight) => h.width_pct > 0 && h.height_pct > 0),
    confidence: clamp(obj.confidence ?? 60),
    raw_response: typeof raw === 'string' ? raw.slice(0, 4000) : undefined,
  };
}

function stringField(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function clamp(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function pct(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, v));
}

function fallback(source: 'llm' | 'rule_based' | 'cached', raw_response?: string): MultimodalVisionAnalysis {
  return {
    source,
    overall_assessment: 'Vision response could not be parsed.',
    cognition_score: 0,
    visual_hierarchy_score: 0,
    cta_prominence_score: 0,
    aesthetic_harmony_score: 0,
    workflow_intuitiveness_score: 0,
    accessibility_score: 0,
    observations: [],
    concerns: [],
    suggested_improvements: [],
    highlight_regions: [],
    confidence: 0,
    raw_response,
  };
}
