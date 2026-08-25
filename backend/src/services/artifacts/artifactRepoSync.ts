/**
 * artifactRepoSync — put a student's uploaded curriculum artifacts into their
 * repo, so the work they did in Claude Code lives somewhere an employer can see
 * rather than only on the platform's uploads volume.
 *
 * ── NEVER THROWS ────────────────────────────────────────────────────────────
 *
 * Every path returns a classified outcome. This is called from the upload
 * handler, and a student who just built a governance framework and pressed
 * upload must not be shown an error because GitHub was rate-limiting, or
 * because they have not connected a repo yet, or because the platform lost push
 * access three weeks ago. Their artifact is already saved by the time this
 * runs; this is the mirror, and a mirror failing is not their problem.
 *
 * The same rule `refreshRepoDocuments` states: a failed write must not turn a
 * successful upload into an error.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 *
 * Two layers, neither relying on the other. `buildArtifactFiles` is pure and
 * clock-free, so an unchanged artifact set renders byte-identically; and
 * `writeDocsToRepo` compares content hashes against `.colaberry/manifest.json`
 * before any network call, so identical content produces `committed: false` and
 * zero commits. Re-running this after every upload is therefore safe and cheap
 * — which is the point, because it runs after every upload.
 *
 * ── WHY IT WRITES THE WHOLE SET, NOT JUST THE NEW ONE ───────────────────────
 *
 * The index has to be regenerated anyway, and it can only be correct if it sees
 * every artifact. Writing the full set costs nothing extra (unchanged files are
 * filtered before the network call) and means a repo that fell behind — a
 * student who uploaded three artifacts while their repo was disconnected —
 * repairs itself on the next successful sync instead of staying permanently
 * short.
 */
import * as fs from 'fs/promises';
import {
  ArtifactRecord,
  artifactPath,
  buildArtifactFiles,
  isTextArtifact,
  mergeArtifactHashesIntoManifest,
} from './artifactRepoFiles';
import { resolveProjectRepo } from '../projectRepoResolver';
import {
  diagnoseWriteFailure,
  messageForCause,
  probeRepoReadable,
  statusFromMessage,
} from './writeFailureDiagnosis';

export type ArtifactSyncOutcome =
  | 'written'        // files changed and were committed
  | 'unchanged'      // nothing differed — the idempotency guarantee holding
  | 'no_repo'        // no repo connected yet. Expected in weeks 1-3, not a fault.
  | 'no_artifacts'   // nothing uploaded yet
  | 'no_access'      // the platform cannot push to this repo any more
  | 'repo_gone'      // the connected repo cannot be found at all
  | 'not_configured' // GITHUB_TOKEN absent — our misconfiguration, not theirs
  | 'failed';

export interface ArtifactSyncResult {
  outcome: ArtifactSyncOutcome;
  changedPaths: string[];
  commitSha?: string;
  /** Plain-language, safe to show a student. Never carries an API body. */
  reason?: string;
  /**
   * Which repo this concerned, when we got far enough to know.
   *
   * Returned specifically so the UI can offer the FIX rather than only the
   * diagnosis: `no_access` is actionable in one click, but only if the student
   * is handed a link to their own repo's collaborator settings. Telling someone
   * "we cannot write to your repository" without saying which repo or where to
   * go is a diagnosis they have to go and act on later, which is how sixteen
   * students ended up stuck in the first place.
   *
   * Owner and repo only. Never the URL of anything the platform authenticated
   * with, and nothing derived from the token.
   */
  repo?: { owner: string; name: string };
}

export interface ArtifactSyncOptions {
  correlationId?: string;
  /** Injected in tests. */
  now?: string;
}

/** The stored artifact row this module needs. Keeps the query at the caller. */
export interface StoredArtifact {
  card_id: string;
  title: string;
  content: {
    filename?: string;
    stored_path?: string;
    size_bytes?: number;
    uploaded_at?: string;
    week?: number | null;
    project_label?: string | null;
    built_on_sample?: boolean;
  } | null;
}

const MAX_TEXT_BYTES = 1024 * 1024; // 1MB. Beyond this it is not a document.

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'artifact-repo-sync',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    ...ctx,
  }));
}

/**
 * Read an artifact's bytes if it is text and small enough to be a document.
 * Returns null for binary, oversized, or unreadable — all of which render as a
 * stub rather than failing the sync. An artifact whose file vanished from disk
 * still belongs in the index.
 */
export async function readArtifactText(
  filename: string,
  storedPath: string | undefined,
  sizeBytes: number | null,
  readFile: (p: string, enc: BufferEncoding) => Promise<string> = fs.readFile as any,
): Promise<string | null> {
  if (!isTextArtifact(filename)) return null;
  if (!storedPath) return null;
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_TEXT_BYTES) return null;
  try {
    return await readFile(storedPath, 'utf8');
  } catch {
    return null;
  }
}

/** PURE. Stored rows to the record shape the renderer wants. */
export function toArtifactRecords(
  rows: StoredArtifact[],
  textByCardId: Map<string, string | null>,
): ArtifactRecord[] {
  const out: ArtifactRecord[] = [];
  for (const row of rows) {
    const c = row.content;
    if (!c || !c.filename) continue; // a row with no file is not an artifact
    out.push({
      week: typeof c.week === 'number' ? c.week : null,
      cardId: row.card_id,
      filename: c.filename,
      title: row.title || c.filename,
      text: textByCardId.get(row.card_id) ?? null,
      uploadedAt: c.uploaded_at || '',
      sizeBytes: typeof c.size_bytes === 'number' ? c.size_bytes : null,
      // Absent on every artifact uploaded before this was recorded, which is
      // all 53 of them. Defaults to "own project" rather than "sample" —
      // labelling real capstone work as a sample is the worse error, and the
      // backfill can correct any it can identify.
      builtOnSample: c.built_on_sample === true,
      projectLabel: c.project_label ?? null,
    });
  }
  return out;
}

/**
 * Mirror every build artifact this project's student has uploaded into their
 * repo. Safe to call after every upload.
 */
export async function syncArtifactsToRepo(
  projectId: string,
  opts: ArtifactSyncOptions = {},
): Promise<ArtifactSyncResult> {
  const cid = opts.correlationId;
  // Hoisted so the catch block can probe the same repo the write targeted.
  let repoTarget: { owner: string; repo: string } | null = null;
  try {
    const { default: Project } = await import('../../models/Project');
    const project: any = await Project.findByPk(projectId);
    if (!project) {
      return { outcome: 'failed', changedPaths: [], reason: 'Project not found' };
    }

    // The repo comes from the GitHubConnection, not the project column — see
    // projectRepoResolver for why reading the column reported every connected
    // student as unconnected.
    const pointer = await resolveProjectRepo(projectId, project.github_repo_url);
    if (!pointer.url || !pointer.owner || !pointer.name) {
      log('artifact_sync_no_repo', cid, 'success', { project_id: projectId });
      return {
        outcome: 'no_repo',
        changedPaths: [],
        reason: 'No GitHub repository is connected to this project yet.',
      };
    }

    const { default: PortfolioArtifact } = await import('../../models/PortfolioArtifact');
    const rows: any[] = await PortfolioArtifact.findAll({
      where: { enrollment_id: project.enrollment_id, kind: 'build_artifact' },
    });
    if (!rows.length) {
      return { outcome: 'no_artifacts', changedPaths: [] };
    }

    const textByCardId = new Map<string, string | null>();
    for (const row of rows) {
      const c = row.content || {};
      textByCardId.set(
        row.card_id,
        await readArtifactText(c.filename || '', c.stored_path, c.size_bytes ?? null),
      );
    }

    const files = buildArtifactFiles(toArtifactRecords(rows as StoredArtifact[], textByCardId));

    const { readRepoManifest, writeDocsToRepo, MANIFEST_PATH } = await import('../sbp/repoWriter');
    const { createHash } = await import('crypto');
    const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

    const target = { owner: pointer.owner, repo: pointer.name };
    repoTarget = target;
    const manifest = await readRepoManifest(target, { correlationId: cid });

    // Record our paths IN the manifest, or every sync re-commits identical
    // content forever — proven in production, see mergeArtifactHashesIntoManifest.
    // repoWriter excludes MANIFEST_PATH from the change comparison and appends it
    // only when something substantive changed, so adding it here cannot itself
    // trigger a commit.
    const mergedManifest = mergeArtifactHashesIntoManifest(manifest, files, sha256);
    const toWrite = mergedManifest
      ? [...files, { path: MANIFEST_PATH, content: mergedManifest }]
      : files;

    // No cast: RenderedArtifactFile and RenderedFile are the same { path, content }
    // shape, and a test asserts they stay assignable so this stays honest.
    const result = await writeDocsToRepo(target, toWrite, manifest, { correlationId: cid });

    // Record WHERE each artifact landed and in WHICH commit.
    //
    // The sync has always known both and thrown them away, which left the
    // Capstone Record unable to link an artifact to its evidence: a portfolio
    // row with no path is not a claim anyone can check, and a link pinned to a
    // branch instead of a SHA rots the moment the student keeps working.
    //
    // Written on EVERY successful pass, not only when a commit happened. An
    // `unchanged` result still means the file is present at the recorded path,
    // and a row whose path was never stored would otherwise stay unlinkable
    // forever simply because it synced before this existed.
    if (result.committed || result.changedPaths.length === 0) {
      const pathByCard = new Map<string, string>();
      for (const record of toArtifactRecords(rows as StoredArtifact[], textByCardId)) {
        pathByCard.set(record.cardId, artifactPath(record));
      }
      for (const row of rows) {
        const path = pathByCard.get(row.card_id);
        if (!path) continue;
        const content = { ...(row.content || {}), repo_path: path, commit_sha: result.commitSha ?? row.content?.commit_sha ?? null };
        // Fail-soft per row: a bookkeeping write must never turn a successful
        // sync into an error the student sees.
        await row.update({ content }).catch(() => {});
      }
    }

    log('artifact_sync_done', cid, 'success', {
      project_id: projectId,
      committed: result.committed,
      changed: result.changedPaths.length,
      artifacts: rows.length,
    });

    return {
      outcome: result.committed ? 'written' : 'unchanged',
      changedPaths: result.changedPaths,
      commitSha: result.commitSha,
    };
  } catch (err: any) {
    const cls = err?.error_class ?? err?.name ?? 'Error';

    if (cls === 'NoPushAccess') {
      log('artifact_sync_no_access', cid, 'failure', { project_id: projectId, error_class: cls });
      return {
        outcome: 'no_access',
        changedPaths: [],
        reason: 'Colaberry no longer has permission to write to this repository.',
      };
    }
    if (cls === 'ConfigError') {
      log('artifact_sync_not_configured', cid, 'failure', { project_id: projectId, error_class: cls });
      return { outcome: 'not_configured', changedPaths: [], reason: 'Repository sync is not configured.' };
    }

    // GitHub answers an unauthorised WRITE with 404, not 403, so a permissions
    // problem arrives here as UpstreamError and used to be reported as "we'll
    // retry" — advice that can never come true, since only the student can grant
    // push access. Re-read the repo to tell "may not write" from "is gone".
    // Measured 2026-08-21: 12 of 13 student repos were exactly this.
    const status = statusFromMessage(err?.message);
    let repoReadable: boolean | null = null;
    if (status === 404 && repoTarget && process.env.GITHUB_TOKEN) {
      repoReadable = await probeRepoReadable(repoTarget.owner, repoTarget.repo, process.env.GITHUB_TOKEN);
    }
    const cause = diagnoseWriteFailure({ errorClass: cls, status, repoReadable });

    if (cause === 'no_push_access' || cause === 'repo_missing') {
      log('artifact_sync_blocked', cid, 'failure', {
        project_id: projectId, error_class: cls, status, cause, repo_readable: repoReadable,
      });
      return {
        outcome: cause === 'no_push_access' ? 'no_access' : 'repo_gone',
        changedPaths: [],
        reason: messageForCause(cause),
        ...(repoTarget ? { repo: { owner: repoTarget.owner, name: repoTarget.repo } } : {}),
      };
    }

    // Deliberately not surfacing err.message — it can carry an upstream API body.
    log('artifact_sync_failed', cid, 'failure', {
      project_id: projectId,
      error_class: cls,
      message: String(err?.message ?? '').slice(0, 300),
    });
    return {
      outcome: 'failed',
      changedPaths: [],
      reason: 'Could not sync artifacts to the repository. Your upload was saved.',
    };
  }
}
