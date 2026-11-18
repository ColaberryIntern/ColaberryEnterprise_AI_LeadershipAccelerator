/**
 * AF10.9 — the ladder lift.
 *
 * The load-bearing test is `will not undo a finished rung`. Kalkidan's rung 1 is the only verified
 * ladder progress across all seven boards, it was verified hours before the call that produced
 * this ticket, and the obvious implementation of "reset the rungs to a ladder" destroys it
 * silently. Everything else here is ordering; that one is the promise.
 */
import {
  RUNG_ORDER,
  assertProgressPreserved,
  intendedStatus,
  isFinished,
  planLadderLift,
  rungOf,
  type BoardStory,
  type Rung,
  type StoryStatus,
} from '../capabilityLadderLift';

const CAP = 'admissions.page_event_admissions_enrichment';

function rung(r: Rung, position: number, status: StoryStatus = 'in_progress', verified: string | null = null): BoardStory {
  return { id: `id-${r}`, story_id: `${CAP}.${r}`, story_kind: 'capability_ladder', position, status, verified_at: verified };
}
function plain(id: string, position: number, status: StoryStatus = 'not_started'): BoardStory {
  return { id, story_id: `story-${id}`, story_kind: 'implementation', position, status, verified_at: null };
}

/** Sarbjit's shape: 70 ordinary stories, then the four rungs at 71 to 74. */
function boardLikeSarbjit(): BoardStory[] {
  const rest = Array.from({ length: 70 }, (_, i) => plain(`s${i + 1}`, i + 1));
  return [...rest, ...RUNG_ORDER.map((r, i) => rung(r, 71 + i))];
}

/** Kalkidan's shape: rung 1 genuinely finished and verified by the build pipeline. */
function boardLikeKalkidan(): BoardStory[] {
  const rest = Array.from({ length: 54 }, (_, i) => plain(`k${i + 1}`, i + 1));
  return [
    ...rest,
    rung('L1-BY-HAND', 55, 'complete', '2026-11-17T13:50:42.369Z'),
    rung('L2-IN-THE-APP', 56),
    rung('L3-TOOL-REQUEST', 57),
    rung('L4-AGENT-WATCHED', 58),
  ];
}

describe('reading a board', () => {
  it('recognises each rung from the story id suffix', () => {
    expect(rungOf(rung('L3-TOOL-REQUEST', 1))).toBe('L3-TOOL-REQUEST');
    expect(rungOf(plain('x', 1))).toBeNull();
  });

  it('counts a verification as finished even when the status was never updated', () => {
    // Both forms occur in production: the pipeline writes `verified_at`, a human sets `complete`.
    // Treating only one as finished is how real progress gets overwritten.
    expect(isFinished(rung('L1-BY-HAND', 1, 'in_progress', '2026-11-17T13:50:42Z'))).toBe(true);
    expect(isFinished(rung('L1-BY-HAND', 1, 'complete'))).toBe(true);
    expect(isFinished(rung('L1-BY-HAND', 1, 'in_progress'))).toBe(false);
  });
});

describe('the ladder goes to the top', () => {
  it('puts the four rungs at positions 1 to 4, in climb order', () => {
    const plan = planLadderLift(boardLikeSarbjit());
    const moved = new Map(plan.positions.map((p) => [p.id, p.to]));
    RUNG_ORDER.forEach((r, i) => expect(moved.get(`id-${r}`)).toBe(i + 1));
  });

  it('pushes everything else down without reordering it', () => {
    const plan = planLadderLift(boardLikeSarbjit());
    const moved = new Map(plan.positions.map((p) => [p.id, p.to]));
    // s1 was first and is still first among the non-ladder stories, now at 5.
    expect(moved.get('s1')).toBe(5);
    expect(moved.get('s2')).toBe(6);
    expect(moved.get('s70')).toBe(74);
  });

  it('leaves no two stories sharing a position', () => {
    const before = boardLikeSarbjit();
    const plan = planLadderLift(before);
    expect(assertProgressPreserved(before, plan)).toEqual([]);
  });

  it('does nothing at all to a board with no ladder', () => {
    const plan = planLadderLift([plain('a', 1), plain('b', 2)]);
    expect(plan.positions).toEqual([]);
    expect(plan.statuses).toEqual([]);
    expect(plan.rungsFound).toEqual([]);
  });

  it('is idempotent: running it on an already lifted board changes nothing', () => {
    const before = boardLikeSarbjit();
    const first = planLadderLift(before);
    const after: BoardStory[] = before.map((s) => {
      const mv = first.positions.find((p) => p.id === s.id);
      const st = first.statuses.find((c) => c.id === s.id);
      return { ...s, position: mv ? mv.to : s.position, status: st ? st.to : s.status };
    });
    const second = planLadderLift(after);
    expect(second.positions).toEqual([]);
    expect(second.statuses).toEqual([]);
  });
});

describe('the rungs read as a ladder', () => {
  it('opens rung 1 and leaves 2 to 4 waiting on a fresh board', () => {
    const plan = planLadderLift(boardLikeSarbjit());
    const to = new Map(plan.statuses.map((c) => [c.rung, c.to]));
    // Rung 1 was already in_progress, so it is not in the change list; 2 to 4 must come back.
    expect(to.get('L2-IN-THE-APP')).toBe('not_started');
    expect(to.get('L3-TOOL-REQUEST')).toBe('not_started');
    expect(to.get('L4-AGENT-WATCHED')).toBe('not_started');
    expect(to.has('L1-BY-HAND')).toBe(false);
  });

  it('opens the rung AFTER the finished one', () => {
    const plan = planLadderLift(boardLikeKalkidan());
    const to = new Map(plan.statuses.map((c) => [c.rung, c.to]));
    expect(to.has('L1-BY-HAND')).toBe(false);          // finished, untouched
    expect(to.has('L2-IN-THE-APP')).toBe(false);        // already in_progress, correctly open
    expect(to.get('L3-TOOL-REQUEST')).toBe('not_started');
    expect(to.get('L4-AGENT-WATCHED')).toBe('not_started');
  });

  it('never reopens a blocked rung, because somebody set that deliberately', () => {
    const board = [
      rung('L1-BY-HAND', 1, 'complete'),
      rung('L2-IN-THE-APP', 2, 'blocked'),
      rung('L3-TOOL-REQUEST', 3),
      rung('L4-AGENT-WATCHED', 4),
    ];
    const byRung = new Map(board.map((s) => [rungOf(s)!, s]));
    expect(intendedStatus('L2-IN-THE-APP', byRung)).toBe('blocked');
    // The ladder opens the next rung that is neither finished nor blocked.
    expect(intendedStatus('L3-TOOL-REQUEST', byRung)).toBe('in_progress');
  });
});

describe('THE GUARANTEE: finished work survives', () => {
  it('will not undo Kalkidan’s verified rung 1', () => {
    const before = boardLikeKalkidan();
    const plan = planLadderLift(before);

    const touchesRung1 = plan.statuses.find((c) => c.rung === 'L1-BY-HAND');
    expect(touchesRung1).toBeUndefined();
    expect(assertProgressPreserved(before, plan)).toEqual([]);

    // And it is still at the top of the board afterwards, not buried by the lift.
    expect(plan.positions.find((p) => p.id === 'id-L1-BY-HAND')?.to).toBe(1);
  });

  it('the guard is real: a plan that WOULD undo it is refused, by name', () => {
    // A check that cannot fail proves nothing, so here is the failure it exists to catch.
    const before = boardLikeKalkidan();
    const sabotaged = {
      ...planLadderLift(before),
      statuses: [{ id: 'id-L1-BY-HAND', rung: 'L1-BY-HAND' as Rung, from: 'complete' as StoryStatus, to: 'not_started' as StoryStatus }],
    };
    const reasons = assertProgressPreserved(before, sabotaged);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('L1-BY-HAND');
    expect(reasons[0]).toContain('finished');
    expect(reasons[0]).toContain('2026-11-17T13:50:42.369Z');
  });

  it('catches a plan that would drop a story onto another story’s position', () => {
    const before = boardLikeSarbjit();
    const collide = { ...planLadderLift(before), positions: [{ id: 's1', from: 1, to: 2 }] };
    const reasons = assertProgressPreserved(before, collide);
    expect(reasons.some((r) => r.includes('would share position 2'))).toBe(true);
  });
});

describe('an odd board is reported rather than silently half-fixed', () => {
  it('names a missing rung instead of lifting three and claiming success', () => {
    const plan = planLadderLift([
      plain('a', 1),
      rung('L1-BY-HAND', 2),
      rung('L2-IN-THE-APP', 3),
      rung('L3-TOOL-REQUEST', 4),
    ]);
    expect(plan.rungsFound).toHaveLength(3);
    expect(plan.problems.join(' ')).toContain('found 3');
  });

  it('names a ladder story whose rung cannot be read', () => {
    const odd: BoardStory = { id: 'weird', story_id: `${CAP}.L9-NONSENSE`, story_kind: 'capability_ladder', position: 1, status: 'in_progress', verified_at: null };
    const plan = planLadderLift([odd]);
    expect(plan.problems.join(' ')).toContain('no recognisable rung suffix');
  });
});
