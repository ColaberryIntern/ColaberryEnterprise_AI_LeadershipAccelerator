/**
 * Phase 6 tests — pure helpers.
 *
 * Coverage:
 *   - domSemanticAnalyzer (heading discipline, missing aria, action density)
 *   - visualHierarchyAnalyzer (competing primaries, flat hierarchy)
 *   - layoutDensityAnalyzer (sparse/comfortable/busy/overloaded)
 *   - ctaProminenceAnalyzer (hidden cta, weak cta, below-fold)
 *   - visionAnalysisEngine (composite cognition_score)
 *   - visualContradictionDetector (8 detectors)
 *   - behavioralSignalAnalyzer (rage clicks, abandonment rate, friction pressure)
 *   - userFlowIntelligence (edges, drop-offs, completion rate)
 *   - uxImpactPredictor (kind-aware deltas)
 *   - uxRegressionDetector (delta thresholds)
 */
import { analyzeDOMSemantics, type DOMNode } from '../vision/domSemanticAnalyzer';
import { analyzeVisualHierarchy } from '../vision/visualHierarchyAnalyzer';
import { analyzeLayoutDensity } from '../vision/layoutDensityAnalyzer';
import { analyzeCTAProminence } from '../vision/ctaProminenceAnalyzer';
import { runVisionAnalysis } from '../vision/visionAnalysisEngine';
import { detectVisualContradictions } from '../vision/visualContradictionDetector';
import { predictUXImpact } from '../vision/uxImpactPredictor';
import { detectUXRegression } from '../vision/uxRegressionDetector';
import { analyzeBehavioralSignals, type BehavioralEvent } from '../behavioral/behavioralSignalAnalyzer';
import { analyzeUserFlow } from '../behavioral/userFlowIntelligence';

const VALID_PROJECT_ID = '11111111-1111-4111-8111-111111111111';

// Helper: build a small DOM tree
function dom(children?: DOMNode[]): DOMNode {
  return { tag: 'body', children };
}
function btn(label: string, weight: number, focusable = true, y?: number): DOMNode {
  return { tag: 'button', label, visual_weight: weight, focusable, position: y !== undefined ? { x: 10, y, width: 100, height: 40 } : undefined };
}

// ---------------------------------------------------------------------------
// domSemanticAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeDOMSemantics', () => {
  it('returns empty report for null root', () => {
    const r = analyzeDOMSemantics(null);
    expect(r.action_count).toBe(0);
    expect(r.semantic_warnings.length).toBe(0);
  });

  it('counts headings + flags missing h1', () => {
    const tree = dom([{ tag: 'h2', label: 'Section' }]);
    const r = analyzeDOMSemantics(tree);
    expect(r.heading_levels.h2).toBe(1);
    expect(r.semantic_warnings.some(w => w.includes('No <h1>'))).toBe(true);
  });

  it('flags multiple h1 elements', () => {
    const tree = dom([{ tag: 'h1', label: 'A' }, { tag: 'h1', label: 'B' }]);
    const r = analyzeDOMSemantics(tree);
    expect(r.semantic_warnings.some(w => w.includes('h1'))).toBe(true);
  });

  it('flags icon-only buttons missing aria-label', () => {
    const tree = dom([{ tag: 'button' }]);
    const r = analyzeDOMSemantics(tree);
    expect(r.missing_aria_labels.length).toBe(1);
  });

  it('captures primary action candidates with weight >= 50', () => {
    const tree = dom([btn('Save', 80), btn('Cancel', 30), btn('Delete', 60)]);
    const r = analyzeDOMSemantics(tree);
    expect(r.primary_action_candidates.length).toBe(2);
    expect(r.primary_action_candidates[0].label).toBe('Save');
  });
});

// ---------------------------------------------------------------------------
// visualHierarchyAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeVisualHierarchy', () => {
  it('flags competing primaries when 2+ high-weight actions', () => {
    const tree = dom([btn('Save', 80), btn('Submit', 85), btn('Delete', 75)]);
    const r = analyzeVisualHierarchy(tree);
    expect(r.competing_primaries).toBe(3);
    expect(r.findings.some(f => f.kind === 'competing_primaries')).toBe(true);
  });

  it('flags flat hierarchy when all weights are similar', () => {
    const tree = dom([btn('a', 50), btn('b', 50), btn('c', 50), btn('d', 50)]);
    const r = analyzeVisualHierarchy(tree);
    expect(r.findings.some(f => f.kind === 'flat_hierarchy')).toBe(true);
  });

  it('flags no_primary when no action carries high weight', () => {
    const tree = dom([btn('a', 30), btn('b', 25)]);
    const r = analyzeVisualHierarchy(tree);
    expect(r.findings.some(f => f.kind === 'no_primary')).toBe(true);
  });

  it('detects heading skip', () => {
    const tree = dom([{ tag: 'h1', label: 'a' }, { tag: 'h4', label: 'b' }]);
    const r = analyzeVisualHierarchy(tree);
    expect(r.findings.some(f => f.kind === 'heading_skip')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// layoutDensityAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeLayoutDensity', () => {
  const viewport = { width: 1280, height: 720 };

  it('classifies a single-action page as sparse', () => {
    const tree = dom([btn('a', 60)]);
    const r = analyzeLayoutDensity(tree, viewport);
    expect(r.category).toBe('sparse');
    expect(r.density_health).toBeGreaterThan(60);
  });

  it('classifies a sane 30-action page as comfortable or busy', () => {
    const buttons = Array.from({ length: 30 }, (_, i) => btn(`a${i}`, 50));
    const tree = dom(buttons);
    const r = analyzeLayoutDensity(tree, viewport);
    expect(['comfortable', 'busy']).toContain(r.category);
  });

  it('classifies an extreme 100-action page as overloaded', () => {
    const buttons = Array.from({ length: 100 }, (_, i) => btn(`a${i}`, 50));
    const tree = dom(buttons);
    const r = analyzeLayoutDensity(tree, viewport);
    expect(r.category).toBe('overloaded');
    expect(r.findings.some(f => f.kind === 'overloaded_action_zone')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ctaProminenceAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeCTAProminence', () => {
  const viewport = { width: 1280, height: 720 };

  it('flags hidden_primary_cta when top action weight is low', () => {
    const tree = dom([btn('Maybe save', 20), btn('Cancel', 18)]);
    const r = analyzeCTAProminence(tree, viewport);
    expect(r.findings.some(f => f.kind === 'hidden_primary_cta')).toBe(true);
  });

  it('flags below_fold position', () => {
    const tree = dom([btn('Save', 90, true, 1500)]);
    const r = analyzeCTAProminence(tree, viewport);
    expect(r.primary_position).toBe('below_fold');
    expect(r.findings.some(f => f.description.includes('below the fold'))).toBe(true);
  });

  it('healthy CTA above the fold scores high', () => {
    const tree = dom([btn('Save', 90, true, 200), btn('Cancel', 30, true, 200)]);
    const r = analyzeCTAProminence(tree, viewport);
    expect(r.cta_score).toBeGreaterThan(80);
    expect(r.is_dominant).toBe(true);
  });

  it('flags no_cta_at_all when page has no actions', () => {
    const tree = dom([{ tag: 'h1', label: 'Hello' }]);
    const r = analyzeCTAProminence(tree, viewport);
    expect(r.findings.some(f => f.kind === 'no_cta_at_all')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// visionAnalysisEngine
// ---------------------------------------------------------------------------

describe('runVisionAnalysis', () => {
  it('produces a composite cognition_score', () => {
    const tree = dom([
      { tag: 'h1', label: 'Title' },
      btn('Save', 90, true, 200),
      btn('Cancel', 30, true, 200),
    ]);
    const report = runVisionAnalysis({ dom: tree, viewport: { width: 1280, height: 720 } });
    expect(report.cognition_score).toBeGreaterThan(0);
    expect(report.summary).toContain('hierarchy');
  });
});

// ---------------------------------------------------------------------------
// visualContradictionDetector
// ---------------------------------------------------------------------------

describe('detectVisualContradictions', () => {
  function reportFromTree(tree: DOMNode) {
    return runVisionAnalysis({ dom: tree, viewport: { width: 1280, height: 720 } });
  }

  it('emits hidden_primary_cta when CTA is below fold', () => {
    const tree = dom([btn('Save', 80, true, 1500)]);
    const flags = detectVisualContradictions({
      project_id: VALID_PROJECT_ID,
      route: '/x',
      vision: reportFromTree(tree),
    });
    expect(flags.some(f => f.kind === 'hidden_primary_cta')).toBe(true);
  });

  it('emits visual_hierarchy_mismatch when multiple primaries compete', () => {
    const tree = dom([btn('Save', 90), btn('Submit', 90), btn('Delete', 85)]);
    const flags = detectVisualContradictions({
      project_id: VALID_PROJECT_ID,
      route: '/x',
      vision: reportFromTree(tree),
    });
    expect(flags.some(f => f.kind === 'visual_hierarchy_mismatch')).toBe(true);
  });

  it('emits overloaded_action_zone for extreme density', () => {
    const buttons = Array.from({ length: 100 }, (_, i) => btn(`a${i}`, 50));
    const tree = dom(buttons);
    const flags = detectVisualContradictions({
      project_id: VALID_PROJECT_ID,
      route: '/x',
      vision: reportFromTree(tree),
    });
    expect(flags.some(f => f.kind === 'overloaded_action_zone')).toBe(true);
  });

  it('emits workflow_dead_end when is_dead_end is true', () => {
    const tree = dom([btn('Save', 90, true, 200)]);
    const flags = detectVisualContradictions({
      project_id: VALID_PROJECT_ID,
      route: '/x',
      vision: reportFromTree(tree),
      is_dead_end: true,
    });
    expect(flags.some(f => f.kind === 'workflow_dead_end')).toBe(true);
  });

  it('emits orphan_navigation_path for unknown outbound routes', () => {
    const tree = dom([btn('Save', 80, true, 200)]);
    const flags = detectVisualContradictions({
      project_id: VALID_PROJECT_ID,
      route: '/x',
      vision: reportFromTree(tree),
      outbound_routes: ['/admin/foo', '/unknown/bar'],
      all_known_routes: ['/x', '/admin/foo'],
    });
    expect(flags.some(f => f.kind === 'orphan_navigation_path')).toBe(true);
  });

  it('escalates rage_clicks to hidden_primary_cta', () => {
    const tree = dom([btn('Save', 80, true, 200)]);
    const flags = detectVisualContradictions({
      project_id: VALID_PROJECT_ID,
      route: '/x',
      vision: reportFromTree(tree),
      behavioral: { rage_clicks: 7, nav_loops: 0, form_retries: 0, abandonment_rate: 0 },
    });
    expect(flags.some(f => f.kind === 'hidden_primary_cta' && (f.evidence as any).source === 'behavioral')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// behavioralSignalAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeBehavioralSignals', () => {
  function ev(route: string, kind: string, session = 's1', extra: Partial<BehavioralEvent> = {}): BehavioralEvent {
    return { route, kind: kind as any, session_id: session, observed_at: new Date(), ...extra };
  }

  it('returns zero state for empty input', () => {
    const r = analyzeBehavioralSignals([]);
    expect(r.project_friction_pressure).toBe(0);
    expect(r.per_route.length).toBe(0);
  });

  it('counts rage_clicks per route', () => {
    const events = [ev('/a', 'rage_click'), ev('/a', 'rage_click'), ev('/b', 'rage_click')];
    const r = analyzeBehavioralSignals(events);
    const a = r.per_route.find(p => p.route === '/a')!;
    const b = r.per_route.find(p => p.route === '/b')!;
    expect(a.rage_clicks).toBe(2);
    expect(b.rage_clicks).toBe(1);
  });

  it('computes abandonment_rate correctly', () => {
    const events: BehavioralEvent[] = [
      ev('/x', 'nav_enter', 's1'),
      ev('/x', 'form_submit', 's1'),
      ev('/x', 'nav_enter', 's2'),
      ev('/x', 'nav_enter', 's3'),
    ];
    const r = analyzeBehavioralSignals(events);
    const x = r.per_route.find(p => p.route === '/x')!;
    expect(x.session_count).toBe(3);
    // 1 of 3 sessions submitted → 67% abandonment
    expect(x.abandonment_rate).toBe(67);
  });

  it('worst_route is the highest friction_pressure', () => {
    const events: BehavioralEvent[] = [
      ev('/a', 'rage_click'),
      ev('/b', 'rage_click'),
      ev('/b', 'rage_click'),
      ev('/b', 'form_abandon'),
    ];
    const r = analyzeBehavioralSignals(events);
    expect(r.worst_route).toBe('/b');
  });
});

// ---------------------------------------------------------------------------
// userFlowIntelligence
// ---------------------------------------------------------------------------

describe('analyzeUserFlow', () => {
  function ev(session: string, route: string, kind: string, ts: number): BehavioralEvent {
    return { session_id: session, route, kind: kind as any, observed_at: new Date(ts) };
  }

  it('extracts edges from session-ordered nav events', () => {
    const events = [
      ev('s1', '/a', 'nav_enter', 1),
      ev('s1', '/b', 'nav_enter', 2),
      ev('s1', '/c', 'nav_enter', 3),
    ];
    const r = analyzeUserFlow(events);
    const ab = r.edges.find(e => e.from === '/a' && e.to === '/b');
    const bc = r.edges.find(e => e.from === '/b' && e.to === '/c');
    expect(ab?.count).toBe(1);
    expect(bc?.count).toBe(1);
  });

  it('detects drop-off when sessions enter without exiting/submitting', () => {
    const events = [
      ev('s1', '/x', 'nav_enter', 1),
      ev('s2', '/x', 'nav_enter', 1),
      ev('s2', '/x', 'form_submit', 2),
    ];
    const r = analyzeUserFlow(events);
    const drop = r.drop_off_points.find(d => d.route === '/x');
    expect(drop?.count).toBe(1);
  });

  it('reports completion_rate as ratio with form_submit', () => {
    const events = [
      ev('s1', '/x', 'nav_enter', 1),
      ev('s1', '/x', 'form_submit', 2),
      ev('s2', '/x', 'nav_enter', 3),
    ];
    const r = analyzeUserFlow(events);
    expect(r.completion_rate).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// uxImpactPredictor
// ---------------------------------------------------------------------------

describe('predictUXImpact', () => {
  function visionStub(overrides: any = {}) {
    return {
      hierarchy: { hierarchy_score: 50, weight_tiers: 1, competing_primaries: 0, heading_path: [], findings: [] },
      density: { action_count: 0, viewport_area: 0, density_per_100k_px: 0, density_health: 50, category: 'comfortable', findings: [] },
      cta: { primary_label: null, primary_weight: 0, primary_position: 'unknown', is_dominant: false, cta_score: 50, findings: [] },
      dom_semantic: { action_count: 0, primary_action_candidates: [], heading_levels: {}, focusable_count: 0, missing_aria_labels: [], nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: [] },
      screenshot: null,
      cognition_score: 50,
      summary: '',
      ...overrides,
    } as any;
  }

  it('hierarchy suggestion lifts workflow + onboarding', () => {
    const r = predictUXImpact({ kind: 'hierarchy', title: 't', expected_ux_impact: 30 }, visionStub());
    expect(r.workflow_completion_delta).toBeGreaterThan(0);
    expect(r.onboarding_delta).toBeGreaterThan(0);
  });

  it('layout suggestion against overloaded density yields negative friction (i.e., friction reduced)', () => {
    const r = predictUXImpact(
      { kind: 'layout', title: 't', expected_ux_impact: 30 },
      visionStub({ density: { action_count: 200, viewport_area: 1000000, density_per_100k_px: 20, density_health: 0, category: 'overloaded', findings: [] } }),
    );
    expect(r.friction_delta).toBeLessThan(0);
  });

  it('accessibility suggestion lifts accessibility', () => {
    const r = predictUXImpact({ kind: 'accessibility', title: 't', expected_ux_impact: 40 }, visionStub());
    expect(r.accessibility_delta).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// uxRegressionDetector
// ---------------------------------------------------------------------------

describe('detectUXRegression', () => {
  function vision(scores: { cta?: number; hier?: number; density?: number; cog?: number; missing?: number; competing?: number }) {
    return {
      hierarchy: { hierarchy_score: scores.hier ?? 80, weight_tiers: 3, competing_primaries: scores.competing ?? 0, heading_path: [], findings: [] },
      density: { action_count: 0, viewport_area: 0, density_per_100k_px: 0, density_health: scores.density ?? 80, category: 'comfortable', findings: [] },
      cta: { primary_label: null, primary_weight: 0, primary_position: 'unknown', is_dominant: false, cta_score: scores.cta ?? 80, findings: [] },
      dom_semantic: { action_count: 0, primary_action_candidates: [], heading_levels: {}, focusable_count: 0, missing_aria_labels: Array(scores.missing ?? 0).fill('x'), nav_landmarks: 0, form_count: 0, nested_action_zones: [], semantic_warnings: [] },
      screenshot: null,
      cognition_score: scores.cog ?? 80,
      summary: '',
    } as any;
  }

  it('reports no regression when scores improve', () => {
    const prev = vision({ cta: 60 });
    const curr = vision({ cta: 80 });
    const r = detectUXRegression(prev, curr);
    expect(r.is_regression).toBe(false);
  });

  it('reports cta regression when score drops 15+', () => {
    const prev = vision({ cta: 80 });
    const curr = vision({ cta: 50 });
    const r = detectUXRegression(prev, curr);
    expect(r.is_regression).toBe(true);
    expect(r.findings.some(f => f.dimension === 'cta_score')).toBe(true);
  });

  it('reports accessibility regression when issues count rises', () => {
    const prev = vision({ missing: 1 });
    const curr = vision({ missing: 4 });
    const r = detectUXRegression(prev, curr);
    expect(r.findings.some(f => f.dimension === 'accessibility')).toBe(true);
  });

  it('reports high severity when cognition drops 25+', () => {
    const prev = vision({ cog: 90 });
    const curr = vision({ cog: 60 });
    const r = detectUXRegression(prev, curr);
    const finding = r.findings.find(f => f.dimension === 'cognition_score');
    expect(finding?.severity).toBe('high');
  });
});
