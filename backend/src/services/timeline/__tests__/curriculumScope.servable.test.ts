/**
 * curriculumScope — the shared card-servability predicate.
 *
 * `isCardServable` is the ONE answer to "may a student be served this card, and
 * will an action against it succeed?", consulted by both sides of the contract:
 * the read side (`todayFeedComposer.buildServed`) and the write side (`openCard`,
 * `dwell`, `watch`, and the assessment / field-guide / build-artifact / architect
 * handlers). Before it existed those sides each carried their own private
 * `visibility !== 'published'` copy and the read side simply had none at all,
 * which is how ~half a student's Today feed came to be cards that rendered but
 * 404'd on every interaction.
 *
 * The property these tests pin is that the predicate is an ALLOW-LIST. That
 * matters concretely: `timeline_cards.visibility` is a plain VARCHAR(20) with no
 * CHECK constraint and no Postgres enum behind it (see TimelineCard.ts:154), so
 * the four contract values are enforced only in TypeScript and the column will
 * physically accept any short string. A deny-list ("not archived") would let a
 * typo, a future state, or a bad backfill sail straight through to a student.
 */
import { isCardServable, servableCardWhere, globalCurriculumWhere, SERVABLE_CARD_VISIBILITY } from '../curriculumScope';

describe('isCardServable', () => {
  it('admits published, and ONLY published, of the four contract values', () => {
    // The contract enum, verbatim from TimelineCard.TimelineCardVisibility.
    expect(isCardServable('published')).toBe(true);
    expect(isCardServable('draft')).toBe(false);
    expect(isCardServable('scheduled')).toBe(false);
    expect(isCardServable('archived')).toBe(false);
  });

  it('fails CLOSED on anything outside the contract, because the column is an unconstrained VARCHAR', () => {
    // `archived` is what the 18-day retention job writes, and is the value that
    // produced the dead cards. But nothing in the database prevents these.
    expect(isCardServable('Published')).toBe(false);   // wrong case
    expect(isCardServable('published ')).toBe(false);  // stray whitespace from a backfill
    expect(isCardServable('publish')).toBe(false);     // typo
    expect(isCardServable('live')).toBe(false);        // a future state nobody has added yet
    expect(isCardServable('')).toBe(false);
  });

  it('treats an absent visibility as not servable (null / undefined boundary)', () => {
    // Reachable in real code: `attributes` lists that omit the column, and the
    // `(card as any).visibility` reads in assessmentService / architectMindsetService.
    expect(isCardServable(null)).toBe(false);
    expect(isCardServable(undefined)).toBe(false);
  });
});

describe('servableCardWhere / globalCurriculumWhere share one definition', () => {
  it('servableCardWhere is the query form of the predicate', () => {
    expect(servableCardWhere()).toEqual({ visibility: SERVABLE_CARD_VISIBILITY });
    expect(isCardServable(SERVABLE_CARD_VISIBILITY)).toBe(true);
  });

  it('globalCurriculumWhere is BUILT FROM servableCardWhere, so the two cannot drift', () => {
    // This is the regression that matters: if someone edits the visibility rule
    // in one place, the Classroom reader and the Today reader must both move.
    const where = globalCurriculumWhere();
    expect(where.visibility).toBe(SERVABLE_CARD_VISIBILITY);
    expect(where.visibility).toBe(servableCardWhere().visibility);
    // and the rest of the curriculum scope is untouched by this change
    expect(where.cohort_id).toBeNull();
    expect(where.status).toBe('active');
  });
});
