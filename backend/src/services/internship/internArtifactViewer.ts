/**
 * internArtifactViewer - one published intern artifact, shaped for the admin viewer page.
 *
 * Why this exists: the Internship Report links every artifact an intern has published, and Ali
 * asked to "open any artifacts they have published directly in the report". Artifacts live in
 * `runtime_portfolio_artifacts` as CONTENT, not files or URLs, and the shape differs by kind
 * (measured on prod 9 Nov 2026):
 *   field_guide       content.body_html (a full HTML document, up to ~500 KB)
 *   claude_studio     content.artifact_url (a claude.ai link) + reflection
 *   build_artifact    an uploaded file at content.stored_path (+ repo_path, commit_sha)
 *   architecture_decision / case_study / prompt_library / architecture_doc   structured JSON
 * So the viewer gets: the HTML when there is some, the external link when there is one, the
 * uploaded file's text when it is a small text file, and the rest of the content as data.
 *
 * Scope: only artifacts of ACTIVE interns (the same roster predicate as the Intern Console). The
 * route is on the `internship` section, and that section should not become a way to read any
 * student's portfolio by guessing an id. Anything else answers null, which the route turns into 404.
 *
 * Failure modes: an unreadable or missing upload file is reported as `file: null` with the reason,
 * never thrown; the DB query failing throws to the route (500, logged).
 */
import fs from 'fs';
import path from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_ROOT || '/app/uploads');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TABLE_ROWS = 2000;
const TEXT_MIME = /^(text\/|application\/(json|xml|x-yaml|yaml))/;

/**
 * What the uploaded file is, so the page can pick the right viewer (Ali, 10 Nov 2026: "I also need
 * to have a pdf viewer in the platform ... I should be able to have a csv viewer where I can view
 * in excel"). From the extension first, then the stored mimetype.
 */
export type ArtifactFileKind = 'pdf' | 'csv' | 'word' | 'slides' | 'spreadsheet' | 'image' | 'text' | 'other';
export function fileKind(name: string, mimetype?: unknown): ArtifactFileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const mime = typeof mimetype === 'string' ? mimetype.toLowerCase() : '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv') return 'csv';
  if (ext === 'docx' || ext === 'doc' || mime.includes('wordprocessingml')) return 'word';
  if (ext === 'pptx' || ext === 'ppt' || mime.includes('presentationml')) return 'slides';
  if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheetml')) return 'spreadsheet';
  if (/^(png|jpe?g|gif|webp|svg)$/.test(ext) || mime.startsWith('image/')) return 'image';
  if (TEXT_MIME.test(mime) || /^(md|markdown|txt|json|ya?ml|xml)$/.test(ext)) return 'text';
  return 'other';
}

/** The absolute path of an upload, or null when it is outside the uploads root (never served). */
export function safeUploadPath(storedPath: unknown, root = UPLOADS_ROOT): string | null {
  if (typeof storedPath !== 'string' || !storedPath) return null;
  const resolved = path.resolve(storedPath);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

/** CSV text to rows; a malformed CSV gives null (the page then shows the raw text). */
export function csvRows(text: string, delimiter = ','): string[][] | null {
  try {
    const rows = parseCsv(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, bom: true }) as string[][];
    return rows.slice(0, MAX_TABLE_ROWS);
  } catch {
    return null;
  }
}

export interface InternArtifactView {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  intern: string;
  /** A full HTML document to render in a sandboxed frame, when the artifact is one. */
  html: string | null;
  /** A link the artifact already lives at (claude.ai), when it has one. */
  externalUrl: string | null;
  /**
   * The uploaded file. `kind` picks the viewer: pdf (streamed from /file), csv (`table`, plus an
   * Excel download), word / slides / spreadsheet (download), text (`text`).
   */
  file: { name: string; kind: ArtifactFileKind; available: boolean; text: string | null; table: string[][] | null; note: string | null } | null;
  /** Everything else in the content, for a structured render. */
  data: Record<string, unknown>;
}

const SQL = `
  SELECT r.id, r.kind, r.title, r.created_at, r.content, COALESCE(NULLIF(TRIM(e.full_name), ''), e.email) AS intern
    FROM runtime_portfolio_artifacts r
    JOIN enrollments e ON e.id = r.enrollment_id
   WHERE r.id = :id
     AND EXISTS (SELECT 1 FROM cohort_memberships cm JOIN cohorts c ON c.id = cm.cohort_id
                  WHERE cm.enrollment_id = r.enrollment_id AND cm.membership_type = 'internship'
                    AND cm.status = 'active' AND c.cohort_type = 'ai_internship')`;

/** Read an upload only when it is inside the uploads root, small, and text. */
export function readUpload(storedPath: unknown, mimetype: unknown, root = UPLOADS_ROOT): { text: string | null; note: string | null } {
  if (typeof storedPath !== 'string' || !storedPath) return { text: null, note: 'no stored file' };
  const resolved = safeUploadPath(storedPath, root);
  if (!resolved) return { text: null, note: 'file outside the uploads folder' };
  if (typeof mimetype === 'string' && mimetype && !TEXT_MIME.test(mimetype)) return { text: null, note: `binary file (${mimetype})` };
  try {
    const st = fs.statSync(resolved);
    if (st.size > MAX_FILE_BYTES) return { text: null, note: 'file too large to show' };
    return { text: fs.readFileSync(resolved, 'utf8'), note: null };
  } catch {
    return { text: null, note: 'file is no longer on the server' };
  }
}

/** The file part of the view: binary kinds are only located (the page streams them), text kinds are read. */
function shapeFile(content: Record<string, unknown>): NonNullable<InternArtifactView['file']> {
  const name = String(content.filename ?? path.basename(String(content.stored_path)));
  const kind = fileKind(name, content.mimetype);
  const abs = safeUploadPath(content.stored_path);
  const available = !!abs && fs.existsSync(abs);
  if (kind === 'csv' || kind === 'text') {
    // A CSV's stored mimetype is sometimes octet-stream; read it as text either way.
    const { text, note } = readUpload(content.stored_path, kind === 'csv' ? 'text/csv' : content.mimetype);
    const table = kind === 'csv' && text !== null ? csvRows(text, /\.tsv$/i.test(name) ? '\t' : ',') : null;
    return { name, kind, available, text, table, note };
  }
  return { name, kind, available, text: null, table: null, note: available ? null : 'file is no longer on the server' };
}

export function shapeArtifact(row: { id: string; kind: string; title: string; created_at: string | Date; content: unknown; intern: string }): InternArtifactView {
  const content = (row.content && typeof row.content === 'object' ? row.content : {}) as Record<string, unknown>;
  const { body_html: bodyHtml, artifact_url: artifactUrl, ...rest } = content;
  const html = typeof bodyHtml === 'string' && bodyHtml.trim() ? bodyHtml : null;
  const externalUrl = typeof artifactUrl === 'string' && /^https:\/\//.test(artifactUrl) ? artifactUrl : null;
  const file = typeof content.stored_path === 'string' ? shapeFile(content) : null;
  // Server paths are not something the viewer needs to show.
  delete (rest as Record<string, unknown>).stored_path;
  delete (rest as Record<string, unknown>).stored_name;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    intern: row.intern,
    html,
    externalUrl,
    file,
    data: rest,
  };
}

/** MIME types the file route will serve; anything else goes out as a download. */
const SERVE_MIME: Record<ArtifactFileKind, string> = {
  pdf: 'application/pdf', csv: 'text/csv; charset=utf-8', text: 'text/plain; charset=utf-8',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  slides: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  spreadsheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  image: 'application/octet-stream', other: 'application/octet-stream',
};

export interface InternArtifactFile { absPath: string; name: string; kind: ArtifactFileKind; contentType: string; title: string }

/**
 * The uploaded file behind an artifact, for streaming: same active-intern scope as the viewer, and
 * only a path inside the uploads root that exists. Null for anything else (the route answers 404).
 */
export async function getInternArtifactFile(id: string): Promise<InternArtifactFile | null> {
  const rows = await sequelize.query<{ title: string; content: Record<string, unknown> | null }>(SQL, { replacements: { id }, type: QueryTypes.SELECT });
  const content = rows[0]?.content;
  if (!content) return null;
  const absPath = safeUploadPath(content.stored_path);
  if (!absPath || !fs.existsSync(absPath)) return null;
  const name = String(content.filename ?? path.basename(absPath));
  const kind = fileKind(name, content.mimetype);
  return { absPath, name, kind, contentType: SERVE_MIME[kind], title: rows[0].title };
}

export async function getInternArtifact(id: string): Promise<InternArtifactView | null> {
  const rows = await sequelize.query<{ id: string; kind: string; title: string; created_at: string; content: unknown; intern: string }>(SQL, {
    replacements: { id }, type: QueryTypes.SELECT,
  });
  return rows[0] ? shapeArtifact(rows[0]) : null;
}
