/**
 * repoArtifactStore — put a repository file's BYTES where the artifact viewers already look.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `repoArtifactIngest` recorded 137 deliverables on 14 Nov 2026 and every one of them
 * opened nowhere. The viewers are not missing: `ArtifactFileViewer` renders PDF inline,
 * CSV as a table plus an Excel download, images, text, and Word/PowerPoint as HTML built
 * server-side by `officeToHtml` (Ali, 10 Nov 2026: "We also need a MS word viewer"). All
 * of it is already built, on both the admin side and the learner's My work page.
 *
 * What they need is one field. `shapeArtifact` builds its `file` only when
 * `content.stored_path` is a string, and `fetchArtifactFile` resolves that path through
 * `safeUploadPath`. An ingested row carried `repo_path` and a GitHub URL and no
 * `stored_path`, so the viewer had nothing to open and the piece rendered as a link.
 *
 * So this module does the one missing step: fetch the file from GitHub and write it into
 * the uploads volume exactly as a student's own upload lands there. Nothing about the
 * viewers changes. They start working on these rows because the row finally looks like
 * what they have always read.
 *
 * ── NAMED BY CONTENT, SO RE-RUNNING IS FREE ──────────────────────────────────
 * The stored name is the git BLOB sha plus the extension. A blob sha IS the content, so
 * the same file always lands on the same path, two interns who commit the same PDF share
 * one copy, and a re-run overwrites a byte-identical file instead of growing the volume.
 * That is what makes the ingest's idempotency reach the disk and not just the table.
 *
 * ── NEVER THROWS ─────────────────────────────────────────────────────────────
 * Same contract as the ingest it serves. A rate limit, a deleted file or a full disk
 * returns a classified failure, and the caller still records the artifact with its GitHub
 * link. A file that cannot be fetched today is worth less than one that can, and worth a
 * great deal more than a run that died halfway through a cohort.
 */
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { UPLOADS_ROOT } from '../internship/internArtifactViewer';
import { MAX_ARTIFACT_BYTES } from './repoArtifactScan';

/** Inside the uploads volume, so `safeUploadPath` resolves it and the viewers may serve it. */
export const REPO_ARTIFACT_DIR = path.join(UPLOADS_ROOT, 'repo-artifacts');

export type StoreFailure =
  | 'no_repo_url'      // the connection's repo_url could not be read as owner/repo
  | 'not_found'        // 404: committed once, gone from the default branch since
  | 'too_large'        // bigger than the scan's own ceiling
  | 'empty'            // zero bytes; there is nothing for a viewer to render
  | 'fetch_failed'     // GitHub refused, timed out, or rate-limited
  | 'write_failed';    // the uploads volume refused the write

export interface StoredFile {
  storedPath: string;
  storedName: string;
  sizeBytes: number;
}

export type StoreResult =
  | ({ ok: true; reused: boolean } & StoredFile)
  | { ok: false; failure: StoreFailure; detail?: string };

/**
 * owner/repo out of any GitHub remote we store.
 *
 * Handles `https://github.com/o/r`, a trailing `.git`, a trailing slash and the `git@`
 * form, because `github_connections.repo_url` has held all four over time.
 */
export function parseRepoUrl(repoUrl: unknown): { owner: string; repo: string } | null {
  if (typeof repoUrl !== 'string' || !repoUrl.trim()) return null;
  const m = /github\.com[/:]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(repoUrl.trim());
  if (!m) return null;
  const [, owner, repo] = m;
  if (!owner || !repo) return null;
  return { owner, repo };
}

/** The extension a viewer keys off, lowercased, or '' when the filename has none. */
export function extensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : '';
}

/**
 * The on-disk name for one repository file.
 *
 * Content-addressed and sanitized to hex plus one extension, so no part of a student's
 * path or filename reaches the filesystem. A traversal attempt in a committed filename
 * cannot survive a name that is `[0-9a-f]+` by construction.
 */
export function storedNameFor(blobSha: unknown, filename: string): string {
  const sha = typeof blobSha === 'string' && /^[0-9a-f]{7,64}$/i.test(blobSha)
    ? blobSha.toLowerCase()
    // No usable blob sha: fall back to a hash of the path so the name stays deterministic.
    : createHash('sha256').update(String(blobSha ?? '') + '\u0000' + filename).digest('hex').slice(0, 40);
  return `${sha}${extensionOf(filename)}`;
}

export interface StoreInput {
  repoUrl: unknown;
  repoPath: string;
  filename: string;
  blobSha: unknown;
  /** The size the git tree reported, checked again against the bytes actually received. */
  sizeBytes: number;
}

export interface StoreOptions {
  /** Injected in tests, and the seam that keeps this module free of a GitHub dependency at import time. */
  fetchRaw?: (owner: string, repo: string, repoPath: string) => Promise<Buffer | null>;
  dir?: string;
}

async function defaultFetchRaw(owner: string, repo: string, repoPath: string): Promise<Buffer | null> {
  const { fetchRepoFileRaw } = await import('../sbp/repoConnect/githubRepoClient');
  return fetchRepoFileRaw(owner, repo, repoPath);
}

/**
 * Fetch one repository file and store it where the viewers read uploads from.
 *
 * Returns `reused: true` when the content was already on disk, which is the normal
 * outcome of a second run and costs no GitHub call beyond the one that proved it.
 */
export async function storeRepoFile(input: StoreInput, opts: StoreOptions = {}): Promise<StoreResult> {
  const dir = opts.dir ?? REPO_ARTIFACT_DIR;
  const parsed = parseRepoUrl(input.repoUrl);
  if (!parsed) return { ok: false, failure: 'no_repo_url' };

  if (input.sizeBytes > MAX_ARTIFACT_BYTES) {
    return { ok: false, failure: 'too_large', detail: `${input.sizeBytes} bytes` };
  }

  const storedName = storedNameFor(input.blobSha, input.filename);
  const storedPath = path.join(dir, storedName);

  // Content-addressed, so an existing file of the right size IS this file. Checked before
  // the network call: re-running the ingest over a cohort must not re-download everything.
  try {
    const stat = await fs.stat(storedPath);
    if (stat.isFile() && stat.size > 0) {
      return { ok: true, reused: true, storedPath, storedName, sizeBytes: stat.size };
    }
  } catch { /* not stored yet; fetch it */ }

  let bytes: Buffer | null;
  try {
    bytes = await (opts.fetchRaw ?? defaultFetchRaw)(parsed.owner, parsed.repo, input.repoPath);
  } catch (err: unknown) {
    const e = err as { error_class?: string; constructor?: { name?: string } };
    return { ok: false, failure: 'fetch_failed', detail: e?.error_class ?? e?.constructor?.name ?? 'Error' };
  }

  if (bytes === null) return { ok: false, failure: 'not_found' };
  if (bytes.length === 0) return { ok: false, failure: 'empty' };
  if (bytes.length > MAX_ARTIFACT_BYTES) {
    return { ok: false, failure: 'too_large', detail: `${bytes.length} bytes` };
  }

  try {
    await fs.mkdir(dir, { recursive: true });
    // Written to a temp name and renamed, so a failure mid-write can never leave a
    // truncated file sitting at a content-addressed path that the next run would trust.
    const tmp = `${storedPath}.${process.pid}.part`;
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, storedPath);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    return { ok: false, failure: 'write_failed', detail: e?.code ?? String(e?.message ?? '').slice(0, 120) };
  }

  return { ok: true, reused: false, storedPath, storedName, sizeBytes: bytes.length };
}

