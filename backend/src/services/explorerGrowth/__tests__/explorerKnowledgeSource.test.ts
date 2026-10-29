import fs from 'fs';
import path from 'path';
import {
  parseKnowledgeBase,
  confidenceBreakdown,
  KnowledgeBaseContractError,
  SUPPORTED_SCHEMA,
  MIN_SUPPORTED_VERSION,
} from '../explorerKnowledgeSource';

/** A minimal valid export. Helpers override only what a test is about. */
function doc(overrides: Record<string, unknown> = {}) {
  return {
    schema: SUPPORTED_SCHEMA,
    version: '1.1',
    description: 'test base',
    core_facts: 'some facts',
    generated_at: '2026-10-28T00:00:00.000Z',
    count: 1,
    entries: [entry()],
    ...overrides,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sales-1',
    domain: 'sales',
    category: 'Program basics',
    category_key: 'program-basics',
    question: 'What is it?',
    answer: 'A program.',
    detail: '',
    tags: ['overview'],
    reference: 'sales/index.html#cat-program-basics',
    reference_label: 'Program basics',
    confidence: 'grounded',
    ...overrides,
  };
}

describe('parseKnowledgeBase — the envelope contract', () => {
  it('parses a well-formed export and maps snake_case onto the typed shape', () => {
    const base = parseKnowledgeBase(doc());
    expect(base.version).toBe('1.1');
    expect(base.coreFacts).toBe('some facts');
    expect(base.entries).toHaveLength(1);
    expect(base.entries[0]).toEqual({
      id: 'sales-1',
      domain: 'sales',
      category: 'Program basics',
      question: 'What is it?',
      answer: 'A program.',
      detail: '',
      tags: ['overview'],
      reference: 'sales/index.html#cat-program-basics',
      referenceLabel: 'Program basics',
      confidence: 'grounded',
    });
  });

  it('rejects a different schema rather than guessing at it', () => {
    expect(() => parseKnowledgeBase(doc({ schema: 'something.else/v2' }))).toThrow(
      KnowledgeBaseContractError,
    );
  });

  // The reason this parser exists. Version 1.0 has no per-entry `confidence`, so every
  // entry would read as reviewed. Accepting it would be the fail-open bug, not a
  // convenience.
  it('REFUSES a pre-1.1 export, and says why, instead of defaulting confidence', () => {
    expect(() => parseKnowledgeBase(doc({ version: '1.0' }))).toThrow(
      /predates 1\.1.*confidence/s,
    );
    expect(() => parseKnowledgeBase(doc({ version: '0.9' }))).toThrow(
      KnowledgeBaseContractError,
    );
  });

  it('accepts 1.1 and anything above it', () => {
    expect(parseKnowledgeBase(doc({ version: MIN_SUPPORTED_VERSION })).version).toBe('1.1');
    expect(parseKnowledgeBase(doc({ version: '1.2' })).version).toBe('1.2');
    expect(parseKnowledgeBase(doc({ version: '2.0' })).version).toBe('2.0');
    // Not a lexical comparison: '1.10' must beat '1.9', which string compare gets wrong.
    expect(parseKnowledgeBase(doc({ version: '1.10' })).version).toBe('1.10');
  });

  it('rejects a declared count that disagrees with the entries it carries', () => {
    expect(() => parseKnowledgeBase(doc({ count: 5 }))).toThrow(
      /declares count 5 but carries 1/,
    );
  });

  it('rejects duplicate entry ids', () => {
    const d = doc({ count: 2, entries: [entry(), entry()] });
    expect(() => parseKnowledgeBase(d)).toThrow(/duplicate entry id "sales-1"/);
  });

  // `confidence` is required, NOT defaulted. A missing value is the exact condition the
  // tri-state was added to expose, so filling it in would defeat the change.
  it('rejects an entry with no confidence field at all', () => {
    const bare = entry();
    delete (bare as Record<string, unknown>).confidence;
    expect(() => parseKnowledgeBase(doc({ entries: [bare] }))).toThrow(
      KnowledgeBaseContractError,
    );
  });

  it('rejects a confidence value outside the tri-state', () => {
    expect(() => parseKnowledgeBase(doc({ entries: [entry({ confidence: 'probably' })] }))).toThrow(
      KnowledgeBaseContractError,
    );
    // Notably the OLD boolean is not a valid confidence value either.
    expect(() => parseKnowledgeBase(doc({ entries: [entry({ confidence: false })] }))).toThrow(
      KnowledgeBaseContractError,
    );
  });

  it('names the offending path when the shape is wrong', () => {
    expect(() => parseKnowledgeBase(doc({ entries: [entry({ question: '' })] }))).toThrow(
      /entries\.0\.question/,
    );
  });

  it('rejects non-objects without throwing something unrecognisable', () => {
    for (const bad of [null, undefined, 42, 'kb', []]) {
      expect(() => parseKnowledgeBase(bad)).toThrow(KnowledgeBaseContractError);
    }
  });

  it('tags its error with a stable error_class for logging', () => {
    try {
      parseKnowledgeBase(doc({ schema: 'x' }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(KnowledgeBaseContractError);
      expect((e as KnowledgeBaseContractError).errorClass).toBe('ContractViolation');
    }
  });

  it('counts the confidence states', () => {
    const d = doc({
      count: 3,
      entries: [
        entry({ id: 'a', confidence: 'grounded' }),
        entry({ id: 'b', confidence: 'unstated' }),
        entry({ id: 'c', confidence: 'drafted-verify' }),
      ],
    });
    expect(confidenceBreakdown(parseKnowledgeBase(d))).toEqual({
      grounded: 1,
      unstated: 1,
      'drafted-verify': 1,
    });
  });
});

/**
 * Against the REAL published export, not a fixture.
 *
 * A fixture proves the parser parses the fixture. These numbers are the measured state
 * of the actual library and are pinned deliberately: if someone edits the knowledge base
 * and the distribution moves, this fails and the gate's posture gets re-examined instead
 * of silently drifting.
 */
describe('parseKnowledgeBase — the real kb.json', () => {
  const KB_PATH = path.resolve(
    __dirname,
    '../../../../../frontend/public/knowledge/kb.json',
  );

  it('exists where the backend expects to find it in the repo', () => {
    expect(fs.existsSync(KB_PATH)).toBe(true);
  });

  it('parses, and carries the tri-state distribution measured on 2026-10-28', () => {
    const base = parseKnowledgeBase(JSON.parse(fs.readFileSync(KB_PATH, 'utf8')));

    expect(base.schema).toBe(SUPPORTED_SCHEMA);
    expect(base.entries).toHaveLength(217);

    // The finding this whole change rests on: only `sales` has ever been triaged, so
    // 137 entries carry no confidence statement and must not read as verified.
    expect(confidenceBreakdown(base)).toEqual({
      grounded: 77,
      unstated: 137,
      'drafted-verify': 3,
    });

    // Every `grounded` and `drafted-verify` entry is in sales; nothing else was reviewed.
    const reviewedDomains = new Set(
      base.entries.filter((e) => e.confidence !== 'unstated').map((e) => e.domain),
    );
    expect([...reviewedDomains]).toEqual(['sales']);
  });

  it('still carries the file-level caveat that contradicts its own unflagged entries', () => {
    const base = parseKnowledgeBase(JSON.parse(fs.readFileSync(KB_PATH, 'utf8')));
    // Load-bearing: the description says the refund terms are not final, while every
    // refund entry reads as needing no verification. The gate exists because of gaps
    // like this one, so if the description is ever cleaned up, this should be revisited.
    expect(base.description).toMatch(/Refund and cancellation terms are drafted, not final/);
  });
});
