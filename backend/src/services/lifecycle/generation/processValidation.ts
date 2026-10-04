/**
 * P3-T2 — blueprint-layer process validation.
 *
 * `factoryValidate` already enforces fourteen rules, and reading it closed three of the four
 * cases this task was planned around: `DECISION` already requires >=2 distinct labelled outcomes
 * (a "missing branch"), `REACHABILITY` already rejects a task unreachable from START (an "orphan
 * task"), and `SOURCE_COVERAGE` already rejects a requirement block cited by no task. Implementing
 * those again would be duplication dressed as rigour.
 *
 * TWO GENUINE GAPS REMAIN, and this module is only those two:
 *
 *   1. UNBOUNDED REWORK. `LOOP` errors on a cycle over NON-rework edges, which means a back-edge
 *      marked `is_rework` is explicitly legal. And `TransitionEdge` carries no bound field — nor
 *      does any other factory contract type. So "send it back for revision" is today a cycle with
 *      NO ITERATION LIMIT AT ALL: legal, gate-passing, and able to run forever. CLAUDE.md
 *      prohibits retrying without an upper bound; this is that prohibition applied to a business
 *      process rather than to an HTTP call.
 *
 *   2. NON-TERMINATION. `REACHABILITY` asks whether a task can be reached FROM START. Nothing
 *      asks whether an END can be reached FROM a task. A task the process can enter and never
 *      leave passes the existing gate cleanly — the flow is fully reachable and still has a
 *      state it cannot get out of.
 *
 * The bound lives in the BLUEPRINT layer, passed alongside the project, because this task edits
 * no existing file: adding a field to `TransitionEdge` would change a contract four factory
 * modules depend on, which is a different task with a different blast radius.
 *
 * NO DATABASE, and `ValidationIssue` is reused verbatim rather than redeclared, so a consumer can
 * concatenate these issues with `factoryValidate`'s and render one list.
 */

import { factoryValidate, type ValidationIssue } from '../../factory/factoryValidate';
import type { FactoryProject } from '../../factory/contracts/factoryContract';

/**
 * Declared iteration bounds for rework edges, keyed by `TransitionEdge.id`.
 *
 * A missing entry is NOT treated as "unbounded is fine" — it is the violation. Defaulting an
 * absent bound to some number would invent a business rule nobody stated, and defaulting it to
 * infinity would make the rule unenforceable by omission.
 */
export type ReworkBounds = Readonly<Record<string, number>>;

/** The two codes this module adds. Distinct from `factoryValidate`'s fourteen. */
export const PROCESS_VALIDATION_CODES = ['REWORK_BOUND', 'TERMINATION'] as const;
export type ProcessValidationCode = (typeof PROCESS_VALIDATION_CODES)[number];

const err = (code: ProcessValidationCode, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });

/** Flow kinds a process actually moves through. START is included: it must also be able to finish. */
function isFlowOrStart(kind: string): boolean {
  return kind === 'TASK' || kind === 'DECISION' || kind === 'START';
}

/** Adjacency over every edge, in both directions, built once. */
function adjacency(project: FactoryProject): {
  out: Map<string, string[]>;
  into: Map<string, string[]>;
} {
  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const e of project.transitions) {
    (out.get(e.from_task_id) ?? out.set(e.from_task_id, []).get(e.from_task_id)!).push(e.to_task_id);
    (into.get(e.to_task_id) ?? into.set(e.to_task_id, []).get(e.to_task_id)!).push(e.from_task_id);
  }
  return { out, into };
}

/** Ids reachable from `start` following `edges`. Iterative: a deep flow must not blow the stack. */
function reachableFrom(start: string, edges: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of edges.get(id) ?? []) stack.push(next);
  }
  return seen;
}

/**
 * Rework edges that actually close a cycle.
 *
 * An edge flagged `is_rework` that does NOT close a cycle needs no bound — it is just an edge
 * someone labelled pessimistically, and demanding a bound for it would train people to write
 * meaningless numbers. The test is whether the edge's destination can get back to its origin.
 */
export function cyclingReworkEdges(project: FactoryProject): FactoryProject['transitions'] {
  const { out } = adjacency(project);
  return project.transitions.filter(
    (e) => e.is_rework && reachableFrom(e.to_task_id, out).has(e.from_task_id),
  );
}

/**
 * Flow tasks from which no END is reachable.
 *
 * Computed by reverse reachability from every END at once, then complemented — one traversal
 * rather than one per task. Rework edges count as traversable: they are real paths a process can
 * take, and a flow that can only terminate by going backwards still terminates.
 */
export function tasksThatCannotTerminate(project: FactoryProject): string[] {
  const ends = project.tasks.filter((t) => t.kind === 'END');
  const flow = project.tasks.filter((t) => isFlowOrStart(t.kind));

  // With no END at all, `factoryValidate`'s END rule is already erroring. Reporting every task
  // here as well would bury that one real cause under n derived ones.
  if (ends.length === 0) return [];

  const { into } = adjacency(project);
  const canTerminate = new Set<string>();
  for (const e of ends) for (const id of reachableFrom(e.id, into)) canTerminate.add(id);

  return flow.filter((t) => !canTerminate.has(t.id)).map((t) => t.id);
}

/**
 * Validate a generated process at the blueprint layer.
 *
 * Returns `factoryValidate`'s issues FIRST, then this module's. The order matters for reading: a
 * missing task reference explains a dozen downstream complaints, so the cause should appear above
 * its symptoms.
 */
export function validateProcess(
  project: FactoryProject,
  bounds: ReworkBounds = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [...factoryValidate(project)];

  // REWORK_BOUND — every rework cycle declares a finite, positive, whole iteration limit.
  for (const e of cyclingReworkEdges(project)) {
    const declared = Object.prototype.hasOwnProperty.call(bounds, e.id)
      ? bounds[e.id]
      : undefined;

    if (declared === undefined) {
      issues.push(err(
        'REWORK_BOUND',
        `rework edge ${e.id} (${e.from_task_id} -> ${e.to_task_id}) closes a cycle with no declared `
        + 'iteration bound. An unbounded rework loop can run forever.',
        e.from_task_id,
      ));
      continue;
    }
    if (!Number.isFinite(declared) || !Number.isInteger(declared) || declared < 1) {
      issues.push(err(
        'REWORK_BOUND',
        `rework edge ${e.id} declares an iteration bound of ${String(declared)}, which is not a `
        + 'whole number >= 1. A bound of 0 is not "bounded" — it is a loop that cannot be entered, '
        + 'and a non-integer or infinite bound is not a bound at all.',
        e.from_task_id,
      ));
    }
  }

  // TERMINATION — every flow task can reach an END.
  for (const id of tasksThatCannotTerminate(project)) {
    issues.push(err(
      'TERMINATION',
      `task ${id} cannot reach any END. The process can enter this state and never finish — `
      + 'reachability FROM START does not imply a path TO an end.',
      id,
    ));
  }

  return issues;
}

/** Convenience: just the blocking errors. Mirrors `factoryErrors` so callers read the same way. */
export function processErrors(
  project: FactoryProject,
  bounds: ReworkBounds = {},
): ValidationIssue[] {
  return validateProcess(project, bounds).filter((i) => i.severity === 'error');
}
