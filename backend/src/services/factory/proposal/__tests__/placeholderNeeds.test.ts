import { parsePlaceholderNeeds, everyMarkerHasNeed, needKeyForFact } from '../placeholderNeeds';

/**
 * v3 "placeholders are always questions": every `[PLACEHOLDER: …]` becomes exactly one typed need, identical asks
 * dedupe by key, and a document can never hold an unresolved marker with no open need (the acceptance invariant).
 */
describe('parsePlaceholderNeeds', () => {
  it('turns one marker into one fatal fact need used in the doc/section', () => {
    const out = parsePlaceholderNeeds('<p>Colaberry has delivered for [PLACEHOLDER: How many years has Colaberry delivered data and AI projects?] years.</p>', 'past', { sectionKey: 's2' });
    expect(out).toHaveLength(1);
    expect(out[0].need).toMatchObject({ kind: 'fact', blocking: 'fatal' });
    expect(out[0].need.ask).toContain('How many years');
    expect(out[0].need.key).toMatch(/^fact:/);
    expect(out[0].need.usedIn).toEqual([{ docKey: 'past', sectionKey: 's2' }]);
  });

  it('dedupes identical asks and merges where they are used', () => {
    const html = 'A [PLACEHOLDER: What is the DUNS number?] ... later again [PLACEHOLDER: What is the DUNS number?]';
    const a = parsePlaceholderNeeds(html, 'cover', { sectionKey: 's1' });
    expect(a).toHaveLength(1);
    // Same ask in another section of the same doc merges usedIn rather than making a second need.
    const b = parsePlaceholderNeeds(`${html} and [PLACEHOLDER: What is the DUNS number?]`, 'cover', { sectionKey: 's9' });
    expect(b).toHaveLength(1);
  });

  it('two DIFFERENT asks become two needs with different keys', () => {
    const out = parsePlaceholderNeeds('[PLACEHOLDER: Years in business?] and [PLACEHOLDER: Prime contact name?]', 'tech');
    expect(out).toHaveLength(2);
    expect(new Set(out.map((o) => o.needKey)).size).toBe(2);
  });

  it('honors an explicit key= prefix for dedupe across differently-worded asks', () => {
    const out = parsePlaceholderNeeds('[PLACEHOLDER: key=years_in_business | How many years in business?]', 'tech');
    expect(out[0].needKey).toBe('fact:years_in_business');
    expect(out[0].need.ask).toBe('How many years in business?');
  });

  it('empty / markerless content yields no needs', () => {
    expect(parsePlaceholderNeeds('<p>All grounded here.</p>', 'tech')).toEqual([]);
    expect(parsePlaceholderNeeds('', 'tech')).toEqual([]);
    expect(parsePlaceholderNeeds(null, 'tech')).toEqual([]);
  });
});

describe('the invariant: a marker is never left without an open need', () => {
  it('content with a marker always produces at least one need', () => {
    expect(everyMarkerHasNeed('x [PLACEHOLDER: anything at all] y', 'd')).toBe(true);
  });
  it('markerless content trivially satisfies it', () => {
    expect(everyMarkerHasNeed('<p>done</p>', 'd')).toBe(true);
  });
});

describe('needKeyForFact', () => {
  it('normalizes to a stable fact key', () => {
    expect(needKeyForFact('How many YEARS?!')).toBe('fact:how_many_years');
    expect(needKeyForFact('   ')).toBe('fact:unspecified');
  });
});
