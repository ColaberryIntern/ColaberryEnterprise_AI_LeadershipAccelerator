import { packItems, ANSWER_MAX } from '../buildIntakeAdapter';

/**
 * Detailed requirements have to survive the crossing.
 *
 *     "I heard from Swati today that she gave the process very detailed
 *      requirements and it missed some of them... I think we should build out
 *      all of the requirements - no matter how big. We can always decide which
 *      release they will demo. I would rather have all the requirements there."
 *      (Ali, 2026-09-29)
 *
 * One of the two places hers were lost is here. Every item in a dimension was
 * joined into one string and clipped at ANSWER_MAX, so a customer who answered
 * at length lost the tail — and the loss was recorded as "(N items) clipped",
 * which says THAT something went and never WHICH. These pin the replacement:
 * pack across as many answers as it takes, and never cut an item that could
 * have fitted somewhere.
 */

const item = (n: number, size = 300) => `REQ-${n}: ${'x'.repeat(size)}`;

describe('packing a dimension the customer detailed at length', () => {
  it('keeps every item when the total is far over the per-answer ceiling', () => {
    // 40 items x ~300 chars = ~12k, three times ANSWER_MAX. The old code kept
    // the first 4,000 characters and silently discarded the rest.
    const phrases = Array.from({ length: 40 }, (_, i) => item(i + 1));
    const { chunks, clipped } = packItems(phrases);

    expect(clipped).toEqual([]);
    const joined = chunks.join('\n');
    for (const p of phrases) expect(joined).toContain(p);
  });

  it('splits into more than one answer rather than truncating', () => {
    const phrases = Array.from({ length: 40 }, (_, i) => item(i + 1));
    const { chunks } = packItems(phrases);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('keeps every chunk under the ceiling', () => {
    const phrases = Array.from({ length: 40 }, (_, i) => item(i + 1));
    for (const c of packItems(phrases).chunks) {
      expect(c.length).toBeLessThanOrEqual(ANSWER_MAX);
    }
  });

  it('never splits an item across two answers', () => {
    // A requirement cut in half is worse than one left out: half a sentence
    // reads as a complete, wrong requirement.
    const phrases = Array.from({ length: 30 }, (_, i) => item(i + 1));
    for (const c of packItems(phrases).chunks) {
      for (const line of c.split('\n')) {
        expect(phrases).toContain(line);
      }
    }
  });

  it('leaves a short dimension as a single answer', () => {
    const phrases = [item(1), item(2)];
    expect(packItems(phrases).chunks).toHaveLength(1);
  });

  it('handles an empty dimension without inventing an answer', () => {
    expect(packItems([])).toEqual({ chunks: [], clipped: [] });
  });
});

describe('the one loss that cannot be avoided is named', () => {
  it('reports a single item longer than the ceiling, with its text', () => {
    // Nowhere to put it, so it is clipped — but the report carries the item
    // itself, not a count, so the loss can be read and acted on.
    const huge = `REQ-1: ${'y'.repeat(ANSWER_MAX + 500)}`;
    const { chunks, clipped } = packItems([huge, item(2)]);

    expect(clipped).toEqual([huge]);
    expect(chunks.join('\n')).toContain(item(2));
    expect(chunks.every((c) => c.length <= ANSWER_MAX)).toBe(true);
  });

  it('does not report a loss when everything fitted', () => {
    // The honesty runs both ways: a clean crossing must not produce a warning
    // that sends someone looking for a requirement that is present.
    expect(packItems(Array.from({ length: 40 }, (_, i) => item(i + 1))).clipped).toEqual([]);
  });
});
