import Project from '../../models/Project';
import InternshipApplication from '../../models/InternshipApplication';
import { createNewProjectForEnrollment } from '../projectService';
import { hasPublishedBuild } from '../projects/projectWriteService';
import { generateIntakeQuestions, type IntakeQuestionsResult } from '../sbp/intakeQuestionsService';
import {
  startBuild, getBuildState, publishBuild, type BuildState, type PublishResult,
} from '../sbp/sbpOrchestrator';
import { blockingViolations, advisoryViolations, type GateViolation } from '../sbp/planGate';
import type { BuildPlan } from '../sbp/planContract';

/**
 * Assigning an intern a project by generating it, not by typing it.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Ali, 2026-09-28, looking at the story-by-story authoring form:
 *
 *   "We will never build projects like this, one story at a time. We do not
 *    create manually. This is where I need to put my idea process in here. The
 *    same process that already exists for creating projects."
 *
 * That process is the Student Build Pipeline. It already writes to the same
 * three tables the internship's manual form writes to — a project is a
 * `projects` row, a release is a `student_task_lists` row, a story is a
 * `student_tasks` row — so nothing here is a second persistence path, and an
 * intern's generated project renders exactly like a student's.
 *
 * ── WHAT THIS MODULE ACTUALLY ADDS ─────────────────────────────────────────
 *
 * An admin door. Every SBP route is `requireParticipant` and takes the
 * enrollment from the student's own JWT, deliberately, so that a project that
 * is not yours answers 404 rather than 403. `startBuild` itself has always
 * taken a bare `enrollmentId` and would have worked for an intern unchanged —
 * what did not exist was any way for a REVIEWER to run it on someone's behalf.
 * This module is that entry, and nothing more: every stage below is the
 * pipeline's own, called in the pipeline's own order.
 *
 * ── THE REVIEW HOLD IS THE POINT ───────────────────────────────────────────
 *
 * Generation auto-publishes by default, which for a student is right: their
 * plan should land the moment it is good. For a reviewer-initiated build it
 * would be backwards — the reviewer would be approving a plan the intern is
 * already looking at. So these builds pass `holdForReview`, rest at `drafted`,
 * and `assignGeneratedProject` is the reviewer saying yes. It carries the
 * reviewed plan's hash, so "the plan I read is the plan that shipped" is
 * enforced by `publishPlan` rather than assumed.
 */

/** A tier, in the pipeline's own vocabulary. Anything else falls back to `project`. */
export type InternProjectSize = 'workflow' | 'project' | 'autonomous';
const SIZES: readonly InternProjectSize[] = ['workflow', 'project', 'autonomous'];
export const normalizeSize = (s?: string | null): InternProjectSize => (
  SIZES.includes(s as InternProjectSize) ? (s as InternProjectSize) : 'project'
);

export class InternshipGenerationError extends Error {
  status: number;
  error_class: string;
  constructor(message: string, status = 400, errorClass = 'InternshipGenerationError') {
    super(message);
    this.status = status;
    this.error_class = errorClass;
  }
}

/**
 * The enrollment behind an application. Everything downstream is keyed on it,
 * because an intern IS an enrollment — the same identity `startBuild` takes.
 */
async function enrollmentForApplication(applicationId: string): Promise<{ applicationId: string; enrollmentId: string }> {
  const app = await InternshipApplication.findByPk(applicationId, { attributes: ['id', 'enrollment_id'] });
  if (!app) throw new InternshipGenerationError('Application not found.', 404, 'NotFoundError');
  return { applicationId: app.id, enrollmentId: app.enrollment_id };
}

/**
 * The sharpening interview, for the reviewer instead of the student.
 *
 * Not optional, and not decoration. The pipeline's own isolation study: with no
 * interview a generated plan named the student's real systems 0 times out of
 * 14 and carried their stated guardrail 0 of 6; with it, 14/14 and 6/6.
 * Generating a 17,000-word requirements document instead recovered neither. An
 * idea box with a Generate button beside it would give us the fast path AND the
 * weak plans, which is the manual-authoring problem one level up.
 *
 * `generated: false` means the model failed and the generic set was substituted.
 * Reported rather than hidden, because a plan built on the generic set is
 * measurably worse and whoever is about to assign it should know.
 */
export async function internProjectQuestions(params: {
  idea: string;
  size?: string | null;
  name?: string | null;
}): Promise<IntakeQuestionsResult> {
  const idea = (params.idea ?? '').trim();
  if (idea.length < 20) {
    throw new InternshipGenerationError('Describe the project in a sentence or two first (at least 20 characters).');
  }
  return generateIntakeQuestions({
    idea,
    size: normalizeSize(params.size),
    name: params.name ?? undefined,
  });
}

export interface StartInternProjectInput {
  applicationId: string;
  idea: string;
  name?: string | null;
  industry?: string | null;
  size?: string | null;
  answers?: Array<{ id: string; question: string; answer: string; angle?: string }>;
  covered?: Array<{ angle: string; evidence: string }>;
}

export interface StartInternProjectResult {
  project_id: string;
  enrollment_id: string;
  correlation_id: string;
  status: string;
}

/**
 * Create the project and start generation, held for review.
 *
 * Creates a NEW project every time it is called, because
 * `createNewProjectForEnrollment` always creates and activates. That is the
 * student path's behaviour and it is deliberate here too — a second attempt at
 * a different idea is a different project, not an edit of the first. The
 * caller decides whether a second one is wanted; this refuses only the case
 * where it would destroy something (see `assertNotGeneratedProject`).
 */
export async function startInternProjectBuild(input: StartInternProjectInput): Promise<StartInternProjectResult> {
  const idea = (input.idea ?? '').trim();
  if (idea.length < 20) {
    throw new InternshipGenerationError('Describe the project in a sentence or two first (at least 20 characters).');
  }
  const { enrollmentId } = await enrollmentForApplication(input.applicationId);

  const project = await createNewProjectForEnrollment(enrollmentId);
  const name = (input.name ?? '').trim();
  const industry = (input.industry ?? '').trim();
  const overrides: Partial<{ name: string; industry: string }> = {};
  if (name) overrides.name = name;
  if (industry) overrides.industry = industry;
  if (Object.keys(overrides).length) await project.update(overrides);

  const started = await startBuild({
    projectId: project.id,
    enrollmentId,
    idea,
    name: name || undefined,
    size: normalizeSize(input.size),
    answers: input.answers,
    covered: input.covered,
    // The whole reason this module exists: a reviewer reads it before an intern does.
    holdForReview: true,
  });

  return {
    project_id: project.id,
    enrollment_id: enrollmentId,
    correlation_id: started.correlationId,
    status: started.status,
  };
}

export interface InternProjectBuildView {
  project_id: string;
  enrollment_id: string;
  status: BuildState['status'] | null;
  plan: BuildPlan | null;
  version: number | null;
  /** Reasons it cannot be assigned. Empty means it can. */
  blocking: GateViolation[];
  /** Warnings that ride along and do NOT stop an assignment. */
  advisory: GateViolation[];
  /** The hash of the plan being shown, to hand back on assign. */
  plan_sha256: string | null;
  /** Already assigned: publish has run and the intern can see it. */
  assigned: boolean;
}

/**
 * What the reviewer is looking at.
 *
 * Blocking and advisory violations are split HERE rather than in the browser.
 * The student client used to show the first three of a mostly-advisory array as
 * the refusal reason, so someone blocked on an uncovered must-have was told
 * about a stylistically redundant story. A reviewer deciding whether to assign
 * needs the same distinction, and needs it to be the server's.
 */
export async function internProjectBuild(projectId: string): Promise<InternProjectBuildView> {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'enrollment_id'] });
  if (!project) throw new InternshipGenerationError('Project not found.', 404, 'NotFoundError');

  const state = await getBuildState(projectId);
  const violations = state?.gate?.violations ?? [];
  const assigned = await hasPublishedBuild(projectId);

  return {
    project_id: projectId,
    enrollment_id: project.enrollment_id,
    status: state?.status ?? null,
    plan: state?.plan?.plan ?? null,
    version: state?.plan?.version ?? null,
    blocking: blockingViolations(violations),
    advisory: advisoryViolations(violations),
    // Off the STORED plan, never recomputed: this is the hash `publishPlan`
    // will compare against, so it has to be the row's own value.
    plan_sha256: state?.plan?.plan_sha256 ?? null,
    assigned,
  };
}

/**
 * The reviewer says yes.
 *
 * `expectedSha` is the hash of the plan they actually read. `publishPlan`
 * refuses on a mismatch, so a regeneration between reading and assigning cannot
 * ship a plan nobody reviewed — the failure this exact parameter was added for,
 * after a pilot reviewed a 6/3/1/1/1 plan and shipped an 8/1/1/1/1 one.
 *
 * Idempotent: publish promotes an already-published version to itself,
 * materialize upserts on (project_id, story_id) and preserves completed work.
 */
export async function assignGeneratedProject(params: {
  projectId: string;
  expectedSha?: string | null;
}): Promise<PublishResult> {
  const project = await Project.findByPk(params.projectId, { attributes: ['id', 'enrollment_id'] });
  if (!project) throw new InternshipGenerationError('Project not found.', 404, 'NotFoundError');

  const { repoForProject } = await import('../sbp/workspaceRepo');
  const repo = await repoForProject(params.projectId);

  return publishBuild(params.projectId, {
    enrollmentId: project.enrollment_id,
    expectedSha: params.expectedSha ?? undefined,
    repo,
  });
}

/**
 * Refuse to hand-author over a generated project.
 *
 * `importProject` — the manual form's writer — short-circuits and writes
 * NOTHING when the project already has a published build plan
 * (`projectWriteService.ts:303`, `project_import_skipped_published`). It
 * returns the existing tree, so the call looks like it worked and the reviewer
 * is told their stories were saved when nothing was written.
 *
 * That silence is the trap this exists to close. The manual form is the escape
 * hatch for a project the pipeline has not touched; on a generated one, a
 * reviewer who wants different stories regenerates or edits the plan, and is
 * told so rather than left believing a write landed.
 */
export async function assertNotGeneratedProject(enrollmentId: string): Promise<void> {
  const active = await Project.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
    attributes: ['id'],
  });
  if (!active) return;
  if (await hasPublishedBuild(active.id)) {
    throw new InternshipGenerationError(
      'This intern already has a generated project. Hand-authored stories would be silently discarded over a generated plan, '
      + 'so regenerate the plan instead, or archive that project first.',
      409,
      'GeneratedProjectExists',
    );
  }
}
