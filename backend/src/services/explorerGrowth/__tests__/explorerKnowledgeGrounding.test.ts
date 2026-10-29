import {
  groundDraft,
  rankQuotableEntries,
  scoreEntry,
  queryTokens,
  buildKnowledgeBlock,
  KNOWLEDGE_BLOCK_HEADER,
  KNOWLEDGE_BLOCK_CONSTRAINT,
  MAX_GROUNDING_ENTRIES,
} from '../explorerKnowledgeGrounding';
import type { KnowledgeBase, KnowledgeEntry } from '../explorerKnowledgeSource';
import type { ExplorerFactSet } from '../explorerFactGuard';

/**
 * Grounding = gate, then rank, then render.
 *
 * THE ASSERTION THAT MATTERS is "governance before relevance": an entry that is a perfect
 * match for the query but may not be quoted must not reach the prompt. Written the other
 * way round - rank first, filter the top few - that entry would take a slot, the gate's
 * verdict would depend on the search query, and the failure would be invisible because the
 * block would still look populated. So that case is driven with an entry engineered to
 * score higher than every quotable one.
 *
 * The banned-copy and ungrounded-fact cases go through the REAL rule and the REAL fact
 * guard rather than a stub, because the thing being tested is the wiring: these modules
 * were written, tested, and had no caller.
 */

const NO_FACTS: ExplorerFactSet = { dates: [], prices: [], seats: [] };

function entry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'sales-1',
    domain: 'sales',
    category: 'Program basics',
    question: 'Do I need a coding background?',
    answer: 'No. The program assumes no prior engineering experience.',
    detail: '',
    tags: [],
    reference: 'sales/index.html#cat-program-basics',
    referenceLabel: 'Program basics',
    confidence: 'grounded',
    ...overrides,
  };
}

function base(entries: readonly KnowledgeEntry[]): KnowledgeBase {
  return {
    schema: 'colaberry.kb/v1',
    version: '1.1',
    description: '',
    coreFacts: '',
    generatedAt: '2026-10-28T00:00:00.000Z',
    entries,
  };
}

describe('queryTokens', () => {
  it('keeps words of three or more characters, lowercased', () => {
    expect(queryTokens('Do I need a Coding background')).toEqual(['need', 'coding', 'background']);
  });

  it('is empty for a query of only short words, so nothing is ranked on noise', () => {
    expect(queryTokens('is it a go')).toEqual([]);
  });

  it('strips surrounding punctuation but keeps technical characters', () => {
    expect(queryTokens('pricing, c++ and .NET!')).toEqual(['pricing', 'c++', '.net']);
  });

  it('drops function words, which would otherwise score against nearly every entry', () => {
    // "and" is three characters, so a length filter alone keeps it. One +1 body hit is
    // enough to clear the `score > 0` bar and take one of four prompt slots.
    expect(queryTokens('what are the details of this and that')).toEqual(['details']);
  });
});

describe('scoreEntry — Maya’s weights, unchanged', () => {
  it('scores a tag hit above a question hit above a body hit', () => {
    const tokens = ['pricing'];
    const tagHit = scoreEntry(entry({ tags: ['pricing'] }), tokens);
    const questionHit = scoreEntry(entry({ question: 'What is the pricing?' }), tokens);
    const bodyHit = scoreEntry(entry({ answer: 'Our pricing is simple.' }), tokens);

    expect(tagHit).toBe(3);
    expect(questionHit).toBe(2);
    expect(bodyHit).toBe(1);
  });

  it('matches tags bidirectionally, catching plurals and compounds in either direction', () => {
    expect(scoreEntry(entry({ tags: ['cohort'] }), ['cohorts'])).toBe(3);
    expect(scoreEntry(entry({ tags: ['ai-engineer'] }), ['ai'])).toBe(3);
  });

  it('does NOT match a stem variant that is not a substring', () => {
    // "pricing" and "price" share only the prefix "pric", so neither contains the other.
    // Documented because the obvious reading of "bidirectional substring" is that it would.
    expect(scoreEntry(entry({ tags: ['pricing'] }), ['price'])).toBe(0);
  });

  it('adds the category bonus once, not once per token', () => {
    const e = entry({ category: 'Pricing', tags: [], question: '', answer: '' });
    expect(scoreEntry(e, ['alpha', 'bravo', 'charlie'], 'Pricing')).toBe(2);
  });

  it('counts answer and detail as ONE body, so repetition earns nothing extra', () => {
    const repeated = entry({ answer: 'cohort details', detail: 'cohort details' });
    expect(scoreEntry(repeated, ['cohort'])).toBe(1);
  });
});

describe('rankQuotableEntries', () => {
  it('orders by score, highest first', () => {
    const ranked = rankQuotableEntries(
      [
        entry({ id: 'a', answer: 'mentions cohort once' }),
        entry({ id: 'b', tags: ['cohort'] }),
        entry({ id: 'c', question: 'When is the cohort?' }),
      ],
      'cohort',
    );

    expect(ranked.map((r) => r.entry.id)).toEqual(['b', 'c', 'a']);
  });

  it('drops entries that match nothing, rather than padding the prompt', () => {
    const ranked = rankQuotableEntries(
      [entry({ id: 'match', tags: ['cohort'] }), entry({ id: 'miss', answer: 'unrelated' })],
      'cohort',
    );

    expect(ranked.map((r) => r.entry.id)).toEqual(['match']);
  });

  it('returns nothing for a query with no scorable words', () => {
    expect(rankQuotableEntries([entry()], 'is it a go')).toEqual([]);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => entry({ id: `e${i}`, tags: ['cohort'] }));
    expect(rankQuotableEntries(many, 'cohort', undefined, 2)).toHaveLength(2);
  });

  it('breaks ties deterministically, so the same corpus yields the same prompt', () => {
    const tied = [
      entry({ id: 'sales-9', tags: ['cohort'] }),
      entry({ id: 'sales-2', tags: ['cohort'] }),
    ];

    const once = rankQuotableEntries(tied, 'cohort').map((r) => r.entry.id);
    const twice = rankQuotableEntries([...tied].reverse(), 'cohort').map((r) => r.entry.id);

    expect(once).toEqual(twice);
  });
});

describe('buildKnowledgeBlock', () => {
  it('is empty when there is nothing to quote', () => {
    expect(buildKnowledgeBlock([])).toBe('');
  });

  it('uses the header Maya’s prompts already use, verbatim', () => {
    const block = buildKnowledgeBlock([{ entry: entry(), score: 3 }]);
    expect(block.startsWith(KNOWLEDGE_BLOCK_HEADER)).toBe(true);
  });

  it('numbers entries so a reviewer can trace a sentence to a citation', () => {
    const block = buildKnowledgeBlock([
      { entry: entry({ id: 'a', question: 'First?' }), score: 3 },
      { entry: entry({ id: 'b', question: 'Second?' }), score: 2 },
    ]);

    expect(block).toContain('[1] sales - First?');
    expect(block).toContain('[2] sales - Second?');
  });

  it('ends with the constraint, so the facts are a limit and not just context', () => {
    const block = buildKnowledgeBlock([{ entry: entry(), score: 3 }]);
    expect(block.trimEnd().endsWith(KNOWLEDGE_BLOCK_CONSTRAINT)).toBe(true);
  });

  it('omits an empty detail line rather than emitting blank indentation', () => {
    const block = buildKnowledgeBlock([{ entry: entry({ detail: '' }), score: 3 }]);
    expect(block).not.toMatch(/\n\s+\n/);
  });
});

describe('groundDraft — governance runs BEFORE relevance', () => {
  it('excludes an unstated-confidence entry even when it is the best match by far', () => {
    // Engineered to outscore everything quotable: tag hit + question hit + body hit.
    const unstatedButPerfect = entry({
      id: 'perfect',
      confidence: 'unstated',
      tags: ['cohort'],
      question: 'When does the cohort start?',
      answer: 'The cohort start is published on the hub.',
    });
    const quotableButWeak = entry({ id: 'weak', answer: 'A passing mention of a cohort.' });

    const result = groundDraft({
      base: base([unstatedButPerfect, quotableButWeak]),
      query: 'cohort start',
      facts: NO_FACTS,
    });

    expect(result.block).not.toContain('published on the hub');
    expect(result.block).toContain('A passing mention of a cohort.');
    expect(result.refusalCounts.confidence_unstated).toBe(1);
    expect(result.quotableCount).toBe(1);
  });

  it('excludes a drafted-verify entry, which the hub itself says to confirm before quoting', () => {
    const result = groundDraft({
      base: base([entry({ confidence: 'drafted-verify', tags: ['cohort'] })]),
      query: 'cohort',
      facts: NO_FACTS,
    });

    expect(result.block).toBe('');
    expect(result.refusalCounts.confidence_drafted_verify).toBe(1);
  });

  it('excludes an entry that advertises the regulated word, through the real rule', () => {
    const result = groundDraft({
      base: base([
        entry({
          id: 'regulated',
          tags: ['cohort'],
          answer: 'The cohort workshop is free to attend.',
        }),
      ]),
      query: 'cohort',
      facts: NO_FACTS,
    });

    expect(result.block).toBe('');
    expect(result.refusalCounts.banned_copy).toBe(1);
  });

  it('excludes an entry whose date is not in the learner’s resolved facts', () => {
    const dated = entry({ id: 'dated', tags: ['cohort'], answer: 'The cohort starts Nov 3.' });

    const ungrounded = groundDraft({ base: base([dated]), query: 'cohort', facts: NO_FACTS });
    expect(ungrounded.block).toBe('');
    expect(ungrounded.refusalCounts.ungrounded_fact).toBe(1);

    // The control the other way: the same entry IS quotable once the fact is resolved, which
    // proves the refusal was about grounding and not about the sentence containing a digit.
    const grounded = groundDraft({
      base: base([dated]),
      query: 'cohort',
      facts: { dates: ['Nov 3'], prices: [], seats: [] },
    });
    expect(grounded.block).toContain('The cohort starts Nov 3.');
    expect(grounded.refusalCounts.ungrounded_fact).toBe(0);
  });
});

describe('groundDraft — what it reports', () => {
  it('returns citations aligned one-for-one with the block, in block order', () => {
    const result = groundDraft({
      base: base([
        entry({ id: 'a', tags: ['cohort'], question: 'Strong?', reference: 'sales/a.html' }),
        entry({ id: 'b', answer: 'weak cohort mention', question: 'Weak?', reference: 'sales/b.html' }),
      ]),
      query: 'cohort',
      facts: NO_FACTS,
    });

    expect(result.citations.map((c) => c.question)).toEqual(['Strong?', 'Weak?']);
    expect(result.citations.map((c) => c.reference)).toEqual(['sales/a.html', 'sales/b.html']);
    expect(result.block).toContain('[1] sales - Strong?');
    expect(result.block).toContain('[2] sales - Weak?');
  });

  it('reports quotableCount as gate survivors, not as block size', () => {
    // Six quotable entries, all matching; the block is capped, the count is not.
    const six = Array.from({ length: 6 }, (_, i) => entry({ id: `e${i}`, tags: ['cohort'] }));

    const result = groundDraft({ base: base(six), query: 'cohort', facts: NO_FACTS });

    expect(result.quotableCount).toBe(6);
    expect(result.citations).toHaveLength(MAX_GROUNDING_ENTRIES);
  });

  it('says the copy rules were applied, which cannot be false by construction', () => {
    // The rule set is imported, not injected, precisely so a caller cannot pass an empty
    // one and turn the banned-copy check off while still reading "no refusals".
    const result = groundDraft({ base: base([entry()]), query: 'coding', facts: NO_FACTS });
    expect(result.copyRulesApplied).toBe(true);
  });

  it('grounds nothing, and cites nothing, on an empty corpus', () => {
    const result = groundDraft({ base: base([]), query: 'cohort', facts: NO_FACTS });

    expect(result.block).toBe('');
    expect(result.citations).toEqual([]);
    expect(result.quotableCount).toBe(0);
  });

  it('treats an absent fact set as grounding nothing, which is intended and not degenerate', () => {
    const result = groundDraft({
      base: base([entry({ tags: ['cohort'], answer: 'Seats are $500.' })]),
      query: 'cohort',
    });

    expect(result.block).toBe('');
    expect(result.refusalCounts.ungrounded_fact).toBe(1);
  });
});
