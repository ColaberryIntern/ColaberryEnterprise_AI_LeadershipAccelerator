/**
 * govProjectMaterialization — turn an authorized gov build into a REAL monitored student project.
 *
 * This is the P2.3 write path behind Ali's "approve a build + assign to an intern → their project profile →
 * monitor like the Command Center". It is an EXPLICIT, section-gated admin action — never automatic. It:
 *   1. resolves the assigned builder's identity → their Enrollment (link graph, else email) → cohort → program;
 *   2. obtains the SAME raw BuildPlan the Build-step Gantt showed (reusing the cached decomposition) and GATES it;
 *   3. idempotently creates/reuses ONE student project for the pursuit's solution_build track (anchored on
 *      ContractTrack.solution_student_project_id via the existing linkGovBuildToStudentProject), marking its
 *      origin in project_variables, naming it (a project with no name is invisible on the delivery board);
 *   4. materializes the plan's releases/stories as student_task_lists / student_tasks on a synthetic
 *      [today → deadline] schedule (idempotent on (project_id, story_id), injects the STORY-000 Command Center).
 *
 * Idempotent + additive (no migration): re-running reuses the same project and upserts tasks — no duplicates,
 * no un-completing. Errors are TYPED and surfaced (this is a write, not fail-soft-silent). Reuses the SBP engine
 * + projectService + linkGovBuildToStudentProject UNCHANGED.
 */
import { Op } from 'sequelize';
import { getIdentityLinks } from '../../modules/identity/platformIdentityService';
import PlatformIdentity from '../../models/PlatformIdentity';
import Enrollment from '../../models/Enrollment';
import ContractTrack from '../../models/ContractTrack';
import { createNewProjectForEnrollment } from '../projectService';
import Project from '../../models/Project';
import { materializePlanAsTasks } from '../sbp/materializeTasks';
import { buildSchedule, type CohortWindow, type Schedule } from '../sbp/buildSchedule';
import { gatePlan, blockingViolations } from '../sbp/planGate';
import type { BuildPlan } from '../sbp/planContract';
import { linkGovBuildToStudentProject } from './govDeliveryProject';
import { factoryId } from './factoryIds';
import { decomposeGovBuildPlanRaw } from './govBuildPlanAI';

export type GovMaterializeReason = 'no_enrollment' | 'no_program' | 'decompose_error' | 'plan_blocked' | 'bad_input';
export class GovMaterializeError extends Error {
  constructor(public readonly reason: GovMaterializeReason, message: string) {
    super(message);
    this.name = 'GovMaterializeError';
  }
}

export interface MaterializeGovProjectInput {
  deliveryProjectId: string;
  canonicalOpportunityId: string;
  assigneeIdentityId: string;
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  buildSpec?: string | null;
  deadline?: string | null;
  projectName?: string | null;
  actorIdentityId?: string | null;
  now?: Date;
}
export interface MaterializeGovProjectResult {
  projectId: string;
  created: boolean;
  enrollmentId: string;
  lists: number;
  tasks: number;
  releaseCount: number;
  storyCount: number;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Schedule the build over the plan's NATURAL weeks (the POST-AWARD build timeline), starting from `now`.
 * Deliberately NOT bound to the proposal's submission deadline — the build happens after award — so the
 * materialized tasks are never crammed or born late against the submission cutoff. PURE.
 */
export function govSyntheticSchedule(plan: BuildPlan, now: Date): Schedule {
  const now0 = startOfUtcDay(now);
  const maxWeek = Math.max(1, ...plan.releases.map((r) => r.week_end || r.week_start || 1));
  const window: CohortWindow = { cohortStart: now0, asOf: now0, startWeek: 1, prepWeek: maxWeek + 1, demoWeek: maxWeek + 2 };
  const releases = plan.releases.map((r) => ({ key: r.key, name: r.name, week_start: r.week_start, week_end: r.week_end }));
  const storiesByRelease = new Map<string, string[]>();
  for (const s of plan.stories) {
    const arr = storiesByRelease.get(s.release) ?? [];
    arr.push(s.id);
    storiesByRelease.set(s.release, arr);
  }
  return buildSchedule({ window, releases, storiesByRelease });
}

/** Resolve a builder's PlatformIdentity to an Enrollment id: the link graph first, then a case-insensitive email match. */
export async function resolveEnrollmentForIdentity(identityId: string): Promise<string> {
  try {
    const links = await getIdentityLinks(identityId);
    if (links.enrollment && links.enrollment[0]) return links.enrollment[0];
  } catch { /* link graph may be unavailable — fall through to email */ }
  const identity = await PlatformIdentity.findByPk(identityId);
  const email = (identity as { primary_email?: string } | null)?.primary_email;
  if (email) {
    const enr = await Enrollment.findOne({ where: { email: { [Op.iLike]: email } } });
    if (enr) return (enr as { id: string }).id;
  }
  throw new GovMaterializeError('no_enrollment', 'The assigned builder has no enrollment. Assign an enrolled intern to create a monitored project.');
}

export async function materializeGovBuildProject(input: MaterializeGovProjectInput): Promise<MaterializeGovProjectResult> {
  if (!input.deliveryProjectId || !input.assigneeIdentityId || !Array.isArray(input.requirements) || input.requirements.length === 0) {
    throw new GovMaterializeError('bad_input', 'A delivery project, an assigned builder, and established requirements are required.');
  }
  const now = input.now ?? new Date();

  // 1. Owner: the assigned intern's enrollment.
  const enrollmentId = await resolveEnrollmentForIdentity(input.assigneeIdentityId);

  // 2. The SAME plan the Gantt showed (reuse the cached decomposition), then GATE it — a blocking plan would
  //    write rows that corrupt the board (e.g. a dangling blocked_by locks a task forever).
  const raw = await decomposeGovBuildPlanRaw({ requirements: input.requirements, title: input.title, buyer: input.buyer, buildSpec: input.buildSpec });
  if (raw.error || !raw.plan) throw new GovMaterializeError('decompose_error', raw.error ?? 'The AI build plan could not be generated right now.');
  const plan = raw.plan;
  const gate = gatePlan(plan);
  if (blockingViolations(gate.violations).length > 0) {
    throw new GovMaterializeError('plan_blocked', 'The generated build plan has blocking issues — re-generate the build plan before creating the project.');
  }

  // 3. Idempotent project: reuse the one already linked to this pursuit's solution_build track, else create+link.
  const track = await ContractTrack.findByPk(factoryId('track', [input.deliveryProjectId, 'solution_build']));
  let projectId = (track as { solution_student_project_id?: string | null } | null)?.solution_student_project_id ?? null;
  let created = false;
  if (!projectId) {
    let project: Project;
    try {
      project = await createNewProjectForEnrollment(enrollmentId);
    } catch (err: any) {
      if (/no associated program|program/i.test(String(err?.message ?? ''))) {
        throw new GovMaterializeError('no_program', "The assigned intern's enrollment has no program (its cohort is missing a program). Assign an intern enrolled in a cohort with a program.");
      }
      throw err;
    }
    project.name = input.projectName || input.title || `Gov build — ${input.canonicalOpportunityId}`;
    project.project_variables = { ...(project.project_variables || {}), kind: 'gov', gov_canonical_id: input.canonicalOpportunityId, gov_delivery_project_id: input.deliveryProjectId };
    await project.save();
    projectId = project.id as string;
    created = true;
    await linkGovBuildToStudentProject({
      deliveryProjectId: input.deliveryProjectId,
      studentProjectId: projectId,
      reason: `gov build materialized from pursuit ${input.canonicalOpportunityId}`,
      actorIdentityId: input.actorIdentityId ?? null,
    });
  }

  // 4. Schedule + materialize (idempotent on (project_id, story_id); injects the STORY-000 Command Center).
  const schedule = govSyntheticSchedule(plan, now);
  const mat = await materializePlanAsTasks(projectId, enrollmentId, plan, { schedule, now });

  return {
    projectId, created, enrollmentId,
    lists: mat.lists, tasks: mat.tasks,
    releaseCount: plan.releases.length, storyCount: plan.stories.length,
  };
}
