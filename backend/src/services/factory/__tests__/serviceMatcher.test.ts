/**
 * The deterministic matcher is advisory and explainable: NAICS overlap outranks a category match which outranks
 * keyword hits; the rationale names the exact overlaps; it is case-insensitive, capped, and total (never throws,
 * empty when nothing overlaps). These are pure-function tests — no DB, no IO.
 */
import { matchServicesToOpportunity, type MatcherServiceInput } from '../serviceMatcher';

const svc = (over: Partial<MatcherServiceInput> & { id: string; name: string }): MatcherServiceInput => ({
  category: null, keywords: [], naicsCodes: [], ...over,
});

const CATALOG: MatcherServiceInput[] = [
  svc({ id: 'data', name: 'Managed Data Services', category: 'Data', keywords: ['data analytics', 'dashboards', 'etl', 'reporting'], naicsCodes: ['541512'] }),
  svc({ id: 'ai', name: 'AI Production Pilot', category: 'AI', keywords: ['generative ai', 'llm', 'workflow automation'] }),
  svc({ id: 'train', name: 'Workforce Training', category: 'Training', keywords: ['training', 'upskilling', 'curriculum development'] }),
];

describe('matchServicesToOpportunity — deterministic, explainable', () => {
  it('matches on keyword overlap and names the matched keywords in the reason', () => {
    const m = matchServicesToOpportunity({ title: 'RFP for a data analytics dashboards platform' }, CATALOG);
    expect(m.map((x) => x.id)).toContain('data');
    const data = m.find((x) => x.id === 'data')!;
    expect(data.matchedKeywords).toEqual(expect.arrayContaining(['data analytics', 'dashboards']));
    expect(data.reason).toContain('data analytics');
    expect(data.score).toBe(2); // two keyword hits, no category/naics
  });

  it('is case-insensitive', () => {
    const m = matchServicesToOpportunity({ title: 'DATA ANALYTICS and ETL modernization' }, CATALOG);
    expect(m.find((x) => x.id === 'data')!.matchedKeywords).toEqual(expect.arrayContaining(['data analytics', 'etl']));
  });

  it('category match is a boost (label containment, not substring inside a word)', () => {
    const m = matchServicesToOpportunity({ category: 'Training Services' }, CATALOG);
    const train = m.find((x) => x.id === 'train');
    expect(train).toBeDefined();
    expect(train!.categoryMatched).toBe(true);
    expect(train!.reason).toContain('category Training');
    // "AI" must NOT match inside an unrelated category word
    expect(m.find((x) => x.id === 'ai')).toBeUndefined();
  });

  it('NAICS exact overlap is the strongest signal and outranks keyword-only matches', () => {
    const m = matchServicesToOpportunity(
      { title: 'generative ai llm workflow automation pilot', naics: ['541512'] },
      CATALOG,
    );
    // ai matches 3 keywords (score 3); data matches NAICS (score 10) -> data ranks first
    expect(m[0].id).toBe('data');
    expect(m[0].matchedNaics).toEqual(['541512']);
    expect(m[0].strength).toBe('strong');
    expect(m[0].reason).toContain('NAICS 541512');
  });

  it('combined scoring orders by total score (NAICS + category + keywords)', () => {
    const m = matchServicesToOpportunity(
      { category: 'Data', title: 'data analytics etl reporting dashboards', naics: ['541512'] },
      CATALOG,
    );
    expect(m[0].id).toBe('data'); // 10 (naics) + 3 (category) + 4 (keywords) = 17
    expect(m[0].score).toBe(17);
  });

  it('returns an empty list when nothing overlaps', () => {
    expect(matchServicesToOpportunity({ title: 'snow plowing and road salt supply' }, CATALOG)).toEqual([]);
  });

  it('honors the cap (top N by score)', () => {
    const big: MatcherServiceInput[] = Array.from({ length: 10 }, (_, i) => svc({ id: `s${i}`, name: `S${i}`, keywords: ['automation'] }));
    const m = matchServicesToOpportunity({ title: 'automation', naics: [] }, big, { max: 6 });
    expect(m.length).toBe(6);
  });

  it('is total: garbage signals, non-string fields, or an empty catalog never throw and yield []', () => {
    expect(matchServicesToOpportunity(null as any, CATALOG)).toEqual([]);
    expect(matchServicesToOpportunity({ title: 'x' }, [])).toEqual([]);
    expect(matchServicesToOpportunity({ title: 123 as any, requirements: [null, 5 as any, 'data analytics'] }, CATALOG).map((x) => x.id)).toContain('data');
    expect(() => matchServicesToOpportunity({ naics: [null as any, 'bad'] }, [{ id: 'x', name: 'X', keywords: [1 as any, 'etl'] }])).not.toThrow();
  });

  it('matches against requirements text too', () => {
    const m = matchServicesToOpportunity({ requirements: ['The vendor shall provide curriculum development and upskilling.'] }, CATALOG);
    expect(m.find((x) => x.id === 'train')!.matchedKeywords).toEqual(expect.arrayContaining(['curriculum development', 'upskilling']));
  });
});
