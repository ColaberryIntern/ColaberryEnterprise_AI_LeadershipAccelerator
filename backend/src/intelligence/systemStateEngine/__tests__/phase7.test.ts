/**
 * Phase 7 tests — pure helpers.
 *
 * Coverage:
 *   - visionPromptBuilder (system + user prompts shape)
 *   - visionResponseNormalizer (parses + rejects bad input)
 *   - visionResultCache (TTL, LRU, hit-rate stats)
 *   - blendReasoningScores (LLM/heuristic confidence-weighted blend)
 *   - aestheticHarmonyAnalyzer (overload/balance/typography findings)
 *   - visualDiffAnalyzer (improvements / regressions / position shifts)
 *   - adaptivePriorityWeighting (factor calc + visual-task elevation)
 *   - uxPressureEscalation (tier mapping + reason aggregation)
 *   - multimodalContradictionResolver (7 detectors)
 *   - viewportIntelligence (mobile-only overload, below-fold mobile CTA)
 *   - autoAnnotationGenerator (kind mapping, % → px conversion)
 */
import { buildVisionPrompt } from '../multimodal/visionPromptBuilder';
import { normalizeVisionResponse } from '../multimodal/visionResponseNormalizer';
import { makeCacheKey, getCached, setCached, getCacheStats, _resetCacheForTests } from '../multimodal/visionResultCache';
import { blendReasoningScores } from '../multimodal/visualReasoningScorer';
import { analyzeAestheticHarmony } from '../multimodal/aestheticHarmonyAnalyzer';
import { analyzeVisualDiff } from '../multimodal/visualDiffAnalyzer';
import { computeWeightFactor, applyAdaptiveWeighting } from '../multimodal/adaptivePriorityWeighting';
import { computeUXPressure } from '../multimodal/uxPressureEscalation';
import { detectMultimodalContradictions } from '../multimodal/multimodalContradictionResolver';
import { compareViewports } from '../multimodal/viewportIntelligence';
import { generateAutoAnnotations } from '../multimodal/autoAnnotationGenerator';
import type { AuthoritativeTask } from '../types/systemState.types';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// visionPromptBuilder
// ---------------------------------------------------------------------------

describe('buildVisionPrompt', () => {
  it('always includes the response schema keys', () => {
    const p = buildVisionPrompt({ route: '/x' });
    for (const k of ['cognition_score', 'visual_hierarchy_score', 'cta_prominence_score', 'highlight_regions', 'confidence']) {
      expect(p.user).toContain(k);
    }
  });

  it('includes viewport label when supplied', () => {
    const p = buildVisionPrompt({ route: '/x', viewport: { width: 390, height: 844, label: 'mobile' } });
    expect(p.user).toContain('mobile (390×844)');
  });

  it('includes comparison instruction when comparing=true', () => {
    const p = buildVisionPrompt({ route: '/x', comparing: true });
    expect(p.user.toLowerCase()).toContain('previous screenshot');
  });
});

// ---------------------------------------------------------------------------
// visionResponseNormalizer
// ---------------------------------------------------------------------------

describe('normalizeVisionResponse', () => {
  it('parses a clean JSON string', () => {
    const out = normalizeVisionResponse(JSON.stringify({
      overall_assessment: 'Looks fine.',
      cognition_score: 80, visual_hierarchy_score: 70, cta_prominence_score: 75,
      aesthetic_harmony_score: 65, workflow_intuitiveness_score: 80, accessibility_score: 60,
      observations: ['ok'], concerns: [], suggested_improvements: [], highlight_regions: [], confidence: 90,
    }));
    expect(out.cognition_score).toBe(80);
    expect(out.confidence).toBe(90);
    expect(out.source).toBe('llm');
  });

  it('strips ```json fences', () => {
    const out = normalizeVisionResponse('```json\n{"cognition_score": 50, "confidence": 60}\n```');
    expect(out.cognition_score).toBe(50);
  });

  it('falls back to structured zeros when JSON is invalid', () => {
    const out = normalizeVisionResponse('not json');
    expect(out.cognition_score).toBe(0);
    expect(out.confidence).toBe(0);
  });

  it('clamps out-of-range scores', () => {
    const out = normalizeVisionResponse('{"cognition_score": 250}');
    expect(out.cognition_score).toBe(100);
  });

  it('drops invalid highlight regions', () => {
    const out = normalizeVisionResponse('{"highlight_regions":[{"kind":"x","x_pct":10,"y_pct":10,"width_pct":0,"height_pct":0}]}');
    expect(out.highlight_regions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// visionResultCache
// ---------------------------------------------------------------------------

describe('visionResultCache', () => {
  beforeEach(() => _resetCacheForTests());

  it('returns null on miss', () => {
    expect(getCached('nope')).toBeNull();
  });

  it('returns cached entry, tagged source=cached', () => {
    const k = makeCacheKey({ screenshot_path: '/a.png' });
    setCached(k, normalizeVisionResponse('{"cognition_score": 70}'));
    const out = getCached(k);
    expect(out).not.toBeNull();
    expect(out?.source).toBe('cached');
    expect(out?.cognition_score).toBe(70);
  });

  it('hit_rate computes correctly', () => {
    const k = makeCacheKey({ screenshot_path: '/a.png' });
    setCached(k, normalizeVisionResponse('{"cognition_score": 70}'));
    getCached(k);          // hit
    getCached('miss');     // miss
    const stats = getCacheStats();
    expect(stats.hit_rate).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// blendReasoningScores
// ---------------------------------------------------------------------------

describe('blendReasoningScores', () => {
  function visionStub(overrides: any = {}) {
    return {
      hierarchy: { hierarchy_score: 80, weight_tiers: 3, competing_primaries: 0, heading_path: [], findings: [] },
      density: { action_count: 0, viewport_area: 0, density_per_100k_px: 0, density_health: 80, category: 'comfortable', findings: [] },
      cta: { primary_label: null, primary_weight: 0, primary_position: 'unknown', is_dominant: false, cta_score: 75, findings: [] },
      dom_semantic: { action_count: 0, primary_action_candidates: [], heading_levels: {}, focusable_count: 0, missing_aria_labels: [], nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: [] },
      screenshot: null,
      cognition_score: 78,
      summary: '',
      ...overrides,
    } as any;
  }

  it('high LLM confidence biases blend toward the LLM scores', () => {
    const result = blendReasoningScores(
      normalizeVisionResponse('{"cognition_score": 50, "visual_hierarchy_score": 50, "cta_prominence_score": 50, "aesthetic_harmony_score": 60, "workflow_intuitiveness_score": 50, "accessibility_score": 50, "confidence": 90}'),
      visionStub(),
    );
    expect(result.llm_weight).toBeGreaterThanOrEqual(0.9);
    // Blended cognition should be closer to 50 (LLM) than 78 (heuristic)
    expect(result.cognition_score).toBeLessThan(78);
  });

  it('rule_based source means heuristic-only blend', () => {
    const stub = normalizeVisionResponse('{"cognition_score": 50}', 'rule_based');
    const result = blendReasoningScores(stub, visionStub());
    expect(result.llm_weight).toBe(0);
  });

  it('returns LLM-only blend when no heuristic', () => {
    const result = blendReasoningScores(
      normalizeVisionResponse('{"cognition_score": 60, "confidence": 80}'),
      null,
    );
    expect(result.heuristic_weight).toBe(0);
    expect(result.cognition_score).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// aestheticHarmonyAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeAestheticHarmony', () => {
  function vision(overrides: any = {}) {
    return {
      hierarchy: { hierarchy_score: 80, weight_tiers: 3, competing_primaries: 0, heading_path: [], findings: [] },
      density: { action_count: 4, viewport_area: 1000000, density_per_100k_px: 4, density_health: 100, category: 'comfortable', findings: [] },
      cta: { primary_label: null, primary_weight: 0, primary_position: 'unknown', is_dominant: false, cta_score: 80, findings: [] },
      dom_semantic: { action_count: 4, primary_action_candidates: [], heading_levels: { h1: 1 }, focusable_count: 4, missing_aria_labels: [], nav_landmarks: 1, form_count: 0, nested_action_zones: [{ depth: 2, action_count: 4 }], semantic_warnings: [] },
      screenshot: null,
      cognition_score: 80, summary: '',
      ...overrides,
    } as any;
  }

  it('high harmony for clean comfortable layouts', () => {
    const r = analyzeAestheticHarmony(vision());
    expect(r.aggregate).toBeGreaterThanOrEqual(85);
    expect(r.findings.length).toBe(0);
  });

  it('overloaded density tanks spacing_rhythm', () => {
    const r = analyzeAestheticHarmony(vision({
      density: { action_count: 100, viewport_area: 1000000, density_per_100k_px: 100, density_health: 0, category: 'overloaded', findings: [] },
    }));
    expect(r.spacing_rhythm).toBeLessThan(50);
    expect(r.findings.some(f => f.kind === 'spacing_rhythm' && f.severity === 'high')).toBe(true);
  });

  it('flat hierarchy (1 weight tier) drops visual_balance', () => {
    const r = analyzeAestheticHarmony(vision({
      hierarchy: { hierarchy_score: 80, weight_tiers: 1, competing_primaries: 0, heading_path: [], findings: [] },
    }));
    expect(r.visual_balance).toBeLessThan(80);
  });

  it('missing h1 drops typography_consistency', () => {
    const r = analyzeAestheticHarmony(vision({
      dom_semantic: { action_count: 4, primary_action_candidates: [], heading_levels: {}, focusable_count: 4, missing_aria_labels: [], nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: ['No <h1> found.'] },
    }));
    expect(r.typography_consistency).toBeLessThan(85);
  });
});

// ---------------------------------------------------------------------------
// visualDiffAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeVisualDiff', () => {
  function visionAt(scores: { cog?: number; hier?: number; cta?: number; density?: number; cta_pos?: 'above_fold' | 'below_fold' | 'unknown'; density_cat?: string; missing?: number }) {
    return {
      hierarchy: { hierarchy_score: scores.hier ?? 80, weight_tiers: 3, competing_primaries: 0, heading_path: [], findings: [] },
      density: { action_count: 0, viewport_area: 0, density_per_100k_px: 0, density_health: scores.density ?? 80, category: scores.density_cat ?? 'comfortable', findings: [] },
      cta: { primary_label: null, primary_weight: 0, primary_position: scores.cta_pos ?? 'above_fold', is_dominant: false, cta_score: scores.cta ?? 80, findings: [] },
      dom_semantic: { action_count: 0, primary_action_candidates: [], heading_levels: {}, focusable_count: 0, missing_aria_labels: Array(scores.missing ?? 0).fill('x'), nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: [] },
      screenshot: null,
      cognition_score: scores.cog ?? 80,
      summary: '',
    } as any;
  }

  it('detects no diff when scores within tolerance', () => {
    const r = analyzeVisualDiff(visionAt({ cog: 80 }), visionAt({ cog: 81 }));
    expect(r.entries.length).toBe(0);
  });

  it('detects an improvement when CTA goes up significantly', () => {
    const r = analyzeVisualDiff(visionAt({ cta: 50 }), visionAt({ cta: 80 }));
    expect(r.is_improvement).toBe(true);
    expect(r.entries.some(e => e.dimension === 'cta_score' && e.direction === 'improved')).toBe(true);
  });

  it('detects a regression when cognition drops a lot', () => {
    const r = analyzeVisualDiff(visionAt({ cog: 90 }), visionAt({ cog: 60 }));
    expect(r.is_regression).toBe(true);
    expect(r.entries.find(e => e.dimension === 'cognition_score')?.severity).toBe('high');
  });

  it('detects CTA position shift', () => {
    const r = analyzeVisualDiff(visionAt({ cta_pos: 'above_fold' }), visionAt({ cta_pos: 'below_fold' }));
    expect(r.entries.some(e => e.dimension === 'cta_position' && e.severity === 'high')).toBe(true);
  });

  it('detects density category shift', () => {
    const r = analyzeVisualDiff(visionAt({ density_cat: 'comfortable' }), visionAt({ density_cat: 'overloaded' }));
    expect(r.entries.some(e => e.dimension === 'density_category')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// adaptivePriorityWeighting
// ---------------------------------------------------------------------------

function mkTask(id: string, type: any, rank: number): AuthoritativeTask {
  return Object.freeze({
    id, project_id: PROJECT_ID, bp_id: 'bp', title: `T-${id}`, type,
    priority_score: 50, blocking_score: 50, dependency_score: 50,
    maturity_gain: 50, readiness_gain: 50, confidence_score: 70, execution_cost: 30,
    dependencies: Object.freeze([]),
    calculated_rank: rank,
    state: 'ready',
    reasoning: Object.freeze([]),
  }) as AuthoritativeTask;
}

describe('computeWeightFactor', () => {
  it('returns 1.0 for a calm project', () => {
    expect(computeWeightFactor({})).toBe(1.0);
  });

  it('drops factor for high friction', () => {
    expect(computeWeightFactor({ friction_pressure: 70 })).toBeLessThan(0.7);
  });

  it('drops further when regression + low cognition + high contradictions stack', () => {
    const f = computeWeightFactor({
      friction_pressure: 70,
      worst_cognition_score: 30,
      has_recent_regression: true,
      unresolved_high_contradictions: 5,
    });
    expect(f).toBeLessThanOrEqual(0.5);
  });

  it('floor is 0.4', () => {
    expect(computeWeightFactor({
      friction_pressure: 100,
      worst_cognition_score: 0,
      has_recent_regression: true,
      unresolved_high_contradictions: 20,
      rage_routes: 20, loop_routes: 20, abandon_routes: 20,
    })).toBeGreaterThanOrEqual(0.4);
  });
});

describe('applyAdaptiveWeighting', () => {
  it('factor 1.0 returns tasks unchanged', () => {
    const tasks = [mkTask('a', 'backend', -10), mkTask('b', 'ui_review', -5)];
    const r = applyAdaptiveWeighting(tasks, {});
    expect(r.adjustments.length).toBe(0);
    expect(r.tasks).toBe(tasks);
  });

  it('elevated pressure pulls visual tasks earlier than backend tasks', () => {
    const tasks = [
      mkTask('a', 'backend', -20),
      mkTask('b', 'ui_review', -5),
    ];
    const r = applyAdaptiveWeighting(tasks, { friction_pressure: 70 });
    const adjVisual = r.adjustments.find(adj => adj.task_id === 'b');
    expect(adjVisual).toBeTruthy();
    expect(Math.abs(adjVisual!.delta)).toBeGreaterThan(0);
    // Visual delta should be larger in magnitude than backend delta
    const adjBackend = r.adjustments.find(adj => adj.task_id === 'a');
    if (adjBackend) {
      expect(Math.abs(adjVisual!.delta)).toBeGreaterThan(Math.abs(adjBackend.delta));
    }
  });

  it('output is sorted by adjusted rank ascending', () => {
    const tasks = [mkTask('a', 'backend', 0), mkTask('b', 'ui_review', 0)];
    const r = applyAdaptiveWeighting(tasks, { friction_pressure: 70 });
    for (let i = 1; i < r.tasks.length; i++) {
      expect(r.tasks[i].calculated_rank).toBeGreaterThanOrEqual(r.tasks[i - 1].calculated_rank);
    }
  });
});

// ---------------------------------------------------------------------------
// uxPressureEscalation
// ---------------------------------------------------------------------------

describe('computeUXPressure', () => {
  it('returns calm tier for empty inputs', () => {
    const r = computeUXPressure({}, 1.0);
    expect(r.tier).toBe('calm');
    expect(r.pressure_level).toBe(0);
  });

  it('escalates to elevated with friction 40', () => {
    const r = computeUXPressure({ friction_pressure: 40 }, 0.85);
    expect(['elevated', 'urgent']).toContain(r.tier);
  });

  it('escalates to critical with regression + high friction + bad cognition', () => {
    const r = computeUXPressure({
      friction_pressure: 70,
      worst_cognition_score: 30,
      has_recent_regression: true,
      unresolved_high_contradictions: 5,
      rage_routes: 5, loop_routes: 3, abandon_routes: 4,
    }, 0.4);
    expect(r.tier).toBe('critical');
    expect(r.recommended_action.toLowerCase()).toContain('halt');
  });
});

// ---------------------------------------------------------------------------
// multimodalContradictionResolver
// ---------------------------------------------------------------------------

describe('detectMultimodalContradictions', () => {
  const baseHeuristic = {
    hierarchy: { hierarchy_score: 50, weight_tiers: 2, competing_primaries: 0, heading_path: [], findings: [] },
    density: { action_count: 0, viewport_area: 0, density_per_100k_px: 0, density_health: 50, category: 'comfortable', findings: [] },
    cta: { primary_label: null, primary_weight: 0, primary_position: 'unknown', is_dominant: false, cta_score: 50, findings: [] },
    dom_semantic: { action_count: 0, primary_action_candidates: [], heading_levels: {}, focusable_count: 0, missing_aria_labels: [], nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: [] },
    screenshot: null,
    cognition_score: 50,
    summary: '',
  } as any;

  it('flags visual_vs_dom_conflict on big LLM/heuristic divergence', () => {
    const flags = detectMultimodalContradictions({
      project_id: PROJECT_ID,
      route: '/x',
      multimodal: normalizeVisionResponse('{"cognition_score": 90, "confidence": 80}'),
      heuristic: baseHeuristic,
    });
    expect(flags.some(f => f.kind === 'visual_vs_dom_conflict')).toBe(true);
  });

  it('flags aesthetic_vs_accessibility_conflict when aesthetic high but a11y low', () => {
    const flags = detectMultimodalContradictions({
      project_id: PROJECT_ID,
      route: '/x',
      multimodal: normalizeVisionResponse('{"aesthetic_harmony_score": 85, "accessibility_score": 40, "confidence": 80}'),
    });
    expect(flags.some(f => f.kind === 'aesthetic_vs_accessibility_conflict')).toBe(true);
  });

  it('flags behavioral_vs_visual_conflict for healthy page with rage clicks', () => {
    const flags = detectMultimodalContradictions({
      project_id: PROJECT_ID,
      route: '/x',
      multimodal: normalizeVisionResponse('{"cognition_score": 85, "confidence": 80}'),
      behavioral: { rage_clicks: 5, nav_loops: 0, form_abandons: 0, abandonment_rate: 20 },
    });
    expect(flags.some(f => f.kind === 'behavioral_vs_visual_conflict')).toBe(true);
  });

  it('flags regression_without_manifest', () => {
    const flags = detectMultimodalContradictions({
      project_id: PROJECT_ID,
      route: '/x',
      multimodal: normalizeVisionResponse('{}'),
      has_recent_regression: true,
      recent_manifest_touched_route: false,
    });
    expect(flags.some(f => f.kind === 'regression_without_manifest')).toBe(true);
  });

  it('flags unresolved_visual_regression on persistent regression', () => {
    const flags = detectMultimodalContradictions({
      project_id: PROJECT_ID,
      route: '/x',
      multimodal: normalizeVisionResponse('{}'),
      has_recent_regression: true,
      regression_persisted_from_previous: true,
    });
    expect(flags.some(f => f.kind === 'unresolved_visual_regression')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// viewportIntelligence
// ---------------------------------------------------------------------------

describe('compareViewports', () => {
  function vp(label: any, overrides: any = {}) {
    return {
      viewport: label,
      heuristic: {
        hierarchy: { hierarchy_score: 80, weight_tiers: 3, competing_primaries: 0, heading_path: [], findings: [] },
        density: { action_count: 5, viewport_area: 1000000, density_per_100k_px: 5, density_health: 100, category: 'comfortable', findings: [] },
        cta: { primary_label: null, primary_weight: 0, primary_position: 'above_fold', is_dominant: false, cta_score: 80, findings: [] },
        dom_semantic: { action_count: 5, primary_action_candidates: [], heading_levels: {}, focusable_count: 5, missing_aria_labels: [], nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: [] },
        screenshot: null,
        cognition_score: 80,
        summary: '',
        ...overrides.heuristic,
      },
    } as any;
  }

  it('flags mobile_only_overload when mobile is overloaded but desktop is not', () => {
    const r = compareViewports([
      vp('desktop'),
      vp('mobile', { heuristic: { density: { action_count: 100, viewport_area: 100000, density_per_100k_px: 100, density_health: 0, category: 'overloaded', findings: [] } } }),
    ]);
    expect(r.findings.some(f => f.kind === 'mobile_only_overload')).toBe(true);
  });

  it('flags mobile_below_fold_cta', () => {
    const r = compareViewports([
      vp('desktop'),
      vp('mobile', { heuristic: { cta: { primary_label: null, primary_weight: 0, primary_position: 'below_fold', is_dominant: false, cta_score: 60, findings: [] } } }),
    ]);
    expect(r.findings.some(f => f.kind === 'mobile_below_fold_cta')).toBe(true);
  });

  it('returns worst_viewport with lowest cognition', () => {
    const r = compareViewports([
      vp('desktop', { heuristic: { cognition_score: 90 } }),
      vp('mobile', { heuristic: { cognition_score: 50 } }),
    ]);
    expect(r.worst_viewport).toBe('mobile');
  });
});

// ---------------------------------------------------------------------------
// autoAnnotationGenerator
// ---------------------------------------------------------------------------

describe('generateAutoAnnotations', () => {
  it('maps cta_weakness to hierarchy/high', () => {
    const drafts = generateAutoAnnotations(
      normalizeVisionResponse('{"highlight_regions": [{"kind": "cta_weakness", "x_pct": 10, "y_pct": 20, "width_pct": 30, "height_pct": 5, "label": "weak save button"}]}'),
      { width: 1000, height: 800 },
    );
    expect(drafts.length).toBe(1);
    expect(drafts[0].kind).toBe('hierarchy');
    expect(drafts[0].severity).toBe('high');
  });

  it('converts pct → px correctly', () => {
    const drafts = generateAutoAnnotations(
      normalizeVisionResponse('{"highlight_regions": [{"kind": "alignment_break", "x_pct": 25, "y_pct": 50, "width_pct": 10, "height_pct": 5, "label": "x"}]}'),
      { width: 1000, height: 800 },
    );
    expect(drafts[0].region).toEqual({ x: 250, y: 400, width: 100, height: 40 });
  });
});
