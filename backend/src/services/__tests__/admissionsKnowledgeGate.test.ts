import {
  gateKnowledgeEntries,
  renderKnowledgeContext,
  NO_KNOWLEDGE_DIRECTIVE,
  type QuotableKnowledgeEntry,
} from '../admissionsKnowledgeGate';

/**
 * The gate between what keyword scoring RETRIEVED and what Maya is allowed to QUOTE.
 *
 * The two behaviours these tests exist to hold are the two that were broken: a retired fact
 * must not reach the prompt even when it scores highest, and "nothing to say" must never be
 * expressible as an empty string, because an empty string left the model answering from its
 * own weights with nothing marking the answer as unsourced.
 */

const entry = (over: Partial<QuotableKnowledgeEntry> = {}): QuotableKnowledgeEntry => ({
  id: 'e1',
  category: 'pricing',
  title: 'What does membership cost?',
  content: 'Membership is $149 per month billed annually. You can start for $0, no card needed.',
  ...over,
});

describe('gateKnowledgeEntries', () => {
  it('allows a clean entry', () => {
    const g = gateKnowledgeEntries([entry()]);
    expect(g.allowed).toHaveLength(1);
    expect(g.blocked).toEqual([]);
    expect(g.retrieved).toBe(1);
  });

  it('blocks a retired price in the CONTENT, however relevant the row is', () => {
    const g = gateKnowledgeEntries([entry({ content: 'The program is $4,500 per participant.' })]);
    expect(g.allowed).toEqual([]);
    expect(g.blocked).toHaveLength(1);
    expect(g.blocked[0].reason).toBe('retired_fact');
    expect(g.blocked[0].detail).toContain('retired fact');
  });

  it('blocks a retired fact in the TITLE, not only the body', () => {
    // The seeder's own check reads title+content; a figure in a title is quoted just as
    // readily, and reading content alone would have let this through.
    const g = gateKnowledgeEntries([
      entry({ title: 'Is it still 4,500 per seat?', content: 'Pricing has changed since then.' }),
    ]);
    expect(g.allowed).toEqual([]);
    expect(g.blocked).toHaveLength(1);
  });

  it('blocks the retired cohort date', () => {
    const g = gateKnowledgeEntries([entry({ content: 'The next cohort starts March 31, 2026.' })]);
    expect(g.allowed).toEqual([]);
    expect(g.blocked).toHaveLength(1);
  });

  it('partitions totally - every retrieved row lands in exactly one bucket', () => {
    // A `filter` would drop rows silently. Totality is what makes "withheld" observable.
    const rows = [
      entry({ id: 'ok1' }),
      entry({ id: 'bad1', content: '$4,500 per seat' }),
      entry({ id: 'ok2' }),
      entry({ id: 'bad2', content: 'Cohort begins March 31' }),
    ];
    const g = gateKnowledgeEntries(rows);
    expect(g.allowed.length + g.blocked.length).toBe(rows.length);
    expect(g.retrieved).toBe(4);
    expect(g.allowed.map((e) => e.id)).toEqual(['ok1', 'ok2']);
    expect(g.blocked.map((b) => b.entry.id)).toEqual(['bad1', 'bad2']);
  });

  it('is idempotent - gating the same rows twice gives the same answer', () => {
    const rows = [entry({ id: 'a' }), entry({ id: 'b', content: '$4,500 per participant' })];
    expect(gateKnowledgeEntries(rows)).toEqual(gateKnowledgeEntries(rows));
  });

  it('handles the empty retrieval without inventing a row', () => {
    const g = gateKnowledgeEntries([]);
    expect(g.allowed).toEqual([]);
    expect(g.blocked).toEqual([]);
    expect(g.retrieved).toBe(0);
  });
});

describe('renderKnowledgeContext', () => {
  it('NEVER returns an empty string - that is the whole point', () => {
    // Both no-answer paths must be indistinguishable to the caller, and neither may be
    // falsy: `if (ctx)` in the caller is exactly how the unsourced answer used to happen.
    expect(renderKnowledgeContext(gateKnowledgeEntries([]))).toBe(NO_KNOWLEDGE_DIRECTIVE);
    expect(renderKnowledgeContext(gateKnowledgeEntries([]))).not.toBe('');
    expect(NO_KNOWLEDGE_DIRECTIVE.length).toBeGreaterThan(0);
  });

  it('returns the directive when rows WERE retrieved but all of them were withheld', () => {
    // The dangerous case: relevant-looking rows existed, so a count-based check would say
    // "we had knowledge", yet none of it may be repeated.
    const g = gateKnowledgeEntries([entry({ content: '$4,500 per participant' })]);
    expect(g.retrieved).toBe(1);
    expect(renderKnowledgeContext(g)).toBe(NO_KNOWLEDGE_DIRECTIVE);
  });

  it('tells the model it has no sourced answer and must not estimate', () => {
    expect(NO_KNOWLEDGE_DIRECTIVE).toMatch(/no sourced answer/i);
    expect(NO_KNOWLEDGE_DIRECTIVE).toMatch(/do not state program facts/i);
    expect(NO_KNOWLEDGE_DIRECTIVE).toMatch(/estimate|approximate/i);
  });

  it('does not use the advertising term this repo may not publish', () => {
    // 40 TAC 807.172(d). The approved phrasing is "no card needed".
    expect(NO_KNOWLEDGE_DIRECTIVE.toLowerCase()).not.toMatch(/\bfree\b/);
  });

  it('preserves the prompt shape Maya already had, so this is not a prompt rewrite', () => {
    const out = renderKnowledgeContext(gateKnowledgeEntries([entry()]));
    expect(out).toContain('KNOWLEDGE BASE (use these facts to answer accurately):');
    expect(out).toContain('[PRICING] What does membership cost?: Membership is $149');
  });

  it('names withheld entries so a short list cannot read as the whole truth', () => {
    const one = renderKnowledgeContext(
      gateKnowledgeEntries([entry({ id: 'ok' }), entry({ id: 'bad', content: '$4,500 a seat' })]),
    );
    expect(one).toContain('1 further entry was');
    expect(one).toContain('retired facts');

    const two = renderKnowledgeContext(
      gateKnowledgeEntries([
        entry({ id: 'ok' }),
        entry({ id: 'b1', content: '$4,500 a seat' }),
        entry({ id: 'b2', content: 'starts March 31' }),
      ]),
    );
    expect(two).toContain('2 further entries were');
  });

  it('says nothing about withholding when nothing was withheld', () => {
    expect(renderKnowledgeContext(gateKnowledgeEntries([entry()]))).not.toContain('withheld');
  });
});
