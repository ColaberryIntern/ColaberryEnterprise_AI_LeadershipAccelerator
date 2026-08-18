/**
 * storyVerificationRead — the one story the workspace page has open, as the
 * server sees it.
 *
 * WHY THIS EXISTS RATHER THAN REUSING THE PROJECT TREE
 *
 * The workspace page polls this every few seconds while a student has a story
 * open, waiting for a push to be confirmed. `/api/portal/projects/active`
 * already carries the same verdict, but it assembles every list and every task
 * on the project to do it. Polling that on a timer would re-read a whole build
 * to answer a question about one story, several times a minute, for every
 * student with a workspace open.
 *
 * So this is deliberately the narrowest read that answers the question: one row,
 * by (project_id, story_id), plus the ownership check.
 *
 * READ-ONLY. It never writes, never awards, and never triggers a GitHub call.
 * The verdict it returns was written by buildVerificationService on the last
 * sync — this endpoint reports that decision, it does not make one. That
 * separation is what makes it safe to poll: a student holding the page open
 * cannot drive load onto GitHub or move their own verification state.
 */
import { Op } from 'sequelize';
import Project from '../../../models/Project';
import StudentTask from '../../../models/StudentTask';
import EvidenceRecord from '../../../models/EvidenceRecord';
import { toTaskVerificationDto, TaskVerificationDto } from '../../projects/projectTreeDto';
import { awardedEvidenceRef } from './verificationLatch';

export interface StoryVerificationView {
  project_id: string;
  story_id: string;
  /** The student's own planning claim. Never the basis for the completion gate. */
  status: string;
  /**
   * The gate. Non-null means the platform confirmed this story against the repo
   * and it is a one-way latch — it never moves once set, and nothing here can
   * unset it.
   */
  verified_at: string | null;
  /** What granted it, e.g. `build_pipeline:repo_verification`. */
  verified_by: string | null;
  /**
   * The last verdict, or null when this story has never been checked. Carries
   * the outstanding criteria and the plain-language reasons the UI renders.
   */
  verification: TaskVerificationDto | null;
  /**
   * The acceptance criteria as the PLAN has them, in plan order.
   *
   * Served alongside the verdict rather than left to the client's cached copy
   * because the two have to agree for the checkbox rendering to mean anything:
   * a criterion is confirmed when it is in this list and absent from
   * `verification.outstanding`. Pairing a fresh outstanding-set against a stale
   * client-side criteria list would mis-mark boxes, and mis-marking them in the
   * confident direction is the one failure this feature must not have.
   */
  acceptance: string[];
  /**
   * Builder XP actually banked for this story, read back from the evidence row
   * rather than recomputed — what a student was awarded is what they keep, even
   * if the economy is retuned later.
   *
   * `project_story_verified` is a `budget_per_build` row: an 800 XP budget for
   * the whole capstone, split across its stories, so a 20-story build pays 40 a
   * story. The UI still renders the points beat only when this is above zero,
   * because the split FAILS CLOSED at 0 in every degenerate case (config row
   * missing, budget unset, zero stories) and celebrating a "+0" would announce
   * an award that did not happen.
   */
  xp_awarded: number;
}

/**
 * Read one story's verification state for a student who owns it.
 *
 * Returns null when the project is not the caller's OR does not exist OR has no
 * such story. All three collapse to the same answer on purpose: a student must
 * not be able to probe for the existence of somebody else's project or story,
 * and the caller renders 404 for all of them. Same reasoning as
 * `requireOwnedProject` in repoConnectService.
 */
export async function readStoryVerification(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<StoryVerificationView | null> {
  if (!enrollmentId || !projectId || !storyId) return null;

  const project = await Project.findByPk(projectId);
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) return null;

  const task = await StudentTask.findOne({ where: { project_id: projectId, story_id: storyId } });
  if (!task) return null;

  const verifiedAt = toIso(task.verified_at);

  return {
    project_id: projectId,
    story_id: storyId,
    status: typeof task.status === 'string' ? task.status : 'not_started',
    verified_at: verifiedAt,
    verified_by: typeof task.verified_by === 'string' ? task.verified_by : null,
    verification: toTaskVerificationDto(task.verification_json),
    acceptance: toStringArray(task.acceptance),
    // Only looked up once the latch is set. An unverified story has no award by
    // definition, so the common polling case — a student waiting for a push to
    // land — costs exactly one query, not two.
    xp_awarded: verifiedAt
      ? await awardedXp(enrollmentId, storyId, {
        verified_at: task.verified_at,
        verified_ref: typeof task.verified_ref === 'string' ? task.verified_ref : null,
      })
      : 0,
  };
}

/**
 * The XP banked for one story, read back from its evidence row.
 *
 * Keyed on `verified_ref` — the sha FROZEN at award time — never on the current
 * repo read. A student who force-pushed or squashed after verifying still gets
 * the number they were actually granted; rebuilding the key from the live
 * verdict would send the lookup hunting for a row that was never written. Same
 * reasoning, and the same `<story>@` prefix fallback for rows that predate the
 * `verified_ref` column, as `verifiedStoryXp` in projectReadService.
 *
 * FAIL-SOFT. An unreadable evidence table costs a number on a card. It must not
 * cost the student the verification state they came to the page to see.
 */
async function awardedXp(
  enrollmentId: string,
  storyId: string,
  latch: { verified_at: Date | string | null; verified_ref: string | null },
): Promise<number> {
  try {
    const ref = awardedEvidenceRef(storyId, latch);
    const row = await EvidenceRecord.findOne({
      where: {
        enrollment_id: enrollmentId,
        source_type: 'github_commit',
        // The `@` delimiter is what makes the prefix fallback safe: `STORY-1@`
        // cannot match `STORY-10@...`.
        ...(ref ? { source_ref: ref } : { source_ref: { [Op.startsWith]: `${storyId}@` } }),
      },
      attributes: ['builder_xp', 'created_at'],
      // Two rows for one story would mean it transitioned into verified twice,
      // which the first-write-wins latch forbids — but if it ever happened, the
      // EARLIEST is the one that was actually awarded.
      order: [['created_at', 'ASC']],
    });
    return Number(row?.builder_xp) || 0;
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'sbp-verification',
      event: 'story_awarded_xp_unavailable',
      outcome: 'partial',
      error_class: (err as { name?: string })?.name ?? 'Error',
      context: { story_id: storyId, message: (err as { message?: string })?.message },
    }));
    return 0;
  }
}

/**
 * Sequelize hands back a Date for TIMESTAMPTZ, but a plain string survives a
 * `JSON.parse(JSON.stringify(...))` round trip through a cache or a test
 * fixture. Both are accepted; anything else reads as "not verified", which is
 * the safe direction for a field that gates credit.
 */
function toIso(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** `acceptance` is JSONB and an older row can hold anything. Non-arrays read as empty. */
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
