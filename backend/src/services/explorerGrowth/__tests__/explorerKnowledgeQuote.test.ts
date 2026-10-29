import fs from 'fs';
import path from 'path';
import {
  decideKnowledgeQuote,
  decideCoreFactsQuote,
  selectQuotableEntries,
  type KnowledgeQuoteContext,
} from '../explorerKnowledgeQuote';
import {
  parseKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeEntry,
} from '../explorerKnowledgeSource';
import type { ExplorerFactSet } from '../explorerFactGuard';
// Importing the canonical rule is legal HERE and only here: `frontendCopyLint.test.ts`
// fails the build if any RUNTIME file under backend/src imports this module, because it
// pulls in the TypeScript compiler. Tests are exempt from that walk, which is what lets
// this suite pin behaviour against the real regulated word instead of an invented one.
import { FREE_WORD_RULE } from '../../content/bannedCopyScanner';

const RULES = [FREE_WORD_RULE];
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

const ctx = (over: Partial<KnowledgeQuoteContext> = {}): KnowledgeQuoteContext => ({
  copyRules: RULES,
  facts: NO_FACTS,
  ...over,
});

describe('decideKnowledgeQuote — what may be repeated', () => {
  it('allows a reviewed entry that states no date, price or forbidden wording', () => {
    const d = decideKnowledgeQuote(entry(), ctx());
    expect(d.quotable).toBe(true);
    expect(d.refusals).toEqual([]);
    expect(d.checksRun).toEqual({ confidence: true, bannedCopy: true, groundedFacts: true });
  });

  it('cites the question and the hub link, and NEVER the positional id', () => {
    const d = decideKnowledgeQuote(entry({ id: 'sales-8' }), ctx());
    expect(d.citation).toEqual({
      domain: 'sales',
      question: 'Do I need a coding background?',
      reference: 'sales/index.html#cat-program-basics',
      referenceLabel: 'Program basics',
    });
    // `build-kb.js` numbers ids positionally, so inserting one entry renumbers the rest
    // and `sales-8` silently becomes a different answer. A citation must not depend on it.
    expect(Object.keys(d.citation ?? {})).not.toContain('id');
    expect(Object.values(d.citation ?? {})).not.toContain('sales-8');
  });

  it('refuses an entry nobody ever reviewed, because unstated is not verified', () => {
    const d = decideKnowledgeQuote(entry({ confidence: 'unstated' }), ctx());
    expect(d.quotable).toBe(false);
    expect(d.refusals.map((r) => r.code)).toEqual(['confidence_unstated']);
    expect(d.refusals[0].detail).toMatch(/never been reviewed/);
    expect(d.citation).toBeNull();
  });

  it('refuses an entry marked drafted-verify', () => {
    const d = decideKnowledgeQuote(entry({ confidence: 'drafted-verify' }), ctx());
    expect(d.quotable).toBe(false);
    expect(d.refusals.map((r) => r.code)).toEqual(['confidence_drafted_verify']);
  });

  it('refuses forbidden wording and names the match, the rule and the alternatives', () => {
    const d = decideKnowledgeQuote(
      entry({ answer: 'Come to the free Open House to see it first.' }),
      ctx(),
    );
    expect(d.quotable).toBe(false);
    const banned = d.refusals.filter((r) => r.code === 'banned_copy');
    expect(banned).toHaveLength(1);
    expect(banned[0].detail).toContain('"free"');
    expect(banned[0].detail).toContain('tac-807-172-d-free');
    expect(banned[0].detail).toContain('$0 to start');
  });

  it('does not fire on a word that merely contains the forbidden one', () => {
    const d = decideKnowledgeQuote(
      entry({ answer: 'Freedom to build carefree, at your own pace.' }),
      ctx(),
    );
    expect(d.refusals.filter((r) => r.code === 'banned_copy')).toEqual([]);
    expect(d.quotable).toBe(true);
  });

  it('refuses a date the resolved context does not support', () => {
    const d = decideKnowledgeQuote(entry({ answer: 'Kickoff is July 23.' }), ctx());
    expect(d.quotable).toBe(false);
    const facts = d.refusals.filter((r) => r.code === 'ungrounded_fact');
    expect(facts).toHaveLength(1);
    expect(facts[0].detail).toContain('July 23');
    expect(facts[0].detail).toContain('date');
  });

  // The gate is not a blanket refusal of dates. This is the behaviour that distinguishes
  // "ungrounded" from "stale", and it is why the existing fact guard was reused rather
  // than a past-date check written from scratch.
  it('ALLOWS the same date once the context actually resolves it', () => {
    const d = decideKnowledgeQuote(
      entry({ answer: 'Kickoff is July 23.' }),
      ctx({ facts: { dates: ['July 23'], prices: [], seats: [] } }),
    );
    expect(d.refusals).toEqual([]);
    expect(d.quotable).toBe(true);
  });

  it('refuses an ungrounded price and an ungrounded seat count', () => {
    const price = decideKnowledgeQuote(entry({ answer: 'It is $149/mo.' }), ctx());
    expect(price.refusals.map((r) => r.code)).toContain('ungrounded_fact');

    const seats = decideKnowledgeQuote(entry({ answer: 'There are 40 seats.' }), ctx());
    expect(seats.refusals.map((r) => r.code)).toContain('ungrounded_fact');
  });

  // A check that did not run must not read as a check that passed. This is the
  // `explorerQuoteGuard` rule - zero rules means UNCHECKED, never clean - made blocking.
  it('refuses outright when no copy rules were supplied, and says the check did not run', () => {
    const d = decideKnowledgeQuote(entry(), ctx({ copyRules: [] }));
    expect(d.quotable).toBe(false);
    expect(d.refusals.map((r) => r.code)).toEqual(['copy_rules_absent']);
    expect(d.checksRun.bannedCopy).toBe(false);
    expect(d.citation).toBeNull();
  });

  it('returns EVERY reason, not just the first one found', () => {
    const d = decideKnowledgeQuote(
      entry({ confidence: 'unstated', answer: 'A free seat on July 23 for $149.' }),
      ctx(),
    );
    const codes = new Set(d.refusals.map((r) => r.code));
    expect(codes).toEqual(new Set(['confidence_unstated', 'banned_copy', 'ungrounded_fact']));
  });

  it('scans the question and detail, not only the answer', () => {
    const q = decideKnowledgeQuote(
      entry({ question: 'Why not just use free YouTube videos?' }),
      ctx(),
    );
    expect(q.refusals.map((r) => r.code)).toContain('banned_copy');
    expect(q.refusals[0].detail).toContain('question');

    const detail = decideKnowledgeQuote(entry({ detail: 'Free Open House in July.' }), ctx());
    expect(detail.refusals.map((r) => r.code)).toContain('banned_copy');
  });

  it('treats an absent fact set the same as an empty one — closed, not open', () => {
    const d = decideKnowledgeQuote(entry({ answer: 'Kickoff is July 23.' }), {
      copyRules: RULES,
    });
    expect(d.quotable).toBe(false);
    expect(d.refusals.map((r) => r.code)).toContain('ungrounded_fact');
  });
});

describe('decideCoreFactsQuote', () => {
  const base = (coreFacts: string): KnowledgeBase => ({
    schema: 'colaberry.kb/v1',
    version: '1.1',
    description: '',
    coreFacts,
    generatedAt: '2026-10-28T00:00:00.000Z',
    entries: [],
  });

  // core_facts is one maintained string with no confidence statement of any kind, and it
  // is the part most likely to be pasted verbatim. Treating it as reviewed because it
  // looks authoritative is the mistake.
  it('is never quotable, even when the text is otherwise clean and facts resolve', () => {
    const d = decideCoreFactsQuote(base('A 12-week project-based program.'), ctx());
    expect(d.quotable).toBe(false);
    expect(d.refusals.map((r) => r.code)).toContain('confidence_unstated');
    expect(d.citation).toBeNull();
  });

  it('still reports the specific wording and fact problems on top of that', () => {
    const d = decideCoreFactsQuote(base('Open House (free): Thursday, July 16, 2026.'), ctx());
    const codes = new Set(d.refusals.map((r) => r.code));
    expect(codes).toContain('banned_copy');
    expect(codes).toContain('ungrounded_fact');
  });
});

describe('selectQuotableEntries — against the real kb.json', () => {
  const KB_PATH = path.resolve(
    __dirname,
    '../../../../../frontend/public/knowledge/kb.json',
  );
  const realBase = (): KnowledgeBase =>
    parseKnowledgeBase(JSON.parse(fs.readFileSync(KB_PATH, 'utf8')));

  it('partitions the library completely — nothing is silently dropped', () => {
    const base = realBase();
    const sel = selectQuotableEntries(base, ctx());
    expect(sel.quotable.length + sel.refused.size).toBe(base.entries.length);
    expect(base.entries.length).toBe(217);
  });

  /**
   * The measured answer to "what can actually be quoted today", pinned.
   *
   * With no facts resolved for a particular learner, every date and price is ungrounded
   * by definition, so this is the floor rather than the ceiling: resolving a cohort date
   * for a real Explorer moves entries INTO the quotable set, as the unit test above shows.
   */
  it('allows 37 of 217 with no resolved facts, and all of them are reviewed sales entries', () => {
    const sel = selectQuotableEntries(realBase(), ctx());

    expect(sel.quotable).toHaveLength(37);
    expect(new Set(sel.quotable.map((e) => e.domain))).toEqual(new Set(['sales']));
    expect(sel.quotable.every((e) => e.confidence === 'grounded')).toBe(true);

    expect(sel.refusalCounts).toEqual({
      confidence_unstated: 137,
      confidence_drafted_verify: 3,
      banned_copy: 23,
      ungrounded_fact: 58,
      copy_rules_absent: 0,
    });
  });

  it('refuses the whole library when the copy rules are missing', () => {
    const sel = selectQuotableEntries(realBase(), ctx({ copyRules: [] }));
    expect(sel.quotable).toEqual([]);
    expect(sel.refusalCounts.copy_rules_absent).toBe(217);
  });

  it('refuses the known self-contradicting refund pair, for different stated reasons', () => {
    const base = realBase();
    const sel = selectQuotableEntries(base, ctx());

    // `sales-8` quotes a specific non-refundable clause and labels itself "Approved
    // policy", while `compliance-8` says the terms are not final and must not be quoted
    // as such. Both carry needs_verification=false, so only this gate separates them.
    for (const id of ['sales-8', 'compliance-8']) {
      expect(sel.quotable.map((e) => e.id)).not.toContain(id);
      expect(sel.refused.has(id)).toBe(true);
    }
    expect(sel.refused.get('compliance-8')?.map((r) => r.code)).toContain(
      'confidence_unstated',
    );
    expect(sel.refused.get('sales-8')?.map((r) => r.code)).toContain('ungrounded_fact');
  });
});
