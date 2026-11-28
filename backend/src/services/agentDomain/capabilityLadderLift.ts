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
 * ## Re-measured 25 Nov 2026, before any of this ran
 *
 * The planner above was written on 17 Nov and never wired to a caller, so none of it had been
 * applied. In the eight days since, the shape it was written against changed:
 *
 *   - **Ten boards, not seven.** `executive`, `learner_success` and `website` carry a ladder too.
 *   - **Seven rungs, not four.** The three `L0-*` rungs now come first, so production holds 70
 *     ladder stories. A four-rung planner would have lifted four and left three behind.
 *   - **Still at the bottom**, on every board: marketing at 71 to 74 of 79, executive at 96 to 99
 *     of 104. The defect is unchanged, only larger.
 *   - **Positions now collide.** The `L0-*` rungs were inserted at positions the original four
 *     already held, so 32 positions across the ten boards are shared by two stories and the
 *     render order within each pair is whatever the database returns. See `boardOrder`.
 *   - **Two boards carry real progress now, not one.** Kalkidan's admissions rungs 1 and 2 are
 *     both complete and verified, and Quincy's platform board has four verified rungs. The
 *     guarantee below therefore protects six verified rungs rather than Kalkidan's single one.
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

/**
 * The rungs, in the order they must be climbed.
 *
 * **This list went stale once and the staleness is the reason the ticket sat unshipped.** It was
 * written on 17 Nov with four rungs, which is what the boards held that day. The ladder has since
 * grown three `L0-*` rungs in front of them, so production carries seven per board and a planner
 * that knows four treats the other three as unrecognisable stories and leaves them where they are.
 *
 * `capabilityLadder.LADDER_STEPS` is the canonical list. It is not imported here because its
 * `suffix` is typed `string`, which would collapse `Rung` to `string` and lose the literal union
 * every signature below relies on. Instead the two lists are pinned equal, in order, by a test.
 * Add a rung there and this file fails its test rather than silently skipping the new rung.
 */
export const RUNG_ORDER = [
  'L0-CHOOSE', 'L0-SCOPE-SHEET', 'L0-ASK-FOR-A-SCREEN',
  'L1-BY-HAND', 'L2-IN-THE-APP', 'L3-TOOL-REQUEST', 'L4-AGENT-WATCHED',
] as const;
export type Rung = typeof RUNG_ORDER[number];

/**
 * Story kinds that stay ABOVE the ladder.
 *
 * Every board's position 0 is its `command_center` story, `<domain>.STORY-000` — the front door,
 * the one story explicitly numbered to be first. The ticket's acceptance says the ladder stories
 * are "the first four on the board"; read literally that would push the front door to position 8.
 * So the ladder goes directly BELOW the pinned stories and the builder still lands on STORY-000.
 *
 * This is the one judgement call in the operation, which is why it is a named constant with a
 * test rather than an ordering buried in a sort.
 */
export const PINNED_KINDS: ReadonlySet<string> = new Set(['command_center']);

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

/**
 * A board's reading order: by position, then by story id, then by row id.
 *
 * **The tie-breaks are not decoration.** Position is not unique in production: measured 25 Nov,
 * 32 positions across the ten boards are held by two stories each, because the three `L0-*` rungs
 * were inserted at positions the original four already occupied, and platform carries an older
 * collision at position 8 between two implementation stories. Sorting on `position` alone leaves
 * every tied pair in whatever order the database happened to return, so two runs of this planner
 * could order them differently and the second would report changes — which would quietly break
 * the idempotency this module's docblock promises.
 *
 * A total order makes the output a pure function of the row set, which is what idempotency needs.
 */
export function boardOrder(a: BoardStory, b: BoardStory): number {
  return a.position - b.position
    || (a.story_id ?? '').localeCompare(b.story_id ?? '')
    || a.id.localeCompare(b.id);
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
  const others = stories.filter((s) => !ladderIds.has(s.id));
  const pinned = others.filter((s) => PINNED_KINDS.has(s.story_kind ?? '')).slice().sort(boardOrder);
  const rest = others.filter((s) => !PINNED_KINDS.has(s.story_kind ?? '')).slice().sort(boardOrder);

  const ordered = [...pinned, ...rungsFound.map((r) => byRung.get(r)!), ...rest];

  // Keep the board's OWN numbering base rather than forcing 1. Production numbers from 0, so
  // renumbering from 1 would issue an UPDATE for all 598 rows across the ten boards to achieve
  // nothing, and bury the seventy rows that actually matter in a diff nobody can read.
  const lowest = stories.reduce((m, s) => Math.min(m, s.position), Number.POSITIVE_INFINITY);
  const base = Number.isFinite(lowest) ? lowest : 0;

  const positions: PositionChange[] = [];
  ordered.forEach((s, i) => {
    const to = base + i;
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
