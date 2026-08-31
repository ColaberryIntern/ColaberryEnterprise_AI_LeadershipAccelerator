import { z } from 'zod';

/**
 * The shapes GitHub sends, and the helpers that read them.
 *
 * EXTRACTED from `caseStudyRepoReader.ts`, which had reached 499 of the 500-line
 * hard ceiling. CLAUDE.md's rule is that the change which would cross it splits
 * first, and this section was the natural seam: pure data shapes with no
 * dependency on the reader's logging, classification or failure vocabulary. The
 * reader keeps the reads; this keeps what the reads parse.
 */

// Every field optional: a payload that is valid JSON but missing fields must
// degrade to `null` facts, not fail the repository. Only a payload of the wrong
// TYPE (an array where an object belongs) is a classified `Unknown`.
export const repoPayloadSchema = z.object({
  name: z.string().optional(),
  full_name: z.string().optional(),
  owner: z.object({ login: z.string() }).optional(),
  description: z.string().nullable().optional(),
  homepage: z.string().nullable().optional(),
  private: z.boolean().optional(),
  default_branch: z.string().optional(),
  topics: z.array(z.string()).optional(),
  language: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  pushed_at: z.string().nullable().optional(),
  license: z.object({
    key: z.string().optional(), name: z.string().optional(), spdx_id: z.string().nullable().optional(),
  }).nullable().optional(),
  fork: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const treePayloadSchema = z.object({
  tree: z.array(z.object({
    path: z.string(), type: z.string().optional(), size: z.number().optional(),
  })).optional(),
  truncated: z.boolean().optional(),
});

/**
 * One commit, as both `GET /commits` (array) and `GET /commits/{sha}` (single
 * object) return it.
 *
 * The `.catch(undefined)` on the `commit` branch is load bearing, and its
 * placement was settled by measurement rather than by taste. Without it, a date
 * of the wrong TYPE — which is what a GitHub shape change looks like — fails the
 * WHOLE parse; the read then reports "not the expected shape" and the caller
 * loses the SHA to protect a date nothing needed. One `.catch` HERE is enough:
 * it absorbs both a malformed date and a `commit` branch that is not an object
 * at all. Repeating `.catch` on the inner author/committer objects covers
 * strictly less — it cannot survive a non-object `commit` — and was removed as
 * redundant once a mutation showed it protecting nothing the outer one did not.
 */
export const commitPayloadSchema = z.object({
  sha: z.string(),
  commit: z
    .object({
      author: z.object({ date: z.string().optional() }).optional(),
      committer: z.object({ date: z.string().optional() }).optional(),
    })
    .optional()
    .catch(undefined),
});

export const commitsPayloadSchema = z.array(commitPayloadSchema);

export const languagesPayloadSchema = z.record(z.string(), z.number());

export type CommitPayload = z.infer<typeof commitPayloadSchema>;

/**
 * The committer date of a parsed commit, or null.
 *
 * COMMITTER, not author. The two differ after a rebase or a cherry-pick, and the
 * committer date is when the commit landed on the branch being measured. The
 * author date is a fallback only because a commit object missing its committer
 * is better answered with the other date than with nothing.
 */
export function committedAtOf(commit: CommitPayload): string | null {
  return commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null;
}

export function safeJson(body: string): unknown {
  try { return JSON.parse(body); } catch { return undefined; }
}

/** Blob entries only, with their sizes. Shared by the live and persisted paths. */
export function blobsFromTreePayload(
  entries: readonly { path: string; type?: string; size?: number }[],
): { paths: string[]; sizes: Map<string, number> } {
  const paths: string[] = [];
  const sizes = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type && entry.type !== 'blob') continue;
    paths.push(entry.path);
    if (typeof entry.size === 'number') sizes.set(entry.path, entry.size);
  }
  return { paths, sizes };
}
