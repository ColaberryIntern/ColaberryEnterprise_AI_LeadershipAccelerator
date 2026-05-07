/**
 * Phase 5 tests — pure helpers.
 *
 * Coverage:
 *   - uxDebtScorer (severity weighting + dimension routing + dominant pick)
 *   - workflowFrictionAnalyzer (excessive actions / duplicates / dead ends)
 *   - visualCritiqueEngine (template-based suggestion generation)
 *   - visualPriorityRanker (UX debt → ui_review tasks)
 *   - visualPromptGenerator (Claude-ready prompt assembly)
 */
import { scoreUXDebt, dominantDebtDimension, type CritiqueSnapshot } from '../visual/uxDebtScorer';
import { analyzeWorkflowFriction, type UIPageSummary } from '../visual/workflowFrictionAnalyzer';
import { generateSuggestionsFromCritique } from '../visual/visualCritiqueEngine';
import { rankVisualPriorityTasks } from '../visual/visualPriorityRanker';
import { generateVisualChangePackage } from '../visual/visualPromptGenerator';

// ---------------------------------------------------------------------------
// uxDebtScorer
// ---------------------------------------------------------------------------

describe('scoreUXDebt', () => {
  it('returns 0 debt when no critiques', () => {
    const r = scoreUXDebt([]);
    expect(r.total_debt).toBe(0);
    expect(r.ux_health).toBe(100);
  });

  it('routes spacing critiques to layout_debt', () => {
    const r = scoreUXDebt([{ id: 'a', kind: 'spacing', severity: 'high', resolved: false }]);
    expect(r.layout_debt).toBeGreaterThan(0);
    expect(r.workflow_debt).toBe(0);
  });

  it('resolved critiques don\'t count toward debt', () => {
    const open = scoreUXDebt([{ id: 'a', kind: 'workflow', severity: 'high', resolved: false }]);
    const resolved = scoreUXDebt([{ id: 'a', kind: 'workflow', severity: 'high', resolved: true }]);
    expect(open.workflow_debt).toBeGreaterThan(0);
    expect(resolved.workflow_debt).toBe(0);
  });

  it('severity weighting: high > medium > low', () => {
    const high = scoreUXDebt([{ id: 'a', kind: 'workflow', severity: 'high', resolved: false }]);
    const med = scoreUXDebt([{ id: 'a', kind: 'workflow', severity: 'medium', resolved: false }]);
    const low = scoreUXDebt([{ id: 'a', kind: 'workflow', severity: 'low', resolved: false }]);
    expect(high.workflow_debt).toBeGreaterThan(med.workflow_debt);
    expect(med.workflow_debt).toBeGreaterThan(low.workflow_debt);
  });

  it('accessibility carries the heaviest weight in the aggregate', () => {
    const accessibility = scoreUXDebt([
      { id: 'a', kind: 'accessibility', severity: 'high', resolved: false },
      { id: 'b', kind: 'accessibility', severity: 'high', resolved: false },
      { id: 'c', kind: 'accessibility', severity: 'high', resolved: false },
    ]);
    const layout = scoreUXDebt([
      { id: 'a', kind: 'spacing', severity: 'high', resolved: false },
      { id: 'b', kind: 'spacing', severity: 'high', resolved: false },
      { id: 'c', kind: 'spacing', severity: 'high', resolved: false },
    ]);
    expect(accessibility.total_debt).toBeGreaterThan(layout.total_debt);
  });

  it('dominantDebtDimension picks the highest dimension', () => {
    const r = scoreUXDebt([
      { id: 'a', kind: 'workflow', severity: 'high', resolved: false },
      { id: 'b', kind: 'workflow', severity: 'high', resolved: false },
      { id: 'c', kind: 'spacing', severity: 'low', resolved: false },
    ]);
    expect(dominantDebtDimension(r)).toBe('workflow_debt');
  });

  it('ux_health = 100 - total_debt', () => {
    const r = scoreUXDebt([
      { id: 'a', kind: 'workflow', severity: 'high', resolved: false },
    ]);
    expect(r.ux_health).toBe(100 - r.total_debt);
  });
});

// ---------------------------------------------------------------------------
// workflowFrictionAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeWorkflowFriction', () => {
  function mkPage(overrides: Partial<UIPageSummary>): UIPageSummary {
    return {
      route: '/x',
      category: 'admin',
      actions: [],
      ...overrides,
    };
  }

  it('returns empty findings for empty input', () => {
    const r = analyzeWorkflowFriction([]);
    expect(r.findings.length).toBe(0);
    expect(r.friction_score).toBe(0);
  });

  it('flags excessive actions (>7) as medium', () => {
    const actions = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, label: `Action ${i}`, kind: 'button' }));
    const r = analyzeWorkflowFriction([mkPage({ actions })]);
    expect(r.findings.some(f => f.kind === 'excessive_actions' && f.severity === 'medium')).toBe(true);
  });

  it('flags >12 actions as high cognitive load', () => {
    const actions = Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, label: `Action ${i}`, kind: 'button' }));
    const r = analyzeWorkflowFriction([mkPage({ actions })]);
    expect(r.findings.some(f => f.kind === 'high_cognitive_load' && f.severity === 'high')).toBe(true);
  });

  it('flags duplicate actions across pages', () => {
    const a1 = mkPage({ route: '/a', actions: [{ id: 'save', label: 'Save', kind: 'button' }] });
    const a2 = mkPage({ route: '/b', actions: [{ id: 'save2', label: 'Save', kind: 'button' }] });
    const r = analyzeWorkflowFriction([a1, a2]);
    expect(r.findings.some(f => f.kind === 'duplicate_actions')).toBe(true);
  });

  it('flags dead-end workflows (no actions, no critical workflows)', () => {
    const p = mkPage({ route: '/dead', actions: [], critical_workflows: [] });
    const r = analyzeWorkflowFriction([p]);
    expect(r.findings.some(f => f.kind === 'dead_end_workflow')).toBe(true);
  });

  it('flags inconsistent navigation when 3+ contexts mix', () => {
    const p = mkPage({
      route: '/admin/x',
      actions: [
        { id: 'a', kind: 'link', handler: '/admin/foo' },
        { id: 'b', kind: 'link', handler: '/portal/bar' },
        { id: 'c', kind: 'link', handler: '/public/baz' },
      ],
    });
    const r = analyzeWorkflowFriction([p]);
    expect(r.findings.some(f => f.kind === 'inconsistent_nav')).toBe(true);
  });

  it('friction_score saturates at 100', () => {
    const actions = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, label: `Action ${i}`, kind: 'button' }));
    const pages = Array.from({ length: 20 }, (_, i) => mkPage({ route: `/p${i}`, actions }));
    const r = analyzeWorkflowFriction(pages);
    expect(r.friction_score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// visualCritiqueEngine
// ---------------------------------------------------------------------------

describe('generateSuggestionsFromCritique', () => {
  it('produces at least one suggestion for a covered kind', () => {
    const suggestions = generateSuggestionsFromCritique({
      id: 'c1',
      kind: 'spacing',
      severity: 'medium',
      description: 'Buttons too tight',
    });
    expect(suggestions.length).toBeGreaterThan(0);
    // Spacing template should mention "vertical rhythm" or "baseline grid".
    expect(suggestions[0].body.toLowerCase()).toMatch(/rhythm|grid|spacing|whitespace/);
  });

  it('high severity boosts confidence and impact', () => {
    const high = generateSuggestionsFromCritique({ id: 'c1', kind: 'hierarchy', severity: 'high', description: '' });
    const low = generateSuggestionsFromCritique({ id: 'c2', kind: 'hierarchy', severity: 'low', description: '' });
    expect(high[0].confidence).toBeGreaterThan(low[0].confidence);
    expect(high[0].expected_ux_impact).toBeGreaterThan(low[0].expected_ux_impact);
  });

  it('embeds user description in rationale (truncated)', () => {
    const suggestions = generateSuggestionsFromCritique({
      id: 'c1', kind: 'spacing', severity: 'medium',
      description: 'The cards have inconsistent vertical spacing across breakpoints',
    });
    expect(suggestions[0].rationale).toContain('inconsistent vertical spacing');
  });

  it('returns empty array for unmapped kinds', () => {
    const suggestions = generateSuggestionsFromCritique({
      id: 'c1', kind: 'nonexistent_kind' as any, severity: 'medium', description: '',
    });
    expect(suggestions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// visualPriorityRanker
// ---------------------------------------------------------------------------

describe('rankVisualPriorityTasks', () => {
  const cleanDebt = scoreUXDebt([]);

  it('emits no tasks when total_debt < 20', () => {
    const tasks = rankVisualPriorityTasks({
      project_id: 'p1',
      ux_debt: cleanDebt,
    });
    expect(tasks).toEqual([]);
  });

  it('emits a dominant-dimension task when debt is meaningful', () => {
    const debt = scoreUXDebt([
      { id: 'a', kind: 'workflow', severity: 'high', resolved: false },
      { id: 'b', kind: 'workflow', severity: 'high', resolved: false },
    ]);
    const tasks = rankVisualPriorityTasks({
      project_id: 'p1',
      ux_debt: debt,
    });
    expect(tasks.length).toBe(1);
    expect(tasks[0].type).toBe('ui_review');
    expect(tasks[0].title.toLowerCase()).toContain('workflow');
  });

  it('emits a dedicated accessibility task when accessibility_debt >= 60', () => {
    const debt = scoreUXDebt([
      { id: 'a', kind: 'accessibility', severity: 'high', resolved: false },
      { id: 'b', kind: 'accessibility', severity: 'high', resolved: false },
      { id: 'c', kind: 'accessibility', severity: 'high', resolved: false },
    ]);
    const tasks = rankVisualPriorityTasks({
      project_id: 'p1',
      ux_debt: debt,
    });
    const accTask = tasks.find(t => t.id.endsWith(':accessibility'));
    expect(accTask).toBeTruthy();
    expect(accTask!.blocking_score).toBeGreaterThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// visualPromptGenerator
// ---------------------------------------------------------------------------

describe('generateVisualChangePackage', () => {
  it('renders a markdown prompt with all sections', () => {
    const pkg = generateVisualChangePackage({
      session_id: 's1',
      project_id: 'p1',
      bp_id: 'bp1',
      page_route: '/admin/dashboard',
      critiques: [{
        id: 'c1', kind: 'spacing', severity: 'medium',
        description: 'Tight stacking on the metrics row',
      }],
      accepted_suggestions: [{
        id: 's1', kind: 'layout',
        title: 'Increase whitespace',
        body: 'Use consistent vertical rhythm',
        rationale: 'Improves scannability',
        expected_ux_impact: 25,
      }],
      affected_components: ['frontend/src/components/Metrics.tsx'],
      screenshot_path: 'system/ui/visual_reviews/x.png',
    });

    expect(pkg.generated_prompt).toContain('Visual Improvement Build Package');
    expect(pkg.generated_prompt).toContain('/admin/dashboard');
    expect(pkg.generated_prompt).toContain('Critique items');
    expect(pkg.generated_prompt).toContain('Accepted improvements');
    expect(pkg.generated_prompt).toContain('Increase whitespace');
    expect(pkg.generated_prompt).toContain('Definition of Done');
    expect(pkg.generated_prompt).toContain('BuildManifest');
  });

  it('projected_ux_gain averages accepted impacts', () => {
    const pkg = generateVisualChangePackage({
      session_id: 's1', project_id: 'p1', bp_id: null,
      page_route: '/x',
      critiques: [],
      accepted_suggestions: [
        { id: 's1', kind: 'layout', title: 'A', body: 'a', expected_ux_impact: 20, rationale: null },
        { id: 's2', kind: 'layout', title: 'B', body: 'b', expected_ux_impact: 40, rationale: null },
      ],
    });
    expect(pkg.projected_ux_gain).toBe(30);
  });

  it('expected_outcomes filters by impact >= 15', () => {
    const pkg = generateVisualChangePackage({
      session_id: 's1', project_id: 'p1', bp_id: null,
      page_route: '/x',
      critiques: [],
      accepted_suggestions: [
        { id: 's1', kind: 'layout', title: 'Big win', body: 'a', expected_ux_impact: 30, rationale: null },
        { id: 's2', kind: 'copy', title: 'Tiny tweak', body: 'b', expected_ux_impact: 5, rationale: null },
      ],
    });
    expect(pkg.expected_outcomes).toEqual(['Big win']);
  });
});
