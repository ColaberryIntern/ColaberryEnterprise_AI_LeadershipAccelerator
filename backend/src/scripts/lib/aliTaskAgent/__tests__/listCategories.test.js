/**
 * listCategories.
 *
 * Categories are navigation, so the property that matters is that they are STABLE and that a list
 * nobody wrote a rule for is visibly unsorted rather than quietly filed under the nearest heading.
 * A mis-filed list is a thing you look for and cannot find; an unsorted pile is a prompt to add a
 * rule.
 *
 * The names below are real list names from production.
 */
const { categoryOf, groupByCategory, CATEGORIES, CATEGORY_COLORS, PROJECT_CATEGORIES } = require('../listCategories');

describe('categoryOf', () => {
  it.each([
    ['Credentials & Registrations to Unlock Gov Contracts', 'government'],
    ['R3 - Set-Aside Entity + JV - The Veteran/Minority Company', 'government'],
    ['Stand Up NewCo: Veteran/Minority Gov-Contracting Entity', 'government'],
    ['Path to Profitability - decisions for Ram', 'revenue'],
    ['11 - Revenue Room: live revenue intelligence for Ram', 'revenue'],
    ['MILESTONE APPROVALS - Ali', 'decisions'],
    ['06 - Owner Decisions and Blockers', 'decisions'],
    ['Agent Factory - Ten AI Employees, Interns Building Them', 'platform'],
    ['Sense Layer - Adapters', 'platform'],
    ['RMS - Email + RFQ intake (W1 forward track)', 'government'],
    ['10 - Individual Training, Content Engine & Self-Paced Revenue', 'learning'],
  ])('%s -> %s', (name, key) => {
    expect(categoryOf(name).key).toBe(key);
  });

  /** An unmatched list must be visible as unmatched, never filed under a plausible neighbour. */
  it('returns unsorted, not a guess, when no rule matches', () => {
    const c = categoryOf('Then automate the spend feed zzz');
    expect(['revenue', 'unsorted']).toContain(c.key);
    expect(categoryOf('Qqqq wibble').key).toBe('unsorted');
    expect(categoryOf('Qqqq wibble').matched).toBeNull();
  });

  it('records WHICH rule matched, so a wrong category is a visible wrong rule', () => {
    expect(categoryOf('R1 - Opportunity Visibility').matched).toBeTruthy();
  });

  it('is stable: the same name always lands in the same place', () => {
    const n = 'Credentials & Registrations to Unlock Gov Contracts';
    expect(categoryOf(n).key).toBe(categoryOf(n).key);
  });

  it('survives a null name', () => {
    expect(categoryOf(null).key).toBe('unsorted');
  });

  it('gives every category an icon and a one-line blurb', () => {
    CATEGORIES.forEach((c) => {
      expect(c.icon).toBeTruthy();
      expect(c.blurb).toBeTruthy();
    });
  });
});

describe('groupByCategory', () => {
  const l = (key, total, dormant = 0) => ({
    key, name: key, total, dormant, live: total - dormant,
    generatedShare: 0, humanShare: 0, suggestions: [], tasks: [], lead: null, oldestDue: null,
  });

  it('rolls lists up and orders by size', () => {
    const g = groupByCategory([l('R1 - Opportunity Visibility', 3), l('11 - Revenue Room', 8)]);
    expect(g[0].key).toBe('revenue');
    expect(g[0].total).toBe(8);
  });

  /** Unsorted is a to-do, not a category, so it never competes for the top of the page. */
  it('always puts unsorted last, however big it is', () => {
    const g = groupByCategory([l('Qqqq wibble', 500), l('11 - Revenue Room', 2)]);
    expect(g[g.length - 1].key).toBe('unsorted');
  });

  it('sums dormant and live alongside the total', () => {
    const [g] = groupByCategory([l('11 - Revenue Room', 10, 4)]);
    expect(g).toMatchObject({ total: 10, dormant: 4, live: 6 });
  });

  it('handles an empty input', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

/**
 * Tiers 2 and 3. Names, ids and expected homes are real: measured on production 2026-11-11.
 */
describe('categoryOf by project', () => {
  it.each([
    ['TMS - Transportation lifecycle', '47126345', 'delivery'],
    ['Cadence + Weekly Demo Prep', '47126345', 'delivery'],
    ['FC1 - Build the class', '49210714', 'learning'],
    ['08 - Documentation and Enablement', '49210714', 'learning'],
    ['Marriage Goals', '33392153', 'personal'],
    ['P2 - Convert to LLC', '47346103', 'government'],
    ['Design Systems', '12724483', 'platform'],
  ])('%s in project %s -> %s', (name, pid, key) => {
    expect(categoryOf(name, pid).key).toBe(key);
  });

  it('accepts a numeric project id as well as the VARCHAR string', () => {
    expect(categoryOf('TMS - Transportation lifecycle', 47126345).key).toBe('delivery');
  });

  /** The promise that makes this safe: a list sorted by name today is never re-filed. */
  it('lets a name rule beat the project', () => {
    expect(categoryOf('R1 - Opportunity Visibility', '6593808').key).toBe('government');
  });

  it('lets the project beat the catch-all rules', () => {
    expect(categoryOf('00 - Control, Source of Truth and Governance', '49210714').key).toBe('learning');
  });

  it('uses the catch-all rules for lists in the catch-all project', () => {
    expect(categoryOf('00 - Control, Source of Truth & Governance', '7463955').key).toBe('platform');
    expect(categoryOf('S1 - Core MVP (wk 4)', '7463955').key).toBe('platform');
    expect(categoryOf('09 - Open Risks, Escalations & Standing Obligations', '7463955').key).toBe('decisions');
  });

  it('never maps the catch-all projects themselves', () => {
    expect(PROJECT_CATEGORIES['7463955']).toBeUndefined();
    expect(PROJECT_CATEGORIES['12724441']).toBeUndefined();
    expect(categoryOf('Reference Kits', '7463955').key).toBe('unsorted');
  });

  it('records the project as the matched rule', () => {
    expect(categoryOf('TMS - Transportation lifecycle', '47126345').matched).toMatch(/project 47126345 \(ShipCES/);
  });

  it('maps only to categories that exist and have a colour in both modes', () => {
    Object.values(PROJECT_CATEGORIES).forEach(([key]) => {
      expect(CATEGORIES.some((c) => c.key === key)).toBe(true);
    });
    CATEGORIES.forEach((c) => {
      expect(CATEGORY_COLORS.light[c.key]).toMatch(/^#[0-9a-f]{6}$/);
      expect(CATEGORY_COLORS.dark[c.key]).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it('groups by project when the summary carries one', () => {
    const g = groupByCategory([{ key: 'TMS - Transportation lifecycle', projectId: '47126345',
      total: 6, dormant: 0, live: 6 }]);
    expect(g[0].key).toBe('delivery');
  });
});
