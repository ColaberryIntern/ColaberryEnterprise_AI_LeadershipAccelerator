/**
 * AF10.9 — put the four rungs at the TOP of a builder's board, and make them read as a ladder.
 *
 * ## What was actually wrong
 *
 * Measured in production on 17 Nov 2026, across all seven staffed boards:
 *
 *   - Every board already carries exactly four `capability_ladder` stories, one per rung, for one
 *     seeded capability. The ladder was never missing.
 *   - On every board those four are the LAST four stories. Mihret's are at positions 32 to 35 of
 *     35; Sarbjit's are at 71 to 74 of 74. Boards render in `position ASC` and nothing groups by
 *     story kind, so a builder working top down never reaches them. A ladder nobody can find is,
 *     on Wednesday morning, the same as no ladder.
 *   - Six of the seven have all four rungs sitting at `in_progress` at the same time. A ladder you
 *     are standing on all four rungs of is not a ladder, and it contradicts the instructions going
 *     out to the builders.
 *
 * ## Why this is not a new field on the reconciler
 *
 * `agentDomainBoardReconciler.changedFields` deliberately excludes `position`, and the reason
 * written there is correct: position is assigned by enumeration order within a release, so
 * diffing it would mark every row below an upstream insertion as drifted and rewrite whole boards
 * for nothing. Adding `position` there to fix this would trade a findability bug for a much worse
 * churn bug. So this is a separate, narrow operation with its own guarantees.
 *
 * ## The guarantee that matters
 *
 * Ali promised the room nothing would be taken away. **Kalkidan really finished rung 1**: her
 * `L1-BY-HAND` story is `complete`, verified 17 Nov by `build_pipeline:repo_verification`, and it
 * is the only verified ladder progress anywhere across the seven boards. A naive reseed would set
 * it back to not started and nobody would notice. `planLadderLift` therefore never downgrades a
 * finished rung, and `assertProgressPreserved` fails the plan if one would be lost.
 *
 * Everything here is pure. The caller does the writing, so the promise can be tested without a
 * database.
 */

/** The statuses a story can hold. Mirrors `StudentTaskStatus`. */
export type StoryStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';

/** The four rungs, in the order they must be climbed. */
export const RUNG_ORDER = ['L1-BY-HAND', 'L2-IN-THE-APP', 'L3-TOOL-REQUEST', 'L4-AGENT-WATCHED'] as const;
export type Rung = typeof RUNG_ORDER[number];

export interface BoardStory {
  readonly id: string;
  readonly story_id: string | null;
  readonly story_kind: string | null;
  readonly position: number;
  readonly status: StoryStatus;
  readonly verified_at: string | null;
}

export interface PositionChange {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

export interface StatusChange {
  readonly id: string;
  readonly rung: Rung;
  readonly from: StoryStatus;
  readonly to: StoryStatus;
}

export interface LadderLiftPlan {
  readonly positions: ReadonlyArray<PositionChange>;
  readonly statuses: ReadonlyArray<StatusChange>;
  /** Rungs found, in climb order. Fewer than four means this board is not shaped as expected. */
  readonly rungsFound: ReadonlyArray<Rung>;
  /** Stated rather than inferred, so a caller can refuse to write against an odd board. */
  readonly problems: ReadonlyArray<string>;
}

/** A finished rung. Both forms count: a status of `complete`, or a recorded verification. */
export function isFinished(s: BoardStory): boolean {
  return s.status === 'complete' || Boolean(s.verified_at);
}

/** Which rung a ladder story is, read from the suffix the provisioner writes into `story_id`. */
export function rungOf(story: BoardStory): Rung | null {
  const id = story.story_id ?? '';
  return RUNG_ORDER.find((r) => id.endsWith(`.${r}`)) ?? null;
}

/**
 * The status each rung should hold once the ladder reads as a ladder.
 *
 * One rung is open at a time: the first that is not finished. Everything above it waits. A
 * finished rung is left exactly as it is, which is the Kalkidan guarantee in one line.
 *
 * `blocked` is also left alone. Somebody set it deliberately and this operation is about
 * ordering, not about overruling a judgement that a rung cannot proceed.
 */
export function intendedStatus(
  rung: Rung, byRung: ReadonlyMap<Rung, BoardStory>,
): StoryStatus | null {
  const story = byRung.get(rung);
  if (!story) return null;
  if (isFinished(story) || story.status === 'blocked') return story.status;

  const firstUnfinished = RUNG_ORDER.find((r) => {
    const s = byRung.get(r);
    return s ? !isFinished(s) && s.status !== 'blocked' : false;
  });
  return rung === firstUnfinished ? 'in_progress' : 'not_started';
}

/**
 * Lift the ladder to the top and set the rung statuses.
 *
 * Every other story keeps its RELATIVE order and simply moves down by however many ladder stories
 * were lifted above it. Nothing is deleted and nothing is reordered among itself.
 */
export function planLadderLift(stories: ReadonlyArray<BoardStory>): LadderLiftPlan {
  const problems: string[] = [];

  const ladder = stories.filter((s) => s.story_kind === 'capability_ladder');
  const byRung = new Map<Rung, BoardStory>();
  for (const s of ladder) {
    const r = rungOf(s);
    if (!r) { problems.push(`ladder story ${s.story_id ?? s.id} has no recognisable rung suffix`); continue; }
    if (byRung.has(r)) { problems.push(`two ladder stories claim rung ${r}`); continue; }
    byRung.set(r, s);
  }

  const rungsFound = RUNG_ORDER.filter((r) => byRung.has(r));
  if (rungsFound.length === 0) {
    // Not a failure. A board with no ladder yet is simply not this operation's business.
    return { positions: [], statuses: [], rungsFound: [], problems };
  }
  if (rungsFound.length !== RUNG_ORDER.length) {
    problems.push(`expected ${RUNG_ORDER.length} rungs, found ${rungsFound.length}: ${rungsFound.join(', ')}`);
  }

  const ladderIds = new Set([...byRung.values()].map((s) => s.id));
  const rest = stories
    .filter((s) => !ladderIds.has(s.id))
    .slice()
    .sort((a, b) => a.position - b.position);

  const ordered = [...rungsFound.map((r) => byRung.get(r)!), ...rest];

  const positions: PositionChange[] = [];
  ordered.forEach((s, i) => {
    const to = i + 1;
    if (s.position !== to) positions.push({ id: s.id, from: s.position, to });
  });

  const statuses: StatusChange[] = [];
  for (const rung of rungsFound) {
    const s = byRung.get(rung)!;
    const want = intendedStatus(rung, byRung);
    if (want && want !== s.status) statuses.push({ id: s.id, rung, from: s.status, to: want });
  }

  return { positions, statuses, rungsFound, problems };
}

/**
 * Refuse a plan that would lose finished work.
 *
 * This is the check that would have caught a blind reseed of Kalkidan's board. It is deliberately
 * a separate function from `planLadderLift`: a planner that also judges itself proves nothing, and
 * a caller is expected to run this against the plan before writing a single row.
 *
 * Returns the reasons it must not run. Empty means safe.
 */
export function assertProgressPreserved(
  before: ReadonlyArray<BoardStory>, plan: LadderLiftPlan,
): string[] {
  const reasons: string[] = [];
  const byId = new Map(before.map((s) => [s.id, s]));

  for (const change of plan.statuses) {
    const was = byId.get(change.id);
    if (!was) { reasons.push(`status change targets unknown story ${change.id}`); continue; }
    if (isFinished(was) && change.to !== was.status) {
      reasons.push(
        `${change.rung} is finished (status ${was.status}`
        + `${was.verified_at ? `, verified ${was.verified_at}` : ''}) `
        + `and this plan would set it to ${change.to}`,
      );
    }
  }

  // Positions may move freely: moving a finished story loses nothing. Dropping one would.
  const touched = new Set(plan.positions.map((p) => p.id));
  for (const id of touched) {
    if (!byId.has(id)) reasons.push(`position change targets unknown story ${id}`);
  }

  // Every story must still hold exactly one position, or something has been dropped.
  const finalPositions = new Map<number, number>();
  for (const s of before) {
    const moved = plan.positions.find((p) => p.id === s.id);
    const pos = moved ? moved.to : s.position;
    finalPositions.set(pos, (finalPositions.get(pos) ?? 0) + 1);
  }
  for (const [pos, n] of finalPositions) {
    if (n > 1) reasons.push(`${n} stories would share position ${pos}`);
  }

  return reasons;
}
