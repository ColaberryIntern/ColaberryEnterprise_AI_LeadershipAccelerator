/**
 * P3-T3 — allocation and accountability.
 *
 * THE GAP HERE IS TOTAL, NOT PARTIAL, verified three ways:
 *   - `factoryAssemble.ts:65-66` defaults `allocation` and `role_map` to `[]`.
 *   - `FACTORY_DECOMPOSITION_JSON_SCHEMA` omits both entirely, so the model is structurally
 *     incapable of emitting them.
 *   - `factoryDecomposeRun.ts` never passes them. The only non-empty allocation in the repo is a
 *     hand-authored fixture.
 *
 * `AllocationRow` has existed in the contract all along (`factoryContract.ts:224-229`) with
 * exactly the four execution classes the request names. It has no PRODUCER. This module is its
 * first one, which is why it adopts that shape rather than inventing a parallel one.
 *
 * WHAT IS ALREADY ENFORCED UPSTREAM, and is therefore delegated rather than rewritten:
 *   - `OVERSIGHT` (`factoryValidate.ts:68-91`) already refuses an agent holding ACCOUNTABLE or
 *     APPROVER, in both directions, and already requires a human accountable/approver on any task
 *     with an agent PERFORMER. That is the hard part of accountability and it works.
 *
 * WHAT IS NOT, and this module owns:
 *   - `PERFORMER` fires ONLY on zero performers. It builds a count map at `factoryValidate.ts:60-64`
 *     and then tests `if (!performersByTask.get(t.id))`, so the count is computed and thrown away:
 *     TWO performers on one task pass silently today. The repo's own UI agrees — the label at
 *     `factoryProjectView.ts:92` reads "Every task has A performer" and `:84` uses `.find()`,
 *     quietly ignoring a second. §4.3 requires one PRIMARY performer, so this module enforces it
 *     HERE rather than by tightening the shared validator: tightening it would newly reject
 *     already-stored factory projects carrying two performers, turning this task into an unplanned
 *     data migration. The factory-path looseness is a recorded Phase 7 gap.
 *   - Nothing requires an allocation row to exist at all, nor a rationale on it.
 *   - Nothing CONNECTS `data_sensitivity` to the allocation. The field is already required on
 *     every task with four members and no 'unknown' (`factoryContract.ts:63`), so a
 *     presence check would be inert — it could never fire on typed input. The real gap is that a
 *     'regulated' task can be allocated 'ai_autonomous' today and every gate passes.
 *
 * NOT IN THIS TASK, and recorded rather than quietly skipped: §4.3's `tool_needs` has no field
 * (the nearest, `required_skills`, is skill ids from the ontology, not tools) and belongs to T4,
 * which builds the tool registry. §4.3's `evidence_required` also has no field — `source_evidence`
 * is where a task CAME FROM, not what would show it is done — and is a carried-forward gap.
 *
 * NO DATABASE. Pure functions over values; `ValidationIssue` is reused verbatim so these issues
 * concatenate with `factoryValidate`'s and `processValidation`'s into one list.
 */

import type { ValidationIssue } from '../../factory/factoryValidate';
import type {
  FactoryProject,
  FactoryTask,
  AllocationRow,
  Assignment,
} from '../../factory/contracts/factoryContract';

/** The four execution classes, exactly as `AllocationRow` already declares them. */
export const EXECUTION_CLASSES = [
  'human',
  'ai_with_approval',
  'ai_autonomous',
  'deterministic_software',
] as const;
export type ExecutionClass = (typeof EXECUTION_CLASSES)[number];

/** Classes that put an AI in the performing seat. Both require human accountability. */
const AI_CLASSES: ReadonlySet<ExecutionClass> = new Set<ExecutionClass>([
  'ai_with_approval',
  'ai_autonomous',
]);

/** Executor types that can carry accountability. An agent is deliberately absent. */
const HUMAN_EXECUTORS: ReadonlySet<string> = new Set(['person', 'team']);

/**
 * Data classes that may not be handled by an unsupervised agent.
 *
 * `data_sensitivity` is already a REQUIRED field with no 'unknown' member, so the gap was never
 * that it might be missing — it is that nothing connected it to the allocation.
 */
const SENSITIVE_DATA: ReadonlySet<string> = new Set(['confidential', 'regulated']);

/**
 * Decision authorities too consequential to allocate to autonomy.
 *
 * `decide_full` is unbounded authority; `decide_bounded` is still a decision rather than a
 * recommendation. 'none' and 'recommend' are fine for an autonomous agent — a recommendation a
 * human acts on is not a decision the agent took.
 */
const IRREVERSIBLE_AUTHORITY: ReadonlySet<string> = new Set(['decide_bounded', 'decide_full']);

export const ALLOCATION_CODES = [
  'ALLOCATION_MISSING',
  'ALLOCATION_DUPLICATE',
  'ALLOCATION_CLASS',
  'ALLOCATION_RATIONALE',
  'ALLOCATION_ACCOUNTABLE',
  'PERFORMER_SINGULAR',
  'SENSITIVITY_AUTONOMY',
  'TASK_FIELDS',
] as const;
export type AllocationCode = (typeof ALLOCATION_CODES)[number];

const err = (code: AllocationCode, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });

/** Tasks that carry work. START/END are structure, not work, and are not allocated. */
function workTasks(project: FactoryProject): FactoryTask[] {
  return project.tasks.filter((t) => t.kind === 'TASK' || t.kind === 'DECISION');
}

function assignmentsByTask(project: FactoryProject): Map<string, Assignment[]> {
  const byTask = new Map<string, Assignment[]>();
  for (const a of project.assignments) {
    (byTask.get(a.task_id) ?? byTask.set(a.task_id, []).get(a.task_id)!).push(a);
  }
  return byTask;
}

/**
 * Derive an execution class from the performing assignment.
 *
 * Returns `null` — not a guess — when there is no performer or no executor. An unknown allocation
 * must stay visible: `lifecyclePrerequisites`' `allocation_unknown` rule exists precisely so an
 * unknown blocks full approval while still permitting a draft, and defaulting to `human` here
 * would make a blank look like a decision somebody took.
 */
export function deriveExecutionClass(assignments: ReadonlyArray<Assignment>): ExecutionClass | null {
  const performer = assignments.find((a) => a.responsibility === 'PERFORMER');
  if (!performer || !performer.executor) return null;

  if (performer.executor.type === 'agent') {
    // An agent performer with a human APPROVER on the same task is a review gate, not autonomy.
    const approved = assignments.some(
      (a) => a.responsibility === 'APPROVER'
        && a.executor !== null
        && HUMAN_EXECUTORS.has(a.executor.type),
    );
    return approved ? 'ai_with_approval' : 'ai_autonomous';
  }
  return 'human';
}

/**
 * Role ids that some assignment fills with a person or a team.
 *
 * "Resolvable accountable human" means exactly this: a role that a human actually occupies on
 * this project. A role that exists in `roles` but nobody fills is a name, not an accountability.
 */
export function humanlyFilledRoleIds(project: FactoryProject): Set<string> {
  const ids = new Set<string>();
  for (const a of project.assignments) {
    if (a.executor && HUMAN_EXECUTORS.has(a.executor.type)) ids.add(a.role_id);
  }
  return ids;
}

/**
 * Propose an allocation for every work task whose class can be read off its assignments.
 *
 * A proposal, not a decision: this only reports what the assignments already say. A task whose
 * class cannot be derived is OMITTED rather than defaulted — and the omission is what
 * `unknownAllocationCount` counts, so it surfaces as `allocation_unknown` and blocks full
 * approval instead of disappearing. Emitting a row with a guessed `human` class would turn a
 * blank into something that looks like a decision somebody took.
 */
export function deriveAllocation(project: FactoryProject): AllocationRow[] {
  const byTask = assignmentsByTask(project);
  const rows: AllocationRow[] = [];

  for (const t of workTasks(project)) {
    const assignments = byTask.get(t.id) ?? [];
    const cls = deriveExecutionClass(assignments);
    if (cls === null) continue;

    const accountable = assignments.find(
      (a) => (a.responsibility === 'ACCOUNTABLE' || a.responsibility === 'APPROVER')
        && a.executor !== null
        && HUMAN_EXECUTORS.has(a.executor.type),
    );

    rows.push({
      task_id: t.id,
      execution_class: cls,
      rationale: `derived from the ${cls === 'human' ? 'human' : 'agent'} PERFORMER assignment`,
      accountable_role_id: accountable?.role_id ?? null,
    });
  }
  return rows;
}

/** Work tasks with no usable allocation row. Feeds `lifecyclePrerequisites.unknownAllocationCount`. */
export function unknownAllocationCount(
  project: FactoryProject,
  allocation: ReadonlyArray<AllocationRow>,
): number {
  const allocated = new Set(
    allocation
      .filter((r) => (EXECUTION_CLASSES as ReadonlyArray<string>).includes(r.execution_class))
      .map((r) => r.task_id),
  );
  return workTasks(project).filter((t) => !allocated.has(t.id)).length;
}

/**
 * Validate an allocation against its project.
 *
 * An EMPTY allocation yields `ALLOCATION_MISSING` per task — it does not throw and does not pass.
 * That is the "draft permitted, full approval refused" split: these are blocking issues for
 * approval, while a draft may be saved carrying them.
 */
export function validateAllocation(
  project: FactoryProject,
  allocation: ReadonlyArray<AllocationRow>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byTask = assignmentsByTask(project);
  const humanRoles = humanlyFilledRoleIds(project);
  const work = workTasks(project);
  const workIds = new Set(work.map((t) => t.id));

  const rowsByTask = new Map<string, AllocationRow[]>();
  for (const r of allocation) {
    (rowsByTask.get(r.task_id) ?? rowsByTask.set(r.task_id, []).get(r.task_id)!).push(r);
  }

  for (const t of work) {
    const rows = rowsByTask.get(t.id) ?? [];

    if (rows.length === 0) {
      issues.push(err('ALLOCATION_MISSING', `task ${t.id} has no allocation row. An unallocated task is an undecided one, not a human one.`, t.id));
    } else if (rows.length > 1) {
      issues.push(err('ALLOCATION_DUPLICATE', `task ${t.id} has ${rows.length} allocation rows; exactly one is required.`, t.id));
    }

    for (const r of rows) {
      if (!(EXECUTION_CLASSES as ReadonlyArray<string>).includes(r.execution_class)) {
        issues.push(err('ALLOCATION_CLASS', `task ${t.id} has execution class '${String(r.execution_class)}', which is not one of ${EXECUTION_CLASSES.join(', ')}.`, t.id));
        continue;
      }
      if (r.rationale.trim() === '') {
        issues.push(err('ALLOCATION_RATIONALE', `task ${t.id} is allocated '${r.execution_class}' with no rationale. "All human" is a recorded decision, not a blank field.`, t.id));
      }
      // AI work needs a nameable, humanly-filled accountable role. OVERSIGHT already refuses an
      // AGENT holding the seat; this refuses the seat being EMPTY or filled by a role nobody holds.
      if (AI_CLASSES.has(r.execution_class as ExecutionClass)) {
        if (r.accountable_role_id === null) {
          issues.push(err('ALLOCATION_ACCOUNTABLE', `task ${t.id} is allocated '${r.execution_class}' with no accountable role. AI work without a named human is unaccountable by construction.`, t.id));
        } else if (!humanRoles.has(r.accountable_role_id)) {
          issues.push(err('ALLOCATION_ACCOUNTABLE', `task ${t.id} names accountable role ${r.accountable_role_id}, which no person or team fills on this project. A role nobody holds is a name, not an accountability.`, t.id));
        }
      }
    }

    // PERFORMER_SINGULAR — the half `PERFORMER` computes and discards.
    const performers = (byTask.get(t.id) ?? []).filter((a) => a.responsibility === 'PERFORMER');
    if (performers.length > 1) {
      issues.push(err('PERFORMER_SINGULAR', `task ${t.id} has ${performers.length} PERFORMER assignments; §4.3 requires one primary performer. factoryValidate counts performers but only rejects zero.`, t.id));
    }

    // SENSITIVITY_AUTONOMY — the substantive §4.3 rule.
    //
    // `data_sensitivity` is ALREADY a required field on FactoryTask with four members and no
    // 'unknown' (`factoryContract.ts:63`), so a presence check here would be inert in typed code —
    // it could never fire. The real gap is that nothing connects the field to the allocation:
    // today a 'regulated' task can be allocated 'ai_autonomous' and every gate passes.
    for (const r of rows) {
      if (r.execution_class === 'ai_autonomous' && SENSITIVE_DATA.has(t.data_sensitivity)) {
        issues.push(err('SENSITIVITY_AUTONOMY', `task ${t.id} handles ${t.data_sensitivity} data and is allocated 'ai_autonomous'. Sensitive data requires a human in the loop: use 'ai_with_approval' or state why not.`, t.id));
      }
      if (r.execution_class === 'ai_autonomous' && IRREVERSIBLE_AUTHORITY.has(t.decision_authority)) {
        issues.push(err('SENSITIVITY_AUTONOMY', `task ${t.id} carries '${t.decision_authority}' decision authority and is allocated 'ai_autonomous'. A high-consequence decision may not be reclassified into autonomy.`, t.id));
      }
    }

    // TASK_FIELDS — effort without frequency cannot be totalled, which T5 depends on.
    if (t.frequency === null && t.effort_minutes !== null) {
      issues.push(err('TASK_FIELDS', `task ${t.id} carries effort minutes but no frequency, so its contribution to the totals cannot be computed.`, t.id));
    }
  }

  // Rows for tasks that are not work tasks at all.
  for (const r of allocation) {
    if (!workIds.has(r.task_id)) {
      issues.push(err('ALLOCATION_MISSING', `allocation cites task ${r.task_id}, which is not a TASK or DECISION in this project.`, r.task_id));
    }
  }

  return issues;
}

/** Convenience mirroring `factoryErrors`/`processErrors`. */
export function allocationErrors(
  project: FactoryProject,
  allocation: ReadonlyArray<AllocationRow>,
): ValidationIssue[] {
  return validateAllocation(project, allocation).filter((i) => i.severity === 'error');
}
