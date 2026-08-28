/**
 * caseStudyRepoReader — the bounded, classified GitHub read layer of the Case
 * Study analyzer. Five steps, each of which either returns a fact or a
 * classified failure, and none of which ever throws a raw status code at a
 * caller (spec §29).
 *
 * IT DOES NOT OWN A GITHUB CLIENT. Every request goes through
 * `sbp/repoConnect/githubRepoClient.ts`, the one hardened client in this repo:
 * a 15s AbortController timeout, three capped attempts on 429/5xx only, real
 * disambiguation of GitHub's overloaded 403 (`isRateLimitedResult`), and a
 * `fetchImpl` seam so no test ever mocks `global.fetch`. `githubService.ts` is
 * deliberately NOT used — it sets no timeout on any call, so one hung socket
 * there would hang an entire sync run.
 *
 * THE TOKEN IS NEVER HERE. `requireToken()` lives inside the client, is read per
 * call from env, and is never returned or persisted. Nothing in this file reads
 * `GITHUB_TOKEN` or accepts a token argument, and `log()` below takes a FIXED
 * context shape — no spread of an arbitrary object, because a spread is how an
 * Authorization header ends up in a log line.
 *
 * WHY IT IS SPLIT FROM `caseStudyRepoAnalyzer.ts`. Together they are ~700 lines,
 * past CLAUDE.md's 500-line hard ceiling, and spec §11 explicitly asks for
 * "modular services, not one oversized service". The seam is real: this file
 * knows about HTTP, the analyzer knows about facts. The dependency runs one way
 * (extractors → signatures → reader → analyzer), so no cycle is possible.
 *
 * FAILURE-FIRST. Retries: only the client's three capped attempts; nothing here
 * retries again. Timeouts: the client's 15s abort, surfaced as `Timeout`.
 * Recovery: every step is a pure read with no writes, so the caller's remedy is
 * always "run it again". There is NO circuit breaker in this repo's GitHub
 * layer — a documented deferral, not something invented here.
 */
import { createHash } from 'crypto';
import { z } from 'zod';
import { githubApiRequest, fetchRepoFile, isRateLimitedResult } from '../sbp/repoConnect/githubRepoClient';
import type { GitHubReadOptions, RawResult } from '../sbp/repoConnect/githubRepoClient';
import { isRepoConnectError } from '../sbp/repoConnect/connectErrors';
import type { CaseStudyRepoAccessStatus, CaseStudyRepoVisibility } from '../../types/caseStudy';
import { sortUnique, truncateToBytes, looksBinary, MAX_FILE_BYTES } from './repoFactExtractors';
import type { SelectedRepoFile } from './repoFactExtractors';

/* ─────────────────────────────────────────────────── failure vocabulary ──── */

/** Spec §29, exactly. No eighth class is invented here. */
export type CaseStudyRepoAnalysisErrorClass =
  | 'RepoNotFound' | 'Unauthorized' | 'RateLimited' | 'Timeout'
  | 'MalformedManifest' | 'RepoEmpty' | 'Unknown';

const HTTP_STATUS: Record<CaseStudyRepoAnalysisErrorClass, number> = {
  RepoNotFound: 404, Unauthorized: 502, RateLimited: 429, Timeout: 504,
  MalformedManifest: 422, RepoEmpty: 409, Unknown: 502,
};

/** How a failure maps onto persisted `case_study_repositories.access_status`. */
const ACCESS_STATUS: Record<CaseStudyRepoAnalysisErrorClass, CaseStudyRepoAccessStatus> = {
  RepoNotFound: 'unavailable', Unauthorized: 'unavailable', RateLimited: 'rate_limited',
  Timeout: 'unavailable', MalformedManifest: 'connected', RepoEmpty: 'connected', Unknown: 'unknown',
};

export function accessStatusForErrorClass(cls: CaseStudyRepoAnalysisErrorClass): CaseStudyRepoAccessStatus {
  return ACCESS_STATUS[cls];
}

export class CaseStudyRepoAnalysisError extends Error {
  public readonly error_class: CaseStudyRepoAnalysisErrorClass;
  public readonly http_status: number;
  public readonly details: Record<string, unknown>;

  constructor(
    error_class: CaseStudyRepoAnalysisErrorClass, message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CaseStudyRepoAnalysisError';
    this.error_class = error_class;
    this.http_status = HTTP_STATUS[error_class];
    this.details = details;
  }
}

export function isCaseStudyRepoAnalysisError(err: unknown): err is CaseStudyRepoAnalysisError {
  return err instanceof CaseStudyRepoAnalysisError;
}

/* ────────────────────────────────────────────────────────────── contracts ── */

export interface RepoAnalysisIssue {
  readonly error_class: CaseStudyRepoAnalysisErrorClass;
  readonly message: string;
  readonly path?: string;
}

export interface RepoAnalysisFailure {
  readonly status: 'failed';
  readonly repoOwner: string;
  readonly repoName: string;
  readonly error: RepoAnalysisIssue;
}

export interface CaseStudyRepoMetadataFacts {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly description: string | null;
  readonly homepage: string | null;
  readonly visibility: CaseStudyRepoVisibility;
  readonly defaultBranch: string;
  readonly topics: readonly string[];
  readonly languageBytes: readonly { readonly name: string; readonly bytes: number }[];
  readonly primaryLanguage: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly pushedAt: string | null;
  readonly license: { readonly key: string; readonly name: string; readonly spdxId: string | null } | null;
  readonly latestCommitSha: string | null;
  /** Committer date of `latestCommitSha`, ISO-8601. Null when unreadable. */
  readonly latestCommitAt: string | null;
  readonly isFork: boolean;
  readonly isArchived: boolean;
}

export interface TreeRead {
  readonly paths: readonly string[];
  readonly sizes: ReadonlyMap<string, number>;
  readonly truncated: boolean;
  readonly source: 'github' | 'persisted' | 'unavailable';
}

/* ──────────────────────────────────────────────── upstream payload shapes ── */

// Every field optional: a payload that is valid JSON but missing fields must
// degrade to `null` facts, not fail the repository. Only a payload of the wrong
// TYPE (an array where an object belongs) is a classified `Unknown`.
const repoPayloadSchema = z.object({
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

const commitsPayloadSchema = z.array(
  z.object({
    sha: z.string(),
    // `GET /commits` has always returned the commit object; this schema parsed
    // the sha and threw the rest away, which is why no commit date existed
    // anywhere in the analyzer's output.
    //
    // The `.catch(undefined)` on this branch is load bearing, and its placement
    // was settled by measurement rather than by taste. Without it, a date of the
    // wrong TYPE — which is what a GitHub shape change looks like — fails the
    // WHOLE array parse; the read then reports "commit head was not the expected
    // shape" and the repository loses its SHA to protect a date nothing needed.
    // One `.catch` HERE is enough: it absorbs both a malformed date and a
    // `commit` branch that is not an object at all. Repeating `.catch` on the
    // inner author/committer objects covers strictly less (it cannot survive a
    // non-object `commit`) and was removed as redundant once a mutation showed
    // it protecting nothing the outer one did not already protect.
    commit: z
      .object({
        author: z.object({ date: z.string().optional() }).optional(),
        committer: z.object({ date: z.string().optional() }).optional(),
      })
      .optional()
      .catch(undefined),
  })
);
const languagesPayloadSchema = z.record(z.string(), z.number());

function safeJson(body: string): unknown {
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

/* ─────────────────────────────────────────────────────────────── logging ──── */

export type LogOutcome = 'success' | 'failure' | 'partial';

export interface AnalyzerLogContext {
  owner?: string; repo?: string; repo_ref?: string; path?: string; status?: number;
  error_class?: string; files_read?: number; paths_scanned?: number; issue_count?: number;
  repo_count?: number; tree_source?: string;
}

/**
 * A stable, non-reversing handle for a repository whose identity must not be
 * printed. Same repository, same handle, forever, so two log lines can still be
 * correlated by eye or by grep without either of them naming the repository.
 */
export function opaqueRepoRef(owner: string, repo: string): string {
  return createHash('sha256').update(`${owner.toLowerCase()}/${repo.toLowerCase()}`).digest('hex').slice(0, 16);
}

/**
 * WHO MAY BE NAMED IN A LOG LINE. A private repository's owner and name are the
 * customer's information, not ours, and stdout is shipped off the box; the
 * connect step at `sbp/repoConnect/githubRepoClient.ts` logs them unconditionally
 * because at attach time it genuinely does not yet know the visibility, but by
 * the time the analyzer runs `readMetadata()` has answered that question, so
 * there is no excuse here. Public repositories are named (their identity is
 * already public and naming them is what makes a log usable); everything else,
 * INCLUDING `unknown`, gets the opaque handle. Failing closed on `unknown` is
 * deliberate — the one case where visibility is unknown is a metadata read that
 * failed, which is exactly when guessing 'probably public' would be wrong.
 */
export function repoLogIdentity(
  owner: string, repo: string, visibility?: CaseStudyRepoVisibility,
): { owner?: string; repo?: string; repo_ref?: string } {
  if (visibility === 'public') return { owner, repo };
  return { repo_ref: opaqueRepoRef(owner, repo) };
}

/**
 * Structured, per `artifactRepoSync.ts:92-102`. The context is a FIXED shape,
 * deliberately: there is no spread of an arbitrary object that could carry a
 * token, a header or a response body into stdout.
 */
export function log(
  event: string, outcome: LogOutcome, correlationId: string, ctx: AnalyzerLogContext,
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-repo-analyzer',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

/* ────────────────────────────────────────────────────────── classification ── */

/** A non-ok HTTP result becomes one of spec §29's seven classes. */
export function classifyResult(result: RawResult): CaseStudyRepoAnalysisErrorClass {
  if (isRateLimitedResult(result)) return 'RateLimited';
  if (result.status === 401 || result.status === 403) return 'Unauthorized';
  if (result.status === 404) return 'RepoNotFound';
  if (result.status === 409) return 'RepoEmpty';
  return 'Unknown';
}

/** A thrown `RepoConnectError` becomes the same seven-class vocabulary. */
export function classifyThrown(err: unknown): CaseStudyRepoAnalysisErrorClass {
  if (isRepoConnectError(err)) {
    switch (err.error_class) {
      case 'UpstreamTimeout': return 'Timeout';
      case 'RateLimited': return 'RateLimited';
      // ConfigError and NoPushAccess both mean "the PLATFORM's credential cannot
      // read this", which is what Unauthorized means to a sync run.
      case 'Unauthorized': case 'ConfigError': case 'NoPushAccess': return 'Unauthorized';
      case 'RepoNotFound': return 'RepoNotFound';
      case 'RepoEmpty': return 'RepoEmpty';
      default: return 'Unknown';
    }
  }
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') return 'Timeout';
  return 'Unknown';
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function fail(
  owner: string, repo: string, cls: CaseStudyRepoAnalysisErrorClass,
  message: string, correlationId: string, status?: number,
  visibility?: CaseStudyRepoVisibility,
): RepoAnalysisFailure {
  // Field by field, never a spread: see `log()` above for why.
  const identity = repoLogIdentity(owner, repo, visibility);
  log('case_study_repo_analysis_failed', 'failure', correlationId, {
    owner: identity.owner, repo: identity.repo, repo_ref: identity.repo_ref,
    status, error_class: cls,
  });
  return { status: 'failed', repoOwner: owner, repoName: repo, error: { error_class: cls, message } };
}

/* ─────────────────────────────────────────────────────────── the five reads ─ */

/** Required. Losing it fails the repository — there is nothing to describe. */
export async function readMetadata(
  owner: string, repo: string, opts: GitHubReadOptions, correlationId: string,
): Promise<CaseStudyRepoMetadataFacts | RepoAnalysisFailure> {
  let result: RawResult;
  try {
    result = await githubApiRequest('GET', repoPath(owner, repo), opts);
  } catch (err) {
    const cls = classifyThrown(err);
    return fail(owner, repo, cls, `repository metadata unavailable (${cls})`, correlationId);
  }
  if (!result.ok) {
    const cls = classifyResult(result);
    return fail(owner, repo, cls, `repository metadata unavailable (${cls})`, correlationId, result.status);
  }
  const parsed = repoPayloadSchema.safeParse(safeJson(result.body));
  if (!parsed.success) {
    return fail(owner, repo, 'Unknown', 'repository metadata was not the expected shape', correlationId);
  }
  const d = parsed.data;
  const name = d.name || repo;
  const login = d.owner?.login || owner;
  // `unknown` when GitHub did not say — spec §7.3 fails closed, never to public.
  const visibility: CaseStudyRepoVisibility =
    d.private === true ? 'private' : d.private === false ? 'public' : 'unknown';
  return {
    owner: login,
    name,
    fullName: d.full_name || `${login}/${name}`,
    description: d.description ?? null,
    homepage: d.homepage?.trim() ? d.homepage.trim() : null,
    visibility,
    defaultBranch: d.default_branch || 'main',
    topics: sortUnique(d.topics ?? []),
    languageBytes: [],
    primaryLanguage: d.language ?? null,
    createdAt: d.created_at ?? null,
    updatedAt: d.updated_at ?? null,
    pushedAt: d.pushed_at ?? null,
    license: d.license
      ? { key: d.license.key || '', name: d.license.name || '', spdxId: d.license.spdx_id ?? null }
      : null,
    latestCommitSha: null,
    latestCommitAt: null,
    isFork: d.fork === true,
    isArchived: d.archived === true,
  };
}

/**
 * The head commit of the default branch.
 *
 * `committedAt` is the COMMITTER date, not the author date. The two differ after
 * a rebase or a cherry-pick, and the committer date is when the commit actually
 * landed on this branch — which is what an elapsed-delivery measurement is
 * about. The author date is a fallback only because a commit object missing its
 * committer is better answered with the other date than with nothing.
 */
export interface RepoCommitHead {
  readonly sha: string;
  readonly committedAt: string | null;
}

/** A `RepoAnalysisFailure` = the repository has no commits. */
export async function readCommitHead(
  owner: string, repo: string, opts: GitHubReadOptions, correlationId: string,
  issues: RepoAnalysisIssue[], visibility?: CaseStudyRepoVisibility,
): Promise<RepoCommitHead | null | RepoAnalysisFailure> {
  let result: RawResult;
  try {
    result = await githubApiRequest('GET', `${repoPath(owner, repo)}/commits?per_page=1`, opts);
  } catch (err) {
    const cls = classifyThrown(err);
    if (cls === 'RepoEmpty') {
      return fail(owner, repo, cls, 'repository has no commits', correlationId, undefined, visibility);
    }
    issues.push({ error_class: cls, message: `commit head unavailable (${cls})` });
    return null;
  }
  // GitHub answers 409 on this endpoint for a repository with no commits at all.
  if (result.status === 409) {
    return fail(owner, repo, 'RepoEmpty', 'repository has no commits', correlationId, 409, visibility);
  }
  if (!result.ok) {
    issues.push({ error_class: classifyResult(result), message: 'commit head unavailable' });
    return null;
  }
  const parsed = commitsPayloadSchema.safeParse(safeJson(result.body));
  if (!parsed.success) {
    issues.push({ error_class: 'Unknown', message: 'commit head was not the expected shape' });
    return null;
  }
  if (!parsed.data.length) {
    return fail(owner, repo, 'RepoEmpty', 'repository has no commits', correlationId, 200, visibility);
  }
  const head = parsed.data[0];
  return {
    sha: head.sha,
    committedAt: head.commit?.committer?.date ?? head.commit?.author?.date ?? null,
  };
}

/** Best-effort. Losing it costs a language breakdown, not the repository. */
export async function readLanguages(
  owner: string, repo: string, opts: GitHubReadOptions, issues: RepoAnalysisIssue[],
): Promise<{ name: string; bytes: number }[]> {
  let result: RawResult;
  try {
    result = await githubApiRequest('GET', `${repoPath(owner, repo)}/languages`, opts);
  } catch (err) {
    issues.push({ error_class: classifyThrown(err), message: 'language breakdown unavailable' });
    return [];
  }
  if (!result.ok) {
    issues.push({ error_class: classifyResult(result), message: 'language breakdown unavailable' });
    return [];
  }
  const parsed = languagesPayloadSchema.safeParse(safeJson(result.body));
  if (!parsed.success) {
    issues.push({ error_class: 'Unknown', message: 'language breakdown was not the expected shape' });
    return [];
  }
  // Bytes desc, then name — equal-byte languages can never reorder between runs.
  return Object.entries(parsed.data)
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => (b.bytes - a.bytes) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const EMPTY_TREE: TreeRead = { paths: [], sizes: new Map(), truncated: false, source: 'unavailable' };

/** ONE recursive tree request — never a per-directory walk, never file bodies. */
export async function readTree(
  owner: string, repo: string, branch: string, opts: GitHubReadOptions, issues: RepoAnalysisIssue[],
): Promise<TreeRead> {
  let result: RawResult;
  try {
    result = await githubApiRequest(
      'GET', `${repoPath(owner, repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`, opts,
    );
  } catch (err) {
    issues.push({ error_class: classifyThrown(err), message: 'file tree unavailable' });
    return EMPTY_TREE;
  }
  if (!result.ok) {
    issues.push({ error_class: classifyResult(result), message: 'file tree unavailable' });
    return EMPTY_TREE;
  }
  const parsed = treePayloadSchema.safeParse(safeJson(result.body));
  if (!parsed.success) {
    issues.push({ error_class: 'Unknown', message: 'file tree was not the expected shape' });
    return EMPTY_TREE;
  }
  const { paths, sizes } = blobsFromTreePayload(parsed.data.tree ?? []);
  return { paths, sizes, truncated: parsed.data.truncated === true, source: 'github' };
}

/** Classes that mean "stop reading" rather than "skip this one file". */
const STOP_CLASSES: ReadonlySet<CaseStudyRepoAnalysisErrorClass> =
  new Set<CaseStudyRepoAnalysisErrorClass>(['RateLimited', 'Timeout', 'Unauthorized']);

/**
 * Read the already-bounded selection. The cap lives in `selectHighValueFiles()`,
 * so this loop cannot exceed it however large the repository is; the byte cap is
 * enforced twice — by skipping oversized blobs during selection, and by
 * truncating here in case the tree reported no size.
 */
export async function readSelectedFiles(
  owner: string, repo: string, selected: readonly SelectedRepoFile[],
  opts: GitHubReadOptions, issues: RepoAnalysisIssue[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const item of selected) {
    let text: string | null;
    try {
      text = await fetchRepoFile(owner, repo, item.path, opts);
    } catch (err) {
      const cls = classifyThrown(err);
      issues.push({ error_class: cls, message: `could not read file (${cls})`, path: item.path });
      if (STOP_CLASSES.has(cls)) break; // burning the rest of the quota helps nobody
      continue;
    }
    // null = the tree listed it but the contents endpoint says 404. Harmless.
    if (text === null || looksBinary(text)) continue;
    files.set(item.path, truncateToBytes(text, MAX_FILE_BYTES));
  }
  return files;
}
