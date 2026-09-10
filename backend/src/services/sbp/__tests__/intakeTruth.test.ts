import { ANGLE_TO_DIMENSION, itemsFromIntake, normaliseAngle } from '../intakeTruth';
import {
  FACT_BEARING_PROVENANCES,
  NEVER_FACT_DIMENSIONS,
  UNDERSTANDING_DIMENSIONS,
  findIntegrityViolations,
  validateItem,
} from '../../delivery/projectUnderstanding';

/**
 * A student's intake, as project truth.
 *
 * The tests that matter here are the REFUSALS. Anything can write items; the
 * question is whether this module can be made to write one it cannot back with
 * something a student actually typed.
 */

const IDEA = 'A tool that reads incoming invoices from our shared mailbox and checks them '
  + 'against the purchase orders in our spreadsheet.';

const answer = (angle: string, text: string) => ({
  id: angle.toLowerCase().replace(/\s+/g, '_'),
  question: `A question about ${angle}`,
  answer: text,
  angle,
});

describe('the intake becomes truth items', () => {
  it('files each answer under the dimension its angle names', () => {
    const { items } = itemsFromIntake({
      idea: IDEA,
      answers: [
        answer('THE GUARDRAIL', 'Priya signs off anything over 5k before it is paid.'),
        answer('THE TOOLS', 'Gmail, and the purchase order spreadsheet on the shared drive.'),
      ],
    });

    expect(items.map((i) => i.dimension)).toEqual(['problem', 'approval_points', 'systems']);
    expect(items[1].value).toContain('Priya signs off');
  });

  it('records the description itself as the problem, in the student\'s own words', () => {
    const { items } = itemsFromIntake({ idea: IDEA });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ dimension: 'problem', classification: 'FACT' });
    expect(items[0].source_quote).toBe(IDEA);
  });

  it('every item it writes is FACT on a fact-bearing provenance', () => {
    const { items } = itemsFromIntake({
      idea: IDEA,
      answers: [answer('THE OPERATOR', 'Two people in accounts payable.')],
      covered: [{ angle: 'THE JOB', evidence: 'checks invoices against purchase orders' }],
    });

    for (const item of items) {
      expect(item.classification).toBe('FACT');
      expect(FACT_BEARING_PROVENANCES).toContain(item.provenance);
      // A fact with no quote is the thing the whole contract exists to refuse.
      expect(item.source_quote && item.source_quote.length).toBeGreaterThan(0);
    }
  });

  it('never emits ai_inferred, on any path', () => {
    const { items } = itemsFromIntake({
      idea: IDEA,
      answers: [answer('THE MEASURE', 'About four hours a week.')],
      covered: [{ angle: 'THE TOOLS', evidence: 'shared mailbox' }],
    });
    expect(items.map((i) => i.provenance)).not.toContain('ai_inferred');
  });

  it('produces items the shared contract accepts, not merely items shaped like them', () => {
    // Validating against the real validator rather than re-describing its rules
    // here, so a change to the contract fails this test rather than passing it.
    const { items } = itemsFromIntake({
      idea: IDEA,
      answers: [answer('TRIGGER AND RHYTHM', 'Invoices arrive all day, about forty a week.')],
    });
    for (const item of items) {
      expect(validateItem(item)).toEqual({ ok: true, item });
    }
    expect(findIntegrityViolations({ title: 'Invoice checker', proposed_surfaces: [], items }))
      .toEqual([]);
  });
});

describe('what it refuses to write', () => {
  it('reports an unrecognised angle instead of filing it somewhere plausible', () => {
    const stray = answer('THE VIBES', 'Something the model invented an angle for.');
    const { items, unmapped } = itemsFromIntake({ idea: IDEA, answers: [stray] });

    expect(unmapped).toEqual([stray]);
    // Only the description. The stray answer is not filed anywhere.
    expect(items).toHaveLength(1);
  });

  it('treats a question with no angle as unmapped rather than guessing from its wording', () => {
    const older = { id: 'primary_users', question: 'Who uses this?', answer: 'Accounts payable.' };
    const { unmapped } = itemsFromIntake({ idea: IDEA, answers: [older] });
    expect(unmapped).toEqual([older]);
  });

  it('writes nothing for a skipped question', () => {
    const { items, unmapped } = itemsFromIntake({
      idea: IDEA,
      answers: [answer('THE MEASURE', '   ')],
    });
    expect(items).toHaveLength(1);
    expect(unmapped).toEqual([]);
  });

  it('drops a covered angle that quotes nothing', () => {
    const { items } = itemsFromIntake({
      idea: IDEA,
      covered: [{ angle: 'THE TOOLS', evidence: '  ' }],
    });
    expect(items).toHaveLength(1);
  });

  it('writes no item at all for an empty intake', () => {
    expect(itemsFromIntake({ idea: '   ' })).toEqual({ items: [], unmapped: [] });
  });

  it('cannot be steered into a dimension that may never hold a fact', () => {
    // The mapping does not point at one today. This asserts the guard rather
    // than the current table, so adding a bad mapping later fails here.
    for (const dimension of Object.values(ANGLE_TO_DIMENSION)) {
      expect(NEVER_FACT_DIMENSIONS).not.toContain(dimension);
    }
  });
});

describe('the mapping itself', () => {
  it('points every angle at a dimension the contract declares', () => {
    for (const [angle, dimension] of Object.entries(ANGLE_TO_DIMENSION)) {
      expect({ angle, known: UNDERSTANDING_DIMENSIONS.includes(dimension) })
        .toEqual({ angle, known: true });
    }
  });

  it('covers all ten angles, so no angle silently has nowhere to go', () => {
    expect(Object.keys(ANGLE_TO_DIMENSION)).toHaveLength(10);
  });

  it('survives the punctuation and casing a model actually returns', () => {
    expect(normaliseAngle('the tools')).toBe('THE TOOLS');
    expect(normaliseAngle('2. THE TOOLS —')).toBe('THE TOOLS');
    expect(normaliseAngle(undefined)).toBe('');
  });
});
