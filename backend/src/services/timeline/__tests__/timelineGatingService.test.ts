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
  weekStartGateEnabled = false,
): GateContext {
  const nc = new Set(nonCompletableIds);
  return {
    allCards: cards,
    completedCardIds: new Set(completedIds),
    sectionRulesFor: (c) => sectionRules[c.bucket] || [],
    isCompletable: (c) => !nc.has(c.id),
    weekStartGateEnabled,
  };
}

let nextOrder = 0;
const card = (o: Partial<GateCard> & Pick<GateCard, 'id'>): GateCard => ({
  type: 'quiz', bucket: 'learn', week: 1, unlock_rules: [], order: nextOrder++, ...o,
});
beforeEach(() => { nextOrder = 0; });

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

describe('weekStartUnmet — same-week self-unlock', () => {
  it('zero completions in week N: only the entry (lowest-order) card is unlocked', () => {
    const entry = card({ id: 'w1-first', week: 1, order: 0 });
    const rest = card({ id: 'w1-second', week: 1, order: 1 });
    const cards = [entry, rest];
    const ctx = ctxOf(cards, [], {}, [], true);
    expect(evaluateCardLock(entry, ctx).locked).toBe(false);
    const verdict = evaluateCardLock(rest, ctx);
    expect(verdict.locked).toBe(true);
    expect(verdict.unmet.map((u) => u.kind)).toContain('week_not_started');
  });

  it('>=1 completed card in week N unlocks the rest of that week', () => {
    const entry = card({ id: 'w1-first', week: 1, order: 0 });
    const rest = card({ id: 'w1-second', week: 1, order: 1 });
    const cards = [entry, rest];
    const ctx = ctxOf(cards, ['w1-first'], {}, [], true);
    expect(evaluateCardLock(rest, ctx).locked).toBe(false);
  });

  it('a card governed by an existing (satisfied) section rule is not additionally locked', () => {
    const entry = card({ id: 'w1-first', week: 1, order: 0 });
    const learn = card({ id: 'w1-learn', bucket: 'learn', week: 1, order: 1 });
    const gated = card({
      id: 'w1-gated', bucket: 'reflect', week: 1, order: 2,
      unlock_rules: [{ kind: 'card_complete', card_id: 'w1-learn' }],
    });
    const cards = [entry, learn, gated];
    // Zero completions in week 1 EXCEPT the explicit prerequisite the admin authored
    // — the automatic week-start gate must stand down for `gated` since it already
    // has its own explicit unlock_rules, leaving that rule as the sole gate.
    const ctx = ctxOf(cards, ['w1-learn'], {}, [], true);
    expect(evaluateCardLock(gated, ctx).locked).toBe(false);
  });

  it('week 0 is always exempt regardless of completions', () => {
    const w0a = card({ id: 'w0-a', week: 0, order: 0 });
    const w0b = card({ id: 'w0-b', week: 0, order: 1 });
    const ctx = ctxOf([w0a, w0b], [], {}, [], true);
    expect(evaluateCardLock(w0b, ctx).locked).toBe(false);
  });

  it('flag OFF: no behavior change from today (both cards unlocked)', () => {
    const entry = card({ id: 'w1-first', week: 1, order: 0 });
    const rest = card({ id: 'w1-second', week: 1, order: 1 });
    const cards = [entry, rest];
    const ctx = ctxOf(cards, [], {}, [], false);
    expect(evaluateCardLock(entry, ctx).locked).toBe(false);
    expect(evaluateCardLock(rest, ctx).locked).toBe(false);
  });
});
