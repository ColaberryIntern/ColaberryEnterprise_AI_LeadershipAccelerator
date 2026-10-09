/**
 * designAlternatives — 2 to 4 genuinely different interactive options, derived not generated.
 *
 * §4.5: "Each meaningful design decision offers 2-4 genuinely different interactive options
 * using domain-specific content. Queue/detail, case workspace, and exception-first command
 * center are useful patterns."
 *
 * ## No model call, on purpose
 *
 * Alternatives are a DETERMINISTIC PROJECTION of the process graph onto the three patterns §4.5
 * names. Two consequences, and both are the reason for the choice:
 *
 * 1. The comparator can be structural. "Do these two options actually differ?" becomes a
 *    question about which task sits behind which navigation hop, not a judgement about whether
 *    two paragraphs of prose read differently. The failure this guards against is the renamed
 *    dashboard: three options that differ only in what the screens are called.
 * 2. This phase has no unbounded loop. There is nothing to retry until it looks varied enough.
 *
 * ## Why no pattern is invented here
 *
 * The three patterns are exactly the three §4.5 names. A fourth would be this module's opinion
 * about UX dressed as a requirement, and an option list is the worst place to hide one, because
 * every option is presented to a human as a thing the system supports.
 *
 * ## Where the domain content comes from
 *
 * `surfaces` carries the workspace title, action and records VERBATIM from P4-T1's bindings.
 * This module never writes a screen name. "Domain-specific content" in §4.5 is a requirement
 * about what a human sees, and the only way to satisfy it honestly is to carry through what the
 * workspace mapping already declared about the project's own tasks.
 */

import { MAX_VARIANTS } from '../../delivery/deliveryDesignLoop';
import type { FactoryProject, FactoryTask } from '../../factory/contracts/factoryContract';
import { businessTasks } from './workspaceMapping';
import type { TaskSurfaceBinding, WorkspaceRef } from './workspaceBindingTypes';

/** The three patterns §4.5 names. Not a taxonomy this module invented. */
export const DESIGN_PATTERNS = ['queue_detail', 'case_workspace', 'exception_first'] as const;
export type DesignPatternKey = (typeof DESIGN_PATTERNS)[number];

/**
 * One navigable shape.
 *
 * A slot is a surface position, NOT a page name: `depth` is how many navigation hops from where
 * a human lands, and `taskIds` is which of the project's own tasks are reachable there. Those
 * two facts are the whole structure, and they are what the comparator reads.
 */
export interface DesignStructure {
  pattern: DesignPatternKey;
  slots: ReadonlyArray<{
    slotId: string;
    depth: number;
    taskIds: ReadonlyArray<string>;
    workspaceIds: ReadonlyArray<string>;
  }>;
  navigation: ReadonlyArray<{ fromSlotId: string; toSlotId: string }>;
}

export interface DesignAlternative {
  /** Deterministic: the pattern key decides it, so the same project yields the same ids. */
  alternativeId: string;
  pattern: DesignPatternKey;
  structure: DesignStructure;
  /** Carried from the bindings, never composed here. §4.5's "domain-specific content". */
  surfaces: ReadonlyArray<{
    taskId: string;
    workspaceId: string;
    workspaceTitle: string;
    action: string;
    records: ReadonlyArray<string>;
  }>;
}

/**
 * The generated set, plus WHY each absent pattern is absent.
 *
 * `excluded` exists so a caller — and a test — can tell "this pattern cannot apply to this
 * project" from "this pattern produced the same shape as another one". Inferring that from
 * `alternatives.length` is the mistake: a count cannot distinguish an inapplicable pattern from
 * a dead one, and a dead pattern is code nobody ever reaches.
 */
export interface AlternativeSet {
  alternatives: ReadonlyArray<DesignAlternative>;
  excluded: ReadonlyArray<{
    pattern: DesignPatternKey;
    why: 'inapplicable' | 'structurally_identical';
    detail: string;
  }>;
}

/** Bindings that put a task on a human surface. Headless tasks have no position in a design. */
function boundRefs(
  tasks: ReadonlyArray<FactoryTask>,
  bindings: ReadonlyArray<TaskSurfaceBinding>,
): Map<string, WorkspaceRef> {
  const ids = new Set(tasks.map((t) => t.id));
  const out = new Map<string, WorkspaceRef>();
  for (const b of bindings) {
    // No `typeof b.taskId` operand, for the same reason: `ids` is a set of strings, so a
    // non-string id fails `ids.has` anyway and the typeof could never be the operand that
    // decided an answer. Four operands remain and each has an isolating test.
    if (b && b.kind === 'workspace' && ids.has(b.taskId) && b.ref) {
      out.set(b.taskId, b.ref);
    }
  }
  return out;
}

/**
 * Tasks a human reaches first: no incoming edge from another BOUND task.
 *
 * Flow markers are excluded by construction, since `businessTasks` already dropped START/END and
 * only bound tasks are considered. A task whose only predecessor is START is therefore an entry.
 */
function entryTaskIds(project: FactoryProject, bound: Map<string, WorkspaceRef>): Set<string> {
  const hasBoundPredecessor = new Set<string>();
  const transitions = Array.isArray(project.transitions) ? project.transitions : [];
  for (const e of transitions) {
    // Only `from` is checked. A `bound.has(e.to_task_id)` operand here would be noise: the
    // result is consumed by a filter over `bound.keys()`, so an unbound id in this set can
    // never change an answer, which means no test could isolate that operand. Amendment 4
    // of this run’s standing rule — an operand with no possible isolating control is not a
    // guard, it is decoration that makes the guard look stronger than it is.
    if (e && bound.has(e.from_task_id)) hasBoundPredecessor.add(e.to_task_id);
  }
  return new Set([...bound.keys()].filter((id) => !hasBoundPredecessor.has(id)));
}

/**
 * Tasks on an exception or rework path: the target of a transition flagged `is_rework`.
 *
 * ## Why `ProcessRecord.exceptions` is NOT read here
 *
 * The obvious second source would be a task named in a process's `exceptions` list, and an
 * earlier draft of this module read it. It should not: `exceptions: string[]`
 * (`factoryContract.ts`) carries no doc comment, has **no reader anywhere in this repo**, and
 * every sibling field on that record — `inputs`, `outputs`, `decision_branches` — holds prose
 * rather than ids. Treating it as a task-id list would invent a contract for a field nobody
 * documented, and the invention would fail silently: free-text exception descriptions never
 * equal a task id, so `exception_first` would simply never fire and the cause would be invisible.
 *
 * `is_rework` is a typed boolean on a typed edge, which is why it is the only source. If a later
 * phase gives `ProcessRecord.exceptions` a documented meaning, this is where it joins.
 *
 * The returned set may name an unbound task, and that is fine: every caller filters it
 * against `bound.keys()`. A `bound.has` operand here would be un-isolatable - see
 * `entryTaskIds` above.
 */
function exceptionTaskIds(project: FactoryProject, bound: Map<string, WorkspaceRef>): Set<string> {
  const out = new Set<string>();
  for (const e of Array.isArray(project.transitions) ? project.transitions : []) {
    if (e && e.is_rework === true) out.add(e.to_task_id);
  }
  return out;
}

const slot = (slotId: string, depth: number, ids: ReadonlyArray<string>, bound: Map<string, WorkspaceRef>) => ({
  slotId,
  depth,
  taskIds: [...ids].sort(),
  workspaceIds: [...new Set(ids.map((id) => bound.get(id)!.workspaceId))].sort(),
});

/**
 * A pattern either produced a structure, or could not — and WHICH SIDE was empty is the reason.
 *
 * Collapsing both empties into one "inapplicable" would report the wrong cause: for
 * `queue_detail`, an empty front means every task sits behind another (a cycle through rework),
 * while an empty back means nothing sits behind anything. Those are opposite shapes.
 */
type Built = { structure: DesignStructure } | { empty: 'front' | 'back' };

/** Two slots, front one first. */
function twoSlot(
  pattern: DesignPatternKey,
  frontId: string,
  front: ReadonlyArray<string>,
  backId: string,
  back: ReadonlyArray<string>,
  bound: Map<string, WorkspaceRef>,
): Built {
  if (front.length === 0) return { empty: 'front' };
  if (back.length === 0) return { empty: 'back' };
  return {
    structure: {
      pattern,
      slots: [slot(frontId, 0, front, bound), slot(backId, 1, back, bound)],
      navigation: [{ fromSlotId: frontId, toSlotId: backId }],
    },
  };
}

/**
 * The label-independent shape of a structure.
 *
 * Deliberately built from TASK ids and depths, and deliberately NOT from workspace ids, slot
 * ids, titles or actions. Task ids come from the process graph upstream; everything else is
 * minted by the design step and can be renamed at will. A fingerprint that read a workspace id
 * would call "rename the dashboard" a different design, which is the exact failure §4.5's
 * "genuinely different" wording exists to prevent.
 */
function fingerprint(s: DesignStructure): string {
  return JSON.stringify(
    s.slots.map((x) => [x.depth, [...x.taskIds].sort()]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

/**
 * Do these two structures represent genuinely different designs?
 *
 * Exported because this is the claim worth testing directly. The generator and the comparator
 * are separate on purpose: a comparator only ever checked against structures the same module
 * generated proves the two agree, not that either is right.
 */
export function alternativesDifferMeaningfully(a: DesignStructure, b: DesignStructure): boolean {
  return fingerprint(a) !== fingerprint(b);
}

/**
 * Project a process graph and its workspace bindings onto the three patterns.
 *
 * Deterministic in both membership and order: patterns are tried in `DESIGN_PATTERNS` order and
 * every id list is sorted, so the same project yields the same set on every run.
 */
export function generateDesignAlternatives(
  project: FactoryProject,
  bindings: ReadonlyArray<TaskSurfaceBinding>,
): AlternativeSet {
  const tasks = businessTasks(project);
  const bound = boundRefs(tasks, Array.isArray(bindings) ? bindings : []);
  const all = [...bound.keys()].sort();

  const alternatives: DesignAlternative[] = [];
  const excluded: Array<AlternativeSet['excluded'][number]> = [];
  const seen = new Map<string, DesignPatternKey>();

  const entries = entryTaskIds(project, bound);
  const exceptions = exceptionTaskIds(project, bound);

  const candidates: ReadonlyArray<[DesignPatternKey, Built, Record<'front' | 'back', string>]> = [
    [
      'queue_detail',
      twoSlot('queue_detail', 'queue', all.filter((id) => entries.has(id)), 'detail',
        all.filter((id) => !entries.has(id)), bound),
      {
        front: 'every bound task sits behind another, so there is no entry point for a queue',
        back: 'no task sits behind another, so there is nothing for a queue to route into',
      },
    ],
    [
      'case_workspace',
      all.length === 0
        ? { empty: 'front' }
        : { structure: { pattern: 'case_workspace', slots: [slot('case', 0, all, bound)], navigation: [] } },
      {
        front: 'no task is bound to a human surface',
        back: 'no task is bound to a human surface',
      },
    ],
    [
      'exception_first',
      twoSlot('exception_first', 'exceptions', all.filter((id) => exceptions.has(id)), 'normal',
        all.filter((id) => !exceptions.has(id)), bound),
      {
        front: 'no bound task is the target of a rework transition',
        back: 'every bound task is an exception, so there is no normal path to put behind one',
      },
    ],
  ];

  for (const [pattern, built, why] of candidates) {
    if (!('structure' in built)) {
      excluded.push({ pattern, why: 'inapplicable', detail: why[built.empty] });
      continue;
    }
    const { structure } = built;
    const fp = fingerprint(structure);
    const twin = seen.get(fp);
    if (twin !== undefined) {
      excluded.push({
        pattern,
        why: 'structurally_identical',
        detail: `the same shape as '${twin}': the same tasks at the same navigation depth`,
      });
      continue;
    }
    seen.set(fp, pattern);
    alternatives.push({
      alternativeId: `alt-${pattern}`,
      pattern,
      structure,
      surfaces: structure.slots
        .flatMap((s) => s.taskIds)
        .map((taskId) => {
          const ref = bound.get(taskId)!;
          return {
            taskId,
            workspaceId: ref.workspaceId,
            workspaceTitle: ref.workspaceTitle,
            action: ref.action,
            records: Array.isArray(ref.records) ? [...ref.records] : [],
          };
        }),
    });
  }

  // The ceiling is reused from `deliveryDesignLoop` rather than restated, so there is one
  // definition of "more options slow a decision rather than improving it". Three named patterns
  // cannot breach a ceiling of four; the slice is here so adding a pattern cannot silently
  // breach it either.
  return { alternatives: alternatives.slice(0, MAX_VARIANTS), excluded };
}
