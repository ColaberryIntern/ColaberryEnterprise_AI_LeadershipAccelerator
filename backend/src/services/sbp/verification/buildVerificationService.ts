/**
 * buildVerificationService — the completion-verification loop, end to end.
 *
 *   published plan  +  .colaberry/progress.json  +  repo commits
 *        │                     │                        │
 *        └──────────── decideBuild (pure) ──────────────┘
 *                              │
 *              ┌───────────────┴───────────────┐
 *              │                               │
 *   student_tasks.verification_json    markTaskVerifiedComplete
 *   (every story, every sync)          + recordEvidence  (verified only, once)
 *
 * This module is the I/O shell. Every rule about what counts as done lives in
 * ./verifyDecision, which has no I/O at all.
 *
 * IDEMPOTENCY, three independent layers, because this awards credit:
 *   1. `markTaskVerifiedComplete` is first-write-wins — a replay never moves
 *      `verified_at`.
 *   2. Evidence is recorded only on the TRANSITION into verified (the task had
 *      no `verified_at` when we read it), so a second sync over the same commit
 *      records nothing.
 *   3. `recordEvidence` keys on `(enrollment, source, sourceRef)` with a unique
 *      index, so even two concurrent syncs that both saw `verified_at = null`
 *      produce exactly one award.
 *
 * WHAT THIS IS NOT: proof. A student can hand-edit `.colaberry/progress.json`
 * and tick every box. What the platform actually holds is an audit trail — the
 * commit sha behind every award, and a criteria list that came from the plan
 * rather than from the file. This is a learning platform, not a payments
 * system, and the defences are sized accordingly. See
 * docs/BUILD_VERIFICATION_CONTRACT.md.
 */
import Project from '../../../models/Project';
import StudentTask from '../../../models/StudentTask';
import GitHubConnection from '../../../models/GitHubConnection';
import { getPublishedPlan } from '../planStore';
import { markTaskVerifiedComplete } from '../../projects/projectWriteService';
import { recordEvidence } from '../../progression/evidenceEngine';
import { parseProgressFile, ProgressParseErrorClass } from './progressContract';
import {
  decideBuild,
  BuildRollup,
  PlanStorySpec,
  StoryVerdict,
} from './verifyDecision';
import {
  readVerificationInputs,
  RepoReadError,
  RepoReadErrorClass,
} from './repoProgressReader';
import { applyVerificationLatch, VerificationRecord } from './verificationLatch';

/**
 * The points_config key a verified story awards against.
 *
 * A key of its own, deliberately not reusing the `project_task` card type: the
 * curriculum economy and the build economy should be tunable apart.
 *
 * THE NUMBER IS NOT SET. Ali has not decided whether a story is worth a fixed
 * amount or a share of a fixed per-build budget, so the seeded row carries a
 * NULL `builder_xp`, which `getTypeXp` resolves to 0. Evidence is still
 * recorded — the audit trail is complete and the awards are replayable — but
 * zero XP moves until somebody sets the value in `points_config`. Inventing a
 * placeholder here would ship a number nobody chose as though somebody had.
 */
export const STORY_XP_KEY = 'project_story_verified';

/** Stamped into `student_tasks.verified_by` so a completion names what granted it. */
export const VERIFIER_SOURCE = 'build_pipeline:repo_verification';

/**
 * Competency signal for a verified build story. Flat weights: this loop knows
 * the story was finished, not which skills it exercised, and inventing a
 * confident weighting from a story title would be signal we do not have.
 */
const STORY_COMPETENCIES = [
  { domain_id: 'architecture', weight: 1 },
  { domain_id: 'github', weight: 1 },
];

export type VerificationErrorClass =
  | RepoReadErrorClass
  | ProgressParseErrorClass
  | 'NoPublishedPlan'
  | 'NoWorkspaceRepo'
  | 'ProjectNotFound';

/**
 * Per-story state, as stored on the task and served to the portal.
 *
 * A MUTABLE VIEW of the last repo read — not the record. `verified_at` on the
 * task is the record. This is never allowed to lower a story below `verified`;
 * see verificationLatch.ts.
 */
export interface StoryVerificationRecord extends VerificationRecord {
  state: StoryVerdict['state'];
  /** When this verdict was reached. Distinct from verified_at, which never moves. */
  checked_at: string;
}

export interface BuildVerificationSummary {
  project_id: string;
  /** False when nothing could be read. `error_class` says why; nothing was written. */
  ok: boolean;
  error_class: VerificationErrorClass | null;
  /** One sentence for the student. Null when ok. */
  reason: string | null;
  plan_version: number | null;
  checked_at: string;
  rollup: BuildRollup & {
    /** Builder XP this run actually awarded. Zero until points_config carries a value. */
    xp_awarded: number;
    /** Stories that crossed into verified on THIS run. */
    newly_verified: string[];
  };
  stories: Array<{ story_id: string } & StoryVerificationRecord>;
  /** Story ids in the progress file that the published plan does not have. */
  unknown_stories: string[];
  /** True when older commits exist beyond the read window. */
  window_truncated: boolean;
}

export interface VerifyOptions {
  correlationId?: string;
  fetchImpl?: typeof fetch;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-verification',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

const emptyRollup = (): BuildVerificationSummary['rollup'] => ({
  stories_total: 0, stories_verified: 0, stories_submitted: 0,
  stories_in_progress: 0, stories_not_started: 0,
  criteria_total: 0, criteria_passed: 0, qualifying_commits: 0,
  xp_awarded: 0, newly_verified: [],
});

function failure(
  projectId: string,
  error_class: VerificationErrorClass,
  reason: string,
): BuildVerificationSummary {
  return {
    project_id: projectId,
    ok: false,
    error_class,
    reason,
    plan_version: null,
    checked_at: new Date().toISOString(),
    rollup: emptyRollup(),
    stories: [],
    unknown_stories: [],
    window_truncated: false,
  };
}

/**
 * Run the loop for one project.
 *
 * NEVER THROWS for an expected condition — no plan, no repo, unreadable file,
 * GitHub rate limit. Each of those returns `ok: false` with a classified reason
 * the caller can render, because this runs behind a Sync button a student
 * presses and a 500 tells them nothing. Genuinely unexpected errors (a database
 * failure mid-write) still propagate: those are defects, not states.
 */
export async function verifyBuildFromRepo(
  projectId: string,
  opts: VerifyOptions = {},
): Promise<BuildVerificationSummary> {
  const startedAt = Date.now();

  const project = await Project.findByPk(projectId);
  if (!project) return failure(projectId, 'ProjectNotFound', 'That project does not exist.');
  const enrollmentId = String((project as any).enrollment_id ?? '');

  const stored = await getPublishedPlan(projectId);
  if (!stored) {
    return failure(
      projectId,
      'NoPublishedPlan',
      'This project has no published build plan yet, so there are no stories to verify against.',
    );
  }

  const connection = await GitHubConnection.findOne({ where: { project_id: projectId } });
  if (!connection?.repo_owner || !connection?.repo_name) {
    return failure(
      projectId,
      'NoWorkspaceRepo',
      'No workspace repo is provisioned for this project, so there is nothing to read.',
    );
  }

  const specs: PlanStorySpec[] = (stored.plan.stories ?? []).map((s) => ({
    id: s.id,
    acceptance: Array.isArray(s.acceptance) ? s.acceptance.map(String) : [],
  }));

  let inputs;
  try {
    inputs = await readVerificationInputs(
      { owner: connection.repo_owner, repo: connection.repo_name },
      { correlationId: opts.correlationId, fetchImpl: opts.fetchImpl, storyIds: specs.map((s) => s.id) },
    );
  } catch (err: unknown) {
    if (err instanceof RepoReadError) {
      log('sbp_verification_read_failed', opts.correlationId, 'failure', {
        projectId, error_class: err.error_class, message: err.message,
      });
      return failure(projectId, err.error_class, readErrorMessage(err));
    }
    throw err;   // a defect, not a state — let it surface
  }

  // A malformed file is REJECTED, not read as "nothing done". Existing
  // verifications are untouched: this loop never revokes.
  const parsed = parseProgressFile(inputs.progressRaw);
  if (!parsed.ok && parsed.error_class !== 'ProgressFileMissing') {
    log('sbp_verification_progress_rejected', opts.correlationId, 'failure', {
      projectId, error_class: parsed.error_class, issues: parsed.issues ?? [],
    });
    return failure(projectId, parsed.error_class, parsed.reason);
  }

  const decision = decideBuild(specs, parsed.ok ? parsed.file : null, inputs.commits);
  const checkedAt = new Date().toISOString();

  const stories: BuildVerificationSummary['stories'] = [];
  const newlyVerified: string[] = [];
  let xpAwarded = 0;

  for (const verdict of decision.verdicts) {
    const live: StoryVerificationRecord = {
      state: verdict.state,
      criteria_total: verdict.criteria_total,
      criteria_passed: verdict.criteria_passed,
      outstanding: verdict.outstanding,
      commit_sha: verdict.commit_sha,
      commit_at: verdict.commit_at,
      reasons: verdict.reasons,
      rejected_claims: verdict.rejected_claims,
      checked_at: checkedAt,
    };

    const task = await StudentTask.findOne({ where: { project_id: projectId, story_id: verdict.story_id } });
    if (!task) {
      // The plan has a story the materializer never turned into a task. Worth a
      // line — it means the student cannot see this story at all — but not
      // worth aborting the rest of the run over.
      log('sbp_verification_task_missing', opts.correlationId, 'partial', { projectId, storyId: verdict.story_id });
      stories.push({ story_id: verdict.story_id, ...live });
      continue;
    }

    // Read BEFORE the write: this is what makes the award fire once. Layer 3
    // (recordEvidence's unique idempotency key) covers the race where two syncs
    // both read null here.
    const wasVerified = Boolean(task.verified_at);

    // THE LATCH. A story the platform already verified cannot be lowered by a
    // later read of the repo, because the verification is recorded here and the
    // repo is only where it happened. Applied before the write, so the stored
    // blob never states something the record contradicts — and applied again on
    // the read side, so a blob written by any other path cannot lie either.
    const record = applyVerificationLatch(
      live,
      { verified_at: task.verified_at, verified_by: task.verified_by, verified_ref: task.verified_ref },
      task.verification_json as Partial<VerificationRecord> | null,
    ) as StoryVerificationRecord;

    if (record.latched) {
      log('sbp_verification_latch_held', opts.correlationId, 'partial', {
        projectId, storyId: verdict.story_id, live_state: verdict.state,
        reason: 'already verified; the repo read is no longer able to confirm it',
      });
    }

    stories.push({ story_id: verdict.story_id, ...record });
    await StudentTask.update({ verification_json: record }, { where: { id: task.id } });

    // Awarding still requires a LIVE verified verdict with a commit behind it.
    // The latch protects what was already earned; it must never be a second
    // route to earning something, or a story could be awarded off a record it
    // wrote itself.
    if (verdict.state !== 'verified' || !verdict.commit_sha) continue;

    await markTaskVerifiedComplete(projectId, verdict.story_id, {
      source: VERIFIER_SOURCE,
      ref: verdict.commit_sha,
      correlation_id: opts.correlationId ?? null,
    });

    if (wasVerified || !enrollmentId) continue;

    const awarded = await recordEvidence({
      enrollmentId,
      source: 'github_commit',
      // The commit sha IS the evidence reference. Prefixed with the story so two
      // stories legitimately finished in one commit each get their own record
      // rather than the second silently colliding with the first.
      sourceRef: `${verdict.story_id}@${verdict.commit_sha}`,
      typeSlug: STORY_XP_KEY,
      competencyWeights: STORY_COMPETENCIES,
    });
    if (awarded.created) {
      newlyVerified.push(verdict.story_id);
      xpAwarded += awarded.builder_xp;
    }
  }

  // Recount from the LATCHED records, not from the raw verdicts. Otherwise the
  // summary the sync response hands back still says "0 verified" for a build
  // whose stories the platform is holding at verified — the same defect one
  // layer up, and the number a student actually looks at after pressing Sync.
  const summary: BuildVerificationSummary = {
    project_id: projectId,
    ok: true,
    error_class: null,
    reason: null,
    plan_version: stored.version,
    checked_at: checkedAt,
    rollup: {
      ...decision.rollup,
      stories_verified: stories.filter((s) => s.state === 'verified').length,
      stories_submitted: stories.filter((s) => s.state === 'submitted').length,
      stories_in_progress: stories.filter((s) => s.state === 'in_progress').length,
      stories_not_started: stories.filter((s) => s.state === 'not_started').length,
      criteria_passed: stories.reduce((n, s) => n + s.criteria_passed, 0),
      xp_awarded: xpAwarded,
      newly_verified: newlyVerified,
    },
    stories,
    unknown_stories: decision.unknown_stories,
    window_truncated: inputs.window_truncated,
  };

  log('sbp_verification_completed', opts.correlationId, 'success', {
    projectId,
    duration_ms: Date.now() - startedAt,
    plan_version: stored.version,
    verified: summary.rollup.stories_verified,
    submitted: summary.rollup.stories_submitted,
    newly_verified: newlyVerified,
    xp_awarded: xpAwarded,
    unknown_stories: decision.unknown_stories,
    commits_scanned: inputs.commits_scanned,
  });

  return summary;
}

/** A student-facing sentence per upstream failure class. Never the raw GitHub body. */
function readErrorMessage(err: RepoReadError): string {
  switch (err.error_class) {
    case 'RateLimited':
      return err.retry_after_s
        ? `GitHub is rate-limiting us right now. Try again in about ${err.retry_after_s} seconds — nothing was lost.`
        : 'GitHub is rate-limiting us right now. Try again in a few minutes — nothing was lost.';
    case 'RepoNotFound':
      return 'Your workspace repo could not be found on GitHub. It may have been renamed or deleted.';
    case 'Unauthorized':
      return 'The platform could not read your workspace repo. Tell your instructor — this is on our side, not yours.';
    case 'UpstreamTimeout':
      return 'GitHub did not answer in time. Try Sync again in a moment.';
    case 'ConfigError':
      return 'The platform is not configured to read GitHub right now. Tell your instructor.';
    default:
      return 'GitHub could not be read right now. Try Sync again in a moment.';
  }
}
