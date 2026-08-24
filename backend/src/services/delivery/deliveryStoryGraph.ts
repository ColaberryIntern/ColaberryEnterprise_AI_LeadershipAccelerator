/**
 * deliveryStoryGraph — readiness, cycles, parallel-safety and collision risk. PURE.
 *
 * Master plan §Gate 7 asks for four calculations: **ready, blocked, parallel-safe,
 * collision risk.** They are one module because they all read the same two relations —
 * dependencies and touched paths — and splitting them would mean walking the graph twice
 * with two chances to disagree.
 *
 * ## Why collision detection matters more here than in SBP
 *
 * `sbp/boundedQueue.ts` bounds how many things run at once. That is a *capacity* control
 * and it is already reused. This is a different question: of the stories that could run,
 * which ones would tread on each other?
 *
 * For a student, two builds touching one file is a merge conflict they resolve. Under a
 * delivery contract, two agent runs editing the same path concurrently produce a commit
 * nobody reviewed, in a client's repository. So parallel-safety is computed before
 * dispatch rather than discovered after it.
 *
 * The path comparison is deliberately conservative: a declared prefix overlap counts as a
 * collision. A false positive costs one story a slot; a false negative costs a client a
 * corrupted branch.
 */

import type { DeliveryStoryContract } from './deliveryStoryContract';

export type StoryState = 'ready' | 'blocked' | 'complete';

export interface StoryStatusInput {
  story: DeliveryStoryContract;
  complete: boolean;
}

export interface CycleReport {
  hasCycle: boolean;
  /** The story ids involved in a cycle, if any. */
  cycleMembers: string[];
}

/**
 * Detect dependency cycles.
 *
 * A cycle means no story in it can ever become ready — the plan is unbuildable, not
 * merely slow. `sbp/planGate.ts` treats a dangling `blocked_by` as blocking for the same
 * class of reason: it would write data that locks a task forever.
 *
 * Iterative depth-first search with an explicit stack rather than recursion, so a deep
 * or hostile graph cannot blow the call stack.
 */
export function findDependencyCycles(stories: DeliveryStoryContract[]): CycleReport {
  const graph = new Map<string, string[]>();
  for (const story of stories) {
    graph.set(story.storyId, (story.dependsOn ?? []).filter((d) => d !== story.storyId));
  }

  // A self-dependency is a cycle of one and is easy to miss above.
  const selfDependent = stories
    .filter((s) => (s.dependsOn ?? []).includes(s.storyId))
    .map((s) => s.storyId);

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  for (const id of graph.keys()) colour.set(id, WHITE);

  const members = new Set<string>(selfDependent);

  for (const start of graph.keys()) {
    if (colour.get(start) !== WHITE) continue;

    const stack: Array<{ id: string; path: string[] }> = [{ id: start, path: [] }];
    while (stack.length > 0) {
      const { id, path } = stack.pop()!;

      if (colour.get(id) === GREY) {
        colour.set(id, BLACK);
        continue;
      }
      if (colour.get(id) === BLACK) continue;

      colour.set(id, GREY);
      stack.push({ id, path });

      for (const next of graph.get(id) ?? []) {
        if (!graph.has(next)) continue; // dangling dependency; not a cycle
        if (colour.get(next) === GREY) {
          const from = path.indexOf(next);
          const loop = from === -1 ? [next, id] : [...path.slice(from), id];
          loop.forEach((m) => members.add(m));
        } else if (colour.get(next) === WHITE) {
          stack.push({ id: next, path: [...path, id] });
        }
      }
    }
  }

  return { hasCycle: members.size > 0, cycleMembers: [...members].sort() };
}

/** Dependencies naming a story that does not exist. Locks the dependent forever. */
export function findDanglingDependencies(
  stories: DeliveryStoryContract[],
): Array<{ storyId: string; missing: string }> {
  const known = new Set(stories.map((s) => s.storyId));
  return stories.flatMap((s) =>
    (s.dependsOn ?? [])
      .filter((d) => !known.has(d))
      .map((missing) => ({ storyId: s.storyId, missing })),
  );
}

export interface StoryStatus {
  storyId: string;
  state: StoryState;
  /** Dependencies that are not yet complete. */
  waitingOn: string[];
}

/**
 * Ready vs blocked.
 *
 * A story is ready when every dependency is complete. A **dangling** dependency leaves it
 * blocked rather than ready — the safe reading, since the alternative would let a story
 * run because its prerequisite was misspelled.
 */
export function computeStoryStatuses(inputs: StoryStatusInput[]): StoryStatus[] {
  const completeIds = new Set(inputs.filter((i) => i.complete).map((i) => i.story.storyId));
  const known = new Set(inputs.map((i) => i.story.storyId));

  return inputs.map(({ story, complete }) => {
    if (complete) return { storyId: story.storyId, state: 'complete' as const, waitingOn: [] };

    const waitingOn = (story.dependsOn ?? []).filter(
      (d) => !completeIds.has(d) || !known.has(d),
    );

    return {
      storyId: story.storyId,
      state: waitingOn.length === 0 ? ('ready' as const) : ('blocked' as const),
      waitingOn,
    };
  });
}

/** Do two declared path sets overlap? Prefix-aware and deliberately conservative. */
export function pathsCollide(a: readonly string[], b: readonly string[]): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '');
  for (const left of a.map(norm)) {
    for (const right of b.map(norm)) {
      if (left === right) return true;
      if (left.startsWith(`${right}/`) || right.startsWith(`${left}/`)) return true;
    }
  }
  return false;
}

export interface CollisionPair {
  a: string;
  b: string;
  paths: string[];
}

/** Every pair of stories whose declared paths overlap. */
export function findCollisions(stories: DeliveryStoryContract[]): CollisionPair[] {
  const collisions: CollisionPair[] = [];

  for (let i = 0; i < stories.length; i++) {
    for (let j = i + 1; j < stories.length; j++) {
      const left = stories[i];
      const right = stories[j];
      const leftPaths = left.touchesPaths ?? [];
      const rightPaths = right.touchesPaths ?? [];
      if (!pathsCollide(leftPaths, rightPaths)) continue;

      const shared = leftPaths.filter((p) =>
        rightPaths.some((q) => pathsCollide([p], [q])),
      );
      collisions.push({ a: left.storyId, b: right.storyId, paths: shared });
    }
  }

  return collisions;
}

export interface ParallelPlan {
  /** Stories safe to dispatch together right now. */
  parallelSafe: string[];
  /** Ready stories held back because they collide with something already dispatched. */
  deferred: Array<{ storyId: string; collidesWith: string }>;
  blocked: StoryStatus[];
}

/**
 * The dispatch plan: which ready stories may run together.
 *
 * Greedy and deterministic — stories are considered in the order given, and the first
 * claimant of a path wins. Determinism matters more than optimality here: the same
 * inputs must produce the same dispatch every time, or a rerun after a failure would
 * schedule differently and nobody could reproduce what happened.
 *
 * **A story that declares no paths is never treated as parallel-safe alongside others.**
 * Unknown reach is not the same as no reach, and an execution run with an undeclared
 * blast radius is exactly the one that should not be racing another.
 */
export function planParallelExecution(inputs: StoryStatusInput[]): ParallelPlan {
  const statuses = computeStoryStatuses(inputs);
  const byId = new Map(inputs.map((i) => [i.story.storyId, i.story]));

  const ready = statuses.filter((s) => s.state === 'ready');
  const parallelSafe: string[] = [];
  const deferred: ParallelPlan['deferred'] = [];
  const claimed: Array<{ storyId: string; paths: string[] }> = [];
  /**
   * Set when a dispatched story declared no paths. Tracked as a flag rather than as a
   * `'/'` path sentinel: `'/'` normalises to the empty string and then collides with
   * nothing, so the sentinel would have silently let other stories race the very run
   * whose reach is unknown.
   */
  let exclusiveClaimBy: string | null = null;

  for (const status of ready) {
    const story = byId.get(status.storyId)!;
    const paths = story.touchesPaths ?? [];

    if (exclusiveClaimBy) {
      deferred.push({ storyId: story.storyId, collidesWith: exclusiveClaimBy });
      continue;
    }

    if (paths.length === 0) {
      if (parallelSafe.length === 0) {
        // May run, but alone: nothing else joins this batch.
        parallelSafe.push(story.storyId);
        exclusiveClaimBy = story.storyId;
      } else {
        deferred.push({ storyId: story.storyId, collidesWith: '(undeclared paths)' });
      }
      continue;
    }

    const conflict = claimed.find((c) => pathsCollide(paths, c.paths));
    if (conflict) {
      deferred.push({ storyId: story.storyId, collidesWith: conflict.storyId });
    } else {
      parallelSafe.push(story.storyId);
      claimed.push({ storyId: story.storyId, paths });
    }
  }

  return {
    parallelSafe,
    deferred,
    blocked: statuses.filter((s) => s.state === 'blocked'),
  };
}
