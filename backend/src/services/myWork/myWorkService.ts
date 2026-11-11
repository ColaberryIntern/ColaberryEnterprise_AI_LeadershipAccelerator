/**
 * myWorkService - the learner's OWN pieces of work, for the My work room and the work page (C128).
 *
 * Scope is the whole point: every query here is keyed on the enrollment from the verified session
 * AND the piece id, so a learner can only ever read their own rows. Another learner's id, a deleted
 * id and a made-up id all come back null, which the route turns into the same 404 (it does not
 * confirm that the piece exists). The admin viewer (internArtifactViewer) keeps its own scope.
 *
 * The viewers are the admin ones, reused: `shapeArtifact` gives the HTML, link and file parts, and
 * `locateArtifactFile` resolves an upload inside the uploads root only.
 *
 * Failure modes: a failing query throws to the route (500, logged). A missing upload is reported in
 * the view (`file.available: false`), never thrown. The list never touches the disk.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { locateArtifactFile, shapeArtifact, type InternArtifactFile, type InternArtifactView } from '../internship/internArtifactViewer';
import {
  asObject, linkBodyFor, recordingBodyFor, toWorkItem, writtenBodyFor,
  type LinkBody, type RecordingBody, type WorkItem, type WorkRow, type WrittenBody,
} from './myWorkModel';

/** A ceiling, not a page size: the most any learner has today is 79 (production, 10 Nov 2026). */
const MAX_PIECES = 1000;

const LIST_SQL = `
  SELECT id, kind, title, created_at, competencies,
         content - 'body_html' - 'sections' - 'adr' - 'receipt' - 'reflection' AS content
    FROM runtime_portfolio_artifacts
   WHERE enrollment_id = :enrollmentId
   ORDER BY created_at DESC, id
   LIMIT ${MAX_PIECES}`;

const ONE_SQL = `
  SELECT id, kind, title, created_at, competencies, content
    FROM runtime_portfolio_artifacts
   WHERE id = :id AND enrollment_id = :enrollmentId`;

export async function listMyWork(enrollmentId: string): Promise<WorkItem[]> {
  const rows = await sequelize.query<WorkRow>(LIST_SQL, { replacements: { enrollmentId }, type: QueryTypes.SELECT });
  return rows.map(toWorkItem);
}

export type MyWorkPiece = WorkItem & Omit<InternArtifactView, 'intern' | 'kind' | 'title' | 'createdAt' | 'id'> & {
  written: WrittenBody | null;
  link: LinkBody | null;
  recording: RecordingBody | null;
};

/** Content keys a body already renders, so the leftover `data` block does not repeat them. */
const CONSUMED = ['sections', 'skills_demonstrated', 'adr', 'receipt', 'reflection', 'stages_completed', 'ai_disclosure',
  'project_proof_url', 'competencies', 'kind', 'week', 'project_label', 'projectName', 'durationSeconds', 'mode', 'recordingRef',
  'filename', 'mimetype', 'size_bytes', 'uploaded_at', 'scenario_version', 'studio_title', 'verification', 'review_state',
  'attempt', 'first_submitted_at', 'last_submitted_at', 'storyId', 'attemptNo', 'hasAudio', 'hasSharedScreen', 'recordedAt',
  'built_on_sample'];

export function toPiece(row: WorkRow): MyWorkPiece {
  const item = toWorkItem(row);
  const content = asObject(row.content);
  const view = shapeArtifact({ id: row.id, kind: row.kind, title: row.title, created_at: row.created_at, content, intern: '' });
  const data = { ...view.data };
  for (const k of CONSUMED) delete data[k];
  return {
    ...item,
    html: view.html,
    externalUrl: view.externalUrl,
    file: view.file,
    data,
    written: item.group === 'written' ? writtenBodyFor(row.kind, content) : null,
    link: row.kind === 'claude_studio' ? linkBodyFor(content) : null,
    recording: row.kind === 'presentation' ? recordingBodyFor(content) : null,
  };
}

export async function getMyWorkPiece(enrollmentId: string, id: string): Promise<MyWorkPiece | null> {
  const rows = await sequelize.query<WorkRow>(ONE_SQL, { replacements: { id, enrollmentId }, type: QueryTypes.SELECT });
  return rows[0] ? toPiece(rows[0]) : null;
}

/** The uploaded file behind one of the learner's own pieces, for streaming. Null for anything else. */
export async function getMyWorkFile(enrollmentId: string, id: string): Promise<InternArtifactFile | null> {
  const rows = await sequelize.query<WorkRow>(ONE_SQL, { replacements: { id, enrollmentId }, type: QueryTypes.SELECT });
  return rows[0] ? locateArtifactFile(rows[0].title, asObject(rows[0].content)) : null;
}
