import {
  normalizeSubject,
  normalizeEmailAddress,
  domainOf,
  computeSourceHash,
  extractBasecampReferences,
  termOverlapScore,
  parseDigestTodoLines,
  isBasecampDigestSender,
  DIGEST_SENDER,
} from '../textNormalization';
import { DIGEST_SAMPLE_12A, DIGEST_SAMPLE_12B, DIGEST_SAMPLE_42 } from './fixtures/basecampDigestSamples';

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

describe('parseDigestTodoLines — real production Basecamp digest samples', () => {
  it('parses the first real 12-to-do sample into exactly the to-dos a human would identify', () => {
    const parsed = parseDigestTodoLines(DIGEST_SAMPLE_12A);
    expect(parsed).toHaveLength(12);
    expect(parsed[0]).toEqual({
      project: 'AI Systems Architect Accelerator',
      todolist: 'Website - enterprise.colaberry.ai',
      title: 'Final review and approval of enterprise.colaberry.ai',
      dueRaw: 'Jul 10',
    });
    // Last item, different project section, confirms the parser correctly
    // resets project/todolist across multiple "From: ... ---" blocks.
    expect(parsed[parsed.length - 1]).toEqual({
      project: 'LandJet Growth Engine',
      todolist: 'Outreach Engine',
      title: '[Platform] LLM-backed category validation (company vs assigned vertical)',
      dueRaw: 'Jul 11',
    });
  });

  it('parses the second real 12-to-do sample, including multiple todolists under one project', () => {
    const parsed = parseDigestTodoLines(DIGEST_SAMPLE_12B);
    expect(parsed).toHaveLength(12);
    // "Student Platform Build" and "TWC Compliance" are two distinct
    // todolists both under "AI Systems Architect Accelerator" — the real
    // case that tests currentTodolist correctly resets mid-project.
    expect(parsed[0].todolist).toBe('Student Platform Build');
    expect(parsed[1].todolist).toBe('TWC Compliance');
    expect(parsed[1].title).toBe('Legal review of TWC compliance documents');
  });

  it('parses the real 42-to-do sample (the largest, most structurally complex sample) without dropping or miscounting any line', () => {
    const parsed = parseDigestTodoLines(DIGEST_SAMPLE_42);
    expect(parsed).toHaveLength(42);
    expect(parsed.every((t) => t.title.length > 0 && t.project.length > 0)).toBe(true);
  });

  it('strips a leading emoji glyph from the title', () => {
    const parsed = parseDigestTodoLines(DIGEST_SAMPLE_12A);
    const emojiItem = parsed.find((t) => t.title.startsWith('Ali: review ISO 27001'));
    expect(emojiItem).toBeDefined();
    expect(emojiItem!.title).not.toMatch(/🧑/);
  });

  it('returns an empty array for a body with zero ▢ lines (boundary)', () => {
    expect(parseDigestTodoLines('Just a normal email with no to-dos in it.')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseDigestTodoLines('')).toEqual([]);
  });
});

describe('isBasecampDigestSender', () => {
  it('matches the real, confirmed digest sender address', () => {
    expect(isBasecampDigestSender(DIGEST_SENDER)).toBe(true);
    expect(isBasecampDigestSender('notifications@app.basecamp.com')).toBe(true);
  });

  it('rejects a normal person\'s address', () => {
    expect(isBasecampDigestSender('kes@colaberry.com')).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(isBasecampDigestSender(null)).toBe(false);
    expect(isBasecampDigestSender(undefined)).toBe(false);
  });
});
