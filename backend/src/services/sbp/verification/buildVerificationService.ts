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
import { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_ACCEPTANCE } from '../commandCenterStory';
import { markTaskVerifiedComplete } from '../../projects/projectWriteService';
import { recordEvidence } from '../../progression/evidenceEngine';
import { getBudgetPerUnitXp } from '../../progression/pointsConfigService';
import { parseProgressFile, ProgressParseErrorClass } from './progressContract';
import {
  decideBuild,
  summariseUnrecognisedCriteria,
  BuildRollup,
  PlanStorySpec,
  StoryVerdict,
  RepoTreeContext,
} from './verifyDecision';
import { summariseRejectedClaims } from './rejectedClaimsSignal';
import { writeAccessOf } from '../repoConnect/connectionAccess';
import {
  readVerificationInputs,
  RepoReadError,
  RepoReadErrorClass,
} from './repoProgressReader';
import { storedConnect } from '../repoConnect/connectionAccess';
import {
  annotateReadError,
  applyVerificationLatch,
  ProgressReadError,
  VerificationRecord,
} from './verificationLatch';

/**
 * The points_config key a verified story awards against.
 *
 * A key of its own, deliberately not reusing the `project_task` card type: the
 * curriculum economy and the build economy should be tunable apart.
 *
 * THE AWARD MODEL IS A BUDGET, NOT A RATE. The row carries a whole-capstone
 * Builder XP budget which is divided across the stories in that project's
 * published plan, so decomposing the same work into more stories pays no more
 * than decomposing it into fewer. The budget is editable in `points_config`;
 * nothing here hardcodes it. See pointsConfigService.getBudgetPerUnitXp.
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
    /** Builder XP this run actually awarded: per-story rate x stories newly verified. */
    xp_awarded: number;
    /** Stories that crossed into verified on THIS run. */
    newly_verified: string[];
  };
  stories: Array<{ story_id: string } & StoryVerificationRecord>;
  /** Story ids in the progress file that the published plan does not have. */
  unknown_stories: string[];
  /** True when older commits exist beyond the read window. */
  window_truncated: boolean;
  /**
   * The branch the verdict was reached on. Null only when nothing could be read.
   *
   * Previously unanswerable: the reader passed no ref and GitHub silently chose,
   * so a student reporting "the portal cannot see my work" left no record of
   * where we had looked.
   */
  branch_read: string | null;
  /**
   * Non-default branches carrying commits that name a story, when the default
   * branch carried none.
   *
   * Non-empty means the student HAS done the work and it is not on the branch we
   * verify. That is a merge instruction, not a failure, and it is the difference
   * between "you have done nothing" and "your work is on `feature/x`".
   */
  unmerged_branches: string[];
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
    branch_read: null,
    unmerged_branches: [],
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

  /**
   * The stories to judge — the plan's, PLUS the Command Center.
   *
   * STORY-000 is deliberately kept out of `plan.stories` (it is scaffolding the
   * platform authors, not work the student planned), and this loop used to build
   * its spec list from `plan.stories` alone. The consequence was silent and
   * total: STORY-000 got no verdict, no `verification_json`, and no route to
   * `verified_at` — it was the one story on every build that could never be
   * verified, and once completion is gated on the latch it became the one story
   * that could never be finished at all.
   *
   * Its criteria come from COMMAND_CENTER_ACCEPTANCE, which is the same constant
   * materializeTasks writes onto the task row, so the plan and the row cannot
   * disagree about what this story asks for.
   *
   * Deduped defensively: if a plan ever does carry a STORY-000 of its own, the
   * plan wins and nothing is appended, because the plan is the authority on
   * every story it actually contains.
   */
  const planSpecs: PlanStorySpec[] = (stored.plan.stories ?? []).map((s) => ({
    id: s.id,
    acceptance: Array.isArray(s.acceptance) ? s.acceptance.map(String) : [],
  }));
  const specs: PlanStorySpec[] = planSpecs.some((s) => s.id === COMMAND_CENTER_STORY_ID)
    ? planSpecs
    : [...planSpecs, { id: COMMAND_CENTER_STORY_ID, acceptance: [...COMMAND_CENTER_ACCEPTANCE] }];

  let inputs;
  try {
    /**
     * NAME THE BRANCH. The connect flow recorded the repo's default branch on
     * this row; passing it means verification reads a branch we can state and log
     * rather than one GitHub chose for us silently.
     *
     * Not defaulted to `main` when absent — `Pamy77/colaberry-architect-workspace`
     * is on `master`, and a hardcoded default would have broken her build to fix
     * a diagnostic gap. Absent simply falls through to the previous behaviour.
     */
    inputs = await readVerificationInputs(
      {
        owner: connection.repo_owner,
        repo: connection.repo_name,
        branch: storedConnect(connection).default_branch ?? null,
      },
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
  //
  // It used to return here having written NOTHING, which sounds conservative
  // and is not: the row keeps whatever the last READABLE sync concluded, and
  // the portal renders that stale verdict as though it were this push's answer.
  // A student in exactly that position was told "None of the 5 acceptance
  // criteria are marked as passing yet" for hours while every sync was in fact
  // failing to parse her file, and she went back to re-verify finished code.
  // The reason is documented as "one sentence a student can act on"; it now
  // reaches them instead of stopping at the log line.
  const parsed = parseProgressFile(inputs.progressRaw);
  if (!parsed.ok && parsed.error_class !== 'ProgressFileMissing') {
    log('sbp_verification_progress_rejected', opts.correlationId, 'failure', {
      projectId, error_class: parsed.error_class, issues: parsed.issues ?? [],
    });
    await recordProgressReadError(
      projectId, specs, { error_class: parsed.error_class, reason: parsed.reason }, opts,
    );
    return failure(projectId, parsed.error_class, parsed.reason);
  }

  /**
   * The repo as it stands, for the criterion path check.
   *
   * `writeAccessOf` returns null on every connection made before the permission
   * was captured — which is all 10 live rows today — and `criterionPaths` reads
   * that null as "enforce nothing against this student". That is deliberate
   * sequencing, not an oversight: until PR #1618 populates the field we cannot
   * tell a file we owed a student from a file they never added, and the cautious
   * direction is theirs. See criterionPaths.blameForMissing.
   *
   * Null `treePaths` (a tree we could not read) disables the check outright.
   */
  const tree: RepoTreeContext | null = inputs.treePaths
    ? { paths: inputs.treePaths, writeAccess: writeAccessOf(connection) }
    : null;

  const decision = decideBuild(specs, parsed.ok ? parsed.file : null, inputs.commits, tree);
  const checkedAt = new Date().toISOString();

  /**
   * FIX 4 — the mismatch signal reaches a human.
   *
   * `rejected_claims` has been recorded since this loop shipped and read by
   * nothing. One line per run, not per claim, at `warn`, on the stream that
   * already carries this service's events. Emitted BEFORE the per-story loop so
   * a database failure partway through the writes cannot swallow the diagnosis.
   *
   * No student name, no email, no repo contents beyond the unmatched sentences
   * themselves — the project id is enough to find the row, and this is wording
   * drift, not fraud.
   */
  // MERGE NOTE: named `claimsDrift`, not `drift`. `summariseUnrecognisedCriteria`
  // (main, commit 509320a4) already binds `drift` further down this same
  // function for the separate unrecognised-criteria signal. Both signals are
  // kept: this one is the asserted-only `rejected_claims` warn line, that one is
  // the summary flattened onto `sbp_verification_completed`.
  const claimsDrift = summariseRejectedClaims(decision.verdicts);
  if (claimsDrift) {
    log('sbp_verification_claims_unmatched', opts.correlationId, 'partial', {
      projectId,
      plan_version: stored.version,
      claims_total: claimsDrift.claims_total,
      stories_affected: claimsDrift.stories_affected,
      samples: claimsDrift.samples,
      likely_wording_drift: claimsDrift.likely_wording_drift,
      note: claimsDrift.likely_wording_drift
        ? 'a story is held back by claims that match no criterion — check the plan wording against the repo'
        : 'unmatched claims on stories that are otherwise fine; informational',
    });
  }

  // The per-story rate for THIS build: the capstone budget split across the
  // stories in the published plan. Resolved once per run, before any award, so
  // every story verified on this run is paid at the same rate even if the plan
  // is republished mid-run.
  //
  // Deliberately the PLAN's story count (`specs.length`) and not the count of
  // stories the student has finished — otherwise the rate would climb as the
  // build progressed and the first story would be worth less than the last.
  //
  // Awards already written are never repriced. Evidence records are immutable
  // and idempotency-keyed, so a plan republished at a different story count
  // changes the rate for stories verified from then on and leaves earned XP
  // exactly where it is. That is the intended behaviour: you keep what you
  // earned under the plan you earned it under.
  const storyAward = await getBudgetPerUnitXp(STORY_XP_KEY, specs.length);
  if (storyAward.reason) {
    log('sbp_verification_award_unset', opts.correlationId, 'partial', {
      projectId,
      reason: storyAward.reason,
      stories_in_plan: specs.length,
      note: 'evidence will be recorded but no Builder XP will move',
    });
  }

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
      builderXpOverride: storyAward.per_unit,
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
    branch_read: inputs.branch_read,
    unmerged_branches: inputs.unmerged_branches,
  };

  /**
   * THE DRIFT SIGNAL, ON THE LINE SOMEBODY ACTUALLY READS.
   *
   * `sbp_verification_completed` is the one event emitted on every run, and it
   * carried eight fields, none of which was the rejection list. So a build whose
   * progress file was full of criteria the plan has never heard of logged
   * identically to a build that was simply early: `verified: 0`, and nothing
   * else to look at. Across 493 task rows there was not one non-empty
   * `rejected_claims` in the database, and no log line would have shown one
   * either.
   *
   * Flattened onto the completion event rather than raised as its own alert,
   * because this is wording drift, not an incident — see
   * `summariseUnrecognisedCriteria` for the proportionality argument and for why
   * `asserted` and `unasserted` are counted apart rather than summed.
   *
   * `null` when there is no drift, so a clean run logs `drift: null` and stays
   * one line instead of growing an empty object on every sync.
   */
  const drift = summariseUnrecognisedCriteria(decision.verdicts);

  // A student whose work exists but sits off the verified branch is the one case
  // where "nothing is passing" is actively misleading. Logged at warn so it is
  // greppable when they open a ticket saying the portal cannot see their work.
  if (inputs.unmerged_branches.length > 0) {
    log('sbp_verification_evidence_off_branch', opts.correlationId, 'partial', {
      projectId,
      branch_read: inputs.branch_read,
      unmerged_branches: inputs.unmerged_branches,
      note: 'story commits exist on other branches; verdict is default-branch only',
    });
  }

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
    // The asserted subset, verbatim — this is the field the event was missing.
    rejected_claims: decision.verdicts.flatMap((v) => v.rejected_claims),
    // And the whole signal, including the unticked half that produced nothing at all.
    unrecognised_criteria: drift,
  });

  return summary;
}

/**
 * Tell every story on the build that the progress file could not be read.
 *
 * THE ONLY WRITE ON THE REJECT PATH, and deliberately the narrowest one that
 * exists: `verification_json` and nothing else. No `markTaskVerifiedComplete`,
 * no `recordEvidence`, no touch of `verified_at` / `verified_by` /
 * `verified_ref`. A file we could not read is the weakest evidence there is —
 * it may not award anything and it may not revoke anything.
 *
 * VERIFIED STORIES ARE SKIPPED ENTIRELY. Their record already says the work is
 * done and banked, there is nothing for the student to act on, and leaving the
 * row untouched is the strongest possible statement that the latch is not in
 * play here.
 *
 * IDEMPOTENT. The written record is a pure function of (prior record, error)
 * and `annotateReadError` is a fixed point, so a student mashing Sync against a
 * broken file converges on one state and stays there. The write is
 * unconditional rather than diffed first: re-writing an identical blob costs
 * one UPDATE and removes a branch that could otherwise skip a row whose stored
 * copy had drifted.
 *
 * FAILS SOFT per story. One unwritable row must not cost the other nineteen
 * their message, and the caller's `failure(...)` is returned either way — this
 * function only ever adds honesty to what the student sees.
 */
async function recordProgressReadError(
  projectId: string,
  specs: PlanStorySpec[],
  err: ProgressReadError,
  opts: VerifyOptions,
): Promise<void> {
  let annotated = 0;
  let skippedVerified = 0;

  for (const spec of specs) {
    try {
      const task = await StudentTask.findOne({ where: { project_id: projectId, story_id: spec.id } });
      if (!task) continue;
      if (task.verified_at) { skippedVerified += 1; continue; }

      const next = annotateReadError(task.verification_json as Partial<VerificationRecord> | null, err);
      await StudentTask.update({ verification_json: next }, { where: { id: task.id } });
      annotated += 1;
    } catch (e: unknown) {
      log('sbp_verification_read_error_write_failed', opts.correlationId, 'partial', {
        projectId,
        storyId: spec.id,
        error_class: (e as { name?: string })?.name ?? 'Error',
        message: (e as { message?: string })?.message,
      });
    }
  }

  log('sbp_verification_read_error_recorded', opts.correlationId, 'partial', {
    projectId,
    error_class: err.error_class,
    stories_annotated: annotated,
    stories_skipped_verified: skippedVerified,
    note: 'the student now sees why the file could not be read; nothing was awarded or revoked',
  });
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
