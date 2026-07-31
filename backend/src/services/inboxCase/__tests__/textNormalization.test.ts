import {
  normalizeSubject,
  normalizeEmailAddress,
  domainOf,
  computeSourceHash,
  extractBasecampReferences,
  termOverlapScore,
} from '../textNormalization';

describe('normalizeSubject', () => {
  it('strips a single Re: prefix', () => {
    expect(normalizeSubject('Re: Contract renewal')).toBe('contract renewal');
  });

  it('strips repeated Re:/Fwd: prefixes', () => {
    expect(normalizeSubject('Re: Fwd: RE: Contract renewal')).toBe('contract renewal');
  });

  it('collapses punctuation and extra whitespace', () => {
    expect(normalizeSubject('AI Flotation, LLC -- Q3 update!!')).toBe('ai flotation llc q3 update');
  });

  it('handles null/undefined/empty', () => {
    expect(normalizeSubject(null)).toBe('');
    expect(normalizeSubject(undefined)).toBe('');
    expect(normalizeSubject('')).toBe('');
  });

  it('two subjects that only differ by Re:/Fwd: and case normalize identically', () => {
    expect(normalizeSubject('Fwd: AI Flotation LLC')).toBe(normalizeSubject('ai flotation llc'));
  });
});

describe('normalizeEmailAddress', () => {
  it('extracts the address from a "Name <addr>" form', () => {
    expect(normalizeEmailAddress('Kes Colaberry <kes@colaberry.com>')).toBe('kes@colaberry.com');
  });

  it('lowercases and trims a bare address', () => {
    expect(normalizeEmailAddress('  Kes@Colaberry.com  ')).toBe('kes@colaberry.com');
  });

  it('handles null/undefined', () => {
    expect(normalizeEmailAddress(null)).toBe('');
    expect(normalizeEmailAddress(undefined)).toBe('');
  });
});

describe('domainOf', () => {
  it('extracts the domain from an address', () => {
    expect(domainOf('ali@colaberry.com')).toBe('colaberry.com');
  });

  it('returns null for a malformed address', () => {
    expect(domainOf('not-an-email')).toBeNull();
  });
});

describe('computeSourceHash', () => {
  it('is stable for the same provider+id', () => {
    expect(computeSourceHash('gmail_colaberry', 'msg123')).toBe(computeSourceHash('gmail_colaberry', 'msg123'));
  });

  it('differs across providers for the same raw id (prevents cross-provider hash collision)', () => {
    expect(computeSourceHash('gmail_colaberry', 'msg123')).not.toBe(computeSourceHash('hotmail', 'msg123'));
  });
});

describe('extractBasecampReferences', () => {
  it('extracts a Basecamp todo URL and its recording id', () => {
    const refs = extractBasecampReferences('See https://3.basecamp.com/3945211/buckets/7463955/todos/10028907149 for details.');
    expect(refs).toHaveLength(1);
    expect(refs[0].recordingId).toBe('10028907149');
  });

  it('dedupes repeated identical URLs', () => {
    const url = 'https://3.basecamp.com/3945211/buckets/7463955/todos/10028907149';
    const refs = extractBasecampReferences(`${url} again here: ${url}`);
    expect(refs).toHaveLength(1);
  });

  it('finds multiple distinct references', () => {
    const refs = extractBasecampReferences(
      'https://3.basecamp.com/3945211/buckets/7463955/todos/111 and https://3.basecamp.com/3945211/buckets/7463955/messages/222'
    );
    expect(refs.map((r) => r.recordingId).sort()).toEqual(['111', '222']);
  });

  it('returns empty for text with no Basecamp links', () => {
    expect(extractBasecampReferences('just a normal email body')).toEqual([]);
  });

  it('handles null/undefined', () => {
    expect(extractBasecampReferences(null)).toEqual([]);
    expect(extractBasecampReferences(undefined)).toEqual([]);
  });
});

describe('termOverlapScore', () => {
  it('scores identical text as 1', () => {
    expect(termOverlapScore('AI Flotation LLC update', 'AI Flotation LLC update')).toBe(1);
  });

  it('scores unrelated text near 0', () => {
    expect(termOverlapScore('AI Flotation LLC quarterly update', 'lunch tomorrow at noon')).toBe(0);
  });

  it('scores partial overlap between 0 and 1', () => {
    const score = termOverlapScore('AI Flotation LLC contract renewal', 'AI Flotation LLC invoice question');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('is symmetric', () => {
    const a = termOverlapScore('quarterly report deadline', 'deadline for quarterly report');
    const b = termOverlapScore('deadline for quarterly report', 'quarterly report deadline');
    expect(a).toBe(b);
  });
});
