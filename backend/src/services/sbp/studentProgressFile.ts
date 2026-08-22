/**
 * studentProgressFile — the commit the platform cannot make, handed over as a
 * download.
 *
 * ## The problem this closes
 *
 * A student whose repo the platform can PUSH to never thinks about
 * `.colaberry/progress.json`. Every sync renders it from the plan, merges it
 * over whatever is in the repo, and commits the result. Every story, every
 * acceptance criterion in the exact words the verifier grades against, and
 * their own ticks carried across.
 *
 * A pull-only student got none of that, and every surface that tried to help
 * them pointed at something they could not reach:
 *
 *   - `WorkspaceRepoPanel` told them to copy the JSON block out of STORY-000.
 *     That block is one story, so the file it builds can never confirm any
 *     other — silently, with no error. Eleven students were caught.
 *   - The first attempt at a fix pointed at `.colaberry/progress.seed.json`.
 *     That path is produced by `seedPathFor` in exactly one place, inside the
 *     docs zip. Read live from all fifteen pull-only repos on 2026-08-21: the
 *     seed is in NONE of them. Same defect, one layer down.
 *
 * The content was never the problem — `renderProgressFile` has always seeded
 * every story's exact criteria. DELIVERY was. So this module does the whole of
 * what a sync would do for them, up to but not including the write, and returns
 * the bytes for the student to save themselves.
 *
 * ## Why it merges rather than seeds
 *
 * Handing over a blank seed and telling a student "do not copy this over your
 * own file" puts the merge on the person least equipped to do it — by hand, in
 * JSON, at the moment they are already stuck. Several of these students hold
 * real ticked criteria; one holds nine custom top-level keys her Command Center
 * reads at runtime. So the merge happens HERE, server-side, with the platform's
 * own reference implementation, and what the student receives is already theirs
 * plus ours. Replacing their file with it is the correct instruction, which is
 * the only instruction simple enough to survive contact with a reader who told
 * us plainly this week that he could not understand our instructions at all.
 *
 * ## Read-only
 *
 * Nothing here writes to a student's repo, and nothing here writes to the
 * database. It reads the plan, reads their file, and returns bytes.
 */
import { getPublishedPlan, getPlan } from './planStore';
import { renderDocs } from './renderDocs';
import { repoWriteAccessForProject } from './repoWriteAccess';
import { loadBuildProgress } from './buildProgressSnapshot';
import { readRepoProgressFile } from './repoWriter';
import { BuildPlan } from './planContract';
import { RepoConnectError } from './repoConnect/connectErrors';
import { PROGRESS_FILE_PATH, parseProgressFile } from './verification/progressContract';
import {
  StudentProgressMergeResult,
  mergeStudentProgressFile,
} from './verification/studentProgressMerge';

export interface StudentProgressFile {
  /** Where the student must save it. The live path, never a `.seed.json` sibling. */
  path: string;
  /** What the browser calls the download. */
  filename: string;
  content: string;
  planVersion: number;
  /** True when the plan behind it is published rather than a draft. */
  published: boolean;
  /** Whether their repo could be read at all, and what came across. */
  merge: StudentProgressMergeResult;
  /** `owner/repo` the merge input was read from, or null when none is connected. */
  repo: string | null;
}

export interface BuildStudentProgressFileOptions {
  correlationId?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Build one student's own `.colaberry/progress.json`.
 *
 * @throws RepoConnectError('NoPublishedPlan') when the project has no plan at
 *         all — there are no stories to seed, so there is no file to build and
 *         saying so beats handing over an empty one.
 */
export async function buildStudentProgressFile(
  projectId: string,
  opts: BuildStudentProgressFileOptions = {},
): Promise<StudentProgressFile> {
  const published = await getPublishedPlan(projectId);
  const stored = published ?? await getPlan(projectId);
  if (!stored) {
    throw new RepoConnectError(
      'NoPublishedPlan',
      'This build has no plan yet, so there is no progress file to build. Finish the build wizard first.',
    );
  }
  const plan = stored.plan as BuildPlan;

  /**
   * The connection is read DIRECTLY rather than through `repoForProject`.
   *
   * `repoForProject` answers "is there a repo worth attempting a WRITE against"
   * and returns null for a pull-only connection by design — which is precisely
   * the cohort this function exists for. Routing this read through it would make
   * the feature return the blank seed to every student it was built for, and it
   * would look like it was working. `buildVerificationService` reads the row the
   * same way for the same reason.
   */
  const { default: GitHubConnection } = await import('../../models/GitHubConnection');
  const conn = await GitHubConnection.findOne({ where: { project_id: projectId } });
  const owner = conn?.repo_owner ?? null;
  const repo = conn?.repo_name ?? null;

  const { default: Project } = await import('../../models/Project');
  const project = await Project.findByPk(projectId);
  const enrollmentId = String((project as any)?.enrollment_id ?? '');

  // The platform's own conclusions — verified stories, commit shas, points —
  // mirrored into the file exactly as a sync would mirror them, so the Command
  // Center a pull-only student builds reads the same data as everyone else's.
  const snapshot = await loadBuildProgress(projectId, enrollmentId || null);
  const repoWriteAccess = await repoWriteAccessForProject(projectId, opts.correlationId ?? null);

  /**
   * RENDERED THROUGH `renderDocs`, not through a local `renderProgressFile` call.
   *
   * The seed list is `plan.stories` PLUS the Command Center story, and that
   * append has already been re-derived independently in three places
   * (`renderDocs`, `buildVerificationService`, `sbpRoutes`). A fourth copy here
   * is how this download would come to disagree with the file a push-access
   * student receives about whether STORY-000 exists — the single most expensive
   * way this feature could fail, since STORY-000 is the story every one of these
   * students is stuck on. Taking the rendered file off the same renderer makes
   * that disagreement impossible rather than unlikely.
   */
  const rendered = renderDocs(plan, {
    repoUrl: conn?.repo_url || (owner && repo ? `https://github.com/${owner}/${repo}` : null),
    planVersion: stored.version,
    planSha256: stored.plan_sha256,
    correlationId: opts.correlationId,
    progress: snapshot.progress,
    baselineByStory: snapshot.baselineByStory,
    repoWriteAccess,
  }).find((f) => f.path === PROGRESS_FILE_PATH);

  if (!rendered) {
    // Unreachable unless renderDocs stops emitting the file. Loud rather than a
    // silent empty download: a student cannot act on an empty file, and this
    // would be our defect, not theirs.
    throw new RepoConnectError(
      'NoPublishedPlan',
      'Your progress file could not be built just now. This is a fault on our side — tell us and we will fix it.',
    );
  }

  const parsedRender = parseProgressFile(rendered.content);
  if (!parsedRender.ok) {
    // Same posture as `repoWriter`: our own render failing to parse is a defect
    // in `renderDocs`, not a student problem, so hand over the rendered bytes
    // rather than merging blind against a file we do not understand.
    return {
      path: PROGRESS_FILE_PATH,
      filename: 'progress.json',
      content: rendered.content,
      planVersion: stored.version,
      published: Boolean(published),
      repo: owner && repo ? `${owner}/${repo}` : null,
      merge: {
        content: rendered.content,
        existing: 'absent',
        stories: 0,
        criteria: 0,
        criteria_passed: 0,
        preserved_top_level_keys: [],
        preserved_story_keys: [],
        unrecognised_story_ids: [],
      },
    };
  }

  // No repo connected ⇒ nothing to merge over, and that is a legitimate state
  // rather than an error: the student gets the clean seed, which is exactly
  // right for someone starting from nothing.
  const existingRaw = owner && repo
    ? await readRepoProgressFile(
      { owner, repo },
      { correlationId: opts.correlationId, fetchImpl: opts.fetchImpl },
    )
    : null;

  const merge = mergeStudentProgressFile(parsedRender.file, existingRaw);

  return {
    path: PROGRESS_FILE_PATH,
    filename: 'progress.json',
    content: merge.content,
    planVersion: stored.version,
    published: Boolean(published),
    repo: owner && repo ? `${owner}/${repo}` : null,
    merge,
  };
}
