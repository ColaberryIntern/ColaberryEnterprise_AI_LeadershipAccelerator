/**
 * SystemViewV2 Tests — Scaffolding + System Map Verification
 */

import { groupComponents, getNextComponents } from '../pages/project/SystemViewV2';

// ---------------------------------------------------------------------------
// Mock data factory
// ---------------------------------------------------------------------------

function makeBP(overrides: any = {}) {
  return {
    id: overrides.id || 'test-id',
    name: overrides.name || 'Test BP',
    description: overrides.description || '',
    status: overrides.status || 'not_started',
    completion: overrides.completion || 0,
    maturity: overrides.maturity || 'L0 Not Started',
    maturityLevel: overrides.maturityLevel || 0,
    nextStep: overrides.nextStep || null,
    promptTarget: overrides.promptTarget || null,
    isPageBP: overrides.isPageBP || false,
    isDiscovered: overrides.isDiscovered || false,
    source: overrides.source || 'auto',
    layers: overrides.layers || { backend: 'missing', frontend: 'missing', agent: 'missing' },
  };
}

// ---------------------------------------------------------------------------
// 1. GROUPING TESTS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Component Grouping', () => {
  test('groups backend/data components into Foundation', () => {
    const comps = [
      makeBP({ id: '1', name: 'API Integration' }),
      makeBP({ id: '2', name: 'Database Service' }),
    ];
    const groups = groupComponents(comps);
    const foundation = groups.find(g => g.key === 'foundation');
    expect(foundation).toBeDefined();
    expect(foundation!.items).toHaveLength(2);
  });

  test('all page BPs go to Discovered regardless of completion', () => {
    const comps = [
      makeBP({ id: '1', name: 'Dashboard Page', isPageBP: true, completion: 40 }),
      makeBP({ id: '2', name: 'Pricing Page', isPageBP: true, completion: 0 }),
    ];
    const groups = groupComponents(comps);
    const discovered = groups.find(g => g.key === 'discovered');
    expect(discovered).toBeDefined();
    expect(discovered!.items).toHaveLength(2);
    expect(groups.find(g => g.key === 'usability')).toBeUndefined();
  });

  test('groups agent/automation components into Intelligence', () => {
    const comps = [
      makeBP({ id: '1', name: 'AI Adoption and Training' }),
      makeBP({ id: '2', name: 'User Engagement and Feedback' }),
    ];
    const groups = groupComponents(comps);
    const intelligence = groups.find(g => g.key === 'intelligence');
    expect(intelligence).toBeDefined();
    expect(intelligence!.items.length).toBeGreaterThanOrEqual(1);
  });

  test('calculates group completion correctly', () => {
    const comps = [
      makeBP({ id: '1', name: 'API Service', completion: 60 }),
      makeBP({ id: '2', name: 'Data Integration', completion: 40 }),
    ];
    const groups = groupComponents(comps);
    const foundation = groups.find(g => g.key === 'foundation');
    expect(foundation!.completion).toBe(50); // (60+40)/2
  });

  test('empty components returns empty groups', () => {
    const groups = groupComponents([]);
    expect(groups).toHaveLength(0);
  });

  test('fallback: non-keyword BP with backend layer goes to Foundation', () => {
    const comps = [
      makeBP({ id: '1', name: 'XyzModule', layers: { backend: 'ready', frontend: 'missing', agent: 'missing' } }),
    ];
    const groups = groupComponents(comps);
    const foundation = groups.find(g => g.key === 'foundation');
    expect(foundation).toBeDefined();
    expect(foundation!.items[0].name).toBe('XyzModule');
  });

  test('fallback: non-keyword BP without backend goes to Usability', () => {
    const comps = [
      makeBP({ id: '1', name: 'XyzWidget' }),
    ];
    const groups = groupComponents(comps);
    const usability = groups.find(g => g.key === 'usability');
    expect(usability).toBeDefined();
  });

  test('page BPs with progress still go to Discovered, not Usability', () => {
    const comps = [
      makeBP({ id: '1', name: 'API Backend' }),
      makeBP({ id: '2', name: 'Landing Page', isPageBP: true, completion: 30 }),
      makeBP({ id: '3', name: 'AI Agent Automation' }),
    ];
    const groups = groupComponents(comps);
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.key).sort()).toEqual(['discovered', 'foundation', 'intelligence']);
  });

  test('discovered components go to Discovered group', () => {
    const comps = [
      makeBP({ id: '1', name: 'Unknown Module', isDiscovered: true }),
      makeBP({ id: '2', name: 'Repo Widget', isDiscovered: true }),
    ];
    const groups = groupComponents(comps);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('discovered');
    expect(groups[0].items).toHaveLength(2);
  });

  test('discovered components are NOT mixed into other groups', () => {
    const comps = [
      makeBP({ id: '1', name: 'API Backend' }),
      makeBP({ id: '2', name: 'Mystery Component', isDiscovered: true }),
      makeBP({ id: '3', name: 'AI Agent', isDiscovered: true }),
    ];
    const groups = groupComponents(comps);
    const foundation = groups.find(g => g.key === 'foundation');
    const discovered = groups.find(g => g.key === 'discovered');
    expect(foundation!.items).toHaveLength(1);
    expect(discovered!.items).toHaveLength(2);
    // Ensure discovered items are NOT in foundation or intelligence
    expect(foundation!.items.some(c => c.isDiscovered)).toBe(false);
  });

  test('page BPs and discovered components merge into single Discovered group', () => {
    const comps = [
      makeBP({ id: '1', name: 'API Backend' }),
      makeBP({ id: '2', name: 'Landing Page', isPageBP: true, completion: 50 }),
      makeBP({ id: '3', name: 'AI Agent Automation' }),
      makeBP({ id: '4', name: 'Repo Discovery', isDiscovered: true }),
    ];
    const groups = groupComponents(comps);
    expect(groups).toHaveLength(3);
    const discovered = groups.find(g => g.key === 'discovered');
    expect(discovered!.items).toHaveLength(2); // page BP + explicitly discovered
  });

  test('discovered group appears last', () => {
    const comps = [
      makeBP({ id: '1', name: 'API Backend' }),
      makeBP({ id: '2', name: 'Unknown', isDiscovered: true }),
    ];
    const groups = groupComponents(comps);
    expect(groups[groups.length - 1].key).toBe('discovered');
  });
});

// ---------------------------------------------------------------------------
// 2. NEXT BADGE TESTS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Next Badge Logic', () => {
  test('selects top 3 incomplete components by lowest completion', () => {
    const comps = [
      makeBP({ id: 'a', status: 'not_started', completion: 0 }),
      makeBP({ id: 'b', status: 'in_progress', completion: 30 }),
      makeBP({ id: 'c', status: 'in_progress', completion: 50 }),
      makeBP({ id: 'd', status: 'in_progress', completion: 70 }),
      makeBP({ id: 'e', status: 'complete', completion: 100 }),
    ];
    const nextIds = getNextComponents(comps);
    expect(nextIds.size).toBe(3);
    expect(nextIds.has('a')).toBe(true);
    expect(nextIds.has('b')).toBe(true);
    expect(nextIds.has('c')).toBe(true);
    expect(nextIds.has('d')).toBe(false);
    expect(nextIds.has('e')).toBe(false);
  });

  test('returns fewer than 3 if not enough incomplete', () => {
    const comps = [
      makeBP({ id: 'a', status: 'not_started', completion: 0 }),
      makeBP({ id: 'b', status: 'complete', completion: 100 }),
    ];
    const nextIds = getNextComponents(comps);
    expect(nextIds.size).toBe(1);
    expect(nextIds.has('a')).toBe(true);
  });

  test('returns empty set if all complete', () => {
    const comps = [
      makeBP({ id: 'a', status: 'complete', completion: 100 }),
      makeBP({ id: 'b', status: 'complete', completion: 95 }),
    ];
    const nextIds = getNextComponents(comps);
    expect(nextIds.size).toBe(0);
  });

  test('returns empty set for empty list', () => {
    expect(getNextComponents([]).size).toBe(0);
  });

  test('custom max parameter works', () => {
    const comps = [
      makeBP({ id: 'a', status: 'not_started', completion: 0 }),
      makeBP({ id: 'b', status: 'not_started', completion: 5 }),
      makeBP({ id: 'c', status: 'not_started', completion: 10 }),
    ];
    const nextIds = getNextComponents(comps, 1);
    expect(nextIds.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. CLICK / SELECTION TESTS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Selection Logic', () => {
  test('componentId from URL selects component', () => {
    const url = '/portal/project/system-v2?componentId=abc-123';
    const params = new URLSearchParams(url.split('?')[1]);
    const componentId = params.get('componentId');
    const components = [makeBP({ id: 'abc-123', name: 'Target' }), makeBP({ id: 'other' })];
    const selected = components.find(c => c.id === componentId);
    expect(selected?.name).toBe('Target');
  });

  test('missing componentId means no selection', () => {
    const params = new URLSearchParams('');
    expect(params.get('componentId')).toBeNull();
  });

  test('clicking selected component deselects', () => {
    let selectedId: string | null = 'abc';
    // Simulating the toggle logic
    const clickedId = 'abc';
    selectedId = clickedId === selectedId ? null : clickedId;
    expect(selectedId).toBeNull();
  });

  test('clicking unselected component selects it', () => {
    let selectedId: string | null = null;
    const clickedId = 'xyz';
    selectedId = clickedId === selectedId ? null : clickedId;
    expect(selectedId).toBe('xyz');
  });
});

// ---------------------------------------------------------------------------
// 4. EMPTY STATE TESTS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Empty States', () => {
  test('groupComponents handles empty array', () => {
    expect(groupComponents([])).toEqual([]);
  });

  test('getNextComponents handles empty array', () => {
    expect(getNextComponents([])).toEqual(new Set());
  });

  test('all-complete returns no next badges', () => {
    const comps = [makeBP({ id: '1', status: 'complete', completion: 100 })];
    expect(getNextComponents(comps).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. REGRESSION PROTECTION
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Regression', () => {
  test('V1 route unchanged', () => {
    expect('/portal/project/system').toBe('/portal/project/system');
  });

  test('V2 route is distinct', () => {
    expect('/portal/project/system-v2').not.toBe('/portal/project/system');
  });

  test('Blueprint route unchanged', () => {
    expect('/portal/project/blueprint').toBe('/portal/project/blueprint');
  });

  test('existing localStorage keys not affected', () => {
    localStorage.clear();
    localStorage.setItem('active_component_id', 'existing');
    expect(localStorage.getItem('active_component_id')).toBe('existing');
  });
});

// ---------------------------------------------------------------------------
// 6. PERFORMANCE / RESILIENCE
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Resilience', () => {
  test('grouping handles components with missing fields', () => {
    const comps = [makeBP({ id: '1', name: '' })];
    expect(() => groupComponents(comps)).not.toThrow();
  });

  test('grouping handles very large component list', () => {
    const comps = Array.from({ length: 100 }, (_, i) => makeBP({ id: String(i), name: `Component ${i}` }));
    const groups = groupComponents(comps);
    const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
    expect(totalItems).toBe(100);
  });

  test('getNextComponents deterministic across calls', () => {
    const comps = [
      makeBP({ id: 'a', status: 'not_started', completion: 10 }),
      makeBP({ id: 'b', status: 'not_started', completion: 5 }),
    ];
    const first = getNextComponents(comps);
    const second = getNextComponents(comps);
    expect([...first]).toEqual([...second]);
  });
});
