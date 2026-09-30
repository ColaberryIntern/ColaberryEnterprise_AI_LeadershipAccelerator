/**
 * Confirmation is the ONE place an assumption may become a fact, and the one place a
 * customer could be made to appear to have agreed to things they never saw.
 *
 * Both halves matter. Promotion must work — otherwise the customer's own confirmation
 * counts for nothing — and it must never reach past the items that were on screen.
 */

import { applyConfirmation, confirmationProfile } from '../understandingConfirmation';
import { parseUnderstanding, type ProjectUnderstanding } from '../projectUnderstanding';

const base = (): ProjectUnderstanding =>
  parseUnderstanding({
    title: 'Dispatcher Workflow Automation',
    proposed_surfaces: [],
    items: [
      {
        dimension: 'actors',
        value: 'Ralph is the project manager',
        classification: 'FACT',
        provenance: 'voice_transcript',
        source_quote: 'Ralph usually is the keeper of the spreadsheet',
      },
      {
        dimension: 'human_only_decisions',
        value: 'A VP or owner decides on changes',
        classification: 'ASSUMPTION',
        provenance: 'ai_inferred',
      },
      {
        dimension: 'integrations',
        value: 'Which accounting system holds the invoices?',
        classification: 'QUESTION',
        provenance: 'ai_inferred',
      },
      {
        dimension: 'approval_points',
        value: 'Who signs off above a threshold',
        classification: 'DECISION',
        provenance: 'ai_inferred',
      },
    ],
  });

describe('“That’s right” — the one legitimate promotion', () => {
  it('turns an inference the customer confirmed into a fact', () => {
    const { understanding, confirmed } = applyConfirmation(base(), { type: 'confirm', item_indexes: [1] });

    expect(confirmed).toBe(1);
    expect(understanding.items[1]).toMatchObject({
      classification: 'FACT',
      provenance: 'client_confirmed',
    });
  });

  it('drops the transcript quote once a person is the evidence', () => {
    const { understanding } = applyConfirmation(base(), { type: 'confirm', item_indexes: [0] });
    expect(understanding.items[0].source_quote).toBeUndefined();
    expect(understanding.items[0].provenance).toBe('client_confirmed');
  });

  it('produces something the contract still accepts', () => {
    // client_confirmed + FACT + no quote must remain valid, or the promotion is unusable.
    expect(() => applyConfirmation(base(), { type: 'confirm', item_indexes: [0, 1] })).not.toThrow();
  });
});

describe('a customer cannot confirm what they were not shown', () => {
  it('reports an index that does not exist instead of ignoring it', () => {
    const { confirmed, invalid_indexes } = applyConfirmation(base(), { type: 'confirm', item_indexes: [1, 99] });

    expect(confirmed).toBe(1);
    expect(invalid_indexes).toEqual([99]);
  });

  it('confirms only the named items, never the whole document', () => {
    const { understanding } = applyConfirmation(base(), { type: 'confirm', item_indexes: [1] });

    expect(understanding.items[0].provenance).toBe('voice_transcript');
    expect(understanding.items[3].provenance).toBe('ai_inferred');
  });

  it('does not mutate the understanding it was given', () => {
    const before = base();
    const snapshot = JSON.stringify(before);
    applyConfirmation(before, { type: 'confirm', item_indexes: [0, 1] });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('what cannot be confirmed by nodding at a screen', () => {
  it('leaves a QUESTION alone — there is nothing to agree with', () => {
    const { understanding, confirmed } = applyConfirmation(base(), { type: 'confirm', item_indexes: [2] });

    expect(confirmed).toBe(0);
    expect(understanding.items[2].classification).toBe('QUESTION');
  });

  it('leaves a DECISION alone — §3 says it belongs to the customer, not to a click', () => {
    const { understanding, confirmed } = applyConfirmation(base(), { type: 'confirm', item_indexes: [3] });

    expect(confirmed).toBe(0);
    expect(understanding.items[3].classification).toBe('DECISION');
  });
});

describe('“Change something”', () => {
  it('treats a correction as theirs, because they just said it', () => {
    const { understanding, amended } = applyConfirmation(base(), {
      type: 'amend',
      item_index: 1,
      value: 'Our COO decides on changes',
    });

    expect(amended).toBe(1);
    expect(understanding.items[1]).toMatchObject({
      value: 'Our COO decides on changes',
      classification: 'FACT',
      provenance: 'client_confirmed',
    });
  });

  it('ignores an empty correction rather than blanking the statement', () => {
    const { understanding, amended } = applyConfirmation(base(), { type: 'amend', item_index: 1, value: '   ' });

    expect(amended).toBe(0);
    expect(understanding.items[1].value).toBe('A VP or owner decides on changes');
  });

  it('removes a statement that was simply wrong, and hands it back', () => {
    const { understanding, removed } = applyConfirmation(base(), { type: 'remove', item_indexes: [1] });

    expect(understanding.items).toHaveLength(3);
    expect(removed[0].value).toBe('A VP or owner decides on changes');
  });

  it('removes several without the indexes shifting under it', () => {
    const { understanding, removed } = applyConfirmation(base(), { type: 'remove', item_indexes: [0, 2] });

    expect(removed.map((r) => r.value)).toEqual([
      'Ralph is the project manager',
      'Which accounting system holds the invoices?',
    ]);
    expect(understanding.items.map((i) => i.value)).toEqual([
      'A VP or owner decides on changes',
      'Who signs off above a threshold',
    ]);
  });
});

describe('“Add something”', () => {
  it('records what they added as a confirmed fact', () => {
    const { understanding, added } = applyConfirmation(base(), {
      type: 'add',
      dimension: 'constraints',
      value: 'It has to work inside our existing Azure tenant',
    });

    expect(added).toBe(1);
    expect(understanding.items[4]).toMatchObject({
      dimension: 'constraints',
      classification: 'FACT',
      provenance: 'client_confirmed',
    });
  });

  it('ignores an empty addition', () => {
    const { understanding, added } = applyConfirmation(base(), { type: 'add', dimension: 'constraints', value: '  ' });
    expect(added).toBe(0);
    expect(understanding.items).toHaveLength(4);
  });
});

describe('confirmationProfile', () => {
  it('reports nothing confirmed before the customer has seen it', () => {
    expect(confirmationProfile(base())).toMatchObject({
      total: 4,
      client_confirmed: 0,
      confirmed_ratio: 0,
      awaiting_confirmation: 2,
    });
  });

  it('counts what the customer has personally stood behind', () => {
    const { understanding } = applyConfirmation(base(), { type: 'confirm', item_indexes: [0, 1] });
    const profile = confirmationProfile(understanding);

    expect(profile.client_confirmed).toBe(2);
    expect(profile.awaiting_confirmation).toBe(0);
  });

  it('does not count questions and decisions as awaiting confirmation', () => {
    // Only the two statements are confirmable; the QUESTION and DECISION are not.
    expect(confirmationProfile(base()).awaiting_confirmation).toBe(2);
  });

  it('does not divide by zero on an empty understanding', () => {
    const empty = parseUnderstanding({ title: 'T', proposed_surfaces: [], items: [] });
    expect(confirmationProfile(empty).confirmed_ratio).toBe(0);
  });
});
