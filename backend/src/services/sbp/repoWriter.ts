/**
 * repoWriter — commit the rendered document set into a student's workspace repo.
 *
 * ONE commit, content-hash idempotent, path-allowlisted (SBP-GH-v1 FR-026/FR-027).
 *
 * Three properties this must have, each because getting it wrong has a specific
 * cost to a real student:
 *   - **Unchanged ⇒ no commit.** Otherwise every sync churns their git history
 *     with empty commits and their own work gets lost in the noise.
 *   - **One commit, not one per file.** A plan touches ~16 files; sixteen commits
 *     per publish is unreadable.
 *   - **Allowlisted paths, enforced by throwing.** The platform writes `CLAUDE.md`,
 *     `docs/**` and `.colaberry/**`. Everything else in that repo is the
 *     student's, and a bug here would silently overwrite their code.
 *
 * The commit is authored by the platform bot so the push webhook can recognise
 * its own writes and skip them (§5.3) — otherwise our write triggers a sync that
 * triggers a write.
 */
import { createHash } from 'crypto';
import { RenderedFile, isAllowedPath } from './renderDocs';
import { spliceManagedBlock } from './managedBlock';
import {
  PROGRESS_FILE_PATH,
  mergeProgressFile,
  parseProgressFile,
  serialiseProgressFile,
} from './verification/progressContract';
import { PROFILE_FILE_PATH } from './profileContract';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

export const BOT_NAME = 'Colaberry Build Bot';
export const BOT_EMAIL = 'build-bot@colaberry.ai';
/** Prefix the webhook matches to identify our own commits and avoid a sync loop. */
export const BOT_COMMIT_PREFIX = 'chore(colaberry):';

export type RepoWriteErrorClass =
  | 'ConfigError' | 'AllowlistViolation' | 'UpstreamError' | 'UpstreamTimeout' | 'ConflictRetriesExhausted';

export class RepoWriteError extends Error {
  constructor(public readonly error_class: RepoWriteErrorClass, message: string) {
    super(message);
    this.name = 'RepoWriteError';
  }
}

export interface RepoTarget {
  owner: string;
  repo: string;
  /** Defaults to the repo's default branch when omitted. */
  branch?: string;
}

export interface WriteResult {
  /** False when nothing changed — the idempotency guarantee. */
  committed: boolean;
  commitSha?: string;
  changedPaths: string[];
  skippedUnchanged: number;
}

export interface WriteOptions {
  correlationId?: string;
  /** Injected in tests. Production uses the bounded fetch below. */
  fetchImpl?: typeof fetch;
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

function apiBase(): string {
  return process.env.GITHUB_API_URL || 'https://api.github.com';
}

function requireToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token?.trim()) {
    throw new RepoWriteError('ConfigError', 'GITHUB_TOKEN is not configured — cannot write to a student repo');
  }
  return token;
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-repo-writer',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    // NOTE: never spread arbitrary context here — the token must not reach a log line.
    context: ctx,
  }));
}

/**
 * Bounded GitHub call. Retries only transient failures (429/5xx); a 4xx is
 * terminal because retrying a rejected request just burns rate limit.
 */
/**
 * Read a file from the default branch, or null when it is not there.
 *
 * Deliberately soft: a 404 is the normal "they have no CLAUDE.md yet" case, and
 * any other failure must not abort a publish — the caller splices against null,
 * which appends our block rather than replacing a file we could not read.
 */
async function readRepoFile(
  target: RepoTarget,
  path: string,
  token: string,
  fetchImpl: typeof fetch,
  correlationId?: string,
): Promise<string | null> {
  try {
    const res = await gh(
      `/repos/${target.owner}/${target.repo}/contents/${encodeURIComponent(path)}`,
      { method: 'GET' }, token, fetchImpl,
    );
    if (!res?.content) return null;
    return Buffer.from(String(res.content), 'base64').toString('utf8');
  } catch (err: any) {
    if (/404/.test(String(err?.message ?? ''))) return null;
    log('sbp_repo_read_failed', correlationId, 'partial', { path, message: err?.message });
    return null;
  }
}

async function gh(
  path: string,
  init: RequestInit,
  token: string,
  fetchImpl: typeof fetch,
): Promise<any> {
  const url = `${apiBase()}${path}`;
  let lastStatus = 0;
  let lastBody = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new RepoWriteError('UpstreamTimeout', `GitHub request timed out after ${REQUEST_TIMEOUT_MS}ms: ${path}`);
      }
      throw new RepoWriteError('UpstreamError', `GitHub request failed (${err?.message}): ${path}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) return res.status === 204 ? {} : res.json();
    lastStatus = res.status;
    lastBody = await res.text().catch(() => '');
    if (res.status !== 429 && res.status < 500) break;
    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  throw new RepoWriteError('UpstreamError', `GitHub ${path} failed (${lastStatus}): ${lastBody.slice(0, 300)}`);
}

/** Parse the manifest already in the repo, if any. Absent/corrupt ⇒ treat as first write. */
export function parseManifestHashes(manifestContent: string | null | undefined): Record<string, string> {
  if (!manifestContent) return {};
  try {
    const parsed = JSON.parse(manifestContent) as { files?: Array<{ path: string; sha256: string }> };
    return Object.fromEntries((parsed.files ?? []).map((f) => [f.path, f.sha256]));
  } catch {
    // A corrupt manifest means "we do not know what is there" — rewrite everything
    // rather than guess. Deliberately not a throw: a student could have mangled it.
    return {};
  }
}

/**
 * Which files actually differ from what the manifest says is already committed.
 * PURE — the heart of the idempotency guarantee, so it is testable without a network.
 */
export const MANIFEST_PATH = '.colaberry/manifest.json';

/**
 * Which files actually differ from what the manifest says is already committed.
 * PURE — the heart of the idempotency guarantee, so it is testable without a network.
 *
 * The manifest is EXCLUDED from the comparison and only rides along when
 * something else changed. Two reasons, both found by the live check against real
 * GitHub after every mocked test had passed:
 *   1. A manifest cannot contain its own hash, so it never matches and always
 *      looks modified.
 *   2. Its `generated_at` is a fresh timestamp on every render, so its bytes
 *      genuinely differ each time even when nothing it describes has.
 * Left alone, that meant every sync committed the manifest — churning the
 * student's history with commits that change nothing, which is precisely the
 * guarantee this function exists to provide.
 */
export function changedFiles(files: RenderedFile[], existing: Record<string, string>): RenderedFile[] {
  const substantive = files.filter(
    (f) => f.path !== MANIFEST_PATH && existing[f.path] !== sha256(f.content),
  );
  if (substantive.length === 0) return [];

  // Something real changed, so the manifest must be refreshed alongside it.
  const manifest = files.find((f) => f.path === MANIFEST_PATH);
  return manifest ? [...substantive, manifest] : substantive;
}

/**
 * Read `.colaberry/manifest.json` out of the repo, or null when it is not there.
 *
 * This is the input that makes the content-hash idempotency real: without it,
 * `parseManifestHashes` sees `{}`, every file looks new, and every publish
 * commits the whole set. Soft on every failure — a manifest we cannot read is
 * treated as absent, which rewrites everything once. Degrading to "rewrite" is
 * safe; degrading to "assume unchanged" would silently stop syncing a student's
 * plan, so the fallback direction is deliberate.
 */
export async function readRepoManifest(
  target: RepoTarget,
  opts: WriteOptions = {},
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token?.trim()) return null;
  return readRepoFile(target, MANIFEST_PATH, token, opts.fetchImpl ?? fetch, opts.correlationId);
}

/**
 * Write the document set. Returns `committed: false` when nothing changed.
 *
 * @throws RepoWriteError('AllowlistViolation') before any network call if a path
 *         is outside the platform's write allowlist. Throwing rather than
 *         filtering is deliberate: a bad path is a bug to fix, not noise to skip.
 */
export async function writeDocsToRepo(
  target: RepoTarget,
  files: RenderedFile[],
  existingManifest: string | null,
  opts: WriteOptions = {},
): Promise<WriteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  // Allowlist FIRST — before the token is read, before anything leaves the process.
  for (const f of files) {
    if (!isAllowedPath(f.path)) {
      throw new RepoWriteError(
        'AllowlistViolation',
        `refusing to write "${f.path}" — outside CLAUDE.md / docs/** / .colaberry/**`,
      );
    }
  }

  const token = requireToken();
  const { owner, repo } = target;

  // The change check runs on the RENDERED content, before any splicing, so an
  // unchanged plan still makes zero network calls.
  let changed = changedFiles(files, parseManifestHashes(existingManifest));

  if (changed.length === 0) {
    log('sbp_repo_write_noop', opts.correlationId, 'success', { owner, repo, files: files.length });
    return { committed: false, changedPaths: [], skippedUnchanged: files.length };
  }

  // CLAUDE.md belongs to the STUDENT. They arrive with one that already carries
  // their own conventions, and this used to replace the whole file — so a
  // republish silently deleted work they had written. Read theirs and splice
  // our delimited block into it, leaving every other line as found. Done only
  // for a file we are already committing, so the no-op path above stays silent.
  // A failed read splices against null, which APPENDS rather than clobbering
  // a file we could not see.
  for (let i = 0; i < changed.length; i++) {
    if (changed[i].path !== 'CLAUDE.md') continue;
    const existing = await readRepoFile(target, 'CLAUDE.md', token, fetchImpl, opts.correlationId);
    changed[i] = { ...changed[i], content: spliceManagedBlock(existing, changed[i].content) };
  }

  // `.colaberry/progress.json` is co-owned for exactly the same reason CLAUDE.md
  // is. The platform owns the story list and the criterion text; Claude Code
  // owns the `passed` flags it wrote back. Replacing the whole file on a
  // republish would drop every tick the student's agent had recorded — stories
  // sitting at "3 of 4" would silently reset to "not started", which reads as
  // the platform losing their work. Merge instead: our side replaced, their side
  // carried across by story id and criterion text.
  for (let i = 0; i < changed.length; i++) {
    if (changed[i].path !== PROGRESS_FILE_PATH) continue;
    const existing = await readRepoFile(target, PROGRESS_FILE_PATH, token, fetchImpl, opts.correlationId);
    const parsed = parseProgressFile(changed[i].content);
    // Our own render failing to parse is a defect in renderDocs, not a student
    // problem — leave the rendered bytes alone rather than merging blind.
    if (!parsed.ok) continue;
    changed[i] = {
      ...changed[i],
      content: serialiseProgressFile(mergeProgressFile(parsed.file, existing)),
    };
  }

  // `.colaberry/profile.json` is SEED-ONCE. It carries the student's portfolio
  // prose and their publication consent, and neither is ours to rewrite — a
  // consent flag the platform can flip back is not consent.
  //
  // The guard matters because of a specific path, not a hypothetical one:
  // normally the rendered seed is byte-identical every time, so `changedFiles`
  // skips it and the file is never revisited. But the seed embeds the repo URL,
  // so renaming a repo changes the seed's hash, drags the file into `changed`,
  // and would overwrite prose the student had written. Dropping it whenever the
  // repo already has one makes the seed genuinely once-only regardless of what
  // moves upstream.
  //
  // NOTE: the manifest records the hash of the SEED, not of whatever the student
  // has since written, because it was rendered upstream of this check. That is
  // stable and harmless — the seed hash is exactly what keeps this file out of
  // `changed` on every subsequent publish.
  if (changed.some((f) => f.path === PROFILE_FILE_PATH)) {
    const existing = await readRepoFile(target, PROFILE_FILE_PATH, token, fetchImpl, opts.correlationId);
    if (existing !== null && existing.trim() !== '') {
      // DROPPED, not substituted. Writing their own bytes back would still be a
      // commit that changes nothing, which is the exact churn this module exists
      // to prevent.
      changed = changed.filter((f) => f.path !== PROFILE_FILE_PATH);
    }
  }

  // Dropping the profile can empty the change set, leaving only the manifest —
  // which alone is never worth a commit, since it describes files nobody touched.
  if (changed.length === 0 || (changed.length === 1 && changed[0].path === MANIFEST_PATH)) {
    log('sbp_repo_write_noop', opts.correlationId, 'success', {
      owner, repo, files: files.length, reason: 'nothing left to write after seed-once and merge',
    });
    return { committed: false, changedPaths: [], skippedUnchanged: files.length };
  }

  const branch = target.branch
    || (await gh(`/repos/${owner}/${repo}`, { method: 'GET' }, token, fetchImpl)).default_branch
    || 'main';

  try {
    // 1. Where the branch currently points.
    const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, { method: 'GET' }, token, fetchImpl);
    const baseCommitSha: string = ref.object.sha;
    const baseCommit = await gh(`/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, { method: 'GET' }, token, fetchImpl);

    // 2. A tree layered over the existing one — untouched paths stay untouched.
    const tree = await gh(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: changed.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
      }),
    }, token, fetchImpl);

    // 3. ONE commit for the whole set.
    const summary = `${BOT_COMMIT_PREFIX} sync build plan — ${changed.length} file${changed.length === 1 ? '' : 's'}`;
    const commit = await gh(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: opts.correlationId ? `${summary} [corr:${opts.correlationId}]` : summary,
        tree: tree.sha,
        parents: [baseCommitSha],
        author: { name: BOT_NAME, email: BOT_EMAIL },
        committer: { name: BOT_NAME, email: BOT_EMAIL },
      }),
    }, token, fetchImpl);

    // 4. Move the branch. Never forced: a concurrent human push must win, not be erased.
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    }, token, fetchImpl);

    log('sbp_repo_write_committed', opts.correlationId, 'success', {
      owner, repo, branch, commit: commit.sha,
      changed: changed.length, skipped: files.length - changed.length,
    });
    return {
      committed: true,
      commitSha: commit.sha,
      changedPaths: changed.map((f) => f.path),
      skippedUnchanged: files.length - changed.length,
    };
  } catch (err: any) {
    log('sbp_repo_write_failed', opts.correlationId, 'failure', {
      owner, repo, error_class: err?.error_class ?? 'UpstreamError', message: err?.message,
    });
    throw err;
  }
}
