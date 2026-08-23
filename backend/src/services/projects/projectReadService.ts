/**
 * projectReadService — the I/O shell for the Project Backend read API (P1).
 * Serves the persisted StudentTask hierarchy (project → lists → tasks) that the
 * localStorage `projectsStore` migrates onto. All access is scoped to the
 * requesting enrollment (auth contract: a student only reads their own projects).
 * Pure shape/ordering/counts live in ./projectTreeDto.
 */
import { Op } from 'sequelize';
import Project from '../../models/Project';
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import EvidenceRecord from '../../models/EvidenceRecord';
import { getProjectByEnrollment, listProjectsForEnrollment } from '../projectService';
import { awardedEvidenceRef } from '../sbp/verification/verificationLatch';
import {
  toProjectTreeDto,
  toProjectSummaryDto,
  type ProjectTreeDto,
  type ProjectSummaryDto,
} from './projectTreeDto';

async function buildTree(projectId: string): Promise<ProjectTreeDto | null> {
  const project = await Project.findByPk(projectId);
  if (!project) return null;
  const [lists, tasks] = await Promise.all([
    StudentTaskList.findAll({ where: { project_id: projectId }, order: [['position', 'ASC']] }),
    StudentTask.findAll({ where: { project_id: projectId }, order: [['position', 'ASC']] }),
  ]);
  const tasksByList = new Map<string, any[]>();
  for (const t of tasks) {
    const plain = t.get({ plain: true }) as any;
    const key = String(plain.task_list_id);
    const bucket = tasksByList.get(key);
    if (bucket) bucket.push(plain);
    else tasksByList.set(key, [plain]);
  }
  const plainLists = lists.map((l) => {
    const pl = l.get({ plain: true }) as any;
    pl.tasks = tasksByList.get(String(pl.id)) || [];
    return pl;
  });
  const plainProject = project.get({ plain: true }) as any;
  const xpEarned = await verifiedStoryXp(
    String(plainProject.enrollment_id ?? ''),
    tasks.map((t) => t.get({ plain: true })),
  );
  return toProjectTreeDto(plainProject, plainLists, xpEarned);
}

/**
 * Builder XP already banked for this project's verified stories.
 *
 * Read back from `evidence_records` rather than recomputed from a rate, because
 * the rate is editable in `points_config` and a student's earned total must not
 * silently change when somebody retunes the economy. What they were awarded is
 * what they keep.
 *
 * KEYED ON THE SHA FROZEN AT AWARD TIME (`student_tasks.verified_ref`), never
 * on the current repo state. This function used to rebuild the evidence key
 * from `verification_json.commit_sha` — the LATEST read — so a student who
 * force-pushed or squashed re-verified under a new sha, the lookup went hunting
 * for a row under a key nothing was ever awarded against, and that story read
 * 0 XP forever. Their award was still sitting in the table the whole time. The
 * repo does not get a vote in what was already banked.
 *
 * Gated on `verified_at`, not on the live verdict, for the same reason: the
 * latch is the record.
 *
 * Scoped to THIS project's tasks, so a student with several projects never sees
 * one project's XP counted on another. Fail-soft: an unreadable evidence table
 * costs a number on a dashboard, which is not worth failing the project read
 * over.
 *
 * EXPORTED so the archive confirmation quotes the same number the project tree
 * shows. A confirmation dialog that computed "points already awarded" its own
 * way would eventually disagree with the page behind it, and the student would
 * be asked to consent to a figure that is not the one they have been looking at.
 */
export async function verifiedStoryXp(
  enrollmentId: string,
  tasks: Array<{
    story_id?: string | null;
    verified_at?: Date | string | null;
    verified_ref?: string | null;
  }>,
): Promise<number> {
  const verified = tasks.filter((t) => t.story_id && t.verified_at);
  if (!enrollmentId || verified.length === 0) return 0;

  const refs = verified
    .map((t) => awardedEvidenceRef(t.story_id, { verified_at: t.verified_at, verified_ref: t.verified_ref }))
    .filter((r): r is string => r !== null);

  // A task verified before `verified_ref` existed has the latch but no frozen
  // sha. Its award row is still there and still keyed `<story>@<sha>`, so it is
  // found by story prefix instead. The `@` delimiter is what makes this safe:
  // `STORY-1@` cannot match `STORY-10@...`.
  const prefixOnly = verified
    .filter((t) => !awardedEvidenceRef(t.story_id, { verified_at: t.verified_at, verified_ref: t.verified_ref }))
    .map((t) => String(t.story_id));

  if (refs.length === 0 && prefixOnly.length === 0) return 0;

  try {
    const clauses: any[] = [];
    if (refs.length > 0) clauses.push({ source_ref: refs });
    for (const storyId of prefixOnly) clauses.push({ source_ref: { [Op.startsWith]: `${storyId}@` } });

    const rows = await EvidenceRecord.findAll({
      where: {
        enrollment_id: enrollmentId,
        source_type: 'github_commit',
        [Op.or]: clauses,
      },
      attributes: ['source_ref', 'builder_xp', 'created_at'],
      order: [['created_at', 'ASC']],
    });

    // One award per story. Two rows for one story would mean it transitioned
    // into verified twice, which the first-write-wins latch forbids — but if it
    // ever happened, the EARLIEST is the one that was actually awarded, and
    // summing both would invent XP nobody granted.
    const byStory = new Map<string, number>();
    for (const row of rows) {
      const storyId = String(row.source_ref ?? '').split('@')[0];
      if (!storyId || byStory.has(storyId)) continue;
      byStory.set(storyId, Number(row.builder_xp) || 0);
    }
    return [...byStory.values()].reduce((n, xp) => n + xp, 0);
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'project-read',
      event: 'verified_story_xp_unavailable', outcome: 'partial',
      error_class: (err as { name?: string })?.name ?? 'Error',
      context: {
        enrollmentId, refs: refs.length, prefix_lookups: prefixOnly.length,
        message: (err as { message?: string })?.message,
      },
    }));
    return 0;
  }
}

/** The student's active project as a full task tree (scoped to the enrollment). */
export async function getActiveProjectTree(enrollmentId: string): Promise<ProjectTreeDto | null> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) return null;
  return buildTree(project.id);
}

/** A specific project tree, but only if it belongs to this enrollment. */
export async function getOwnedProjectTree(enrollmentId: string, projectId: string): Promise<ProjectTreeDto | null> {
  const project = await Project.findByPk(projectId);
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) return null;
  return buildTree(projectId);
}

/** Lightweight list of the student's projects (no task tree), active flagged. */
export async function listEnrollmentProjectsSummary(enrollmentId: string): Promise<ProjectSummaryDto[]> {
  const [projects, active] = await Promise.all([
    listProjectsForEnrollment(enrollmentId),
    getProjectByEnrollment(enrollmentId),
  ]);
  const activeId = active ? active.id : null;

  // ONE query for the whole list, not one per project. This runs on the page a
  // student lands on, and the badge is not worth an N+1 there.
  //
  // Fail-soft: if the lookup throws, every card reports `repo_sync: null` and
  // simply shows no badge. A Projects page that 500s because a decoration could
  // not be computed would be a straight downgrade on the page it decorates.
  let byProject = new Map<string, { repo_url?: string | null; status_json?: any }>();
  try {
    const { default: GitHubConnection } = await import('../../models/GitHubConnection');
    const rows: any[] = await GitHubConnection.findAll({
      where: { project_id: projects.map((p) => String(p.id)) },
    });
    byProject = new Map(rows.map((r) => [String(r.project_id), r]));
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'project-read',
      event: 'repo_sync_badge_lookup_failed', outcome: 'partial',
      error_class: err?.name ?? 'Error',
    }));
    return projects.map((p) => toProjectSummaryDto(p.get({ plain: true }) as any, activeId));
  }

  return projects.map((p) => {
    const plain = p.get({ plain: true }) as any;
    return toProjectSummaryDto(plain, activeId, byProject.get(String(plain.id)) ?? null);
  });
}
