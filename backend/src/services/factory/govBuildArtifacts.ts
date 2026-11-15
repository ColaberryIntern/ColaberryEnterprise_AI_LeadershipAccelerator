/**
 * govBuildArtifacts — the deliverables an intern has SUBMITTED from their gov build repo, shown in the gov
 * Build Evidence "Build artifacts" section as viewable cards.
 *
 * Why this exists: the connected-repo "Files" block lists only STRUCTURED documents (pdf/word/excel), and a
 * student build repo is source code, so it is empty. But the intern curates a set of deliverables when they
 * build — a project overview page, architecture diagrams, a test/security/cutover report — and each is filed
 * as a `runtime_portfolio_artifacts` row of kind `build_artifact` that points at a file in their repo
 * (content.repo_path + content.artifact_url). Nothing surfaced those. This module resolves them for the gov
 * delivery project and serves each one live from the repo, so the admin (and the intern) can view them here.
 *
 * Scope/security: resolved through the gov project's own `solution_build` track -> student project ->
 * enrollment, AND filtered to artifacts whose `artifact_url` belongs to THIS project's connected repo. The
 * enrollment is shared across a student's projects, so the repo match is what keeps one gov contract's build
 * artifacts from bleeding into another. The file fetch re-applies the same scope before reading one byte, and
 * the repo path is a stored, system-written value (never user input). No token/secret is returned.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/** The viewer a build-artifact card opens. Broader than the repo-deliverable allowlist on purpose: a build's
 *  real deliverables are its app pages (html), diagrams (image) and reports (markdown). */
export type BuildArtifactKind =
  | 'html' | 'image' | 'markdown' | 'pdf' | 'csv' | 'word' | 'slides' | 'spreadsheet' | 'video' | 'other';

export interface GovBuildArtifact {
  /** The runtime_portfolio_artifacts id — the key the file route validates + serves. */
  id: string;
  /** Clean display title. */
  title: string;
  /** The file's basename, for the badge + download name. */
  name: string;
  /** Which viewer the card opens. */
  kind: BuildArtifactKind;
  /** The file's path inside the connected repo. */
  repoPath: string;
}

function extOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

/** Classify a build artifact from its filename, then its stored mimetype. */
export function buildArtifactKind(name: string, mimetype?: unknown): BuildArtifactKind {
  const ext = extOf(name);
  const mime = typeof mimetype === 'string' ? mimetype.toLowerCase() : '';
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') return 'html';
  if (/^(png|jpe?g|gif|webp|svg|bmp)$/.test(ext) || mime.startsWith('image/')) return 'image';
  if (ext === 'md' || ext === 'markdown' || ext === 'txt' || mime === 'text/markdown' || mime === 'text/plain') return 'markdown';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'csv' || mime === 'text/csv') return 'csv';
  if (ext === 'docx' || ext === 'doc' || mime.includes('wordprocessingml')) return 'word';
  if (ext === 'pptx' || ext === 'ppt' || mime.includes('presentationml')) return 'slides';
  if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheetml')) return 'spreadsheet';
  if (/^(mp4|mov|webm|m4v)$/.test(ext) || mime.startsWith('video/')) return 'video';
  return 'other';
}

/** Content-Type for serving one artifact's bytes, by extension. */
const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  md: 'text/markdown; charset=utf-8', markdown: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8',
  pdf: 'application/pdf', csv: 'text/csv; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
};
export function buildArtifactContentType(name: string): string {
  return MIME_BY_EXT[extOf(name)] ?? 'application/octet-stream';
}

interface BuildCtx { enrollmentId: string; repoLike: string }

/** The gov build's owning enrollment and a LIKE pattern that matches its connected repo's blob URLs. Null when
 *  the project has no linked build repo (no solution_build track, or no GitHub connection on the build). */
async function buildContext(deliveryProjectId: string): Promise<BuildCtx | null> {
  const rows = await sequelize.query<{ enrollment_id: string | null; repo_owner: string | null; repo_name: string | null }>(
    `SELECT p.enrollment_id, gc.repo_owner, gc.repo_name
       FROM contract_tracks ct
       JOIN projects p ON p.id = ct.solution_student_project_id
       LEFT JOIN github_connections gc ON gc.project_id = p.id
      WHERE ct.delivery_project_id = :dp AND ct.track_type = 'solution_build' AND ct.solution_student_project_id IS NOT NULL
      LIMIT 1`,
    { replacements: { dp: deliveryProjectId }, type: QueryTypes.SELECT },
  );
  const r = rows[0];
  if (!r || !r.enrollment_id || !r.repo_owner || !r.repo_name) return null;
  return { enrollmentId: String(r.enrollment_id), repoLike: `%/${r.repo_owner}/${r.repo_name}/%` };
}

interface ArtifactRow { id: string; title: string | null; filename: string | null; mimetype: string | null; repo_path: string | null }

function toArtifact(row: ArtifactRow): GovBuildArtifact | null {
  const repoPath = row.repo_path ? String(row.repo_path) : '';
  if (!repoPath) return null;
  const name = (row.filename && String(row.filename).split('/').pop()) || repoPath.split('/').pop() || repoPath;
  return { id: String(row.id), title: (row.title && String(row.title)) || name, name, kind: buildArtifactKind(name, row.mimetype), repoPath };
}

/**
 * The build artifacts the intern submitted for THIS gov delivery project's build, newest first. Empty when no
 * build repo is linked, or none were submitted. Never throws on bad rows.
 */
export async function listGovBuildArtifacts(deliveryProjectId: string): Promise<GovBuildArtifact[]> {
  const ctx = await buildContext(deliveryProjectId);
  if (!ctx) return [];
  const rows = await sequelize.query<ArtifactRow>(
    `SELECT id, title,
            content->>'filename'    AS filename,
            content->>'mimetype'    AS mimetype,
            content->>'repo_path'   AS repo_path
       FROM runtime_portfolio_artifacts
      WHERE enrollment_id = :eid AND kind = 'build_artifact'
        AND content->>'repo_path' IS NOT NULL
        AND (content->>'artifact_url') ILIKE :repoLike
      ORDER BY created_at DESC
      LIMIT 200`,
    { replacements: { eid: ctx.enrollmentId, repoLike: ctx.repoLike }, type: QueryTypes.SELECT },
  );
  const out: GovBuildArtifact[] = [];
  for (const row of rows) { const a = toArtifact(row); if (a) out.push(a); }
  return out;
}

export type BuildArtifactFile =
  | { ok: true; bytes: Buffer; name: string; kind: BuildArtifactKind; contentType: string }
  | { ok: false; status: 404 | 502 };

/**
 * The bytes of ONE submitted build artifact, fetched live from the repo. The artifact is re-scoped to this gov
 * project's build (enrollment + connected repo) before any fetch, so another project's artifact (shared
 * enrollment) or an unknown id is a 404 and never read.
 */
export async function resolveGovBuildArtifactFile(deliveryProjectId: string, artifactId: string): Promise<BuildArtifactFile> {
  const ctx = await buildContext(deliveryProjectId);
  if (!ctx) return { ok: false, status: 404 };
  const rows = await sequelize.query<ArtifactRow>(
    `SELECT id, title,
            content->>'filename'  AS filename,
            content->>'mimetype'  AS mimetype,
            content->>'repo_path' AS repo_path
       FROM runtime_portfolio_artifacts
      WHERE id = :id AND enrollment_id = :eid AND kind = 'build_artifact'
        AND (content->>'artifact_url') ILIKE :repoLike
      LIMIT 1`,
    { replacements: { id: artifactId, eid: ctx.enrollmentId, repoLike: ctx.repoLike }, type: QueryTypes.SELECT },
  );
  const art = rows[0] ? toArtifact(rows[0]) : null;
  if (!art) return { ok: false, status: 404 };

  // The connected repo owner/name for the fetch (reusing the one resolver, so cards + content can't drift).
  const { resolveConnectedRepo } = await import('./govConnectedRepo');
  const repo = await resolveConnectedRepo(deliveryProjectId);
  if (!repo) return { ok: false, status: 404 };

  const { fetchRepoFileRaw } = await import('../sbp/repoConnect/githubRepoClient');
  const bytes = await fetchRepoFileRaw(repo.owner, repo.name, art.repoPath);
  if (!bytes) return { ok: false, status: 404 };
  return { ok: true, bytes, name: art.name, kind: art.kind, contentType: buildArtifactContentType(art.name) };
}
