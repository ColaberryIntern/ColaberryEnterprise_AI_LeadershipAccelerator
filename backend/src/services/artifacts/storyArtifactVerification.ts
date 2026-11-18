/**
 * storyArtifactVerification - phase A2's shell. For each story in a published plan that declares
 * an artifact contract, match the contract against the repository tree the verification sync has
 * already read, record what was genuinely handed over, and report what is outstanding.
 *
 * Every RULE about what counts lives in `storyArtifactMatch`, which is pure. Every WRITE lives in
 * `storyArtifactVerificationStore`, which never throws. This module is only the sequencing, so
 * `buildVerificationService` gains one call rather than a second verification loop.
 *
 * ----------------------------------------------------------------------------
 * NO NEW TRIGGER, AND THAT IS THE POINT
 * ----------------------------------------------------------------------------
 * This rides on the pass the GitHub push webhook already runs. It adds no request to GitHub: the
 * tree, the commits and the plan are all already in hand by the time it is called, and the blob
 * sha and size it records were being discarded by the reader before A2 kept them. A second
 * scheduler watching repositories would have been a second thing to operate, a second thing to
 * rate-limit and a second thing to be wrong on its own.
 *
 * ----------------------------------------------------------------------------
 * IT CANNOT CHANGE A VERDICT YET, BY DESIGN
 * ----------------------------------------------------------------------------
 * The modes are `off` (default) and `report_only`. There is deliberately NO enforcing mode here:
 * making a missing artifact withhold a story's completion changes what a student is told they
 * owe and what they are paid, and it should be switched on against a week of real measurements
 * rather than on the day the measuring is written. The first cycle therefore measures what it
 * WOULD have refused. Gating belongs to the completion phase, and the `mode` column on every row
 * exists so that when it arrives, the rows that gated nothing stay distinguishable from the rows
 * that did.
 *
 * So this module returns a report and writes audit rows. It never touches `student_tasks`, never
 * awards or withholds XP, and never reaches `markTaskVerifiedComplete`.
 */

import {
  validateArtifactContract,
  type ResolvedArtifact,
} from './storyArtifactContract';
import {
  artifactTreeFrom,
  matchStoryArtifacts,
  type ArtifactMatch,
  type ArtifactTreeEntry,
} from './storyArtifactMatch';
import { recordStoryArtifacts } from './storyArtifactVerificationStore';

export type StoryArtifactVerificationMode = 'off' | 'report_only';

/** The flag. Absent or unrecognized means `off`: this never switches itself on. */
export function storyArtifactMode(
  env: Record<string, string | undefined> = process.env,
): StoryArtifactVerificationMode {
  return env.STORY_ARTIFACT_VERIFICATION === 'report_only' ? 'report_only' : 'off';
}

/** Only the two fields of a plan story this module reads. */
export interface StoryWithMaybeContract {
  id?: string;
  artifacts?: unknown;
}

export interface StoryArtifactReport {
  story_id: string;
  /** Keys recorded as handed over at this commit. */
  satisfied: string[];
  /** Keys looked for in the repository and not accepted. This is what a person still owes. */
  outstanding: string[];
  /** Keys this check cannot speak to: handed over on the platform, or an unreadable tree. */
  unverifiable: string[];
  /** Every match in full, including the one-sentence reason per key. */
  matches: ArtifactMatch[];
  /** Rows Postgres actually inserted on this run. Zero on a re-sync of the same commit. */
  rows_inserted: number;
  /** Set when the contract on this story is malformed; the codes name the fields. */
  contract_refused: string[] | null;
}

export interface StoryArtifactVerificationResult {
  mode: StoryArtifactVerificationMode;
  /** The commit the match was made against, or null when none was readable. */
  commit_sha: string | null;
  /** Stories that declared a contract. */
  stories_with_contract: number;
  /** Keys handed over, across every story. */
  satisfied_total: number;
  /** Keys still owed, across every story. */
  outstanding_total: number;
  /** True when the tree could not be read, so nothing was asserted or recorded. */
  tree_unreadable: boolean;
  reports: StoryArtifactReport[];
}

const EMPTY = (mode: StoryArtifactVerificationMode): StoryArtifactVerificationResult => ({
  mode,
  commit_sha: null,
  stories_with_contract: 0,
  satisfied_total: 0,
  outstanding_total: 0,
  tree_unreadable: false,
  reports: [],
});

/**
 * Run the artifact check for one project's stories.
 *
 * NEVER THROWS. Called from inside `verifyBuildFromRepo`, whose contract is that every expected
 * condition is a classified result. A malformed contract, a missing tree, a failed write: each is
 * a reported state, because none of them is a reason to fail the verification that found them.
 */
export async function verifyStoryArtifacts(args: {
  projectId: string;
  stories: ReadonlyArray<StoryWithMaybeContract>;
  treeEntries: ReadonlyArray<ArtifactTreeEntry> | null;
  headCommitSha: string | null;
  planVersion: number | null;
  mode?: StoryArtifactVerificationMode;
}): Promise<StoryArtifactVerificationResult> {
  const mode = args.mode ?? storyArtifactMode();
  if (mode === 'off') return EMPTY(mode);

  const tree = artifactTreeFrom(args.treeEntries ? [...args.treeEntries] : null);
  const out = EMPTY(mode);
  out.commit_sha = args.headCommitSha ?? null;
  out.tree_unreadable = tree === null;

  for (const story of args.stories || []) {
    const storyId = typeof story.id === 'string' ? story.id : '';
    if (!storyId) continue;
    if (story.artifacts === undefined || story.artifacts === null) continue;

    out.stories_with_contract += 1;

    // A stored plan is never re-validated on read, so the contract may be malformed. That is a
    // reported state naming the fields, not a thrown error and not a silent skip.
    const validated = validateArtifactContract(story.artifacts, { storyId });
    if (!validated.ok) {
      out.reports.push({
        story_id: storyId,
        satisfied: [],
        outstanding: [],
        unverifiable: [],
        matches: [],
        rows_inserted: 0,
        contract_refused: validated.refusals.map((r) => r.code),
      });
      continue;
    }

    const resolved: ResolvedArtifact[] = validated.artifacts;
    const summary = matchStoryArtifacts(resolved, tree);

    let inserted = 0;
    if (tree !== null && args.headCommitSha) {
      const outcome = await recordStoryArtifacts({
        projectId: args.projectId,
        storyId,
        commitSha: args.headCommitSha,
        planVersion: args.planVersion,
        mode: 'report_only',
        matches: summary.matches,
      });
      inserted = outcome.inserted;
    }

    out.satisfied_total += summary.satisfied.length;
    out.outstanding_total += summary.outstanding.length;
    out.reports.push({
      story_id: storyId,
      satisfied: summary.satisfied,
      outstanding: summary.outstanding,
      unverifiable: summary.unverifiable,
      matches: summary.matches,
      rows_inserted: inserted,
      contract_refused: null,
    });
  }

  return out;
}
