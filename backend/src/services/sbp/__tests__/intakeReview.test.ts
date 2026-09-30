import {
  applyCorrection,
  buildIntakeReview,
  confirmedIsFactBearing,
  fullyReviewed,
  groupOf,
} from '../intakeReview';
import { findIntegrityViolations, validateItem } from '../../delivery/projectUnderstanding';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

/**
 * The confirmation gate: what the student is shown, and what happens when they
 * fix something.
 */

const item = (over: Partial<UnderstandingItem> = {}): UnderstandingItem => ({
  dimension: 'approval_points',
  value: 'Priya signs off anything over 5k.',
  classification: 'FACT',
  provenance: 'source_message',
  source_quote: 'Priya signs off anything over 5k.',
  ...over,
});

describe('what the student is shown', () => {
  it('separates heard-but-unconfirmed from inferred from confirmed', () => {
    const review = buildIntakeReview([
      item(),
      item({ provenance: 'ai_inferred', source_quote: undefined, classification: 'ASSUMPTION' }),
      item({ provenance: 'client_confirmed' }),
    ]);

    expect(review.counts).toMatchObject({ needsConfirmation: 1, inferences: 1, confirmed: 1 });
  });

  it('puts what a person can act on first, and context last', () => {
    const review = buildIntakeReview([
      item({ provenance: 'client_confirmed' }),
      item(),
    ]);
    expect(review.items.map((i) => i.group)).toEqual(['needsConfirmation', 'confirmed']);
  });

  it('treats a recorded unknown as its own group, not as a gap', () => {
    // The brief is explicit that a student must not be made to invent a
    // baseline to continue. An honest unknown has to be showable without
    // reading as an error.
    const review = buildIntakeReview([
      item({ dimension: 'unknowns', classification: 'ASSUMPTION', provenance: 'source_message' }),
    ]);
    expect(review.counts.unknowns).toBe(1);
    expect(review.blocksPlanning).toBe(false);
  });

  it('carries the student\'s own quote through, so they can see what was heard', () => {
    const review = buildIntakeReview([item({ source_quote: 'Priya signs off over 5k' })]);
    expect(review.items[0].quote).toBe('Priya signs off over 5k');
  });

  it('reports a missing quote as null rather than an empty string', () => {
    const review = buildIntakeReview([
      item({ provenance: 'ai_inferred', source_quote: undefined, classification: 'ASSUMPTION' }),
    ]);
    expect(review.items[0].quote).toBeNull();
  });

  it('is empty and blocks nothing when there is no intake yet', () => {
    const review = buildIntakeReview([]);
    expect(review.items).toEqual([]);
    expect(review.blocksPlanning).toBe(false);
  });
});

describe('only a contradiction blocks', () => {
  it('blocks on an item the contract itself calls invalid', () => {
    // FACT on ai_inferred: the one thing the whole provenance model exists to
    // refuse. Asked of the shared validator, not re-described here.
    const bad = item({ classification: 'FACT', provenance: 'ai_inferred', source_quote: undefined });
    expect(findIntegrityViolations({ title: 't', proposed_surfaces: [], items: [bad] }).length)
      .toBeGreaterThan(0);

    const review = buildIntakeReview([bad]);
    expect(review.blocksPlanning).toBe(true);
    expect(review.contradictions.length).toBeGreaterThan(0);
  });

  it('does NOT block merely because things are unconfirmed', () => {
    // A gate that blocks on "you have not confirmed everything" teaches
    // students to click through it, and then it protects nothing.
    const review = buildIntakeReview([item(), item({ dimension: 'systems' })]);
    expect(review.counts.needsConfirmation).toBe(2);
    expect(review.blocksPlanning).toBe(false);
  });

  it('does not block on an inference either', () => {
    const review = buildIntakeReview([
      item({ classification: 'ASSUMPTION', provenance: 'ai_inferred', source_quote: undefined }),
    ]);
    expect(review.blocksPlanning).toBe(false);
  });
});

describe('correcting an item', () => {
  const items = [item(), item({ dimension: 'systems', value: 'Gmail and a spreadsheet.' })];

  it('records the student\'s words as the strongest provenance there is', () => {
    const result = applyCorrection(items, { index: 0, value: 'Priyanka signs off over 5k.' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.items[0]).toMatchObject({
      value: 'Priyanka signs off over 5k.',
      classification: 'FACT',
      provenance: 'client_confirmed',
      source_quote: 'Priyanka signs off over 5k.',
    });
    expect(confirmedIsFactBearing()).toBe(true);
  });

  it('records confirming-without-editing as a real action', () => {
    // "Nobody has looked at this" and "somebody read it and it was right" are
    // different states, and only the second should survive a re-extraction.
    const result = applyCorrection(items, { index: 0 });
    if (!result.ok) throw new Error('expected a correction');
    expect(result.items[0].provenance).toBe('client_confirmed');
    expect(result.items[0].value).toBe(items[0].value);
  });

  it('leaves every other item exactly as it was', () => {
    const result = applyCorrection(items, { index: 0, value: 'Priyanka signs off.' });
    if (!result.ok) throw new Error('expected a correction');
    expect(result.items[1]).toEqual(items[1]);
    expect(items[0].provenance).toBe('source_message'); // the input was not mutated
  });

  it('refuses an empty correction rather than guessing it meant deletion', () => {
    expect(applyCorrection(items, { index: 0, value: '   ' }))
      .toEqual({ ok: false, reason: 'empty_value' });
  });

  it('refuses an index that names no item', () => {
    expect(applyCorrection(items, { index: 99, value: 'x' }))
      .toEqual({ ok: false, reason: 'unknown_index' });
  });

  it('produces an item the shared contract still accepts', () => {
    const result = applyCorrection(items, { index: 0, value: 'Priyanka signs off over 5k.' });
    if (!result.ok) throw new Error('expected a correction');
    for (const i of result.items) expect(validateItem(i)).toEqual({ ok: true, item: i });
    expect(findIntegrityViolations({ title: 't', proposed_surfaces: [], items: result.items }))
      .toEqual([]);
  });

  it('a corrected item then reads as confirmed on the next review', () => {
    const result = applyCorrection(items, { index: 0, value: 'Priyanka signs off.' });
    if (!result.ok) throw new Error('expected a correction');
    expect(buildIntakeReview(result.items).counts.confirmed).toBe(1);
  });
});

describe('grouping rules, stated once', () => {
  it.each([
    ['client_confirmed', 'confirmed'],
    ['pm_confirmed', 'confirmed'],
    ['ai_inferred', 'inferences'],
    ['source_message', 'needsConfirmation'],
    ['voice_transcript', 'needsConfirmation'],
  ])('%s lands in %s', (provenance, group) => {
    expect(groupOf(item({ provenance: provenance as never }))).toBe(group);
  });

  it('fullyReviewed is false while anything is unconfirmed, and false when empty', () => {
    expect(fullyReviewed([])).toBe(false);
    expect(fullyReviewed([item()])).toBe(false);
    expect(fullyReviewed([item({ provenance: 'client_confirmed' })])).toBe(true);
  });
});

describe('what a build showed (Phase 6)', () => {
  it('groups repo evidence as fromBuild, after what the student said and before inferences', () => {
    const review = buildIntakeReview([
      item({ dimension: 'systems', value: 'Probably Postgres.', classification: 'ASSUMPTION', provenance: 'ai_inferred', source_quote: undefined }),
      item({ dimension: 'integrations', value: 'Reads Zendesk.', provenance: 'repo_evidence', source_quote: 'src/client.ts' }),
      item({ dimension: 'actors', value: 'Priya.' }),
    ]);
    expect(review.items.map((i) => i.group)).toEqual(['needsConfirmation', 'fromBuild', 'inferences']);
    expect(review.counts.fromBuild).toBe(1);
  });

  it('a question a story raised is a question, whatever its provenance', () => {
    expect(groupOf(item({ classification: 'QUESTION', provenance: 'repo_evidence', source_quote: 'src/x.ts' }))).toBe('openQuestions');
  });

  it('a correction keeps the earlier value in history, newest first', () => {
    const heard = item({ dimension: 'actors', value: 'Priya.', provenance: 'repo_evidence', source_quote: 'src/review.ts' });
    const first = applyCorrection([heard], { index: 0, value: 'Priya Natarajan.' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.items[0].history).toHaveLength(1);
    expect(first.items[0].history![0]).toMatchObject({ value: 'Priya.', provenance: 'repo_evidence', replaced_by: 'correction' });

    const second = applyCorrection(first.items, { index: 0, value: 'Priya N.' });
    if (!second.ok) return;
    expect(second.items[0].history!.map((h) => h.value)).toEqual(['Priya Natarajan.', 'Priya.']);
  });

  it('confirming an already-confirmed value unchanged adds nothing to history', () => {
    const confirmed = item({ provenance: 'client_confirmed' });
    const r = applyCorrection([confirmed], { index: 0, value: null });
    if (!r.ok) return;
    expect(r.items[0].history).toBeUndefined();
  });
});
