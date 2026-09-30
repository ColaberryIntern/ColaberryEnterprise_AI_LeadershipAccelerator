import { packItems, toBuildIntake, ANSWER_MAX } from '../buildIntakeAdapter';
import type { ProjectUnderstanding, UnderstandingItem } from '../projectUnderstanding';

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

/**
 * THE PACKING HAS TO BE IN THE LIVE PATH, not merely available to it.
 *
 * `packItems` shipped correct, tested, and with NO CALLER: `toBuildIntake` still
 * joined a dimension's items and clipped at ANSWER_MAX, so every test above
 * passed while Swati's detailed requirements went on being truncated in
 * production. A producer with no consumer is not a fix.
 *
 * These go through `toBuildIntake` — the function the build actually calls — so
 * the only way to satisfy them is for the live path to pack.
 */
const detailed = (n: number, size = 300): UnderstandingItem => ({
  dimension: 'constraints',
  value: `CONSTRAINT-${n}: ${'x'.repeat(size)}`,
  classification: 'FACT',
  provenance: 'source_message',
} as UnderstandingItem);

const withDetailedDimension = (count: number): ProjectUnderstanding => ({
  title: 'A build the customer specified at length',
  proposed_surfaces: [],
  items: [
    {
      dimension: 'problem',
      value: 'Everything about the current process is manual and nothing is written down.',
      classification: 'FACT',
      provenance: 'source_message',
    } as UnderstandingItem,
    ...Array.from({ length: count }, (_, i) => detailed(i + 1)),
  ],
});

describe('toBuildIntake — the detail reaches the decomposer', () => {
  it('carries EVERY item of an over-long dimension into the intake', () => {
    // 40 x ~300 chars = ~12k against a 4k per-answer ceiling. Before the packing
    // was wired in, answers 14 onward simply did not exist.
    const u = withDetailedDimension(40);
    const intake = toBuildIntake(u);

    const everything = intake.answers.map((a) => a.answer).join('\n');
    for (let n = 1; n <= 40; n += 1) {
      expect(everything).toContain(`CONSTRAINT-${n}:`);
    }
  });

  it('splits that dimension across numbered answers instead of truncating it', () => {
    const intake = toBuildIntake(withDetailedDimension(40));
    const ids = intake.answers.map((a) => a.id);

    expect(ids).toContain('constraints');
    expect(ids).toContain('constraints_2');
    expect(ids.filter((id) => id.startsWith('constraints')).length).toBeGreaterThan(1);
  });

  it('labels a continuation as the same question, not a new topic', () => {
    // A second chunk under a bare label reads to the decomposer as a different
    // question that happens to repeat, which is how duplicate requirements are
    // born.
    const intake = toBuildIntake(withDetailedDimension(40));
    const second = intake.answers.find((a) => a.id === 'constraints_2')!;

    expect(second.question).toContain('continued');
    expect(second.question).toContain(intake.answers.find((a) => a.id === 'constraints')!.question.replace('?', ''));
  });

  it('keeps every answer within the ceiling the wizard accepts', () => {
    for (const a of toBuildIntake(withDetailedDimension(40)).answers) {
      expect(a.answer.length).toBeLessThanOrEqual(ANSWER_MAX);
    }
  });

  it('reports NOTHING dropped, and never the old "(N items)" note', () => {
    // "(N items) clipped" was the old report: it proved something was lost and
    // named none of it. Its absence here is the whole point.
    const intake = toBuildIntake(withDetailedDimension(40));

    expect(intake.dropped).toEqual([]);
    expect(JSON.stringify(intake.dropped)).not.toContain('items');
  });

  it('leaves a dimension that fits as one answer, with no suffix', () => {
    // Packing must not cost the common case its readable single answer.
    const intake = toBuildIntake(withDetailedDimension(2));
    const ids = intake.answers.map((a) => a.id);

    expect(ids).toContain('constraints');
    expect(ids).not.toContain('constraints_2');
  });
});
