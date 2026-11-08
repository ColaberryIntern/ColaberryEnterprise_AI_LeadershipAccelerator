/* eslint-disable */
// AF12.7 - what a re-derive would change about a published plan, pinned.
//
// These decide whether a republish is allowed to run against production, so they are written
// to be hostile: the diff must notice a story leaving, must notice acceptance text moving
// under a story that stays, and must REFUSE a removal of anything already earned rather than
// deciding on a student's behalf. Pure functions, no database.

const {
  diffPlanStories, perStoryXp, sameAcceptance, creditedStories,
} = require('../domainPlanRepublish');

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

describe('creditedStories — the fail-closed gate\'s detector', () => {
  // A gate whose detector never fires does not fail closed, it passes vacuously. These are the
  // positive control: they prove the function can see evidence AT ALL before any test is allowed
  // to read an empty result as "nothing was earned".
  it('finds the evidence written for a story, in the real source_ref format', () => {
    const ev = [{ source_ref: `${BASE}@abc1234`, builder_xp: 15 }];
    expect(creditedStories(ev, [BASE])).toEqual([{ story_id: BASE, evidence_rows: 1, xp: 15 }]);
  });

  it('finds a bare source_ref equal to the id, with no suffix at all', () => {
    expect(creditedStories([{ source_ref: BASE, builder_xp: 40 }], [BASE]))
      .toEqual([{ story_id: BASE, evidence_rows: 1, xp: 40 }]);
  });

  it('sums every row for a story, because XP accrues across commits', () => {
    const ev = [
      { source_ref: `${BASE}@aaa`, builder_xp: 15 },
      { source_ref: `${BASE}@bbb`, builder_xp: 15 },
    ];
    expect(creditedStories(ev, [BASE])).toEqual([{ story_id: BASE, evidence_rows: 2, xp: 30 }]);
  });

  it('NEGATIVE CONTROL: the base story does not claim the rung story\'s evidence', () => {
    // This caught the first draft, which required a non-word character after the id — the exact
    // mistake the matcher guard exists to fix, since "." is non-word AND an ordinary id
    // character. Longest match replaced it. If this ever fails again, the gate refuses
    // republishes over work the base story was never paid for.
    const ev = [{ source_ref: `${RUNG0}@abc1234`, builder_xp: 4 }];
    expect(creditedStories(ev, [BASE], [BASE, RUNG0])).toEqual([]);
    expect(creditedStories(ev, [RUNG0], [BASE, RUNG0]))
      .toEqual([{ story_id: RUNG0, evidence_rows: 1, xp: 4 }]);
  });

  it('does not let STORY-1 claim STORY-10 when both ids are known', () => {
    const ev = [{ source_ref: 'STORY-10@sha', builder_xp: 9 }];
    const known = ['STORY-1', 'STORY-10'];
    expect(creditedStories(ev, ['STORY-1'], known)).toEqual([]);
    expect(creditedStories(ev, ['STORY-10'], known))
      .toEqual([{ story_id: 'STORY-10', evidence_rows: 1, xp: 9 }]);
  });

  it('over-attributes rather than under-attributes when the universe is incomplete', () => {
    // Pinning the documented fallback. With STORY-10 unknown, its evidence lands on STORY-1 —
    // wrong, but wrong in the direction that REFUSES a removal. A test records which way it
    // leans so nobody later "fixes" it into silently dropping earned work.
    const ev = [{ source_ref: 'STORY-10@sha', builder_xp: 9 }];
    expect(creditedStories(ev, ['STORY-1'], ['STORY-1']))
      .toEqual([{ story_id: 'STORY-1', evidence_rows: 1, xp: 9 }]);
  });

  it('omits a story with no evidence rather than reporting it as zero', () => {
    // The caller treats presence in this list as "earned", so a zero-row entry would refuse
    // every removal.
    expect(creditedStories([{ source_ref: 'something.else@sha' }], [BASE])).toEqual([]);
  });

  it('survives missing xp, null refs, and empty inputs', () => {
    expect(creditedStories([{ source_ref: `${BASE}@x` }], [BASE]))
      .toEqual([{ story_id: BASE, evidence_rows: 1, xp: 0 }]);
    expect(creditedStories([{ source_ref: null }, {}], [BASE])).toEqual([]);
    expect(creditedStories([], [BASE])).toEqual([]);
    expect(creditedStories(null, null)).toEqual([]);
    expect(creditedStories([{ source_ref: `${BASE}@x` }], ['', null])).toEqual([]);
  });

  it('feeds diffPlanStories, so an earned removal becomes an unsafe one end to end', () => {
    // The two halves of the gate, wired the way the script wires them.
    const ev = [{ source_ref: `${RUNG0}@abc`, builder_xp: 4 }];
    const current = [s(BASE), s(RUNG0)];
    const next = [s(BASE)];
    const first = diffPlanStories(current, next);
    const known = [...current, ...next].map((x) => x.id);
    const earnedIds = creditedStories(ev, first.removed, known).map((e: any) => e.story_id);
    expect(diffPlanStories(current, next, earnedIds).unsafeRemovals).toEqual([RUNG0]);
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
