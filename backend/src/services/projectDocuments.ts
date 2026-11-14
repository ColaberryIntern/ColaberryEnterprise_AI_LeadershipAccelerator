/**
 * projectDocuments — the DOCUMENT + video pieces a student has produced, shown on the admin project
 * delivery panel (ProjectDeliveryView → ArtifactsPanel) as portfolio-style typed cards with per-type
 * viewers, the same treatment as the gov Build Evidence cards.
 *
 * Why this exists: the admin "artifacts" panel reads `project_artifacts` keyed by project_id — a
 * build-pipeline table that only fills when a build is decomposed into artifact_definitions and the
 * student submits against one. For most projects it is empty, so the panel says "No artifacts
 * submitted" even when the student has a full body of work. That work lives in a DIFFERENT table,
 * `runtime_portfolio_artifacts`, keyed by enrollment_id with NO project foreign key. The only bridge
 * is the owner: projects.enrollment_id = runtime_portfolio_artifacts.enrollment_id. So we resolve the
 * project's enrollment and read the student's portfolio pieces, filtered to STRUCTURED DOCUMENTS and
 * VIDEO only (Ali, 2026-11-14) — not written work, field guides, Claude Studio links, or plain text.
 *
 * Scope/security: the enrollment is resolved SERVER-SIDE from the trusted projectId; a piece id is
 * always checked against that enrollment (via getMyWorkFile), so an admin cannot pull a piece from a
 * different enrollment through this path, and a non-document piece is refused even if its id is known.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import Project from '../models/Project';
import { getMyWorkFile } from './myWork/myWorkService';
import { asObject, toWorkItem, type WorkRow } from './myWork/myWorkModel';
import type { InternArtifactFile } from './internship/internArtifactViewer';

/** The card kind a document opens as. `video` is its own kind (inline player); the rest reuse the
 *  portfolio file taxonomy. `other` covers RTF (a structured document with no inline viewer → download). */
export type DocumentKind = 'pdf' | 'csv' | 'word' | 'slides' | 'spreadsheet' | 'video' | 'other';

/** Structured-document extensions → card kind. Deliberately NOT html/md/txt/images/source. */
const DOC_KIND_BY_EXT: Record<string, DocumentKind> = {
  pdf: 'pdf', csv: 'csv',
  doc: 'word', docx: 'word',
  ppt: 'slides', pptx: 'slides',
  xls: 'spreadsheet', xlsx: 'spreadsheet',
  rtf: 'other',
  mp4: 'video', mov: 'video', webm: 'video', m4v: 'video',
};

/** Content-Type for a video card so the inline <video> player can play it (the upload's stored mime is often octet-stream). */
const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
};

function extOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

/** The document/video card kind for a filename, or null when it is not a structured document or video. */
export function documentKind(name: string): DocumentKind | null {
  return DOC_KIND_BY_EXT[extOf(name)] ?? null;
}

export interface ProjectDocument {
  /** The portfolio piece id (the key the content route validates + serves). */
  id: string;
  /** The file's basename, for the card title + download name. */
  name: string;
  /** Clean display title (lesson/file split), from the portfolio model. */
  title: string;
  /** Where it came from (lesson or source kind). */
  from: string;
  /** Which viewer the card opens. */
  kind: DocumentKind;
}

const LIST_SQL = `
  SELECT id, kind, title, created_at, competencies,
         jsonb_build_object(
           'filename',    content->'filename',
           'stored_path', content->'stored_path',
           'mimetype',    content->'mimetype',
           'project_label', content->'project_label',
           'projectName', content->'projectName',
           'week',        content->'week'
         ) AS content
    FROM runtime_portfolio_artifacts
   WHERE enrollment_id = :enrollmentId
   ORDER BY created_at DESC, id
   LIMIT 1000`;

/** Resolve the owning enrollment of a project. Null when the project is missing or has no enrollment. */
async function projectEnrollmentId(projectId: string): Promise<string | null> {
  const project = await Project.findByPk(projectId);
  const eid = (project as unknown as { enrollment_id?: string } | null)?.enrollment_id;
  return eid ?? null;
}

/** The filename behind a portfolio piece, from its uploaded file. Empty string when the piece has no file. */
function fileNameOf(content: Record<string, unknown>): string {
  const filename = typeof content.filename === 'string' ? content.filename : '';
  if (filename) return filename.split('/').pop() || filename;
  const stored = typeof content.stored_path === 'string' ? content.stored_path : '';
  return stored ? (stored.split('/').pop() || stored) : '';
}

/**
 * The student's DOCUMENT + video pieces for a project, newest first. A missing project, a project with
 * no enrollment, and an enrollment with no document pieces all yield []. Never throws on bad rows.
 */
export async function listProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  const enrollmentId = await projectEnrollmentId(projectId);
  if (!enrollmentId) return [];
  const rows = await sequelize.query<WorkRow>(LIST_SQL, { replacements: { enrollmentId }, type: QueryTypes.SELECT });
  const out: ProjectDocument[] = [];
  for (const row of rows) {
    const content = asObject(row.content);
    const name = fileNameOf(content);
    if (!name) continue;
    const kind = documentKind(name);
    if (!kind) continue;
    const item = toWorkItem(row);
    out.push({ id: row.id, name, title: item.title, from: item.from, kind });
  }
  return out;
}

/**
 * The uploaded file behind ONE of a project's document pieces, for streaming. Null for a missing
 * project/enrollment, a piece that is not this enrollment's, or a piece that is not a document/video
 * (refused even if its id is known). Video gets a proper video Content-Type for inline playback.
 */
export async function getProjectDocumentFile(projectId: string, artifactId: string): Promise<InternArtifactFile | null> {
  const enrollmentId = await projectEnrollmentId(projectId);
  if (!enrollmentId) return null;
  const file = await getMyWorkFile(enrollmentId, artifactId);
  if (!file) return null;
  const kind = documentKind(file.name);
  if (!kind) return null; // not a structured document/video — never serve source/text/html through this path
  if (kind === 'video') {
    const mime = VIDEO_MIME_BY_EXT[extOf(file.name)];
    if (mime) return { ...file, contentType: mime };
  }
  return file;
}
