import path from 'path';
import fs from 'fs';
import { ROOM_RECORDING_DIR } from '../../config/upload';

/**
 * Resolve a learner's own rehearsal recording to a file on disk.
 *
 * WHY THIS EXISTS. The Practice panel has always told learners "Your recording is
 * available to watch back", and until now there was no route that could serve one —
 * the file was downloaded, stored and linked to nothing a student could reach. The
 * sentence only became visible on 2026-10-12, when the `ready` transition started
 * working; the gap behind it was older than that.
 *
 * OWNERSHIP IS PROVED FROM THE PROJECT DOWN, never from the recording up. The caller
 * supplies the project and task they claim; this checks the project belongs to the
 * enrollment, then that the attempt belongs to that task, then that the recording
 * belongs to that attempt. A recording id alone is never enough — otherwise one
 * learner could watch another's rehearsal by guessing a uuid, which is exactly the
 * failure the whole Studio tenancy design exists to prevent.
 *
 * NOT FOUND AND NOT YOURS ARE THE SAME ANSWER, deliberately. A 403 would confirm the
 * recording exists.
 */

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export interface PlayableRecording {
  recordingId: string;
  /** Absolute path on disk. Already basename-guarded. */
  filePath: string;
  sizeBytes: number;
  mimeType: string;
  /** For the download filename; never anything the learner supplied. */
  downloadName: string;
}

export type PlaybackResolution =
  | { ok: true; recording: PlayableRecording }
  /** Missing, not owned, not yet ingested, or the bytes are gone. Same answer. */
  | { ok: false; reason: 'not_found' }
  /** Owned and real, but the file never made it to disk — worth saying distinctly. */
  | { ok: false; reason: 'file_missing' };

/**
 * The join that proves the chain: project -> task -> attempt -> recording -> stored file.
 *
 * `ingest_status = 'ingested'` is required: a recording parked in review belongs to
 * nobody yet, and serving one would hand a learner a file that may be another
 * cohort member's rehearsal.
 */
const SQL = `
  SELECT r.id            AS recording_id,
         rr.storage_key  AS storage_key,
         rr.size_bytes   AS size_bytes,
         rr.mime_type    AS mime_type
    FROM presentation_recordings r
    JOIN presentation_attempts   a  ON a.id = r.attempt_id
    JOIN presentation_assignments asg ON asg.id = a.assignment_id
    LEFT JOIN room_resources     rr ON rr.id = r.resource_id
   WHERE asg.project_id = :projectId
     AND asg.story_id   = :storyId
     AND r.id           = :recordingId
     AND r.ingest_status = 'ingested'
   LIMIT 1`;

export async function resolvePlayableRecording(
  enrollmentId: string,
  projectId: string,
  storyId: string,
  recordingId: string,
): Promise<PlaybackResolution> {
  if (!isUuid(recordingId)) return { ok: false, reason: 'not_found' };

  // Ownership first and on its own. Everything below assumes the project is theirs.
  const { getOwnedProjectTree } = await import('../projects/projectReadService');
  if (!(await getOwnedProjectTree(enrollmentId, projectId))) return { ok: false, reason: 'not_found' };

  const sequelize = await db();
  const [rows] = await sequelize.query(SQL, {
    replacements: { projectId, storyId, recordingId },
  }) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'not_found' };

  // No linked resource means the recording row exists but was never joined to the
  // bytes. Distinct from "no such recording", and the operator needs that difference.
  const key = row.storage_key ? String(row.storage_key) : '';
  if (!key) return { ok: false, reason: 'file_missing' };

  // `storage_key` is a uuid filename THIS codebase generated, never anything a user
  // supplied — but basename is applied anyway, so a corrupted row cannot become a
  // path traversal.
  const safeName = path.basename(key);
  const full = path.join(ROOM_RECORDING_DIR, safeName);
  if (!fs.existsSync(full)) return { ok: false, reason: 'file_missing' };

  const stat = fs.statSync(full);
  return {
    ok: true,
    recording: {
      recordingId: String(row.recording_id),
      filePath: full,
      // The row's size can drift from the file's; the file is the truth for ranges.
      sizeBytes: stat.size,
      mimeType: row.mime_type ? String(row.mime_type) : 'video/mp4',
      downloadName: `${storyId}-rehearsal${path.extname(safeName) || '.mp4'}`,
    },
  };
}
