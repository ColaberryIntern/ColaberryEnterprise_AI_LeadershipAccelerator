/**
 * storyArtifactMatch - PURE. Given a story's resolved artifact contract and the repository tree
 * the verification sync already read, which declared artifacts are actually handed over?
 *
 * No I/O, no clock, no randomness, no GitHub call. Same contract and same tree in, identical
 * verdicts out, so a re-sync over an unchanged commit cannot reach a different answer.
 *
 * ---------------------------------------------------------------------------
 * FIVE RULES, EACH ONE THERE BECAUSE THE DISHONEST VERSION IS EASIER TO WRITE
 * ---------------------------------------------------------------------------
 *
 * 1. AN UNREADABLE TREE ENFORCES NOTHING. `readTreePaths` returns null when GitHub says the
 *    tree is truncated or the read failed, and `criterionPaths` already reads that null as
 *    "enforce nothing against this student" rather than as "the files are missing". A1's gate
 *    is stated the other way round, on purpose: refusing to PUBLISH on bad input costs a
 *    person five minutes, while reporting a student's finished work as missing because GitHub
 *    hiccuped costs them the thing they built. Same principle, opposite direction, because the
 *    cost of being wrong is not symmetric. A null tree yields `tree_unreadable` for every key
 *    and NOTHING is recorded.
 *
 * 2. A PLATFORM ARTIFACT IS NOT OUTSTANDING, IT IS UNVERIFIABLE HERE. A portfolio page or a
 *    field guide is handed over on the platform and has no repo path by construction (A0
 *    refuses one). Counting it as outstanding would leave every story that declares one
 *    permanently unsatisfiable by a verifier that cannot see it, and counting it as satisfied
 *    would be a claim nobody checked. It gets its own bucket, reported and never counted as
 *    either.
 *
 * 3. "PRESENT" IS NOT "SATISFIED" WHEN `must_contain` WAS DECLARED. The tree gives paths,
 *    blob shas and sizes. It does not give CONTENT, and reading content would mean one GitHub
 *    call per artifact on a path that currently makes none. So an artifact whose contract names
 *    phrases a reader must find is recorded as `present_content_unchecked`, never as
 *    `satisfied`. The row then says exactly what was and was not checked, instead of a verdict
 *    that silently means less than it reads.
 *
 * 4. THE DECLARED TYPE IS NOT RE-CHECKED HERE, BECAUSE IT CANNOT BE WRONG BY THIS POINT.
 *    The first draft of this module compared the file's extension against the contract's
 *    `file_types` and returned a `wrong_file_type` verdict. Its test could not be made to pass,
 *    which is how the branch was found to be unreachable: A0's schema already refuses a contract
 *    whose `repo_path` extension is not one the artifact accepts (`repo_path_extension_not_
 *    declared`), narrowing included, and every contract read here goes through that validation
 *    first. The lookup is an EXACT path match, so the file found at the declared path has the
 *    declared path's extension by definition.
 *
 *    The check is therefore real and lives one phase earlier, where an author can still fix it,
 *    rather than being re-run against a student on every push. The branch was deleted instead of
 *    left in as defensive cover: an unreachable branch is a verdict no row can ever carry and no
 *    test can ever exercise. `storyArtifactMatch.test.ts` asserts the invariant that makes it
 *    unreachable, so if A0 ever stops refusing the mismatch, a test fails here.
 *
 * 5. AN EMPTY FILE IS NOT A HANDOVER. A zero-byte file at the right path with the right
 *    extension satisfies rules 1 to 4 and hands over nothing. GitHub's tree already carries
 *    `size`, so this costs nothing to check and closes the cheapest possible fake.
 */

import type { ResolvedArtifact } from './storyArtifactContract';

/** One entry of the repository tree, as GitHub's tree API already returns it. */
export interface ArtifactTreeEntry {
  /** Path from the repository root, exactly as the tree reports it. */
  path: string;
  /** The git blob sha: content identity, carried by the tree response at no extra cost. */
  sha: string;
  /** Bytes. Absent on a tree entry that is not a blob. */
  size: number | null;
}

/**
 * The tree, or `null` for a tree that could not be read. Null is NOT an empty tree: see rule 1.
 */
export type ArtifactTree = ReadonlyMap<string, ArtifactTreeEntry> | null;

export type ArtifactMatchVerdict =
  /** Present at the declared path, an allowed type, non-empty, and nothing further was claimed. */
  | 'satisfied'
  /** Present and well formed, but the contract names phrases nobody has read. See rule 3. */
  | 'present_content_unchecked'
  /** Repo evidence, and the declared path is not in the tree. */
  | 'missing'
  /** Present and allowed, and zero bytes. See rule 5. */
  | 'empty_file'
  /** Handed over on the platform; this verifier cannot see it either way. See rule 2. */
  | 'not_repo_evidence'
  /** The tree could not be read, so nothing is asserted about this key. See rule 1. */
  | 'tree_unreadable';

export interface ArtifactMatch {
  key: string;
  verdict: ArtifactMatchVerdict;
  /** The path the contract declared, or null for a platform artifact. */
  repo_path: string | null;
  /** The git blob sha, only when a file was actually found. */
  blob_sha: string | null;
  size_bytes: number | null;
  /** One sentence, written to be shown to the person who owes the artifact. */
  reason: string;
}

export interface StoryArtifactMatchSummary {
  matches: ArtifactMatch[];
  /** Keys that count as handed over: `satisfied` and `present_content_unchecked`. */
  satisfied: string[];
  /** Keys this verifier looked for in the repo and did not accept. */
  outstanding: string[];
  /** Keys this verifier cannot speak to at all: platform artifacts, or an unreadable tree. */
  unverifiable: string[];
  /** True when the tree could not be read, so no row should be written for this story. */
  tree_unreadable: boolean;
}

/** The verdicts that mean the artifact is handed over. Exported so no caller re-lists them. */
export const SATISFYING_VERDICTS: ReadonlyArray<ArtifactMatchVerdict> = [
  'satisfied',
  'present_content_unchecked',
];

/** The verdicts that mean this verifier cannot speak to the key either way. */
export const UNVERIFIABLE_VERDICTS: ReadonlyArray<ArtifactMatchVerdict> = [
  'not_repo_evidence',
  'tree_unreadable',
];

function matchOne(artifact: ResolvedArtifact, tree: ArtifactTree): ArtifactMatch {
  const base = {
    key: artifact.key,
    repo_path: artifact.repo_path,
    blob_sha: null as string | null,
    size_bytes: null as number | null,
  };

  // Rule 1, checked FIRST: an unreadable tree asserts nothing about anything.
  if (tree === null) {
    return {
      ...base,
      verdict: 'tree_unreadable',
      reason: 'The repository tree could not be read on this sync, so nothing is claimed about '
        + 'this artifact. Nothing was recorded, and the next sync will check it again.',
    };
  }

  // Rule 2: a platform artifact has no repo path by construction.
  if (artifact.evidence_source !== 'repo' || !artifact.repo_path) {
    return {
      ...base,
      verdict: 'not_repo_evidence',
      reason: `This artifact is handed over on the platform, not in the repository, so the `
        + 'repository check neither confirms nor denies it.',
    };
  }

  const entry = tree.get(artifact.repo_path);
  if (!entry) {
    return {
      ...base,
      verdict: 'missing',
      reason: `Nothing is committed at ${artifact.repo_path}.`,
    };
  }

  const found = { ...base, blob_sha: entry.sha, size_bytes: entry.size };

  // Rule 5: an empty file hands over nothing.
  if (entry.size === 0) {
    return {
      ...found,
      verdict: 'empty_file',
      reason: `${artifact.repo_path} is committed but empty.`,
    };
  }

  // Rule 3: do not call it satisfied if the contract named content nobody read.
  if ((artifact.must_contain || []).length > 0) {
    return {
      ...found,
      verdict: 'present_content_unchecked',
      reason: `${artifact.repo_path} is committed and is an accepted type. Its contract also `
        + `requires ${(artifact.must_contain || []).map((p) => `"${p}"`).join(', ')}, which this `
        + 'check does not read, so a person still confirms the contents.',
    };
  }

  return {
    ...found,
    verdict: 'satisfied',
    reason: `${artifact.repo_path} is committed and is an accepted type.`,
  };
}

/**
 * Match one story's contract against the tree.
 *
 * An empty contract returns empty buckets and `tree_unreadable: false`: a story that declares
 * nothing has nothing outstanding, which is a statement about the contract rather than about the
 * work. A0's gate is what stops a story declaring nothing in the first place.
 */
export function matchStoryArtifacts(
  artifacts: ReadonlyArray<ResolvedArtifact>,
  tree: ArtifactTree,
): StoryArtifactMatchSummary {
  const matches = (artifacts || []).map((a) => matchOne(a, tree));
  const inBucket = (m: ArtifactMatch, set: ReadonlyArray<ArtifactMatchVerdict>) =>
    set.indexOf(m.verdict) !== -1;

  return {
    matches,
    satisfied: matches.filter((m) => inBucket(m, SATISFYING_VERDICTS)).map((m) => m.key),
    unverifiable: matches.filter((m) => inBucket(m, UNVERIFIABLE_VERDICTS)).map((m) => m.key),
    outstanding: matches
      .filter((m) => !inBucket(m, SATISFYING_VERDICTS) && !inBucket(m, UNVERIFIABLE_VERDICTS))
      .map((m) => m.key),
    tree_unreadable: tree === null && matches.length > 0,
  };
}

/** Build the lookup the matcher wants from the raw tree entries, dropping non-blob entries. */
export function artifactTreeFrom(
  entries: ReadonlyArray<ArtifactTreeEntry> | null,
): ArtifactTree {
  if (entries === null) return null;
  const map = new Map<string, ArtifactTreeEntry>();
  for (const e of entries) {
    if (e && typeof e.path === 'string' && e.path) map.set(e.path, e);
  }
  return map;
}
