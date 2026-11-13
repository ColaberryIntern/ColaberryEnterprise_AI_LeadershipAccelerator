/**
 * humanAiStructure — are the AI tasks grouped into real agent teams, and do the human tasks
 * land on one surface? PURE. No I/O.
 *
 * ## The two failures this exists to make visible
 *
 * 1. **The generic blob.** Before `AgentTeam`, every AI task could sit under one unnamed agent.
 *    Nobody owns an unnamed agent, no subject bounds it, and "the AI does it" is not a statement
 *    anyone can review. An agent that owns one subject can be judged; one that owns everything
 *    cannot.
 *
 * 2. **One screen per role.** Human tasks had an owner and no DESTINATION, so the only grouping
 *    primitive downstream was the role, and a generated app grew a screen and a login per role
 *    with a handoff between each. That app was actually shipped by the first cohort. Nothing in
 *    the contract prevented it, which is the real defect — not the app.
 *
 * ## ABSENCE IS REPORTED, NEVER PASSED
 *
 * `agent_teams` and `surfaces` are optional on `FactoryProject`, because four decompositions in
 * production predate them. A validator that returns "no findings" for a project that declared
 * nothing would convert "we never structured this" into "this is correctly structured" — the
 * exact false zero this codebase keeps producing. So `structured` is a separate field from
 * `passes`, and an unstructured project reports `STRUCTURE_ABSENT` rather than a clean result.
 *
 * ## It fails closed on trust, deliberately matching Gate 5
 *
 * `delivery/deliveryTrustGate` requires all six INPACT dimensions of a production-bound agent and
 * treats a missing dimension as unaddressed rather than not-applicable. A team allowed to run
 * `agent_autonomous` is production-bound by definition, so the same rule applies here rather than
 * a softer local one. Copying the standard is the point; a second, kinder bar would be a way
 * around the first.
 */

import { INPACT_DIMENSIONS, type InpactDimension } from '../../modules/delivery/inpact';
import { AUTONOMY_STAGES } from '../agentDomain/autonomyLadder';
import type { FactoryProject, AgentTeam, Surface, AllocationRow } from './contracts/factoryContract';

/** Execution classes that mean an agent performs the work. */
const AI_CLASSES: ReadonlyArray<AllocationRow['execution_class']> = ['ai_with_approval', 'ai_autonomous'];

export interface StructureFinding {
  /** Stable rule id, so a consumer can filter without matching prose. */
  rule: string;
  severity: 'blocking' | 'warning';
  /** The team, task or surface id the finding is about, when it is about one. */
  ref: string | null;
  detail: string;
}

export interface StructureResult {
  /** Did the project declare teams or surfaces AT ALL. Separate from `passes` on purpose. */
  structured: boolean;
  passes: boolean;
  findings: StructureFinding[];
  blockingFindings: StructureFinding[];
  /** Surfaces of kind `console`. The "one console" claim is this number being 1. */
  consoleCount: number;
  aiTasksWithoutTeam: string[];
  humanTasksWithoutSurface: string[];
}

/** What the evaluator reads. Narrow, so a test does not have to build a whole project. */
export type StructureInput = Pick<
  FactoryProject,
  'tasks' | 'allocation' | 'assignments' | 'agent_teams' | 'surfaces'
>;

function finding(rule: string, severity: StructureFinding['severity'], ref: string | null, detail: string): StructureFinding {
  return { rule, severity, ref, detail };
}

/** Case- and whitespace-insensitive subject key, so "Pricing" and "pricing " are one subject. */
function subjectKey(subject: string): string {
  return subject.trim().toLowerCase();
}

function checkTeamIntegrity(teams: readonly AgentTeam[], out: StructureFinding[]): void {
  const seenSubject = new Map<string, string>();
  const taskOwner = new Map<string, string>();

  for (const team of teams) {
    if (!team.subject || !team.subject.trim()) {
      out.push(finding('SUBJECT_REQUIRED', 'blocking', team.id,
        `Team "${team.name}" declares no subject. A team without a subject is the generic blob under a nicer name.`));
    } else {
      const key = subjectKey(team.subject);
      const prior = seenSubject.get(key);
      if (prior) {
        out.push(finding('SUBJECT_UNIQUE', 'blocking', team.id,
          `Teams ${prior} and ${team.id} both claim subject "${team.subject.trim()}". One subject, one agent.`));
      } else {
        seenSubject.set(key, team.id);
      }
    }

    for (const taskId of team.task_ids) {
      const prior = taskOwner.get(taskId);
      if (prior) {
        out.push(finding('TASK_ONE_TEAM', 'blocking', taskId,
          `Task ${taskId} is claimed by both ${prior} and ${team.id}. A task belongs to at most one team.`));
      } else {
        taskOwner.set(taskId, team.id);
      }
    }

    for (const dim of team.trust_dimensions) {
      if (!INPACT_DIMENSIONS.includes(dim as InpactDimension)) {
        out.push(finding('TRUST_DIMENSION_UNKNOWN', 'blocking', team.id,
          `"${dim}" is not an INPACT dimension. The six are ${INPACT_DIMENSIONS.join(', ')}.`));
      }
    }

    if (team.autonomy_stage !== null && !AUTONOMY_STAGES.includes(team.autonomy_stage)) {
      out.push(finding('AUTONOMY_STAGE_UNKNOWN', 'blocking', team.id,
        `autonomy_stage "${team.autonomy_stage}" is not a namespaced stage. A bare R3 is a delivery RISK tier, not an autonomy level.`));
    }
    if (team.autonomy_stage === null) {
      out.push(finding('AUTONOMY_STAGE_UNASSESSED', 'warning', team.id,
        `Team "${team.name}" has no autonomy stage. Unassessed is a gap to close, never a level to assume.`));
    }
  }
}

/**
 * The two ways an approver role can involve an agent, which are NOT the same finding.
 *
 * `oversight` holds roles where an agent actually holds APPROVER or ACCOUNTABLE — a system signing
 * off, which is the violation this rule was written for. `performer` holds roles where an agent
 * merely DOES the work. Until 2026-11-06 the rule used one set for both and so fired on the second
 * case as though it were the first.
 *
 * The production case that forced the split: the 6 Nov Herriman regeneration gave
 * `role-proposal_manager` an AGENT as PERFORMER on two tasks and a PERSON as APPROVER on three. The
 * oversight was real and human; the model had simply reused one role label for both sides of it.
 * Calling that "a system may never be the approver" was false, and had the rule been promoted to
 * blocking on the strength of it — which is what I was about to recommend — it would have rejected
 * a sound decomposition over a naming collision.
 */
interface AgentRoleSets {
  readonly oversight: ReadonlySet<string>;
  readonly performer: ReadonlySet<string>;
}

function checkOversight(
  teams: readonly AgentTeam[],
  agentRoles: AgentRoleSets,
  out: StructureFinding[],
): void {
  for (const team of teams) {
    if (!team.approver_role_id) {
      // An autonomous team with no approver is the one the renderer badges "AI, NO APPROVER".
      // It is still a finding: somebody chose it, and the choice should be visible, not implied.
      out.push(finding('APPROVER_MISSING',
        team.execution_policy === 'agent_autonomous' ? 'warning' : 'blocking',
        team.id,
        `Team "${team.name}" has no human approver while running ${team.execution_policy}.`));
    } else if (agentRoles.oversight.has(team.approver_role_id)) {
      out.push(finding('APPROVER_IS_AGENT', 'blocking', team.id,
        `Team "${team.name}" names ${team.approver_role_id} as approver, and an agent holds APPROVER or ACCOUNTABLE under that role. A system may never be the approver.`));
    } else if (agentRoles.performer.has(team.approver_role_id)) {
      // A WEAKER CLAIM, DELIBERATELY. Nothing here says a system approved anything: a person may
      // hold the approval and the decomposition still be unreadable, because the role name alone
      // no longer tells a reviewer which side of the handoff it refers to. That is worth saying
      // and not worth refusing over.
      out.push(finding('APPROVER_ROLE_SHARED_WITH_AGENT', 'warning', team.id,
        `Team "${team.name}" names ${team.approver_role_id} as approver, and an agent also PERFORMS work under that same role. The approval may still be a person's, but the role no longer distinguishes the worker from the reviewer; give the human approver a role of their own.`));
    }

    if (team.execution_policy === 'agent_autonomous') {
      const addressed = new Set(team.trust_dimensions);
      const missing = INPACT_DIMENSIONS.filter((d) => !addressed.has(d));
      if (missing.length) {
        out.push(finding('TRUST_INCOMPLETE_FOR_AUTONOMOUS', 'blocking', team.id,
          `Team "${team.name}" runs autonomously with ${missing.length} INPACT dimension(s) unaddressed: ${missing.join(', ')}.`));
      }
    }
  }
}

function checkSurfaces(surfaces: readonly Surface[], out: StructureFinding[]): number {
  const consoles = surfaces.filter((s) => s.kind === 'console');
  if (consoles.length > 1) {
    out.push(finding('ONE_CONSOLE', 'blocking', null,
      `${consoles.length} console surfaces: ${consoles.map((c) => c.name).join(', ')}. Every console past the first is a second login.`));
  }
  if (consoles.length === 0 && surfaces.length > 0) {
    out.push(finding('NO_CONSOLE', 'warning', null,
      'Human tasks land only on external surfaces. Nothing here is a surface this system builds.'));
  }

  // TASK_ONE_SURFACE — the half of "exactly one surface" that nothing was checking.
  //
  // `HUMAN_TASK_WITHOUT_SURFACE` covers "at least one": it flattens every surface's task_ids into
  // one Set and reports the tasks missing from it. A Set cannot see a task that lands TWICE, so
  // the "at most one" half was unenforceable. The decomposition prompt already states the rule to
  // the model ("Every task allocated human MUST appear in exactly one surface's task_ids"), which
  // means a violation was a contract breach the evaluator had no way to name.
  //
  // It matters for the same reason `TASK_ONE_TEAM` does, which teams have carried from the start.
  // One human task with two destinations is the per-role screen this contract exists to prevent,
  // arriving by a different route: whoever builds the UI now has two places to put the same work
  // and a handoff between them.
  const surfaceOwner = new Map<string, string>();
  for (const surface of surfaces) {
    for (const taskId of surface.task_ids) {
      const prior = surfaceOwner.get(taskId);
      if (prior) {
        out.push(finding('TASK_ONE_SURFACE', 'blocking', taskId,
          `Task ${taskId} lands on both ${prior} and ${surface.id}. A human task has exactly one destination.`));
      } else {
        surfaceOwner.set(taskId, surface.id);
      }
    }
  }

  return consoles.length;
}

/**
 * Evaluate the agent-team and surface structure of a decomposed project.
 *
 * Reports EVERY finding rather than the first: a caller learning one problem per run is the
 * round trip worth avoiding, and the same reasoning already governs the decomposition runner.
 */
export function evaluateHumanAiStructure(input: StructureInput): StructureResult {
  const findings: StructureFinding[] = [];
  const teams = input.agent_teams ?? [];
  const surfaces = input.surfaces ?? [];
  const structured = input.agent_teams !== undefined || input.surfaces !== undefined;

  if (!structured) {
    findings.push(finding('STRUCTURE_ABSENT', 'blocking', null,
      'This project declares no agent teams and no surfaces. Unstructured is not the same as correctly structured.'));
  }

  const classOf = new Map(input.allocation.map((a) => [a.task_id, a.execution_class]));
  const agentAssignments = input.assignments.filter((a) => a.executor?.type === 'agent');
  const agentRoles: AgentRoleSets = {
    oversight: new Set(agentAssignments
      .filter((a) => a.responsibility === 'APPROVER' || a.responsibility === 'ACCOUNTABLE')
      .map((a) => a.role_id)),
    performer: new Set(agentAssignments.map((a) => a.role_id)),
  };

  checkTeamIntegrity(teams, findings);
  checkOversight(teams, agentRoles, findings);
  const consoleCount = checkSurfaces(surfaces, findings);

  const teamTaskIds = new Set(teams.flatMap((t) => t.task_ids));
  const surfaceTaskIds = new Set(surfaces.flatMap((s) => s.task_ids));

  // A team may not claim work a human performs. The team is the AI half by definition.
  for (const team of teams) {
    for (const taskId of team.task_ids) {
      if (classOf.get(taskId) === 'human') {
        findings.push(finding('TEAM_CLAIMS_HUMAN_TASK', 'blocking', taskId,
          `Team "${team.name}" claims ${taskId}, which is classed human.`));
      }
    }
  }

  const aiTasksWithoutTeam: string[] = [];
  const humanTasksWithoutSurface: string[] = [];

  for (const task of input.tasks) {
    const cls = classOf.get(task.id);
    // An UNALLOCATED task is not silently counted as either side. It is the allocation gap,
    // which is already reported by the allocation layer, and double-reporting it here would
    // make this result look worse than the structure actually is.
    if (cls === undefined) continue;

    if (AI_CLASSES.includes(cls) && !teamTaskIds.has(task.id)) {
      aiTasksWithoutTeam.push(task.id);
    }
    if (cls === 'human' && !surfaceTaskIds.has(task.id)) {
      humanTasksWithoutSurface.push(task.id);
    }
  }

  if (structured && aiTasksWithoutTeam.length) {
    findings.push(finding('AI_TASK_WITHOUT_TEAM', 'blocking', null,
      `${aiTasksWithoutTeam.length} AI task(s) belong to no team: ${aiTasksWithoutTeam.join(', ')}. Ungrouped AI work is the blob.`));
  }
  if (structured && humanTasksWithoutSurface.length) {
    findings.push(finding('HUMAN_TASK_WITHOUT_SURFACE', 'blocking', null,
      `${humanTasksWithoutSurface.length} human task(s) land nowhere: ${humanTasksWithoutSurface.join(', ')}. A task with no destination becomes its own screen.`));
  }

  const blockingFindings = findings.filter((f) => f.severity === 'blocking');
  return {
    structured,
    passes: blockingFindings.length === 0,
    findings,
    blockingFindings,
    consoleCount,
    aiTasksWithoutTeam,
    humanTasksWithoutSurface,
  };
}
