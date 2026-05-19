import { scoreReadiness } from '../../intelligence/systemStateEngine/scoring/readinessScorer';
import { scoreHealth } from '../../intelligence/systemStateEngine/scoring/healthScorer';
import type { EngineCapabilityInput } from '../../intelligence/systemStateEngine/types/systemState.types';

function makeCap(over: Partial<EngineCapabilityInput> = {}): EngineCapabilityInput {
  return {
    id: 'cap-1', project_id: 'p-1', name: 'X', source: 'auto',
    user_status: 'in_progress', applicability_status: 'active',
    total_requirements: 0, matched_requirements: 0, verified_requirements: 0,
    linked_backend_services: [], linked_frontend_components: [], linked_agents: [],
    ...over,
  } as EngineCapabilityInput;
}

describe('readinessScorer — kind-aware layer weights', () => {
  test('Page with frontend but no backend scores HIGH (frontend is the whole story)', () => {
    const cap = makeCap({ kind: 'page', is_page_bp: true, frontend_route: '/x' });
    const r = scoreReadiness(cap);
    // layer = 100 (full frontend weight) → 100*0.5 = 50
    // coverage = 100 (page default when no reqs) → 100*0.3 = 30
    // quality = 35 (1 frontend signal) → 70*0.2 = 14
    // Total ~= 94
    expect(r.layer_score).toBe(100);
    expect(r.final).toBeGreaterThanOrEqual(80);
  });

  test('Service without backend scores LOW (backend is most of the weight)', () => {
    const cap = makeCap({ kind: 'service', linked_frontend_components: ['x.tsx'] });
    const r = scoreReadiness(cap);
    // layer = 30 (frontend only) → 15
    // coverage = 0 → 0
    // quality ~= 10 → 4
    // Total ~= 19
    expect(r.layer_score).toBe(30);
    expect(r.final).toBeLessThan(40);
  });

  test('Agent cap with agent files scores HIGH (agent IS the backend)', () => {
    const cap = makeCap({ kind: 'agent', linked_agents: ['a1.ts', 'a2.ts'] });
    const r = scoreReadiness(cap);
    expect(r.layer_score).toBe(60); // full agent weight
    expect(r.final).toBeGreaterThan(40);
  });

  test('Page with frontend marks operator_bounded when ui_review categories not all verified', () => {
    const cap = makeCap({
      kind: 'page', is_page_bp: true, frontend_route: '/x',
      ui_element_map: { category_scores: { layout: { verified: true }, accessibility: { verified: false } } },
    } as any);
    const r = scoreReadiness(cap);
    expect(r.operator_bounded).toBe(true);
  });

  test('Page fully verified is NOT operator_bounded', () => {
    const cap = makeCap({
      kind: 'page', is_page_bp: true, frontend_route: '/x',
      ui_element_map: {
        category_scores: {
          layout: { verified: true }, accessibility: { verified: true },
          responsiveness: { verified: true }, interaction: { verified: true },
          content: { verified: true },
        },
      },
    } as any);
    const r = scoreReadiness(cap);
    expect(r.operator_bounded).toBeFalsy();
  });
});

describe('healthScorer — kind-aware applicable dimensions', () => {
  test('Page averages over 4 applicable dimensions (not 6)', () => {
    const cap = makeCap({ kind: 'page', is_page_bp: true, frontend_route: '/x', linked_frontend_components: ['x.tsx'] });
    const h = scoreHealth(cap, []);
    expect(h.applicable_dimensions).toEqual(['ux_exposure', 'reliability', 'observability', 'production_readiness']);
    expect(h.applicable_dimensions).not.toContain('determinism');
    expect(h.applicable_dimensions).not.toContain('automation');
  });

  test('Component averages over only 2 dimensions (ux_exposure + reliability)', () => {
    const cap = makeCap({ kind: 'component', linked_frontend_components: ['comp.tsx'] });
    const h = scoreHealth(cap, []);
    expect(h.applicable_dimensions).toEqual(['ux_exposure', 'reliability']);
  });

  test('Agent skips ux_exposure', () => {
    const cap = makeCap({ kind: 'agent', linked_agents: ['a.ts'], linked_backend_services: ['b.ts'] });
    const h = scoreHealth(cap, []);
    expect(h.applicable_dimensions).not.toContain('ux_exposure');
    expect(h.applicable_dimensions).toContain('automation');
  });

  test('Service uses all 6 dimensions (legacy behavior preserved)', () => {
    const cap = makeCap({ kind: 'service', linked_backend_services: ['s.ts'], linked_frontend_components: ['c.tsx'] });
    const h = scoreHealth(cap, []);
    expect(h.applicable_dimensions).toEqual(['determinism', 'reliability', 'observability', 'ux_exposure', 'automation', 'production_readiness']);
  });

  test('Page with frontend + linked components scores high health (not penalized for missing backend)', () => {
    const cap = makeCap({
      kind: 'page', is_page_bp: true,
      frontend_route: '/x',
      linked_frontend_components: ['x.tsx', 'y.tsx', 'z.tsx', 'w.tsx'],
    });
    const h = scoreHealth(cap, ['Dockerfile']);
    // Pre-fix: would have averaged in 0s for determinism + automation, dragging down.
    // Post-fix: only ux_exposure + reliability + observability + production_readiness.
    expect(h.score).toBeGreaterThan(40);
  });
});
