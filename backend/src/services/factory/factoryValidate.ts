/**
 * factoryValidate — the deterministic machine gate. The LLM (Phase 2) never grades its own
 * output; this function does, with named rule codes ported from NuOrg. Errors block approval;
 * warnings are shown. Pure: no I/O, so it is trivially testable and its codes are stable
 * enough to test against. This is the "code does the deterministic work" half of the design.
 */
import type { FactoryProject, FactoryTask } from './contracts/factoryContract';
import { evaluateHumanAiStructure, type StructureFinding } from './humanAiStructure';
import { evaluatePerspective } from './factoryPerspective';
import { requiresNamedApprover, riskLevelFor } from './factoryTaskRisk';

export type Severity = 'error' | 'warning';
export interface ValidationIssue {
  code: string;
  message: string;
  stepId?: string;
  severity: Severity;
}

const err = (code: string, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'error' });
const warn = (code: string, message: string, stepId?: string): ValidationIssue =>
  ({ code, message, stepId, severity: 'warning' });

/** Returns every issue; an empty errors set means the project may be approved. */
export function factoryValidate(project: FactoryProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tasks = project.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const flowTasks = tasks.filter((t) => t.kind === 'TASK' || t.kind === 'DECISION');

  // WORK_REFERENCE — everything referenced must exist (checked first; later rules assume it).
  const processIds = new Set(project.processes.map((p) => p.id));
  for (const t of tasks) {
    if (t.process_id && !processIds.has(t.process_id)) {
      issues.push(err('WORK_REFERENCE', `task ${t.id} cites missing process ${t.process_id}`, t.id));
    }
  }
  for (const a of project.assignments) {
    if (!byId.has(a.task_id)) issues.push(err('WORK_REFERENCE', `assignment ${a.id} cites missing task ${a.task_id}`));
  }
  for (const e of project.transitions) {
    if (!byId.has(e.from_task_id) || !byId.has(e.to_task_id)) {
      issues.push(err('WORK_REFERENCE', `edge ${e.id} cites a missing task`));
    }
  }

  // SOURCE_CLASSIFICATION — no block may remain unresolved.
  for (const b of project.source_blocks) {
    if (b.kind === 'unresolved') issues.push(err('SOURCE_CLASSIFICATION', `source block ${b.id} is unresolved`));
  }

  // SOURCE_COVERAGE — every requirement block must be cited by at least one task.
  const cited = new Set<string>();
  for (const t of tasks) for (const blk of t.source_evidence) cited.add(blk);
  for (const b of project.source_blocks) {
    if (b.kind === 'requirement' && !cited.has(b.id)) {
      issues.push(err('SOURCE_COVERAGE', `requirement block ${b.id} is cited by no task`));
    }
  }

  // PERFORMER — every TASK/DECISION has a PERFORMER assignment.
  const performersByTask = new Map<string, number>();
  for (const a of project.assignments) {
    if (a.responsibility === 'PERFORMER') performersByTask.set(a.task_id, (performersByTask.get(a.task_id) ?? 0) + 1);
  }
  for (const t of flowTasks) {
    if (!performersByTask.get(t.id)) issues.push(err('PERFORMER', `task ${t.id} has no PERFORMER`, t.id));
  }

  // OVERSIGHT — an agent performer needs a human ACCOUNTABLE/APPROVER; a system may never BE
  // approver/accountable.
  const assignmentsByTask = new Map<string, typeof project.assignments>();
  for (const a of project.assignments) {
    const list = assignmentsByTask.get(a.task_id) ?? [];
    list.push(a);
    assignmentsByTask.set(a.task_id, list);
  }
  for (const a of project.assignments) {
    if (a.executor?.type === 'agent' && (a.responsibility === 'APPROVER' || a.responsibility === 'ACCOUNTABLE')) {
      issues.push(err('OVERSIGHT', `agent executor on ${a.task_id} may not be ${a.responsibility}`, a.task_id));
    }
  }
  for (const t of flowTasks) {
    const list = assignmentsByTask.get(t.id) ?? [];
    const hasAgentPerformer = list.some((a) => a.executor?.type === 'agent' && a.responsibility === 'PERFORMER');
    if (hasAgentPerformer) {
      const humanOversight = list.some(
        (a) => (a.executor?.type === 'person' || a.executor?.type === 'team')
          && (a.responsibility === 'ACCOUNTABLE' || a.responsibility === 'APPROVER'),
      );
      if (!humanOversight) issues.push(err('OVERSIGHT', `task ${t.id} has an agent performer but no human ACCOUNTABLE/APPROVER`, t.id));
    }
  }

  // HIGH_RISK_APPROVAL — risk R3 and up should name a human approver, WHOEVER performs the work.
  //
  // OVERSIGHT above keys on the performer being an agent, and that gap is not theoretical: on
  // 6 Nov the Herriman decomposition left the bid bond, the financial statements, the legal
  // documents and the insurance verification - every one R4, every one human-performed - with
  // nobody named to approve them. Those are exactly the documents a person signs.
  // `deliveryStoryContract` rejects every one of them downstream as
  // `high_risk_story_without_approval`, so this is not a new standard, only an earlier reading
  // of the existing one.
  //
  // A WARNING, NOT AN ERROR, AND THE REASON IS MEASURED. Shipped as an error it newly failed 27
  // tests across 8 suites: the lifecycle generation corpus asserts that fixtures A, B and C
  // compose with ZERO refusals, and each of them carries 8 high-risk tasks with no named
  // approver. Worse than the count, it broke other tests' CONTROLS - CONTROL 5 in
  // corpusControls proves that a below-target share raises BELOW_TARGET_UNEXPLAINED, and with
  // this firing as an error its refusal array no longer isolated that one signal. A rule that
  // destroys the discriminating power of neighboring controls costs more than it collects.
  //
  // THE CONSEQUENCE, STATED PLAINLY: a warning does NOT reach factoryRepair, which iterates
  // `factoryErrors`. So the decomposition prompt asks for an approver, the bridge derives the
  // policy from one, and this surfaces a missing one - but nothing yet FORCES it. Upgrading to
  // an error means re-baselining the generation corpus, which is its own change with its own
  // blast radius, and it is tracked separately rather than smuggled in here.
  for (const t of flowTasks) {
    if (!requiresNamedApprover(t)) continue;
    const list = assignmentsByTask.get(t.id) ?? [];
    // Deliberately DISJOINT from OVERSIGHT. An agent-performed task with no human approver is
    // already reported above, with its own remedy; emitting both would hand the repair loop two
    // findings for one missing assignment.
    if (list.some((a) => a.executor?.type === 'agent' && a.responsibility === 'PERFORMER')) continue;
    const namedApprover = list.some(
      (a) => (a.executor?.type === 'person' || a.executor?.type === 'team')
        && (a.responsibility === 'ACCOUNTABLE' || a.responsibility === 'APPROVER'),
    );
    if (!namedApprover) {
      issues.push(warn(
        'HIGH_RISK_APPROVAL',
        `task ${t.id} is ${riskLevelFor(t)} but names no human APPROVER/ACCOUNTABLE`,
        t.id,
      ));
    }
  }

  // DUPLICATE_ASSIGNMENT — no duplicate (task, role, responsibility).
  const seen = new Set<string>();
  for (const a of project.assignments) {
    const k = `${a.task_id}|${a.role_id}|${a.responsibility}`;
    if (seen.has(k)) issues.push(err('DUPLICATE_ASSIGNMENT', `duplicate ${a.responsibility} of role ${a.role_id} on ${a.task_id}`, a.task_id));
    seen.add(k);
  }

  // EFFORT_EVIDENCE — a number needs a basis.
  for (const t of tasks) {
    if (t.effort_minutes !== null && t.effort_basis === 'UNKNOWN') {
      issues.push(err('EFFORT_EVIDENCE', `task ${t.id} has minutes but basis UNKNOWN`, t.id));
    }
  }
  for (const a of project.assignments) {
    if (a.minutes !== null && a.basis === 'UNKNOWN') {
      issues.push(err('EFFORT_EVIDENCE', `assignment ${a.id} has minutes but basis UNKNOWN`, a.task_id));
    }
  }

  // Flow: START / END / REACHABILITY, BRANCH_KIND, LOOP.
  issues.push(...validateFlow(tasks, byId, project.transitions));

  // STAGE_LIMIT — at most 15 top-level stages.
  const stages = new Set(tasks.map((t) => t.stage_id).filter(Boolean));
  if (stages.size > 15) issues.push(warn('STAGE_LIMIT', `${stages.size} stages exceeds the 15 top-level limit`));

  // HUMAN/AI STRUCTURE (L10.2/L10.3) — reported, never blocking.
  //
  // WHY EVERY ONE OF THESE IS A WARNING, including the ones `humanAiStructure` itself calls
  // `blocking`. Until this commit the evaluator had NO production caller at all: it was built,
  // fully tested, and wired to nothing, so a decomposition could declare no teams and no
  // console and the gate would not mention it. Giving it a voice is the fix.
  //
  // Giving it a VETO is a different change, and a riskier one: every decomposition stored
  // before today has no teams and no surfaces, so promoting these to errors would retroactively
  // un-approve the existing corpus and block regeneration of the one live bid. The severity
  // mapping is deliberately the conservative half, and the evaluator's own `blockingFindings`
  // stays available for a caller that has earned the right to refuse.
  for (const f of structureFindings(project)) {
    issues.push(warn(`STRUCTURE_${f.rule}`, f.ref ? `${f.detail} (${f.ref})` : f.detail, f.ref ?? undefined));
  }

  // PERSPECTIVE (L10.4) — reported, never blocking, for the same reason as the block above.
  //
  // These catch a decomposition that is correctly classified and still written from the wrong
  // side of the table: our obligation to submit a proposal emitted as the buyer's task to
  // receive one. The prompt now forbids it; this is the half that does not depend on the model
  // having read the prompt.
  for (const f of evaluatePerspective({ tasks: project.tasks, source_blocks: project.source_blocks })) {
    issues.push(warn(`PERSPECTIVE_${f.rule}`, `${f.detail}`, f.ref));
  }

  return issues;
}

function validateFlow(
  tasks: FactoryTask[],
  byId: Map<string, FactoryTask>,
  edges: FactoryProject['transitions'],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const starts = tasks.filter((t) => t.kind === 'START');
  const ends = tasks.filter((t) => t.kind === 'END');
  if (starts.length !== 1) issues.push(err('START', `exactly one START required, found ${starts.length}`));
  if (ends.length < 1) issues.push(err('END', 'at least one END required'));

  const outByTask = new Map<string, typeof edges>();
  const inByTask = new Map<string, typeof edges>();
  for (const e of edges) {
    (outByTask.get(e.from_task_id) ?? outByTask.set(e.from_task_id, []).get(e.from_task_id)!).push(e);
    (inByTask.get(e.to_task_id) ?? inByTask.set(e.to_task_id, []).get(e.to_task_id)!).push(e);
  }

  for (const s of starts) if ((inByTask.get(s.id) ?? []).length) issues.push(err('START', `START ${s.id} has an inbound edge`, s.id));
  for (const e of ends) if ((outByTask.get(e.id) ?? []).length) issues.push(err('END', `END ${e.id} has an outbound edge`, e.id));

  // BRANCH_KIND / DECISION.
  for (const t of tasks) {
    const outs = outByTask.get(t.id) ?? [];
    if (outs.length >= 2 && t.kind !== 'DECISION') {
      issues.push(err('BRANCH_KIND', `task ${t.id} has ${outs.length} outgoing edges but is not a DECISION`, t.id));
    }
    if (t.kind === 'DECISION') {
      const labels = new Set(outs.map((e) => e.condition ?? ''));
      if (outs.length < 2 || labels.size < 2 || labels.has('')) {
        issues.push(err('DECISION', `DECISION ${t.id} needs >=2 distinct labeled outcomes`, t.id));
      }
    }
  }

  // REACHABILITY from the (single) START, over all edges.
  if (starts.length === 1) {
    const reached = new Set<string>();
    const stack = [starts[0].id];
    while (stack.length) {
      const id = stack.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);
      for (const e of outByTask.get(id) ?? []) stack.push(e.to_task_id);
    }
    for (const t of tasks) if (!reached.has(t.id)) issues.push(err('REACHABILITY', `task ${t.id} is unreachable from START`, t.id));
  }

  // LOOP — a cycle over NON-rework edges is an error; back-edges must be marked is_rework.
  const forward = edges.filter((e) => !e.is_rework);
  const fwdOut = new Map<string, string[]>();
  for (const e of forward) (fwdOut.get(e.from_task_id) ?? fwdOut.set(e.from_task_id, []).get(e.from_task_id)!).push(e.to_task_id);
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  let cycleFound = false;
  const dfs = (id: string) => {
    color.set(id, GREY);
    for (const nxt of fwdOut.get(id) ?? []) {
      const c = color.get(nxt) ?? WHITE;
      if (c === GREY) { cycleFound = true; return; }
      if (c === WHITE && byId.has(nxt)) dfs(nxt);
      if (cycleFound) return;
    }
    color.set(id, BLACK);
  };
  for (const t of tasks) if ((color.get(t.id) ?? WHITE) === WHITE) { dfs(t.id); if (cycleFound) break; }
  if (cycleFound) issues.push(err('LOOP', 'a cycle exists over non-rework edges (back-edges must be marked is_rework)'));

  return issues;
}

/**
 * The structure findings, with the evaluator's own severity preserved in the code prefix so a
 * consumer can tell "this would block once we turn it on" from "this is advice".
 */
function structureFindings(project: FactoryProject): StructureFinding[] {
  return evaluateHumanAiStructure({
    tasks: project.tasks,
    allocation: project.allocation ?? [],
    assignments: project.assignments,
    agent_teams: project.agent_teams,
    surfaces: project.surfaces,
  }).findings;
}

/** Convenience: just the blocking errors. */
export function factoryErrors(project: FactoryProject): ValidationIssue[] {
  return factoryValidate(project).filter((i) => i.severity === 'error');
}
