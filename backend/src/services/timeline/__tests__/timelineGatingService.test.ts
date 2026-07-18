import {
  normalizeRules,
  evaluateCardLock,
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
