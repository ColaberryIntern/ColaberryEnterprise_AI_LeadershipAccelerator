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
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_ROOT || '/app/uploads');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_MIME = /^(text\/|application\/(json|xml|x-yaml|yaml))/;

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
  /** The uploaded file's text, for small text uploads. */
  file: { name: string; text: string | null; note: string | null } | null;
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
  const resolved = path.resolve(storedPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return { text: null, note: 'file outside the uploads folder' };
  if (typeof mimetype === 'string' && mimetype && !TEXT_MIME.test(mimetype)) return { text: null, note: `binary file (${mimetype})` };
  try {
    const st = fs.statSync(resolved);
    if (st.size > MAX_FILE_BYTES) return { text: null, note: 'file too large to show' };
    return { text: fs.readFileSync(resolved, 'utf8'), note: null };
  } catch {
    return { text: null, note: 'file is no longer on the server' };
  }
}

export function shapeArtifact(row: { id: string; kind: string; title: string; created_at: string | Date; content: unknown; intern: string }): InternArtifactView {
  const content = (row.content && typeof row.content === 'object' ? row.content : {}) as Record<string, unknown>;
  const { body_html: bodyHtml, artifact_url: artifactUrl, ...rest } = content;
  const html = typeof bodyHtml === 'string' && bodyHtml.trim() ? bodyHtml : null;
  const externalUrl = typeof artifactUrl === 'string' && /^https:\/\//.test(artifactUrl) ? artifactUrl : null;
  const file = typeof content.stored_path === 'string'
    ? { name: String(content.filename ?? path.basename(String(content.stored_path))), ...readUpload(content.stored_path, content.mimetype) }
    : null;
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

export async function getInternArtifact(id: string): Promise<InternArtifactView | null> {
  const rows = await sequelize.query<{ id: string; kind: string; title: string; created_at: string; content: unknown; intern: string }>(SQL, {
    replacements: { id }, type: QueryTypes.SELECT,
  });
  return rows[0] ? shapeArtifact(rows[0]) : null;
}
