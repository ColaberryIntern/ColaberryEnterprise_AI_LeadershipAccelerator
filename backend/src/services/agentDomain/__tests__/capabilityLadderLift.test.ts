/**
 * AF10.9 — the ladder lift.
 *
 * The load-bearing test is `will not undo a verified rung`. Six rungs across two boards are
 * genuinely finished and verified by the build pipeline, and the obvious implementation of "reset
 * the rungs so they read as a ladder" destroys all six silently. Everything else here is ordering;
 * that one is the promise Ali made the room.
 *
 * ## Why these fixtures are shaped the way they are
 *
 * The first version of this file invented its boards: four rungs, positions numbered from 1, no
 * `command_center` story, no two stories sharing a position. Every one of those four details was
 * wrong about production, and because the fixtures were invented the whole suite was green while
 * the planner could not have done its job. The three `L0-*` rungs would have been left behind,
 * and the renumber would have rewritten all 598 rows to move the base from 0 to 1.
 *
 * So the fixtures below are transcribed from a measurement of the live boards on 25 Nov 2026:
 * ten boards, seven rungs, positions from 0, `<domain>.STORY-000` at position 0, a `rung_gate`
 * story last, and the colliding positions the `L0-*` insertion left behind. `MARKETING_LADDER`
 * and the two progress fixtures are real rows, not plausible ones.
 */
import { LADDER_STEPS } from '../capabilityLadder';
import {
  PINNED_KINDS,
  RUNG_ORDER,
  assertProgressPreserved,
  boardOrder,
  intendedStatus,
  isFinished,
  planLadderLift,
  rungOf,
  type BoardStory,
  type Rung,
  type StoryStatus,
} from '../capabilityLadderLift';

const VERIFIED = '2026-11-17T13:50:42.369Z';

function story(
  id: string, storyId: string, kind: string, position: number,
  status: StoryStatus = 'not_started', verified: string | null = null,
): BoardStory {
  return { id, story_id: storyId, story_kind: kind, position, status, verified_at: verified };
}

function rungRow(
  cap: string, r: Rung, position: number,
  status: StoryStatus = 'in_progress', verified: string | null = null,
): BoardStory {
  return story(`id-${r}`, `${cap}.${r}`, 'capability_ladder', position, status, verified);
}

/**
 * The non-ladder rows every board shares: STORY-000 at position 0, five research stories, the
 * legacy migration plan, a run of implementation stories, and a `rung_gate` story last.
 *
 * `implCount` and `gatePos` are given per board rather than derived, because each board's real
 * numbers are what make the ladder collide the way it does. Guessing them is what produced a
 * fixture whose gate story sat on top of the ladder, which production has never done.
 */
function surround(domain: string, implCount: number, gatePos: number): BoardStory[] {
  return [
    story('cc', `${domain}.STORY-000`, 'command_center', 0, 'complete'),
    ...[1, 2, 3, 4, 5].map((n) => story(`r${n}`, `${domain}.RESEARCH-${n}`, 'research', n, 'complete')),
    story('legacy', `${domain}.LEGACY-MIGRATION-PLAN`, 'legacy_migration', 6, 'complete'),
    ...Array.from({ length: implCount }, (_, i) => story(
      `impl${i + 1}`, `${domain}.CAP.thing_${i + 1}`, 'implementation', 7 + i, 'in_progress',
    )),
    story('gate', `${domain}.GATE.R0.1`, 'rung_gate', gatePos),
  ];
}

/**
 * Sarbjit's marketing board: 79 stories at positions 0 to 78, the seven rungs jammed into 71 to
 * 74 so three PAIRS of them share a position, and the gate story last at 78.
 */
const MARKETING = 'marketing.CAP.social_signal_discovery';
function boardLikeMarketing(): BoardStory[] {
  return [
    ...surround('marketing', 64, 78),
    rungRow(MARKETING, 'L0-CHOOSE', 71, 'not_started'),
    rungRow(MARKETING, 'L1-BY-HAND', 71, 'in_progress'),
    rungRow(MARKETING, 'L0-SCOPE-SHEET', 72, 'not_started'),
    rungRow(MARKETING, 'L2-IN-THE-APP', 72, 'in_progress'),
    rungRow(MARKETING, 'L0-ASK-FOR-A-SCREEN', 73, 'not_started'),
    rungRow(MARKETING, 'L3-TOOL-REQUEST', 73, 'in_progress'),
    rungRow(MARKETING, 'L4-AGENT-WATCHED', 74, 'in_progress'),
  ];
}

/**
 * Kalkidan's admissions board: 66 stories, rungs 1 and 2 both complete and verified by the build
 * pipeline, and the four older rungs sitting on top of four implementation stories at 54 to 57.
 */
const ADMISSIONS = 'admissions.CAP.page_event_admissions_enrichment';
function boardLikeKalkidan(): BoardStory[] {
  return [
    ...surround('admissions', 51, 65),
    rungRow(ADMISSIONS, 'L1-BY-HAND', 54, 'complete', VERIFIED),
    rungRow(ADMISSIONS, 'L2-IN-THE-APP', 55, 'complete', VERIFIED),
    rungRow(ADMISSIONS, 'L3-TOOL-REQUEST', 56, 'in_progress'),
    rungRow(ADMISSIONS, 'L4-AGENT-WATCHED', 57, 'in_progress'),
    rungRow(ADMISSIONS, 'L0-CHOOSE', 58, 'not_started'),
    rungRow(ADMISSIONS, 'L0-SCOPE-SHEET', 59, 'not_started'),
    rungRow(ADMISSIONS, 'L0-ASK-FOR-A-SCREEN', 60, 'not_started'),
  ];
}

/**
 * Quincy's platform board, 64 stories, which is finished OUT OF ORDER: rungs 0.2, 0.3, 1 and 2
 * are verified while 0.1 was never credited. A real anomaly, kept as a fixture because a planner
 * that tidies it away hides the thing somebody needs to look at.
 *
 * It also carries the one collision on these boards that has nothing to do with the ladder: two
 * implementation stories have shared position 8 since long before any of this.
 */
const PLATFORM = 'platform.CAP.orchestration_health_watch';
function boardLikePlatform(): BoardStory[] {
  return [
    ...surround('platform', 48, 63),
    story('impl-dup', 'platform.CAP.scheduler_liveness_watch', 'implementation', 8, 'in_progress'),
    rungRow(PLATFORM, 'L1-BY-HAND', 55, 'complete', VERIFIED),
    rungRow(PLATFORM, 'L0-CHOOSE', 56, 'in_progress'),
    rungRow(PLATFORM, 'L2-IN-THE-APP', 56, 'complete', VERIFIED),
    rungRow(PLATFORM, 'L0-SCOPE-SHEET', 57, 'complete', VERIFIED),
    rungRow(PLATFORM, 'L3-TOOL-REQUEST', 57, 'in_progress'),
    rungRow(PLATFORM, 'L0-ASK-FOR-A-SCREEN', 58, 'complete', VERIFIED),
    rungRow(PLATFORM, 'L4-AGENT-WATCHED', 58, 'in_progress'),
  ];
}

/** Replay a plan onto a board, the way the runner's transaction does. */
function applied(before: ReadonlyArray<BoardStory>, plan: ReturnType<typeof planLadderLift>): BoardStory[] {
  return before.map((s) => {
    const mv = plan.positions.find((p) => p.id === s.id);
    const st = plan.statuses.find((c) => c.id === s.id);
    return { ...s, position: mv ? mv.to : s.position, status: st ? st.to : s.status };
  });
}

describe('the fixtures are the boards as measured on 25 Nov 2026', () => {
  // A fixture that has drifted from production is the specific way this module failed before:
  // invented boards made a four-rung planner look correct. These numbers come from the live rows.
  it.each([
    ['marketing', boardLikeMarketing, 79, 3],
    ['admissions', boardLikeKalkidan, 66, 4],
    ['platform', boardLikePlatform, 64, 4],
  ] as const)('%s holds %d stories and %d colliding positions', (_name, build, size, dupes) => {
    const board = build();
    expect(board).toHaveLength(size);
    const shared = [...new Set(board.map((s) => s.position))]
      .filter((p) => board.filter((s) => s.position === p).length > 1);
    expect(shared).toHaveLength(dupes);
    expect(board.filter((s) => s.story_kind === 'capability_ladder')).toHaveLength(7);
    expect(Math.min(...board.map((s) => s.position))).toBe(0);
  });
});

describe('the rung list cannot drift from the canonical ladder', () => {
  it('is exactly LADDER_STEPS, in the same order', () => {
    // This is the test that would have caught the eight-day staleness: the ladder grew three L0
    // rungs and this module still knew four, so three rungs per board would have been left behind.
    expect([...RUNG_ORDER]).toEqual(LADDER_STEPS.map((s) => s.suffix));
  });

  it('POSITIVE CONTROL: the canonical list really is seven rungs starting at L0-CHOOSE', () => {
    expect(LADDER_STEPS).toHaveLength(7);
    expect(LADDER_STEPS[0].suffix).toBe('L0-CHOOSE');
  });
});

describe('reading a board', () => {
  it('recognises each rung from the story id suffix', () => {
    expect(rungOf(rungRow(MARKETING, 'L3-TOOL-REQUEST', 1))).toBe('L3-TOOL-REQUEST');
    expect(rungOf(story('x', 'marketing.CAP.thing', 'implementation', 1))).toBeNull();
  });

  it('does not mistake L0-ASK-FOR-A-SCREEN for another rung', () => {
    // endsWith on a shared prefix is how a suffix match goes wrong; L0-CHOOSE and
    // L0-ASK-FOR-A-SCREEN share "L0-" and must not collide.
    expect(rungOf(rungRow(MARKETING, 'L0-ASK-FOR-A-SCREEN', 1))).toBe('L0-ASK-FOR-A-SCREEN');
    expect(rungOf(rungRow(MARKETING, 'L0-CHOOSE', 1))).toBe('L0-CHOOSE');
  });

  it('counts a verification as finished even when the status was never updated', () => {
    // Both forms occur in production: the pipeline writes `verified_at`, a human sets `complete`.
    // Treating only one as finished is how real progress gets overwritten.
    expect(isFinished(rungRow(MARKETING, 'L1-BY-HAND', 1, 'in_progress', VERIFIED))).toBe(true);
    expect(isFinished(rungRow(MARKETING, 'L1-BY-HAND', 1, 'complete'))).toBe(true);
    expect(isFinished(rungRow(MARKETING, 'L1-BY-HAND', 1, 'in_progress'))).toBe(false);
  });
});

describe('boardOrder is a total order', () => {
  it('breaks a tied position by story id rather than leaving it to the database', () => {
    const a = story('a', 'marketing.CAP.aaa', 'implementation', 8);
    const b = story('b', 'marketing.CAP.bbb', 'implementation', 8);
    expect(boardOrder(a, b)).toBeLessThan(0);
    expect(boardOrder(b, a)).toBeGreaterThan(0);
  });

  it('POSITIVE CONTROL: comparing on position alone would call them equal', () => {
    expect(8 - 8).toBe(0);
  });

  it('orders by position first, id only as a tie-break', () => {
    const early = story('zzz', 'marketing.CAP.zzz', 'implementation', 3);
    const late = story('aaa', 'marketing.CAP.aaa', 'implementation', 9);
    expect(boardOrder(early, late)).toBeLessThan(0);
  });
});

describe('the ladder goes to the top, under the front door', () => {
  it('puts the seven rungs at positions 1 to 7, in climb order', () => {
    const plan = planLadderLift(boardLikeMarketing());
    const moved = new Map(plan.positions.map((p) => [p.id, p.to]));
    RUNG_ORDER.forEach((r, i) => expect(moved.get(`id-${r}`)).toBe(i + 1));
  });

  it('leaves STORY-000 exactly where it is, at position 0', () => {
    expect(PINNED_KINDS.has('command_center')).toBe(true);
    const plan = planLadderLift(boardLikeMarketing());
    expect(plan.positions.find((p) => p.id === 'cc')).toBeUndefined();
    const after = applied(boardLikeMarketing(), plan);
    expect(after.find((s) => s.id === 'cc')!.position).toBe(0);
  });

  it('keeps the board 0-based instead of renumbering every row from 1', () => {
    const plan = planLadderLift(boardLikeMarketing());
    const after = applied(boardLikeMarketing(), plan);
    expect(Math.min(...after.map((s) => s.position))).toBe(0);
  });

  it('pushes everything else down by seven without reordering it', () => {
    const before = boardLikeMarketing();
    const plan = planLadderLift(before);
    const after = applied(before, plan);

    const orderOf = (rows: BoardStory[]) => rows
      .filter((s) => s.story_kind !== 'capability_ladder' && s.story_kind !== 'command_center')
      .slice().sort(boardOrder).map((s) => s.id);

    expect(orderOf(after)).toEqual(orderOf(before));
    // The first research story was at 1 and is now at 8, directly below the seventh rung.
    expect(after.find((s) => s.id === 'r1')!.position).toBe(8);
    // The gate story was last and is still last.
    expect(after.find((s) => s.id === 'gate')!.position)
      .toBe(Math.max(...after.map((s) => s.position)));
  });

  it('leaves no two stories sharing a position, on any of the three boards', () => {
    for (const before of [boardLikeMarketing(), boardLikeKalkidan(), boardLikePlatform()]) {
      const plan = planLadderLift(before);
      expect(assertProgressPreserved(before, plan)).toEqual([]);
      const after = applied(before, plan);
      expect(new Set(after.map((s) => s.position)).size).toBe(after.length);
    }
  });

  it('also resolves platform’s older collision between two implementation stories', () => {
    // Position 8 was shared by two implementation rows before any ladder existed. The renumber
    // fixes it as a by-product, and both rows must survive with their order fixed, not dropped.
    const before = boardLikePlatform();
    const after = applied(before, planLadderLift(before));
    const pair = after.filter((s) => s.id === 'impl2' || s.id === 'impl-dup');
    expect(pair).toHaveLength(2);
    expect(pair[0].position).not.toBe(pair[1].position);
  });

  it('does nothing at all to a board with no ladder', () => {
    const plan = planLadderLift([
      story('a', 'x.STORY-000', 'command_center', 0),
      story('b', 'x.CAP.thing', 'implementation', 1),
    ]);
    expect(plan.positions).toEqual([]);
    expect(plan.statuses).toEqual([]);
    expect(plan.rungsFound).toEqual([]);
  });

  it('is idempotent: running it on an already lifted board changes nothing', () => {
    const before = boardLikeMarketing();
    const second = planLadderLift(applied(before, planLadderLift(before)));
    expect(second.positions).toEqual([]);
    expect(second.statuses).toEqual([]);
    expect(second.problems).toEqual([]);
  });

  it('is idempotent on the two boards that carry verified progress too', () => {
    for (const board of [boardLikeKalkidan(), boardLikePlatform()]) {
      const second = planLadderLift(applied(board, planLadderLift(board)));
      expect(second.positions).toEqual([]);
      expect(second.statuses).toEqual([]);
    }
  });
});

describe('the rungs read as a ladder', () => {
  it('opens the first rung and leaves the other six waiting on a fresh board', () => {
    const plan = planLadderLift(boardLikeMarketing());
    const to = new Map(plan.statuses.map((c) => [c.rung, c.to]));
    expect(to.get('L0-CHOOSE')).toBe('in_progress');
    for (const r of ['L1-BY-HAND', 'L2-IN-THE-APP', 'L3-TOOL-REQUEST', 'L4-AGENT-WATCHED'] as Rung[]) {
      expect(to.get(r)).toBe('not_started');
    }
    // These two were already not_started and correctly waiting, so there is nothing to change.
    expect(to.has('L0-SCOPE-SHEET')).toBe(false);
    expect(to.has('L0-ASK-FOR-A-SCREEN')).toBe(false);
  });

  it('opens the first UNFINISHED rung after the ones Kalkidan finished', () => {
    const plan = planLadderLift(boardLikeKalkidan());
    const to = new Map(plan.statuses.map((c) => [c.rung, c.to]));
    expect(to.get('L0-CHOOSE')).toBe('in_progress');
    expect(to.has('L1-BY-HAND')).toBe(false);   // finished and verified, untouched
    expect(to.has('L2-IN-THE-APP')).toBe(false); // finished and verified, untouched
    expect(to.get('L3-TOOL-REQUEST')).toBe('not_started');
    expect(to.get('L4-AGENT-WATCHED')).toBe('not_started');
  });

  it('surfaces Quincy’s out-of-order board rather than tidying it away', () => {
    // 0.2, 0.3, 1 and 2 are verified on platform while 0.1 was never credited. The honest result
    // is that 0.1 is the open rung: a planner that instead opened rung 3 would hide a gap in the
    // record of what was actually done.
    const plan = planLadderLift(boardLikePlatform());
    const to = new Map(plan.statuses.map((c) => [c.rung, c.to]));
    expect(to.has('L0-CHOOSE')).toBe(false);     // already in_progress, which is correct
    expect(to.has('L0-SCOPE-SHEET')).toBe(false); // verified, untouched
    expect(to.has('L1-BY-HAND')).toBe(false);     // verified, untouched
    expect(to.get('L3-TOOL-REQUEST')).toBe('not_started');
    expect(to.get('L4-AGENT-WATCHED')).toBe('not_started');
  });

  it('never reopens a blocked rung, because somebody set that deliberately', () => {
    const board = [
      rungRow(MARKETING, 'L0-CHOOSE', 1, 'complete'),
      rungRow(MARKETING, 'L0-SCOPE-SHEET', 2, 'blocked'),
      rungRow(MARKETING, 'L0-ASK-FOR-A-SCREEN', 3),
    ];
    const byRung = new Map(board.map((s) => [rungOf(s)!, s]));
    expect(intendedStatus('L0-SCOPE-SHEET', byRung)).toBe('blocked');
    // The ladder opens the next rung that is neither finished nor blocked.
    expect(intendedStatus('L0-ASK-FOR-A-SCREEN', byRung)).toBe('in_progress');
  });
});

describe('THE GUARANTEE: finished work survives', () => {
  it('will not undo a verified rung on either board that has one', () => {
    for (const before of [boardLikeKalkidan(), boardLikePlatform()]) {
      const plan = planLadderLift(before);
      const verified = before.filter(isFinished).map((s) => s.id);
      expect(verified.length).toBeGreaterThan(0);
      for (const id of verified) {
        expect(plan.statuses.find((c) => c.id === id)).toBeUndefined();
      }
      expect(assertProgressPreserved(before, plan)).toEqual([]);
    }
  });

  it('keeps Kalkidan’s finished rungs near the top rather than burying them', () => {
    const before = boardLikeKalkidan();
    const after = applied(before, planLadderLift(before));
    // Rungs 1 and 2 are the fourth and fifth rungs of seven, so positions 4 and 5.
    expect(after.find((s) => s.id === 'id-L1-BY-HAND')!.position).toBe(4);
    expect(after.find((s) => s.id === 'id-L2-IN-THE-APP')!.position).toBe(5);
    expect(after.find((s) => s.id === 'id-L1-BY-HAND')!.status).toBe('complete');
    expect(after.find((s) => s.id === 'id-L1-BY-HAND')!.verified_at).toBe(VERIFIED);
  });

  it('the guard is real: a plan that WOULD undo a verified rung is refused, by name', () => {
    // A check that cannot fail proves nothing, so here is the failure it exists to catch.
    const before = boardLikeKalkidan();
    const sabotaged = {
      ...planLadderLift(before),
      statuses: [{
        id: 'id-L1-BY-HAND', rung: 'L1-BY-HAND' as Rung,
        from: 'complete' as StoryStatus, to: 'not_started' as StoryStatus,
      }],
    };
    const reasons = assertProgressPreserved(before, sabotaged);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('L1-BY-HAND');
    expect(reasons[0]).toContain('finished');
    expect(reasons[0]).toContain(VERIFIED);
  });

  it('catches a plan that would drop a story onto another story’s position', () => {
    const before = boardLikeMarketing();
    const collide = { ...planLadderLift(before), positions: [{ id: 'r1', from: 1, to: 0 }] };
    const reasons = assertProgressPreserved(before, collide);
    expect(reasons.some((r) => r.includes('would share position 0'))).toBe(true);
  });

  it('catches a plan that targets a story the board does not hold', () => {
    const before = boardLikeMarketing();
    const bogus = { ...planLadderLift(before), positions: [{ id: 'ghost', from: 1, to: 2 }] };
    expect(assertProgressPreserved(before, bogus).some((r) => r.includes('ghost'))).toBe(true);
  });
});

describe('an odd board is reported rather than silently half-fixed', () => {
  it('names a missing rung instead of lifting six and claiming success', () => {
    const plan = planLadderLift([
      story('a', 'x.STORY-000', 'command_center', 0),
      ...RUNG_ORDER.slice(0, 6).map((r, i) => rungRow(MARKETING, r, i + 1)),
    ]);
    expect(plan.rungsFound).toHaveLength(6);
    expect(plan.problems.join(' ')).toContain('found 6');
  });

  it('names a ladder story whose rung cannot be read', () => {
    const odd = story('weird', `${MARKETING}.L9-NONSENSE`, 'capability_ladder', 1, 'in_progress');
    expect(planLadderLift([odd]).problems.join(' ')).toContain('no recognisable rung suffix');
  });

  it('names a duplicated rung instead of picking one arbitrarily', () => {
    const plan = planLadderLift([
      rungRow(MARKETING, 'L0-CHOOSE', 1),
      { ...rungRow(MARKETING, 'L0-CHOOSE', 2), id: 'id-dup' },
    ]);
    expect(plan.problems.join(' ')).toContain('two ladder stories claim rung L0-CHOOSE');
  });
});
