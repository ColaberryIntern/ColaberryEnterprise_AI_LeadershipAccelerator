import {
  normalizeRules,
  evaluateCardLock,
  namedItemList,
  GateCard,
  GateContext,
  UnlockPredicate,
} from '../timelineGatingService';

// A test context builder: cards + the set of completed card ids + section rules.
function ctxOf(
  cards: GateCard[],
  completedIds: string[],
  sectionRules: Record<string, UnlockPredicate[]> = {},
  nonCompletableIds: string[] = [],
): GateContext {
  const nc = new Set(nonCompletableIds);
  return {
    allCards: cards,
    completedCardIds: new Set(completedIds),
    sectionRulesFor: (c) => sectionRules[c.bucket] || [],
    isCompletable: (c) => !nc.has(c.id),
  };
}

const card = (o: Partial<GateCard> & Pick<GateCard, 'id'>): GateCard => ({
  type: 'quiz', bucket: 'learn', week: 1, unlock_rules: [], ...o,
});

describe('normalizeRules', () => {
  it('keeps valid predicates and drops junk', () => {
    const out = normalizeRules([
      { kind: 'card_complete', card_id: 'c1' },
      { kind: 'section_complete', bucket: 'learn' },
      { kind: 'type_complete', type: 'knowledge_check', scope: 'all' },
      { kind: 'card_complete' },              // missing card_id → dropped
      { kind: 'section_complete', bucket: 'nope' }, // invalid bucket → dropped
      'garbage', null, 42,                    // non-objects → dropped
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ kind: 'card_complete', card_id: 'c1' });
    expect(out[2]).toMatchObject({ kind: 'type_complete', type: 'knowledge_check', scope: 'all' });
  });

  it('returns [] for non-array input', () => {
    expect(normalizeRules(null)).toEqual([]);
    expect(normalizeRules({})).toEqual([]);
    expect(normalizeRules(undefined)).toEqual([]);
  });
});

describe('evaluateCardLock', () => {
  it('is unlocked when there are no rules', () => {
    const c = card({ id: 'a' });
    expect(evaluateCardLock(c, ctxOf([c], []))).toEqual({ locked: false, unmet: [] });
  });

  it('card_complete: locked until the referenced card is completed', () => {
    const test = card({ id: 'test' });
    const survey = card({ id: 'survey', bucket: 'reflect', unlock_rules: [{ kind: 'card_complete', card_id: 'test' }] });
    const cards = [test, survey];
    expect(evaluateCardLock(survey, ctxOf(cards, [])).locked).toBe(true);          // test not done
    expect(evaluateCardLock(survey, ctxOf(cards, ['test'])).locked).toBe(false);   // test done → unlocked
  });

  it('section_complete: locked until every completable card in the section is done (same week)', () => {
    const l1 = card({ id: 'l1', bucket: 'learn', week: 1 });
    const l2 = card({ id: 'l2', bucket: 'learn', week: 1 });
    const lOtherWeek = card({ id: 'l9', bucket: 'learn', week: 2 });
    const test = card({ id: 'test', bucket: 'reflect', week: 1, unlock_rules: [{ kind: 'section_complete', bucket: 'learn' }] });
    const cards = [l1, l2, lOtherWeek, test];
    expect(evaluateCardLock(test, ctxOf(cards, ['l1'])).locked).toBe(true);         // l2 (same week) not done
    expect(evaluateCardLock(test, ctxOf(cards, ['l1', 'l2'])).locked).toBe(false);  // both week-1 Learn done (week-2 ignored)
  });

  it('section_complete ignores non-completable cards (announcements/events)', () => {
    const ann = card({ id: 'ann', type: 'announcement', bucket: 'learn', week: 1 });
    const lesson = card({ id: 'lesson', bucket: 'learn', week: 1 });
    const test = card({ id: 'test', bucket: 'reflect', week: 1, unlock_rules: [{ kind: 'section_complete', bucket: 'learn' }] });
    const cards = [ann, lesson, test];
    // Only `lesson` counts; the announcement can never complete, so completing
    // the lesson alone unlocks the test.
    const ctx = ctxOf(cards, ['lesson'], {}, ['ann']);
    expect(evaluateCardLock(test, ctx).locked).toBe(false);
  });

  it('AND semantics: all predicates must pass; unmet carries a reason', () => {
    const a = card({ id: 'a' });
    const b = card({ id: 'b' });
    const gated = card({ id: 'g', unlock_rules: [
      { kind: 'card_complete', card_id: 'a', label: 'Do A' },
      { kind: 'card_complete', card_id: 'b', label: 'Do B' },
    ] });
    const cards = [a, b, gated];
    const half = evaluateCardLock(gated, ctxOf(cards, ['a']));
    expect(half.locked).toBe(true);
    expect(half.unmet.map((u) => u.label)).toEqual(['Do B']);
    expect(evaluateCardLock(gated, ctxOf(cards, ['a', 'b'])).locked).toBe(false);
  });

  it('merges section rules with per-card rules', () => {
    const learn = card({ id: 'l1', bucket: 'learn', week: 1 });
    const test = card({ id: 'test', bucket: 'reflect', week: 1 });
    const survey = card({ id: 'survey', bucket: 'reflect', week: 1, unlock_rules: [{ kind: 'card_complete', card_id: 'test' }] });
    const cards = [learn, test, survey];
    // Section rule: all Reflect locked until Learn done. Survey ALSO needs the test.
    const sectionRules = { reflect: [{ kind: 'section_complete', bucket: 'learn' } as UnlockPredicate] };
    expect(evaluateCardLock(survey, ctxOf(cards, [])).locked).toBe(true);                 // learn not done
    expect(evaluateCardLock(survey, ctxOf(cards, ['l1'], sectionRules)).locked).toBe(true); // learn done but test not
    expect(evaluateCardLock(survey, ctxOf(cards, ['l1', 'test'], sectionRules)).locked).toBe(false);
  });

  it('ignores a self-referential card_complete rule (no deadlock)', () => {
    const c = card({ id: 'self', unlock_rules: [{ kind: 'card_complete', card_id: 'self' }] });
    expect(evaluateCardLock(c, ctxOf([c], [])).locked).toBe(false);
  });

  it('section_complete on an empty section is vacuously unlocked', () => {
    const test = card({ id: 'test', bucket: 'reflect', week: 1, unlock_rules: [{ kind: 'section_complete', bucket: 'practice' }] });
    expect(evaluateCardLock(test, ctxOf([test], [])).locked).toBe(false);
  });
});

// ── the lock REASON must name the outstanding item(s), not just the section ──
// Regression: a locked Evaluation read "Complete the Learn section to unlock"
// with 6 of 7 Learn cards done and no way to see WHICH one was missing.

describe('namedItemList', () => {
  it('names one item', () => {
    expect(namedItemList(['Context Engineering'])).toBe('“Context Engineering”');
  });

  it('joins two items with "and"', () => {
    expect(namedItemList(['A', 'B'])).toBe('“A” and “B”');
  });

  it('joins three items with commas and a final "and"', () => {
    expect(namedItemList(['A', 'B', 'C'])).toBe('“A”, “B” and “C”');
  });

  it('collapses beyond three into "and N more" so the card never becomes a wall of text', () => {
    expect(namedItemList(['A', 'B', 'C', 'D', 'E'])).toBe('“A”, “B”, “C” and 2 more');
  });

  it('truncates a long title instead of spilling it into the tile', () => {
    const long = 'Prompt Engineering Foundations For Enterprise Architects And Their Teams';
    const out = namedItemList([long]);
    // 48-char budget: 47 characters of title + the ellipsis, inside the quotes.
    expect(out).toBe('“Prompt Engineering Foundations For Enterprise A…”');
    expect(out.replace(/[“”]/g, '')).toHaveLength(48);
  });

  it('leaves a title that exactly fits the budget unelided', () => {
    const exact = 'x'.repeat(48);
    expect(namedItemList([exact])).toBe(`“${exact}”`);
  });

  it('collapses runs of whitespace inside a title', () => {
    expect(namedItemList(['  Deep   Dive  '])).toBe('“Deep Dive”');
  });
});

describe('lock reason names the outstanding work', () => {
  const learnGate: UnlockPredicate[] = [
    { kind: 'section_complete', bucket: 'learn', scope: 'week', label: 'the Learn section' },
  ];

  it('names the single outstanding Learn card (Farhat: 6 of 7 done)', () => {
    const done = [1, 2, 3, 4, 5, 6].map((n) => card({ id: `l${n}`, title: `Learn ${n}`, bucket: 'learn', week: 1 }));
    const missing = card({ id: 'l7', title: 'Context Engineering 101', bucket: 'learn', week: 1 });
    const evaluation = card({ id: 'eval', type: 'evaluation', bucket: 'reflect', week: 1, unlock_rules: learnGate });
    const verdict = evaluateCardLock(evaluation, ctxOf([...done, missing, evaluation], done.map((c) => c.id)));
    expect(verdict.locked).toBe(true);
    expect(verdict.unmet).toHaveLength(1);
    expect(verdict.unmet[0].label).toBe('“Context Engineering 101” in the Learn section');
  });

  it('names several outstanding cards', () => {
    const a = card({ id: 'a', title: 'Alpha', bucket: 'learn', week: 1 });
    const b = card({ id: 'b', title: 'Bravo', bucket: 'learn', week: 1 });
    const c = card({ id: 'c', title: 'Charlie', bucket: 'learn', week: 1 });
    const evaluation = card({ id: 'eval', type: 'evaluation', bucket: 'reflect', week: 1, unlock_rules: learnGate });
    const verdict = evaluateCardLock(evaluation, ctxOf([a, b, c, evaluation], ['a']));
    expect(verdict.unmet[0].label).toBe('“Bravo” and “Charlie” in the Learn section');
  });

  it('never names a card the student has already completed', () => {
    const a = card({ id: 'a', title: 'Alpha', bucket: 'learn', week: 1 });
    const b = card({ id: 'b', title: 'Bravo', bucket: 'learn', week: 1 });
    const evaluation = card({ id: 'eval', type: 'evaluation', bucket: 'reflect', week: 1, unlock_rules: learnGate });
    const label = evaluateCardLock(evaluation, ctxOf([a, b, evaluation], ['b'])).unmet[0].label;
    expect(label).toBe('“Alpha” in the Learn section');
    expect(label).not.toMatch(/Bravo/);
  });

  it('excludes non-completable cards (an announcement is never "outstanding")', () => {
    const ann = card({ id: 'ann', title: 'Week 1 Notice', type: 'announcement', bucket: 'learn', week: 1 });
    const lesson = card({ id: 'lesson', title: 'Alpha', bucket: 'learn', week: 1 });
    const evaluation = card({ id: 'eval', type: 'evaluation', bucket: 'reflect', week: 1, unlock_rules: learnGate });
    const label = evaluateCardLock(evaluation, ctxOf([ann, lesson, evaluation], [], {}, ['ann'])).unmet[0].label;
    expect(label).toBe('“Alpha” in the Learn section');
  });

  it('names the outstanding card for a type_complete gate, with no section suffix', () => {
    const ev = card({ id: 'ev', title: 'Week 2 Evaluation', type: 'evaluation', bucket: 'reflect', week: 2 });
    const survey = card({
      id: 'sv', type: 'survey', bucket: 'reflect', week: 2,
      unlock_rules: [{ kind: 'type_complete', type: 'evaluation', scope: 'week', label: 'the evaluation' }],
    });
    const verdict = evaluateCardLock(survey, ctxOf([ev, survey], []));
    expect(verdict.unmet[0].label).toBe('“Week 2 Evaluation”');
  });

  it('falls back to the authored section label when a title is missing (never names a partial set)', () => {
    const titled = card({ id: 'a', title: 'Alpha', bucket: 'learn', week: 1 });
    const untitled = card({ id: 'b', title: '   ', bucket: 'learn', week: 1 });
    const evaluation = card({ id: 'eval', type: 'evaluation', bucket: 'reflect', week: 1, unlock_rules: learnGate });
    const label = evaluateCardLock(evaluation, ctxOf([titled, untitled, evaluation], [])).unmet[0].label;
    expect(label).toBe('the Learn section');
  });

  it('names the referenced card for a card_complete gate that carries no authored label', () => {
    const dep = card({ id: 'dep', title: 'Setup Lab', bucket: 'build', week: 1 });
    const gated = card({ id: 'g', bucket: 'reflect', week: 1, unlock_rules: [{ kind: 'card_complete', card_id: 'dep' }] });
    const verdict = evaluateCardLock(gated, ctxOf([dep, gated], []));
    expect(verdict.unmet[0].label).toBe('“Setup Lab”');
  });
});
