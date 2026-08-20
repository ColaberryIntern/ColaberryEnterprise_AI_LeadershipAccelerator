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
import { ArtifactRecord, buildArtifactFiles, isTextArtifact } from './artifactRepoFiles';
import { resolveProjectRepo } from '../projectRepoResolver';

export type ArtifactSyncOutcome =
  | 'written'        // files changed and were committed
  | 'unchanged'      // nothing differed — the idempotency guarantee holding
  | 'no_repo'        // no repo connected yet. Expected in weeks 1-3, not a fault.
  | 'no_artifacts'   // nothing uploaded yet
  | 'no_access'      // the platform cannot push to this repo any more
  | 'not_configured' // GITHUB_TOKEN absent — our misconfiguration, not theirs
  | 'failed';

export interface ArtifactSyncResult {
  outcome: ArtifactSyncOutcome;
  changedPaths: string[];
  commitSha?: string;
  /** Plain-language, safe to show a student. Never carries an API body. */
  reason?: string;
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

    const { readRepoManifest, writeDocsToRepo } = await import('../sbp/repoWriter');
    const target = { owner: pointer.owner, repo: pointer.name };
    const manifest = await readRepoManifest(target, { correlationId: cid });
    // No cast: RenderedArtifactFile and RenderedFile are the same { path, content }
    // shape, and a test asserts they stay assignable so this stays honest.
    const result = await writeDocsToRepo(target, files, manifest, { correlationId: cid });

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
