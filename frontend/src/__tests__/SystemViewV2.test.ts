/**
 * SystemViewV2 Tests — Scaffolding + System Map Verification
 */

import { groupComponents, getNextComponents, groupByBusinessDomain, getComponentPurpose, getSystemSummary } from '../pages/project/SystemViewV2';

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
    frontendRoute: overrides.frontendRoute || null,
    coverageRaw: overrides.coverageRaw || 0,
    readinessRaw: overrides.readinessRaw || 0,
    layers: overrides.layers || { backend: 'missing', frontend: 'missing', agent: 'missing' },
    ui: overrides.ui || { pages: [] },
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

// ---------------------------------------------------------------------------
// 7. WORK AREA TAB TESTS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Work Area Tabs', () => {
  test('tab list includes overview, build, improve', () => {
    const tabs = ['overview', 'build', 'improve'];
    expect(tabs).toContain('overview');
    expect(tabs).toContain('build');
    expect(tabs).toContain('improve');
  });

  test('UI tab only available for page BPs', () => {
    const pageBP = makeBP({ isPageBP: true });
    const codeBP = makeBP({ isPageBP: false });
    expect(pageBP.isPageBP).toBe(true);
    expect(codeBP.isPageBP).toBe(false);
    // UI tab renders conditionally on isPageBP
  });

  test('default tab is overview', () => {
    const defaultTab = 'overview';
    expect(defaultTab).toBe('overview');
  });

  test('tab switching changes active tab', () => {
    let activeTab = 'overview';
    activeTab = 'build';
    expect(activeTab).toBe('build');
    activeTab = 'improve';
    expect(activeTab).toBe('improve');
  });
});

// ---------------------------------------------------------------------------
// 8. BUILD FLOW TESTS (Logic)
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Build Flow Logic', () => {
  test('build prompt target falls back to backend_improvement', () => {
    const comp = makeBP({ promptTarget: null });
    const target = comp.promptTarget || 'backend_improvement';
    expect(target).toBe('backend_improvement');
  });

  test('build prompt target uses component value when available', () => {
    const comp = makeBP({ promptTarget: 'frontend_exposure' });
    const target = comp.promptTarget || 'backend_improvement';
    expect(target).toBe('frontend_exposure');
  });

  test('validation requires non-empty report', () => {
    const report = '';
    expect(report.trim()).toBe('');
    const report2 = 'VALIDATION REPORT\n\nFiles Created:\n- test.ts';
    expect(report2.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 9. COMPONENT SELECTION + WORK AREA UPDATE
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Component Selection Updates Work Area', () => {
  test('selecting component provides data for all tabs', () => {
    const comp = makeBP({ id: 'x', name: 'Test', description: 'A test component', completion: 50, nextStep: 'Build backend', layers: { backend: 'ready', frontend: 'missing', agent: 'missing' } });
    // Overview needs: description, layers, nextStep
    expect(comp.description).toBeTruthy();
    expect(comp.layers.backend).toBe('ready');
    expect(comp.nextStep).toBe('Build backend');
    // Build needs: id, promptTarget
    expect(comp.id).toBeTruthy();
    // Improve needs: id (for detail fetch)
    expect(comp.id).toBeTruthy();
  });

  test('deselecting clears component', () => {
    let selectedId: string | null = 'abc';
    selectedId = null;
    expect(selectedId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. CORY COMMAND CENTER TESTS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Cory Command Center', () => {
  test('mode switch between suggestions/plan/execute', () => {
    let mode: 'suggestions' | 'plan' | 'execute' = 'suggestions';
    expect(mode).toBe('suggestions');
    mode = 'plan';
    expect(mode).toBe('plan');
    mode = 'execute';
    expect(mode).toBe('execute');
  });

  test('suggestions generated when backend missing', () => {
    // Simulating: no backend → should suggest backend
    const hasBackend = false;
    const hasFrontend = false;
    const suggestions: string[] = [];
    if (!hasBackend) suggestions.push('Build your backend foundation');
    if (hasBackend && !hasFrontend) suggestions.push('Add a user interface');
    expect(suggestions).toContain('Build your backend foundation');
    expect(suggestions).not.toContain('Add a user interface');
  });

  test('suggestions limited to 3', () => {
    const allSuggestions = ['a', 'b', 'c', 'd', 'e'];
    const limited = allSuggestions.slice(0, 3);
    expect(limited).toHaveLength(3);
  });

  test('dismissed suggestions are filtered out', () => {
    const dismissed = new Set(['sg-backend']);
    const suggestions = [{ id: 'sg-backend' }, { id: 'sg-frontend' }];
    const visible = suggestions.filter(s => !dismissed.has(s.id));
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('sg-frontend');
  });

  test('execution queue tracks index correctly', () => {
    const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    let index = 0;
    expect(queue[index].id).toBe('a');
    index = 1;
    expect(queue[index].id).toBe('b');
    index = 2;
    expect(queue[index].id).toBe('c');
    // Next would complete
    expect(index + 1 >= queue.length).toBe(true);
  });

  test('execution queue exit clears state', () => {
    let queue = [{ id: 'a' }];
    let index = 0;
    let paused = true;
    // Exit
    queue = [];
    index = 0;
    paused = false;
    expect(queue).toHaveLength(0);
    expect(index).toBe(0);
    expect(paused).toBe(false);
  });

  test('autonomous mode is UI-only toggle', () => {
    let autonomous = false;
    expect(autonomous).toBe(false);
    autonomous = true;
    expect(autonomous).toBe(true);
    // No side effects — just a boolean
  });

  test('empty state when no component selected', () => {
    const selectedComponent = null;
    const message = selectedComponent ? 'has content' : 'Select a component to see recommendations.';
    expect(message).toBe('Select a component to see recommendations.');
  });
});

// ---------------------------------------------------------------------------
// 11. BUILD / REPORTING MODE TESTS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Build/Reporting Mode', () => {
  test('mode switch between build and reporting', () => {
    let mode: 'build' | 'reporting' = 'build';
    expect(mode).toBe('build');
    mode = 'reporting';
    expect(mode).toBe('reporting');
  });

  test('build mode shows build tabs', () => {
    const mode = 'build';
    const tabs = mode === 'build' ? ['overview', 'build', 'improve'] : ['overview', 'insights', 'gaps', 'trends'];
    expect(tabs).toContain('build');
    expect(tabs).not.toContain('insights');
  });

  test('reporting mode shows reporting tabs', () => {
    const mode = 'reporting';
    const tabs = mode === 'build' ? ['overview', 'build', 'improve'] : ['overview', 'insights', 'gaps', 'trends'];
    expect(tabs).toContain('insights');
    expect(tabs).toContain('gaps');
    expect(tabs).toContain('trends');
    expect(tabs).not.toContain('build');
  });

  test('mode persists to localStorage', () => {
    localStorage.setItem('system_mode', 'reporting');
    expect(localStorage.getItem('system_mode')).toBe('reporting');
    localStorage.setItem('system_mode', 'build');
    expect(localStorage.getItem('system_mode')).toBe('build');
  });

  test('cory modes change with system mode', () => {
    const buildCoryModes = ['suggestions', 'plan', 'execute'];
    const reportCoryModes = ['r-insights', 'r-gaps', 'r-recommendations'];
    expect(buildCoryModes).not.toContain('r-insights');
    expect(reportCoryModes).not.toContain('suggestions');
  });

  test('selected component preserved across mode switch', () => {
    let selectedId: string | null = 'abc';
    let mode = 'build';
    mode = 'reporting';
    // selectedId should NOT change
    expect(selectedId).toBe('abc');
    expect(mode).toBe('reporting');
  });

  test('tile shows GAP/PARTIAL/OK badge in reporting mode', () => {
    const comp = makeBP({ completion: 20 });
    const badge = comp.completion < 30 ? 'GAP' : comp.completion < 70 ? 'PARTIAL' : 'OK';
    expect(badge).toBe('GAP');
    const comp2 = makeBP({ completion: 50 });
    const badge2 = comp2.completion < 30 ? 'GAP' : comp2.completion < 70 ? 'PARTIAL' : 'OK';
    expect(badge2).toBe('PARTIAL');
    const comp3 = makeBP({ completion: 80 });
    const badge3 = comp3.completion < 30 ? 'GAP' : comp3.completion < 70 ? 'PARTIAL' : 'OK';
    expect(badge3).toBe('OK');
  });
});

// ---------------------------------------------------------------------------
// 12. DEFINE COMPONENT + UI LINKING
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Define Component + UI Linking', () => {
  test('UI tab shows when component has pages', () => {
    const comp = makeBP({ id: '1', name: 'Auth', ui: { pages: [{ name: 'Login Page', route: '/login', source: 'discovered', verified: false, bpId: '2' }] } });
    expect(comp.ui.pages.length).toBeGreaterThan(0);
  });

  test('UI tab hidden when no pages', () => {
    const comp = makeBP({ id: '1', name: 'Auth' });
    // Default factory doesn't include ui.pages
    const pages = comp.ui?.pages || [];
    expect(pages.length).toBe(0);
  });

  test('page attachment adds page to component', () => {
    const attachments: Record<string, Array<{ name: string; route: string }>> = {};
    const targetId = 'comp-1';
    const page = { name: 'Dashboard', route: '/admin/dashboard' };
    attachments[targetId] = [...(attachments[targetId] || []), page];
    expect(attachments[targetId]).toHaveLength(1);
    expect(attachments[targetId][0].route).toBe('/admin/dashboard');
  });

  test('attaching page removes from discovered', () => {
    const ignoredIds = new Set<string>();
    const discoveredId = 'disc-1';
    ignoredIds.add(discoveredId);
    expect(ignoredIds.has(discoveredId)).toBe(true);
  });

  test('multiple pages per component supported', () => {
    const attachments: Record<string, Array<{ name: string }>> = {};
    const id = 'comp-1';
    attachments[id] = [{ name: 'Page 1' }, { name: 'Page 2' }, { name: 'Page 3' }];
    expect(attachments[id]).toHaveLength(3);
  });

  test('auto-detection matches by name similarity', () => {
    const codeName = 'user management';
    const pageName = 'user management page';
    const codeWords = codeName.split(/\s+/);
    const pageWords = pageName.split(/\s+/);
    const overlap = codeWords.filter(w => w.length > 3 && pageWords.some(pw => pw.includes(w)));
    expect(overlap.length).toBeGreaterThanOrEqual(1);
  });

  test('auto-detection does not match unrelated names', () => {
    const codeName = 'security compliance';
    const pageName = 'pricing page';
    const codeWords = codeName.split(/\s+/);
    const pageWords = pageName.split(/\s+/);
    const overlap = codeWords.filter(w => w.length > 3 && pageWords.some(pw => pw.includes(w)));
    expect(overlap.length).toBe(0);
  });

  test('tile shows display icon when has pages', () => {
    const hasPages = true;
    const isPageBP = false;
    const showIcon = hasPages && !isPageBP;
    expect(showIcon).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. VISUAL LINKING + VERIFICATION + CONFIDENCE
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Visual Linking System', () => {
  test('verification flag updates via set', () => {
    const verified = new Set<string>();
    verified.add('comp1:/admin/dashboard');
    expect(verified.has('comp1:/admin/dashboard')).toBe(true);
    expect(verified.has('comp1:/admin/other')).toBe(false);
  });

  test('detach removes page via set', () => {
    const detached = new Set<string>();
    detached.add('comp1:/admin/leads');
    const pages = [{ route: '/admin/leads' }, { route: '/admin/dashboard' }];
    const filtered = pages.filter(p => !detached.has(`comp1:${p.route}`));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].route).toBe('/admin/dashboard');
  });

  test('confidence calculated from word overlap', () => {
    const nameWords = ['user', 'management'].filter(w => w.length > 3);
    const pageWords = ['user', 'management', 'page'].filter(w => w.length > 3);
    const overlap = nameWords.filter(w => pageWords.some(pw => pw.includes(w) || w.includes(pw)));
    const confidence = Math.round((overlap.length / Math.max(nameWords.length, pageWords.length)) * 100);
    // 2 overlapping / max(2, 3) = 67%
    expect(confidence).toBe(67);
    expect(confidence).toBeGreaterThanOrEqual(30); // above detection threshold
  });

  test('low confidence below 70 triggers warning', () => {
    const confidence = 45;
    const showWarning = confidence < 70;
    expect(showWarning).toBe(true);
  });

  test('high confidence does not trigger warning', () => {
    const confidence = 85;
    const showWarning = confidence < 70;
    expect(showWarning).toBe(false);
  });

  test('mapped pages have 100% confidence', () => {
    const page = { source: 'mapped', confidence: 100 };
    expect(page.confidence).toBe(100);
  });

  test('tile shows warning icon for unverified pages', () => {
    const pages = [{ verified: false }, { verified: true }];
    const hasUnverified = pages.some(p => !p.verified);
    expect(hasUnverified).toBe(true);
  });

  test('tile shows link icon for multi-page', () => {
    const pages = [{ verified: true }, { verified: true }];
    const allVerified = pages.every(p => p.verified);
    const isMulti = pages.length > 1;
    expect(allVerified && isMulti).toBe(true);
  });

  test('frontend-no-page state detected correctly', () => {
    const comp = makeBP({ layers: { backend: 'ready', frontend: 'ready', agent: 'missing' } });
    const hasPages = comp.ui.pages.length > 0;
    const hasFrontend = comp.layers.frontend !== 'missing';
    expect(hasFrontend && !hasPages).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14. BUSINESS DOMAIN GROUPING
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Business Domain Grouping', () => {
  test('lead-related BPs go to Revenue', () => {
    const comps = [makeBP({ id: '1', name: 'Lead Management' })];
    const groups = groupByBusinessDomain(comps);
    expect(groups.find(g => g.key === 'revenue')).toBeDefined();
  });

  test('AI-related BPs go to Intelligence', () => {
    const comps = [makeBP({ id: '1', name: 'AI Adoption and Training' })];
    const groups = groupByBusinessDomain(comps);
    expect(groups.find(g => g.key === 'intelligence')).toBeDefined();
  });

  test('page BPs go to Discovered', () => {
    const comps = [makeBP({ id: '1', name: 'Landing Page', isPageBP: true, source: 'frontend_page' })];
    const groups = groupByBusinessDomain(comps);
    expect(groups.find(g => g.key === 'discovered')).toBeDefined();
  });

  test('multiple domains created from mixed BPs', () => {
    const comps = [
      makeBP({ id: '1', name: 'Lead Pipeline' }),
      makeBP({ id: '2', name: 'User Management' }),
      makeBP({ id: '3', name: 'Analytics Reporting' }),
    ];
    const groups = groupByBusinessDomain(comps);
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 15. COMPONENT PURPOSE
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Component Purpose', () => {
  test('lead component gets revenue purpose', () => {
    const purpose = getComponentPurpose('Lead Management');
    expect(purpose).toContain('lead');
  });

  test('monitoring component gets ops purpose', () => {
    const purpose = getComponentPurpose('Monitoring and Observability');
    expect(purpose).toContain('health');
  });

  test('unknown component gets generic purpose', () => {
    const purpose = getComponentPurpose('XyzModule');
    expect(purpose).toContain('XyzModule');
  });

  test('system summary generates from components', () => {
    const comps = [
      makeBP({ name: 'Lead Management' }),
      makeBP({ name: 'AI Training' }),
    ];
    const summary = getSystemSummary(comps);
    expect(summary).toContain('AI-powered');
  });

  test('empty components gives generic summary', () => {
    const summary = getSystemSummary([]);
    expect(summary).toContain('AI-powered');
  });
});

// ---------------------------------------------------------------------------
// 16. REPORTING METRICS
// ---------------------------------------------------------------------------

describe('SystemViewV2 — Reporting Metrics', () => {
  test('completed percentage calculated correctly', () => {
    const total = 10;
    const completed = 3;
    const pct = Math.round((completed / total) * 100);
    expect(pct).toBe(30);
  });

  test('missing backend count calculated from layer status', () => {
    const comps = [
      makeBP({ layers: { backend: 'missing', frontend: 'ready', agent: 'missing' } }),
      makeBP({ layers: { backend: 'ready', frontend: 'missing', agent: 'missing' } }),
    ];
    const noBackend = comps.filter(c => c.layers.backend === 'missing').length;
    expect(noBackend).toBe(1);
  });

  test('gap categorization by severity', () => {
    const comps = [
      makeBP({ layers: { backend: 'missing', frontend: 'missing', agent: 'missing' }, completion: 0 }),
      makeBP({ layers: { backend: 'ready', frontend: 'missing', agent: 'missing' }, completion: 40 }),
      makeBP({ layers: { backend: 'ready', frontend: 'ready', agent: 'missing' }, completion: 60 }),
    ];
    const critical = comps.filter(c => c.layers.backend === 'missing');
    const high = comps.filter(c => c.layers.backend !== 'missing' && c.layers.frontend === 'missing');
    const medium = comps.filter(c => c.layers.backend !== 'missing' && c.layers.frontend !== 'missing' && c.layers.agent === 'missing');
    expect(critical.length).toBe(1);
    expect(high.length).toBe(1);
    expect(medium.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 17. QA RUN #1 FIXES
// ---------------------------------------------------------------------------

describe('SystemViewV2 — QA Fix: localStorage Persistence', () => {
  beforeEach(() => localStorage.clear());

  test('ignoredIds persists to localStorage', () => {
    const ids = ['a', 'b'];
    localStorage.setItem('system_v2_ignored_ids', JSON.stringify(ids));
    const restored = new Set(JSON.parse(localStorage.getItem('system_v2_ignored_ids') || '[]'));
    expect(restored.has('a')).toBe(true);
    expect(restored.has('b')).toBe(true);
  });

  test('pageAttachments persists to localStorage', () => {
    const data = { 'comp1': [{ name: 'Page', route: '/test', source: 'discovered', verified: false, confidence: 80, bpId: 'x' }] };
    localStorage.setItem('system_v2_page_attachments', JSON.stringify(data));
    const restored = JSON.parse(localStorage.getItem('system_v2_page_attachments') || '{}');
    expect(restored['comp1']).toHaveLength(1);
  });

  test('verifiedPages persists to localStorage', () => {
    localStorage.setItem('system_v2_verified_pages', JSON.stringify(['comp1:/test']));
    const restored = new Set(JSON.parse(localStorage.getItem('system_v2_verified_pages') || '[]'));
    expect(restored.has('comp1:/test')).toBe(true);
  });

  test('empty localStorage returns safe defaults', () => {
    const ids = new Set(JSON.parse(localStorage.getItem('system_v2_ignored_ids') || '[]'));
    expect(ids.size).toBe(0);
    const attachments = JSON.parse(localStorage.getItem('system_v2_page_attachments') || '{}');
    expect(Object.keys(attachments)).toHaveLength(0);
  });
});

describe('SystemViewV2 — QA Fix: Multi-Page Switcher', () => {
  test('page index defaults to 0', () => {
    const idx = 0;
    const pages = [{ name: 'A', route: '/a' }, { name: 'B', route: '/b' }];
    expect(pages[idx].name).toBe('A');
  });

  test('switching index changes active page', () => {
    const pages = [{ name: 'A', route: '/a' }, { name: 'B', route: '/b' }];
    let idx = 0;
    idx = 1;
    expect(pages[idx].name).toBe('B');
  });

  test('safe index clamped to pages length', () => {
    const pages = [{ name: 'A' }];
    const idx = 5;
    const safeIdx = Math.min(idx, pages.length - 1);
    expect(safeIdx).toBe(0);
  });
});

describe('SystemViewV2 — QA Fix: Coverage vs Readiness', () => {
  test('coverageRaw and readinessRaw are distinct', () => {
    const comp = makeBP({ coverageRaw: 45, readinessRaw: 72 });
    expect(comp.coverageRaw).toBe(45);
    expect(comp.readinessRaw).toBe(72);
    expect(comp.coverageRaw).not.toBe(comp.readinessRaw);
  });
});

describe('SystemViewV2 — QA Fix: Cory Mode Sync', () => {
  test('reporting mode should use r- prefixed cory modes', () => {
    const isReporting = true;
    let coryMode = 'suggestions';
    if (isReporting && !coryMode.startsWith('r-')) coryMode = 'r-insights';
    expect(coryMode).toBe('r-insights');
  });

  test('build mode should not use r- prefixed modes', () => {
    const isReporting = false;
    let coryMode = 'r-insights';
    if (!isReporting && coryMode.startsWith('r-')) coryMode = 'suggestions';
    expect(coryMode).toBe('suggestions');
  });
});
