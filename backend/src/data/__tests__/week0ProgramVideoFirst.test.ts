/**
 * C112: the Week 0 program video goes first and the Quick check is rewritten from it. The plan is pure, so the
 * production cards (as read on 2026-11-05) are the fixtures.
 */
import {
  PROGRAM_VIDEO_ID, QUICK_CHECK_ID, SELF_STUDY_ID, QUICK_CHECK_QUESTIONS, QUICK_CHECK_TITLE, PRIOR_KEY,
  planProgramVideoFirst, planRollback, type CardState, type CardUpdate,
} from '../week0ProgramVideoFirst';

const OLD_QUESTIONS = [{ question: 'What is generative AI primarily used for?', options: ['a', 'b', 'c', 'd'], correct_index: 0 }];

function prodCards(): [CardState, CardState, CardState] {
  return [
    { id: PROGRAM_VIDEO_ID, title: 'Video: AI Systems Architect Accelerator | Start Your Learning Journey', bucket: 'learn', order: 0, metadata: { video: { url: 'https://www.youtube.com/watch?v=cCFr2qc5ME8' } } },
    { id: QUICK_CHECK_ID, title: 'Quick check: AI foundations', bucket: 'pre_class', order: 1, metadata: { assessment: { questions: OLD_QUESTIONS, generated_at: '2026-07-18' }, content: { title: 'Knowledge Check' } } },
    { id: SELF_STUDY_ID, title: 'Self Study', bucket: 'pre_class', order: 2, metadata: { locked: true } },
  ];
}

/** Apply a plan to in-memory cards the way the script applies it to rows. */
function applyPlan(cards: CardState[], plan: CardUpdate[]): CardState[] {
  return cards.map((c) => {
    const u = plan.find((p) => p.id === c.id);
    return u ? { ...c, ...u.set, metadata: (u.set.metadata ?? c.metadata) as Record<string, unknown> } : c;
  });
}

describe('planProgramVideoFirst', () => {
  it('puts the video right after the welcome, the rewritten check second and Self Study third', () => {
    const [v, q, s] = prodCards();
    const after = applyPlan([v, q, s], planProgramVideoFirst(v, q, s));
    const byId = (id: string) => after.find((c) => c.id === id)!;
    expect(byId(PROGRAM_VIDEO_ID)).toMatchObject({ bucket: 'pre_class', order: 1 });
    expect(byId(QUICK_CHECK_ID)).toMatchObject({ bucket: 'pre_class', order: 2, title: QUICK_CHECK_TITLE });
    expect((byId(QUICK_CHECK_ID).metadata.assessment as { questions: unknown }).questions).toEqual(QUICK_CHECK_QUESTIONS);
    expect(byId(QUICK_CHECK_ID).metadata.locked).toBe(true);
    expect(byId(SELF_STUDY_ID)).toMatchObject({ order: 3 });
  });

  it('is idempotent: a second run plans nothing', () => {
    const [v, q, s] = prodCards();
    const after = applyPlan([v, q, s], planProgramVideoFirst(v, q, s));
    expect(planProgramVideoFirst(after[0], after[1], after[2])).toEqual([]);
  });

  it('is idempotent after a database round trip that reorders object keys (production, 5 Nov)', () => {
    // Postgres jsonb returns keys sorted by length, then bytes ("options", "question", ...), not in the order written.
    // Comparing as JSON text then never matched, so every re-run planned the Quick check again.
    const jsonbOrder = (x: unknown): unknown => Array.isArray(x) ? x.map(jsonbOrder)
      : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map((k) => [k, jsonbOrder((x as Record<string, unknown>)[k])]))
      : x;
    const [v, q, s] = prodCards();
    const stored = applyPlan([v, q, s], planProgramVideoFirst(v, q, s)).map((c) => ({ ...c, metadata: jsonbOrder(c.metadata) as Record<string, unknown> }));
    expect(Object.keys(((stored[1].metadata.assessment as { questions: object[] }).questions[0]))[0]).toBe('options'); // the reorder is real
    expect(planProgramVideoFirst(stored[0], stored[1], stored[2])).toEqual([]);
  });

  it('refuses to touch the wrong cards', () => {
    const [v, q, s] = prodCards();
    expect(() => planProgramVideoFirst({ ...v, title: 'Some other video' }, q, s)).toThrow(/not the program video/);
    expect(() => planProgramVideoFirst(v, { ...q, metadata: {} }, s)).toThrow(/no assessment/);
    expect(() => planProgramVideoFirst(v, q, undefined)).toThrow(/missing/);
  });

  it('round-trips: rollback restores every original value, and a second rollback does nothing', () => {
    const before = prodCards();
    const after = applyPlan(before, planProgramVideoFirst(...before));
    const restored = applyPlan(after, planRollback(after));
    expect(restored).toEqual(before);
    expect(planRollback(restored)).toEqual([]);
  });

  it('keeps the first saved values when a partly applied state is re-run', () => {
    const [v, q, s] = prodCards();
    const after = applyPlan([v, q, s], planProgramVideoFirst(v, q, s));
    const drifted = { ...after[1], order: 9 };
    const again = planProgramVideoFirst(after[0], drifted, after[2]);
    expect((again[0].set.metadata as Record<string, Record<string, unknown>>)[PRIOR_KEY].order).toBe(1);
  });
});

describe('the rewritten Quick check', () => {
  it('has five well-formed questions, each with one valid answer', () => {
    expect(QUICK_CHECK_QUESTIONS).toHaveLength(5);
    for (const q of QUICK_CHECK_QUESTIONS) {
      expect(q.options).toHaveLength(4);
      expect(q.correct_index).toBeGreaterThanOrEqual(0);
      expect(q.correct_index).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(4);
    }
  });

  it('does not use the word "free" or an unapproved credential name', () => {
    const text = JSON.stringify(QUICK_CHECK_QUESTIONS);
    expect(text).not.toMatch(/\bfree\b/i);
    expect(text).not.toMatch(/certif/i);
  });
});
