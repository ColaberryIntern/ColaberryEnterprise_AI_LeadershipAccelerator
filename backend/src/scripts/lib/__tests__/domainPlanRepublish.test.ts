/* eslint-disable */
// AF12.7 - what a re-derive would change about a published plan, pinned.
//
// These decide whether a republish is allowed to run against production, so they are written
// to be hostile: the diff must notice a story leaving, must notice acceptance text moving
// under a story that stays, and must REFUSE a removal of anything already earned rather than
// deciding on a student's behalf. Pure functions, no database.

const { diffPlanStories, perStoryXp, sameAcceptance } = require('../domainPlanRepublish');

const s = (id: string, acceptance: string[] = ['does the thing']) => ({ id, acceptance });

// Real shapes from the admissions domain, not invented ones.
const BASE = 'admissions.CAP.admission_decision_recording';
const RUNG0 = 'admissions.CAP.admission_decision_recording.autonomy:R0';
const RUNG2 = 'admissions.CAP.admission_decision_recording.autonomy:R2';

describe('diffPlanStories', () => {
  it('reports the rung stories a re-derive adds — the whole point of AF12.7', () => {
    const d = diffPlanStories([s(BASE)], [s(BASE), s(RUNG0), s(RUNG2)]);
    expect(d.added).toEqual([RUNG0, RUNG2]);
    expect(d.removed).toEqual([]);
    expect(d.kept).toEqual([BASE]);
    expect(d.currentCount).toBe(1);
    expect(d.nextCount).toBe(3);
  });

  it('reports a story the task table no longer has — the varchar(60) truncation casualties', () => {
    const truncated = 'admissions.CAP.a_story_id_cut_off_at_exactly_sixty_characters_x';
    const d = diffPlanStories([s(BASE), s(truncated)], [s(BASE)]);
    expect(d.removed).toEqual([truncated]);
    expect(d.added).toEqual([]);
    // Nothing was earned against it, so it is a safe removal.
    expect(d.unsafeRemovals).toEqual([]);
  });

  it('REFUSES to call a removal safe when the story has already been earned', () => {
    // This is the gate that stops a republish deleting credited work. If it ever returns an
    // empty list here, the caller will happily drop a story a student was paid for.
    const d = diffPlanStories([s(BASE), s(RUNG0)], [s(BASE)], [RUNG0]);
    expect(d.removed).toEqual([RUNG0]);
    expect(d.unsafeRemovals).toEqual([RUNG0]);
  });

  it('accepts the earned set as a Set as well as an array', () => {
    const d = diffPlanStories([s(RUNG0)], [], new Set([RUNG0]));
    expect(d.unsafeRemovals).toEqual([RUNG0]);
  });

  it('notices acceptance text moving under a story that STAYS', () => {
    // The verifier matches criteria by text. A story that survives the diff but whose wording
    // changed re-grades work already submitted against the old wording, so "kept" is not the
    // same as "unaffected".
    const d = diffPlanStories(
      [s(BASE, ['the endpoint returns 200'])],
      [s(BASE, ['the endpoint returns 200 and emits an audit row'])],
    );
    expect(d.kept).toEqual([BASE]);
    expect(d.criteriaChanged).toEqual([BASE]);
  });

  it('does not flag a story whose criteria only changed whitespace', () => {
    const d = diffPlanStories([s(BASE, ['  does the thing '])], [s(BASE, ['does the thing'])]);
    expect(d.criteriaChanged).toEqual([]);
  });

  it('flags a REORDERING of criteria, because order is how the plan is read back', () => {
    const d = diffPlanStories([s(BASE, ['a', 'b'])], [s(BASE, ['b', 'a'])]);
    expect(d.criteriaChanged).toEqual([BASE]);
  });

  it('flags a story losing its criteria, which would make it unverifiable', () => {
    const d = diffPlanStories([s(BASE, ['a'])], [s(BASE, [])]);
    expect(d.criteriaChanged).toEqual([BASE]);
  });

  it('survives empty and missing inputs without inventing a change', () => {
    expect(diffPlanStories([], [])).toMatchObject({
      added: [], removed: [], kept: [], criteriaChanged: [], currentCount: 0, nextCount: 0,
    });
    expect(diffPlanStories(null, null).added).toEqual([]);
    // A story with no acceptance key at all must not read as "changed" against another one.
    expect(diffPlanStories([{ id: 'x' }], [{ id: 'x' }]).criteriaChanged).toEqual([]);
  });

  it('counts a whole-plan replacement as such, so it cannot look like a small edit', () => {
    const d = diffPlanStories([s('old.1'), s('old.2')], [s('new.1'), s('new.2')]);
    expect(d.added).toEqual(['new.1', 'new.2']);
    expect(d.removed).toEqual(['old.1', 'old.2']);
    expect(d.kept).toEqual([]);
  });
});

describe('perStoryXp — mirrors pointsConfigService, and is pinned to its documented examples', () => {
  it('matches the two worked examples in seedBuildStoryPointsConfig', () => {
    // From that docblock: "an 800 budget pays 40 a story across a 20-story build and 27
    // across a 30-story build". If the real rule stops rounding this way, this fails rather
    // than the dry run quietly reporting a number nobody will be paid.
    expect(perStoryXp(800, 20)).toBe(40);
    expect(perStoryXp(800, 30)).toBe(27);
  });

  it('shows the AF12.7 consequence at the live budget', () => {
    // admissions: 53 stories now, 189 after. Total for a whole build is 800 either way.
    expect(perStoryXp(800, 53)).toBe(15);
    expect(perStoryXp(800, 189)).toBe(4);
  });

  it('fails closed at 0 in every degenerate case, like the real one', () => {
    expect(perStoryXp(800, 0)).toBe(0);
    expect(perStoryXp(0, 20)).toBe(0);
    expect(perStoryXp(null, 20)).toBe(0);
    expect(perStoryXp(800, null)).toBe(0);
    expect(perStoryXp(NaN, 20)).toBe(0);
    expect(perStoryXp(800, -5)).toBe(0);
  });
});

describe('sameAcceptance', () => {
  it('is more sensitive than the verifier on purpose', () => {
    // Case is NOT normalised here even though the verifier normalises it: a false alarm costs
    // a line in a dry run, a missed change re-grades a student.
    expect(sameAcceptance(['A'], ['a'])).toBe(false);
    expect(sameAcceptance([' a '], ['a'])).toBe(true);
    expect(sameAcceptance(undefined, [])).toBe(true);
    expect(sameAcceptance(['a'], ['a', 'b'])).toBe(false);
  });
});
