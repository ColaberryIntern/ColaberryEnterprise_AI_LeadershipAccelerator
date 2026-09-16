/**
 * milestoneService — detects the program milestones a student has reached and
 * latches them into `student_milestones`. The promotion engine counts those
 * rows; this module is the only writer.
 *
 * DETECTION IS A FULL RECOMPUTE, LATCHING IS APPEND-ONLY. Every call re-derives
 * the milestones from the underlying truth (card progress, verified stories,
 * approved certifications) and inserts what is newly true. A row never comes
 * out: decision D5 says a milestone, once earned, is kept even if a definition
 * tightens later. Idempotent by construction — the unique index on
 * (enrollment, type, source_ref) refuses a second row under concurrency.
 *
 * Definitions (docs/POINTS_LADDER_DECISIONS.md):
 *   curriculum_complete   every published graded card in each of the 12 weeks
 *                         of the shared curriculum is completed, and every week
 *                         has at least one graded card (no vacuous truth: an
 *                         unauthored week is not a finished one)
 *   project_complete      a project with a published plan whose every story,
 *                         STORY-000 included, carries a `verified_at` latch
 *   certification_approved written by the certification service on approval
 */
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import StudentMilestone from '../../models/StudentMilestone';
import Project from '../../models/Project';
import StudentTask from '../../models/StudentTask';
import { getPublishedPlan } from '../sbp/planStore';
import { planStorySpecs } from '../sbp/verification/storyPoints';
import { CANONICAL_PROGRAM_ID } from '../timeline/curriculumScope';
import { isGradedCardType } from '../timeline/typeRegistry';
import { CURRICULUM_WEEKS, MilestoneState, PROJECT_MILESTONE_TARGET } from './milestoneLadder';

export interface WeekGradedProgress {
  week: number;
  graded: number;
  completed: number;
}

export interface CurriculumCompletion {
  complete: boolean;
  weeks: WeekGradedProgress[];
  /** Weeks 1..12 that are not yet done, for the gap line and the dry-run. */
  incompleteWeeks: number[];
}

/**
 * Per-week graded-card progress for one student over the shared curriculum.
 *
 * Reads the same scope every student-facing reader uses (curriculumScope:
 * cohort-less, active, published, canonical program or legacy null) so this
 * cannot count a card the classroom would not show. Type filtering happens in
 * process through the registry rather than in SQL, so the definition of
 * "graded" has exactly one home.
 */
export async function getCurriculumCompletion(enrollmentId: string): Promise<CurriculumCompletion> {
  const rows = await sequelize.query<{ week: number; type: string; done: boolean }>(
    `SELECT c.week::int AS week, c.type,
            (p.id IS NOT NULL AND p.status = 'completed') AS done
       FROM timeline_cards c
       LEFT JOIN timeline_card_progress p
         ON p.card_id = c.id AND p.enrollment_id = :enrollmentId
      WHERE c.cohort_id IS NULL
        AND c.status = 'active'
        AND c.visibility = 'published'
        AND (c.program_id = :programId OR c.program_id IS NULL)
        AND c.week BETWEEN 1 AND :weeks`,
    { replacements: { enrollmentId, programId: CANONICAL_PROGRAM_ID, weeks: CURRICULUM_WEEKS }, type: QueryTypes.SELECT },
  );

  const byWeek = new Map<number, WeekGradedProgress>();
  for (let w = 1; w <= CURRICULUM_WEEKS; w += 1) byWeek.set(w, { week: w, graded: 0, completed: 0 });
  for (const r of rows) {
    if (!isGradedCardType(r.type)) continue;
    const wk = byWeek.get(Number(r.week));
    if (!wk) continue;
    wk.graded += 1;
    if (r.done) wk.completed += 1;
  }

  const weeks = [...byWeek.values()];
  const incompleteWeeks = weeks.filter((w) => w.graded === 0 || w.completed < w.graded).map((w) => w.week);
  return { complete: incompleteWeeks.length === 0, weeks, incompleteWeeks };
}

export interface ProjectCompletion {
  projectId: string;
  name: string;
  complete: boolean;
  storiesTotal: number;
  storiesVerified: number;
}

/**
 * Every project of the student that has a published plan, with whether every
 * plan story (STORY-000 included) is verified. Projects without a published plan
 * are not builds yet and are omitted. Archived projects are omitted too: a
 * removed build is not a milestone, and one already latched stays latched.
 */
export async function getProjectCompletions(enrollmentId: string): Promise<ProjectCompletion[]> {
  const projects = await Project.findAll({
    where: { enrollment_id: enrollmentId, archived_at: null } as any,
    attributes: ['id', 'name'],
    order: [['created_at', 'ASC']],
  });
  const out: ProjectCompletion[] = [];
  for (const project of projects) {
    const stored = await getPublishedPlan(project.id);
    if (!stored) continue;
    const specs = planStorySpecs(stored.plan);
    const ids = specs.map((s) => s.id);
    if (ids.length === 0) continue;
    const verified = await StudentTask.count({
      where: { project_id: project.id, story_id: { [Op.in]: ids }, verified_at: { [Op.ne]: null } },
      distinct: true,
      col: 'story_id',
    });
    out.push({
      projectId: project.id,
      name: project.name,
      complete: verified >= ids.length,
      storiesTotal: ids.length,
      storiesVerified: verified,
    });
  }
  return out;
}

export interface MilestoneSync {
  state: MilestoneState;
  /** Milestones written by THIS call (empty on a re-run that finds nothing new). */
  newlyLatched: Array<{ type: string; source_ref: string }>;
  curriculum: CurriculumCompletion;
  projects: ProjectCompletion[];
}

/**
 * Recompute the student's milestones from the truth and latch any that are
 * newly satisfied. Safe to call from every trigger (card completion, story
 * verification, certification approval, the nightly sweep) — running it twice
 * with the same inputs writes nothing the second time.
 *
 * `certification_approved` rows are NOT derived here: the certification
 * service writes them at approval time, because the approval is itself the
 * truth (there is no upstream table to recompute from). They are still COUNTED
 * here, so the returned state is complete.
 */
export async function syncMilestones(enrollmentId: string): Promise<MilestoneSync> {
  const [curriculum, projects] = await Promise.all([
    getCurriculumCompletion(enrollmentId),
    getProjectCompletions(enrollmentId),
  ]);

  const newlyLatched: Array<{ type: string; source_ref: string }> = [];

  if (curriculum.complete) {
    const [, created] = await StudentMilestone.findOrCreate({
      where: { enrollment_id: enrollmentId, milestone_type: 'curriculum_complete', source_ref: 'curriculum' },
      defaults: {
        enrollment_id: enrollmentId,
        milestone_type: 'curriculum_complete',
        source_ref: 'curriculum',
        achieved_at: new Date(),
        evidence: { weeks: curriculum.weeks },
      },
    });
    if (created) newlyLatched.push({ type: 'curriculum_complete', source_ref: 'curriculum' });
  }

  for (const p of projects) {
    if (!p.complete) continue;
    const [, created] = await StudentMilestone.findOrCreate({
      where: { enrollment_id: enrollmentId, milestone_type: 'project_complete', source_ref: p.projectId },
      defaults: {
        enrollment_id: enrollmentId,
        milestone_type: 'project_complete',
        source_ref: p.projectId,
        achieved_at: new Date(),
        evidence: { name: p.name, stories_total: p.storiesTotal, stories_verified: p.storiesVerified },
      },
    });
    if (created) newlyLatched.push({ type: 'project_complete', source_ref: p.projectId });
  }

  const state = await getMilestoneState(enrollmentId);
  return { state, newlyLatched, curriculum, projects };
}

/** The latched milestones as the ladder sees them. Read-only. */
export async function getMilestoneState(enrollmentId: string): Promise<MilestoneState> {
  const rows = await StudentMilestone.findAll({
    where: { enrollment_id: enrollmentId },
    attributes: ['milestone_type', 'source_ref'],
  });
  const projectRefs = new Set<string>();
  let curriculumComplete = false;
  let certificationApproved = false;
  for (const r of rows) {
    if (r.milestone_type === 'curriculum_complete') curriculumComplete = true;
    else if (r.milestone_type === 'project_complete') projectRefs.add(r.source_ref);
    else if (r.milestone_type === 'certification_approved') certificationApproved = true;
  }
  return {
    curriculumComplete,
    projectsComplete: Math.min(PROJECT_MILESTONE_TARGET, projectRefs.size),
    certificationApproved,
  };
}

/**
 * Latch the certification milestone. Called by the certification service on
 * staff approval; keyed on the certification row so a second approval of the
 * same row is a no-op and a different track would be a different milestone.
 */
export async function latchCertificationMilestone(
  enrollmentId: string,
  certificationId: string,
  evidence: Record<string, unknown>,
): Promise<boolean> {
  const [, created] = await StudentMilestone.findOrCreate({
    where: { enrollment_id: enrollmentId, milestone_type: 'certification_approved', source_ref: certificationId },
    defaults: {
      enrollment_id: enrollmentId,
      milestone_type: 'certification_approved',
      source_ref: certificationId,
      achieved_at: new Date(),
      evidence,
    },
  });
  return created;
}
