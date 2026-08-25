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
import { PLAN_FILE_PATH } from './planDocument';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

export const BOT_NAME = 'Colaberry Build Bot';
export const BOT_EMAIL = 'build-bot@colaberry.ai';
/** Prefix the webhook matches to identify our own commits and avoid a sync loop. */
export const BOT_COMMIT_PREFIX = 'chore(colaberry):';

export type RepoWriteErrorClass =
  | 'ConfigError' | 'AllowlistViolation' | 'UpstreamError' | 'UpstreamTimeout' | 'ConflictRetriesExhausted'
  /**
   * GitHub refused the write because the platform does not have push on this
   * repo. Distinct from `UpstreamError` because it is the ONE failure class that
   * is not transient and not ours: retrying will never fix it, and the caller
   * must record the loss of access so the student is told, rather than dropping
   * a silent commit on every sync forever. See connectionAccess.RepoWriteAccess.
   */
  | 'NoPushAccess';

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
 * Is this the "there is no such file" failure, as opposed to a real problem?
 *
 * Matched against the exact message `gh` throws below — `GitHub <path> failed
 * (404): ...` — rather than looking for `404` anywhere in the string, because a
 * response BODY that happens to mention 404 must not be read as "the file is
 * absent". That distinction is load-bearing: `readRepoFileState` turns absent
 * into permission to write, so a false positive here is a student's file
 * overwritten.
 *
 * (This check previously read `/<BS>404<BS>/` — two literal backspace bytes
 * where `\b` word boundaries were intended, from a heredoc that ate the
 * escapes. It could never match, so every 404 took the "unreadable" branch and
 * logged a spurious read failure. Harmless while both branches returned null;
 * not harmless now that they mean different things.)
 */
function isNotFound(err: unknown): boolean {
  return / failed \(404\)/.test(String((err as any)?.message ?? ''));
}

/**
 * What we know about a file in the repo — and crucially, what we DO NOT know.
 *
 * `readRepoFile` flattens all three of these to `null`, which is right for a
 * caller that treats "no file" and "could not read the file" the same way: the
 * CLAUDE.md splice appends in both cases, which is harmless either way. It is
 * wrong for a caller whose decision depends on the difference. "The student has
 * no plan.json" means WRITE, while "GitHub returned a 500" must mean DO NOT
 * WRITE — collapsing the two turns a transient upstream blip into exactly the
 * data loss the drift guard exists to prevent.
 */
export type RepoFileState =
  | { state: 'present'; content: string }
  | { state: 'absent' }
  | { state: 'unreadable' };

/**
 * Read a file from the default branch, keeping "not there" distinct from
 * "could not look".
 *
 * Deliberately soft on failure: no read problem may abort a publish. A 404, and
 * a response carrying no content, are `absent`. Anything else is `unreadable`,
 * and the caller decides how much caution that deserves.
 */
async function readRepoFileState(
  target: RepoTarget,
  path: string,
  token: string,
  fetchImpl: typeof fetch,
  correlationId?: string,
): Promise<RepoFileState> {
  try {
    const res = await gh(
      `/repos/${target.owner}/${target.repo}/contents/${encodeURIComponent(path)}`,
      { method: 'GET' }, token, fetchImpl,
    );
    if (!res?.content) return { state: 'absent' };
    return { state: 'present', content: Buffer.from(String(res.content), 'base64').toString('utf8') };
  } catch (err: any) {
    if (isNotFound(err)) return { state: 'absent' };
    log('sbp_repo_read_failed', correlationId, 'partial', { path, message: err?.message });
    return { state: 'unreadable' };
  }
}

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
  const result = await readRepoFileState(target, path, token, fetchImpl, correlationId);
  return result.state === 'present' ? result.content : null;
}

/**
 * Bounded GitHub call. Retries only transient failures (429/5xx); a 4xx is
 * terminal because retrying a rejected request just burns rate limit.
 */
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
  if (isPermissionRefusal(lastStatus, lastBody)) {
    throw new RepoWriteError(
      'NoPushAccess',
      `GitHub refused the write to ${path} — the platform does not have push access on this repo.`,
    );
  }
  throw new RepoWriteError('UpstreamError', `GitHub ${path} failed (${lastStatus}): ${lastBody.slice(0, 300)}`);
}

/**
 * Is this 403 "you may not write here", as opposed to "slow down"?
 *
 * GitHub overloads 403 for permission refusals AND for rate limiting, and the
 * two must not be confused: recording `pull_only` because we were briefly
 * throttled would demote a perfectly good connection and stop the platform
 * writing to it. Rate-limit responses are recognised by their own vocabulary and
 * excluded here; anything else 403 is a genuine refusal.
 *
 * 404 is deliberately NOT treated as a refusal even though GitHub returns it for
 * some write attempts on repos we can only read. It is also what a missing
 * branch returns — the documented state of a freshly provisioned repo before the
 * student's first push — and demoting those would break the adopt flow.
 */
function isPermissionRefusal(status: number, body: string): boolean {
  if (status !== 403) return false;
  if (/rate limit|secondary rate|abuse detection/i.test(body)) return false;
  return true;
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
 * Why a plan write was allowed or refused. Recorded verbatim in the log line so
 * "the student's plan stopped updating" is answerable from the logs alone.
 */
export type PlanWriteDecision =
  | 'write'
  | 'skip_edited'
  | 'skip_unknown_provenance'
  | 'skip_unreadable';

/**
 * May we replace `.colaberry/plan.json`? PURE, so every branch is testable
 * without a network.
 *
 * ## The hole this closes
 *
 * `changedFiles` compares our new render against `.colaberry/manifest.json` —
 * a record of what the PLATFORM last wrote, never of what is actually in the
 * repo. A student who hand-edits `plan.json` does not touch the manifest, so
 * their edit is invisible to that comparison: the next render that differs from
 * the manifest drags `plan.json` into the change set and replaces their file
 * wholesale. That is not hypothetical. It happened, the student restored his
 * file by hand and reported it as platform corruption, and the next sync
 * overwrote him again.
 *
 * ## Why a hash and not a merge
 *
 * `planDocument` guarantees byte-identical output for identical input, and the
 * whole idempotency story rests on it, so a field-level merge is out — it would
 * produce bytes no renderer can reproduce and every later sync would see drift.
 * The manifest hash is exactly the bytes the platform last committed, so
 * "repo hash === manifest hash" is not a heuristic: a mismatch is PROOF that
 * something other than us wrote this file. One GET buys that proof.
 *
 * ## Why the unknown cases refuse
 *
 * `absent` is the only case that writes on incomplete information, and it is
 * safe by inspection: there is no file, so there is nothing to destroy, and a
 * first publish must still deliver the plan. Every other unknown refuses. A
 * repo whose manifest predates plan tracking has no recorded hash, so we cannot
 * prove the file is ours — and a file we cannot prove is ours belongs to the
 * student, the same reasoning that made unknown write-access mean not-writable.
 * A read we could not make refuses for the stronger reason: this module already
 * holds that "a read failure must never be treated as 'they had nothing'".
 *
 * The cost of refusing wrongly is a stale plan for one sync. The cost of
 * writing wrongly is a student's work destroyed. Those are not comparable, so
 * the tie goes to refusing every time.
 */
export function planWriteDecision(
  repoFile: RepoFileState,
  manifestHash: string | undefined,
): PlanWriteDecision {
  if (repoFile.state === 'unreadable') return 'skip_unreadable';
  if (repoFile.state === 'absent') return 'write';
  if (!manifestHash) return 'skip_unknown_provenance';
  return sha256(repoFile.content) === manifestHash ? 'write' : 'skip_edited';
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
 * Read `.colaberry/progress.json` out of the repo, or null when it is not there.
 *
 * THE SAME READ THE COMMIT PATH ALREADY MAKES, exposed. `writeDocsToRepo` reads
 * this exact file at this exact path to build the merge for a repo it can push
 * to; a pull-only student needs the identical input to build the identical file
 * as a download instead. Sharing the read is what makes the download and the
 * commit the same answer rather than two implementations of it — including the
 * soft-404 and the "a read we could not make is treated as absent" posture,
 * which is what stops a transient GitHub failure turning into a merge that
 * silently drops the student's ticks... as long as the CALLER distinguishes the
 * two. It cannot, from a bare null, so a caller that must tell "they have no
 * file" from "we could not read it" has to establish that itself; the download
 * path does, by refusing to claim a merge that `parseProgressFile` did not back.
 */
export async function readRepoProgressFile(
  target: RepoTarget,
  opts: WriteOptions = {},
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token?.trim()) return null;
  return readRepoFile(target, PROGRESS_FILE_PATH, token, opts.fetchImpl ?? fetch, opts.correlationId);
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

  // `.colaberry/plan.json` is ours to regenerate ONLY while the copy in the repo
  // is still the one we wrote. Students hand-edit it — extra stories, a fixed
  // requirement mapping, whole dashboard tabs — and their Command Center reads
  // it at runtime, so replacing an edited file costs them the data and breaks
  // the page built on it. `changedFiles` cannot see any of that: it compares our
  // render against the MANIFEST, which records what the platform last wrote and
  // says nothing about what is actually in the repo.
  //
  // So ask the repo directly, once, and only for a file we were about to write
  // anyway — the no-op path above stays network-silent.
  if (changed.some((f) => f.path === PLAN_FILE_PATH)) {
    const repoFile = await readRepoFileState(target, PLAN_FILE_PATH, token, fetchImpl, opts.correlationId);
    const decision = planWriteDecision(repoFile, parseManifestHashes(existingManifest)[PLAN_FILE_PATH]);
    if (decision !== 'write') {
      // DROPPED, not substituted — writing their own bytes back would still be a
      // commit that changes nothing. Logged at `partial` because the publish did
      // go ahead, just not for this file: a student asking why their plan stopped
      // updating is answered by this line, without a repo forensics session.
      log('sbp_repo_plan_write_skipped', opts.correlationId, 'partial', {
        owner, repo, path: PLAN_FILE_PATH, reason: decision,
      });
      changed = changed.filter((f) => f.path !== PLAN_FILE_PATH);
    }
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

  // Dropping the plan or the profile can empty the change set, leaving only the
  // manifest — which alone is never worth a commit, since it describes files
  // nobody touched.
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
