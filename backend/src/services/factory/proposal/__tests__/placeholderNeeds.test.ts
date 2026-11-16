import { parsePlaceholderNeeds, parseRecordNeeds, parseDraftNeeds, everyMarkerHasNeed, needKeyForFact } from '../placeholderNeeds';

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

describe('parseRecordNeeds (grouped [RECORD] markers)', () => {
  it('turns [RECORD: reference] into one fatal record need keyed reference:1 with default fields', () => {
    const out = parseRecordNeeds('<p>[RECORD: reference]</p>', 'past', { sectionKey: 's2' });
    expect(out).toHaveLength(1);
    expect(out[0].need).toMatchObject({ kind: 'record', recordType: 'reference', blocking: 'fatal', key: 'reference:1' });
    expect(out[0].need.recordFields).toEqual(['client', 'scope', 'contractValue', 'dates', 'contact']);
    expect(out[0].need.usedIn).toEqual([{ docKey: 'past', sectionKey: 's2' }]);
  });

  it('numbers multiple references in order of appearance', () => {
    const out = parseRecordNeeds('[RECORD: reference] then [RECORD: reference] then [RECORD: reference]', 'past');
    expect(out.map((o) => o.needKey)).toEqual(['reference:1', 'reference:2', 'reference:3']);
  });

  it('personnel records key on personnel:<slot> with personnel fields', () => {
    const out = parseRecordNeeds('[RECORD: personnel]', 'mgmt');
    expect(out[0].need).toMatchObject({ kind: 'record', recordType: 'personnel', key: 'personnel:1' });
    expect(out[0].need.recordFields).toEqual(['name', 'role', 'summary']);
  });

  it('honors an explicit slot= and a fields= override', () => {
    const out = parseRecordNeeds('[RECORD: reference | slot=3 | fields=client, outcome]', 'past');
    expect(out[0].needKey).toBe('reference:3');
    expect(out[0].need.recordFields).toEqual(['client', 'outcome']);
  });

  it('merges a repeated same-slot marker rather than duplicating', () => {
    const out = parseRecordNeeds('[RECORD: reference | slot=1] ... [RECORD: reference | slot=1]', 'past', { sectionKey: 's1' });
    expect(out).toHaveLength(1);
  });

  it('ignores content with no record markers', () => {
    expect(parseRecordNeeds('<p>[PLACEHOLDER: a fact] only</p>', 'past')).toEqual([]);
    expect(parseRecordNeeds('', 'past')).toEqual([]);
  });
});

describe('parseDraftNeeds (both families together)', () => {
  it('returns atomic facts AND grouped records from one draft', () => {
    const out = parseDraftNeeds('<p>[PLACEHOLDER: DUNS number?]</p><p>[RECORD: reference]</p>', 'cover', { sectionKey: 's1' });
    const kinds = out.map((o) => o.need.kind).sort();
    expect(kinds).toEqual(['fact', 'record']);
  });
});

describe('the invariant: a marker is never left without an open need', () => {
  it('content with a placeholder marker always produces at least one need', () => {
    expect(everyMarkerHasNeed('x [PLACEHOLDER: anything at all] y', 'd')).toBe(true);
  });
  it('content with a [RECORD] marker always produces at least one need', () => {
    expect(everyMarkerHasNeed('x [RECORD: reference] y', 'd')).toBe(true);
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
