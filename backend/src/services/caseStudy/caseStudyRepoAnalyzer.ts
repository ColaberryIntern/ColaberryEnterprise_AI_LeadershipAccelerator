/**
 * caseStudyRepoAnalyzer — the bounded, deterministic repository read for a Case
 * Study (spec §11, §29). It answers exactly one question: what can be PROVEN
 * about a repository mechanically. No AI, no inference, no prose reading — spec
 * §12's drafting step consumes these facts, it does not get to invent them.
 *
 * FOUR MODULES, ONE FEATURE (spec §11 asks for "modular services, not one
 * oversized service"; CLAUDE.md caps a file at 500 lines):
 *   · `repoFactExtractors.ts`       — pure: which files are worth reading, and
 *                                     what a path list alone proves
 *   · `repoDependencySignatures.ts` — pure: what manifest BODIES prove
 *   · `caseStudyRepoReader.ts`      — the five bounded, classified GitHub reads
 *   · this file                     — orchestration and the public contract
 * The dependency direction runs strictly left to right, so no cycle is possible.
 *
 * BOUNDED. Per repository: 1 metadata + 1 commit-head + 1 languages + 1 tree
 * request, then at most `MAX_CONTENT_FETCHES` (24) file bodies chosen by
 * `selectHighValueFiles()`, each capped at `MAX_FILE_BYTES` (128 KB). A
 * 10,000-file repository therefore costs at most 28 requests — never a recursive
 * walk of file bodies — and the test asserts exactly that.
 *
 * DETERMINISTIC. Nothing volatile reaches the fact output: the only timestamps
 * in it are the ones GitHub itself returned, every list is sorted and
 * de-duplicated, and the correlation id (which IS random when the caller omits
 * one) is logged but deliberately never returned. Freshness of a persisted tree
 * is the CALLER's decision, which is why `isPersistedTreeFresh()` demands
 * `nowMs` instead of reading a clock here.
 *
 * THE TOKEN IS NEVER HERE. It is read per call inside `githubRepoClient`, from
 * env, and never persisted or returned. This file never reads `GITHUB_TOKEN` and
 * never accepts a token argument; a test proves a sentinel token appears in
 * neither the emitted logs nor the serialised result.
 *
 * FAILURE-FIRST (CLAUDE.md). Metadata and the commit head are required: losing
 * them classifies the repository `failed`. Languages, tree and file bodies are
 * best-effort: losing them yields `partial` with a classified issue, because
 * spec §29 says one bad repository must not destroy the candidate. Retries are
 * the client's three capped attempts and nothing more. Recovery is "run it
 * again" — the analyzer holds no state and writes nothing, so it is idempotent
 * by construction. Unhandled: repositories whose default branch is missing from
 * the tree endpoint, which surface as a tree issue rather than a special case.
 */
import { z } from 'zod';
import type { GitHubReadOptions } from '../sbp/repoConnect/githubRepoClient';
import { ensureTraceId } from '../../utils/requestContext';
import type { CaseStudyRepoAccessStatus, CaseStudySyncStatus } from '../../types/caseStudy';
import {
  selectHighValueFiles, derivePathFacts, mergeRepoFacts, emptyContentFacts, truncateToBytes,
  DOCUMENT_RULES, MAX_DOCUMENTS, MAX_DOCUMENT_EXCERPT_BYTES,
} from './repoFactExtractors';
import type { RepoDerivedFacts, SelectedRepoFile } from './repoFactExtractors';
import { deriveContentFacts } from './repoDependencySignatures';
// Spec §8 precedence (.yml > .yaml > .json) is the reader's, not ours — importing it
// here keeps one implementation rather than two that can disagree about which file wins.
import { pickManifestFilename } from './caseStudyManifestReader';
import { scopeTree } from './repoPathScope';
import {
  readMetadata, readCommitHead, readLanguages, readTree, readSelectedFiles,
  classifyThrown, isCaseStudyRepoAnalysisError, CaseStudyRepoAnalysisError,
  blobsFromTreePayload, treePayloadSchema, log, repoLogIdentity,
} from './caseStudyRepoReader';
import type {
  CaseStudyRepoAnalysisErrorClass, CaseStudyRepoMetadataFacts, RepoAnalysisFailure,
  RepoAnalysisIssue, TreeRead,
} from './caseStudyRepoReader';

// One import surface for consumers: the sync service (T008) should not have to
// know which of the four modules a symbol happens to live in.
export {
  CaseStudyRepoAnalysisError, isCaseStudyRepoAnalysisError, accessStatusForErrorClass,
  classifyResult, classifyThrown,
} from './caseStudyRepoReader';
export type {
  CaseStudyRepoAnalysisErrorClass, CaseStudyRepoMetadataFacts, RepoAnalysisFailure, RepoAnalysisIssue,
} from './caseStudyRepoReader';

/* ────────────────────────────────────────────────────────────── contracts ── */

/** A bounded excerpt of a prose file, for the §12 drafting step to read. */
/** The rule key `selectHighValueFiles` tags a spec §8 manifest with. */
const CASE_STUDY_MANIFEST_RULE = 'case_study_manifest';

/**
 * A repository's spec §8 manifest, carried verbatim so it can be parsed.
 * `filename` is the basename the reader keys its precedence on; `path` is where
 * it actually lives in the tree (they differ when a manifest sits in a
 * subdirectory).
 */
export interface RepoManifestFile {
  readonly filename: string;
  readonly path: string;
  readonly contents: string;
  readonly bytes: number;
}

export interface RepoDocumentExcerpt {
  readonly path: string;
  readonly rule: string;
  readonly bytes: number;
  readonly excerpt: string;
}

export interface CaseStudyRepoFacts {
  readonly repoOwner: string;
  readonly repoName: string;
  readonly repoUrl: string;
  readonly metadata: CaseStudyRepoMetadataFacts;
  readonly derived: RepoDerivedFacts;
  readonly documents: readonly RepoDocumentExcerpt[];
  /**
   * The spec §8 manifest body, verbatim and untruncated, or null when the
   * repository ships none. Deliberately NOT part of `documents` — see
   * `buildManifestFile`. Consumers pass this straight to
   * `readCaseStudyManifest(filename, contents)`.
   */
  readonly manifestFile: RepoManifestFile | null;
  readonly filesRead: readonly string[];
  readonly fileCount: number;
  readonly treeTruncated: boolean;
  readonly treeSource: TreeRead['source'];
  readonly accessStatus: CaseStudyRepoAccessStatus;
}

export interface RepoAnalysisSuccess {
  readonly status: 'ok' | 'partial';
  readonly facts: CaseStudyRepoFacts;
  readonly issues: readonly RepoAnalysisIssue[];
}

export type RepoAnalysisOutcome = RepoAnalysisSuccess | RepoAnalysisFailure;

/**
 * A file tree somebody already persisted — `github_connections.file_tree_json`,
 * which `githubService.syncFileTree()` writes as GitHub's raw recursive tree
 * payload (`{ tree: [{ path, type, size }], truncated }`) alongside
 * `last_sync_at`. Spec §11 prefers it when fresh; using it removes the tree
 * request entirely.
 */
export interface PersistedRepoTree {
  readonly paths: readonly string[];
  readonly sizes?: ReadonlyMap<string, number>;
  readonly truncated?: boolean;
  readonly fetchedAtMs?: number | null;
}

export interface AnalyzeRepositoryInput {
  readonly owner: string;
  readonly repo: string;
  readonly correlationId?: string;
  /** Injected in tests. Production omits it and the client uses global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly persistedTree?: PersistedRepoTree | null;
  /**
   * Path prefixes this Case Study is about. Empty or absent means the whole
   * repository, which is the old behaviour and stays the default.
   */
  readonly pathScope?: readonly string[];
}

export interface RepoSetAnalysis {
  /** Spec §29: one bad repository yields `partial`, never total failure. */
  readonly status: Extract<CaseStudySyncStatus, 'success' | 'partial' | 'failed'>;
  readonly analyzed: readonly CaseStudyRepoFacts[];
  readonly failures: readonly RepoAnalysisFailure[];
  readonly issues: readonly (RepoAnalysisIssue & { readonly repoOwner: string; readonly repoName: string })[];
}

/* ──────────────────────────────────────────────────────────── validation ──── */

// Zod v4 (`error.issues`, never `.errors`). Only the string surface is checked:
// `fetchImpl` and `persistedTree` are internal injections from trusted callers,
// and a Zod schema over a function value would buy nothing.
const NAME = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const inputSchema = z.object({
  owner: NAME,
  repo: NAME,
  correlationId: z.string().min(1).max(200).optional(),
});

/* ───────────────────────────────────────────────────────── persisted tree ── */

/** 24 hours. Facts derived from a tree change on push, not by the minute. */
export const DEFAULT_PERSISTED_TREE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Adapt `github_connections.file_tree_json` into the analyzer's input shape. */
export function persistedTreeFromConnection(
  fileTreeJson: unknown, lastSyncAt?: Date | string | null,
): PersistedRepoTree | null {
  const parsed = treePayloadSchema.safeParse(fileTreeJson);
  if (!parsed.success || !parsed.data.tree?.length) return null;
  const { paths, sizes } = blobsFromTreePayload(parsed.data.tree);
  if (!paths.length) return null;
  const fetchedAt = lastSyncAt ? new Date(lastSyncAt).getTime() : null;
  return {
    paths, sizes, truncated: parsed.data.truncated === true,
    fetchedAtMs: typeof fetchedAt === 'number' && Number.isFinite(fetchedAt) ? fetchedAt : null,
  };
}

/**
 * Freshness is the CALLER's decision, and `nowMs` is a required argument for
 * exactly that reason: a clock read inside the analyzer would let the same input
 * produce two different answers, which is what the determinism rule forbids.
 */
export function isPersistedTreeFresh(
  tree: PersistedRepoTree | null | undefined, nowMs: number,
  maxAgeMs: number = DEFAULT_PERSISTED_TREE_MAX_AGE_MS,
): boolean {
  if (!tree?.paths.length || typeof tree.fetchedAtMs !== 'number') return false;
  const age = nowMs - tree.fetchedAtMs;
  return age >= 0 && age <= maxAgeMs;
}

/* ─────────────────────────────────────────────────────────── orchestration ── */

/**
 * Surface the spec §8 manifest body, if the repository ships one.
 *
 * This exists because `buildDocuments` below cannot carry it. Documents are
 * PROSE EXCERPTS, truncated at `MAX_DOCUMENT_EXCERPT_BYTES` for the drafting
 * step — and a truncated JSON manifest is not valid JSON, so routing the
 * manifest through that path would hand the reader bytes that can never parse.
 * It needs its own untruncated channel.
 *
 * The body is still bounded: `selectHighValueFiles` never chooses a blob the
 * tree already sizes above `MAX_FILE_BYTES`, and the reader enforces its own
 * `MAX_MANIFEST_BYTES` on what it accepts. No second limit is added here.
 *
 * Precedence is spec §8's — `case-study.yml` > `.yaml` > `.json` — and it is
 * resolved by the reader's own `pickManifestFilename`, not reimplemented. That
 * matters: a repository shipping BOTH a `.yml` and a `.json` must yield the
 * `.yml`, so the reader reports `unsupported_manifest_format` rather than
 * silently parsing the `.json` and presenting a partial manifest as the whole
 * truth.
 *
 * Before this existed the manifest was fetched and then discarded, which made
 * the entire §8 feature inert in production: the reader was reachable only by a
 * caller injecting bytes out of band, and a real repository's manifest was
 * ignored without error.
 */
function buildManifestFile(
  selected: readonly SelectedRepoFile[], files: ReadonlyMap<string, string>,
): RepoManifestFile | null {
  const candidates = selected
    .filter((item) => item.rule === CASE_STUDY_MANIFEST_RULE && typeof files.get(item.path) === 'string')
    .map((item) => item.path);
  if (!candidates.length) return null;

  const chosen = pickManifestFilename(candidates);
  if (!chosen) return null;

  // pickManifestFilename returns the basename; map back to the path it came from.
  const path = candidates.find((candidate) => candidate.toLowerCase().endsWith(chosen)) ?? candidates[0];
  const contents = files.get(path);
  if (typeof contents !== 'string') return null;

  return { filename: chosen, path, contents, bytes: Buffer.byteLength(contents, 'utf8') };
}

function buildDocuments(
  selected: readonly SelectedRepoFile[], files: ReadonlyMap<string, string>,
): RepoDocumentExcerpt[] {
  const documents: RepoDocumentExcerpt[] = [];
  for (const item of selected) {
    if (documents.length >= MAX_DOCUMENTS) break;
    if (!DOCUMENT_RULES.includes(item.rule)) continue;
    const text = files.get(item.path);
    if (typeof text !== 'string') continue;
    documents.push({
      path: item.path,
      rule: item.rule,
      bytes: Buffer.byteLength(text, 'utf8'),
      excerpt: truncateToBytes(text, MAX_DOCUMENT_EXCERPT_BYTES),
    });
  }
  return documents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function accessStatusFor(issues: readonly RepoAnalysisIssue[]): CaseStudyRepoAccessStatus {
  if (issues.some((issue) => issue.error_class === 'RateLimited')) return 'rate_limited';
  return issues.length ? 'read_only' : 'connected';
}

/**
 * Analyse one repository. Returns a classified outcome; it throws only for
 * programmer error — an input that is not a repository reference at all.
 */
export async function analyzeRepository(input: AnalyzeRepositoryInput): Promise<RepoAnalysisOutcome> {
  const parsed = inputSchema.safeParse({
    owner: input.owner, repo: input.repo, correlationId: input.correlationId,
  });
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`).join('; ');
    throw new CaseStudyRepoAnalysisError('Unknown', `invalid analyzer input — ${detail}`, {
      issue_count: parsed.error.issues.length,
    });
  }
  const { owner, repo } = parsed.data;
  const correlationId = ensureTraceId(input.correlationId);
  const opts: GitHubReadOptions = { fetchImpl: input.fetchImpl, correlationId };
  const issues: RepoAnalysisIssue[] = [];

  const metadata = await readMetadata(owner, repo, opts, correlationId);
  if ('status' in metadata) return metadata;

  // Visibility is known from here on, so nothing below may name a private repo.
  const head = await readCommitHead(owner, repo, opts, correlationId, issues, metadata.visibility);
  if (head && 'status' in head) return head;

  const languageBytes = await readLanguages(owner, repo, opts, issues);
  const persisted = input.persistedTree;
  const tree: TreeRead = persisted?.paths.length
    ? {
      paths: persisted.paths,
      sizes: persisted.sizes ?? new Map<string, number>(),
      truncated: persisted.truncated === true,
      source: 'persisted',
    }
    : await readTree(owner, repo, metadata.defaultBranch, opts, issues);

  // SCOPE FIRST, then derive. Everything below reads `scoped.tree`, so a Case
  // Study about one corner of a monorepo no longer inherits the whole
  // repository's stack, tests and documents. With no scope this is the identity.
  const scoped = scopeTree(tree, input.pathScope ?? []);
  if (scoped.scope.length > 0 && scoped.scopedPaths === 0) {
    // A scope matching nothing is a typo, not an empty feature. Saying so beats
    // reporting a repository that appears to contain no code.
    issues.push({
      error_class: 'Unknown',
      message: `path scope matched 0 of ${scoped.totalPaths} paths`,
    });
  }

  const selected = selectHighValueFiles(scoped.tree.paths, scoped.tree.sizes);
  const files = await readSelectedFiles(owner, repo, selected, opts, issues);

  const pathFacts = derivePathFacts(scoped.tree.paths);
  const contentFacts = files.size ? deriveContentFacts(files) : emptyContentFacts();
  for (const path of contentFacts.malformedManifests) {
    // Spec §29 + T006: a broken manifest is a classified issue, never a crash —
    // the sync continues on the evidence that did parse.
    issues.push({ error_class: 'MalformedManifest', message: 'manifest is not valid JSON', path });
  }

  const facts: CaseStudyRepoFacts = {
    repoOwner: metadata.owner,
    repoName: metadata.name,
    repoUrl: `https://github.com/${metadata.owner}/${metadata.name}`,
    metadata: {
      ...metadata,
      languageBytes,
      latestCommitSha: head?.sha ?? null,
      latestCommitAt: head?.committedAt ?? null,
    },
    derived: mergeRepoFacts(pathFacts, contentFacts, {
      // The languages API answers for the WHOLE repository and cannot be
      // scoped, so a scoped analysis must not blend it in — doing so would put
      // the monorepo's Flask and PowerShell into the stack of a TypeScript
      // feature. Scoped, the language list comes from the scoped paths alone.
      apiLanguages: scoped.scope.length > 0 ? [] : languageBytes.map((entry) => entry.name),
      homepage: metadata.homepage,
    }),
    documents: buildDocuments(selected, files),
    manifestFile: buildManifestFile(selected, files),
    filesRead: [...files.keys()].sort(),
    fileCount: pathFacts.scannedPathCount,
    treeTruncated: scoped.tree.truncated,
    treeSource: tree.source,
    accessStatus: accessStatusFor(issues),
  };

  const status: 'ok' | 'partial' = issues.length ? 'partial' : 'ok';
  const identity = repoLogIdentity(metadata.owner, metadata.name, metadata.visibility);
  log('case_study_repo_analyzed', status === 'ok' ? 'success' : 'partial', correlationId, {
    owner: identity.owner, repo: identity.repo, repo_ref: identity.repo_ref, files_read: files.size,
    paths_scanned: pathFacts.scannedPathCount, issue_count: issues.length, tree_source: tree.source,
  });
  return { status, facts, issues };
}

/**
 * Analyse a collection. Sequential, not parallel, on purpose: the request budget
 * stays predictable and a shared rate limit is not attacked from four directions
 * at once. Spec §29 — one bad repository yields `partial`, never total failure.
 */
export async function analyzeRepositories(
  inputs: readonly AnalyzeRepositoryInput[],
  options: { readonly correlationId?: string } = {},
): Promise<RepoSetAnalysis> {
  const correlationId = ensureTraceId(options.correlationId);
  const analyzed: CaseStudyRepoFacts[] = [];
  const failures: RepoAnalysisFailure[] = [];
  const issues: (RepoAnalysisIssue & { repoOwner: string; repoName: string })[] = [];

  for (const input of inputs) {
    let outcome: RepoAnalysisOutcome;
    try {
      outcome = await analyzeRepository({ ...input, correlationId: input.correlationId ?? correlationId });
    } catch (err) {
      // A rejected input must not take the rest of the collection down with it.
      const cls: CaseStudyRepoAnalysisErrorClass =
        isCaseStudyRepoAnalysisError(err) ? err.error_class : classifyThrown(err);
      outcome = {
        status: 'failed', repoOwner: input.owner, repoName: input.repo,
        error: { error_class: cls, message: `analysis rejected (${cls})` },
      };
    }
    if (outcome.status === 'failed') { failures.push(outcome); continue; }
    analyzed.push(outcome.facts);
    for (const issue of outcome.issues) {
      issues.push({ ...issue, repoOwner: outcome.facts.repoOwner, repoName: outcome.facts.repoName });
    }
  }

  const clean = !failures.length && !issues.length;
  const status: RepoSetAnalysis['status'] = clean ? 'success' : analyzed.length ? 'partial' : 'failed';
  log(
    'case_study_repo_set_analyzed',
    status === 'success' ? 'success' : status === 'partial' ? 'partial' : 'failure',
    correlationId,
    { repo_count: inputs.length, issue_count: issues.length + failures.length },
  );
  return { status, analyzed, failures, issues };
}
