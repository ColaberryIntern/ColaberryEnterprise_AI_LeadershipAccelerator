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
  /**
   * Whose rehearsal this is. Carried so the caller can tell an owner rewatching
   * themselves from somebody else watching — only the latter is a view.
   */
  ownerEnrollmentId: string | null;
  /**
   * How long the take runs, when Zoom reported it. Carried so a caller choosing a
   * thumbnail frame knows where it may sample; null simply means fewer probes.
   */
  durationSeconds: number | null;
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
         rr.mime_type    AS mime_type,
         r.duration_seconds AS duration_seconds
    FROM presentation_recordings r
    JOIN presentation_attempts   a  ON a.id = r.attempt_id
    JOIN presentation_assignments asg ON asg.id = a.assignment_id
    LEFT JOIN room_resources     rr ON rr.id = r.resource_id
   WHERE asg.project_id = :projectId
     AND asg.story_id   = :storyId
     AND r.id           = :recordingId
     AND r.ingest_status = 'ingested'
   LIMIT 1`;

/**
 * The same chain, by recording id alone, for a STAFF reviewer.
 *
 * `canView` has always said staff see everything — they approve it and they
 * answer for it — so there is no audience predicate to apply here and pretending
 * otherwise would just be ceremony. What there IS, is a narrower entry point:
 * this takes no enrollment and no project, so it cannot be reached from a
 * learner-facing route by passing different arguments. The authority comes from
 * `requireAdmin` on the route plus a ticket that only the admin queue mints.
 *
 * NOT COUNTED AS A VIEW. A staff member checking a demo before approving it is
 * not an audience; counting them would inflate the number the learner sees.
 */
export async function resolveStaffRecording(recordingId: string): Promise<PlaybackResolution> {
  if (!isUuid(recordingId)) return { ok: false, reason: 'not_found' };

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT r.id               AS recording_id,
            rr.storage_key     AS storage_key,
            rr.mime_type       AS mime_type,
            r.duration_seconds AS duration_seconds,
            asg.story_id       AS story_id,
            asg.enrollment_id  AS owner_enrollment_id
       FROM presentation_recordings  r
       JOIN presentation_attempts    a   ON a.id   = r.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
       LEFT JOIN room_resources      rr  ON rr.id  = r.resource_id
      WHERE r.id = :recordingId
        AND r.ingest_status = 'ingested'
      LIMIT 1`,
    { replacements: { recordingId } },
  ) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'not_found' };

  const key = row.storage_key ? String(row.storage_key) : '';
  if (!key) return { ok: false, reason: 'file_missing' };

  const safeName = path.basename(key);
  const full = path.join(ROOM_RECORDING_DIR, safeName);
  if (!fs.existsSync(full)) return { ok: false, reason: 'file_missing' };

  const stat = fs.statSync(full);
  return {
    ok: true,
    recording: {
      recordingId: String(row.recording_id),
      filePath: full,
      sizeBytes: stat.size,
      mimeType: row.mime_type ? String(row.mime_type) : 'video/mp4',
      downloadName: `${row.story_id || 'rehearsal'}-review${path.extname(safeName) || '.mp4'}`,
      ownerEnrollmentId: row.owner_enrollment_id ? String(row.owner_enrollment_id) : null,
      durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined
        ? null
        : Number(row.duration_seconds),
    },
  };
}

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
      // This path only ever resolves for the owner, so the viewer is the owner.
      ownerEnrollmentId: enrollmentId,
      durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    },
  };
}

/**
 * Resolve a recording for ANY permitted viewer — the owner, or somebody the
 * showcase's audience lets in.
 *
 * WHY THIS IS SEPARATE FROM `resolvePlayableRecording`.
 *
 * That function proves ownership and nothing else, which is exactly right for a
 * private rehearsal and exactly wrong for a demo the cohort is meant to watch. A
 * published demo post would have rendered a player that 404s for every peer.
 *
 * The answer is not a second access rule. `canView` already decides who may see a
 * showcase — owner always, staff always, otherwise only while it is live, then
 * private means nobody, cohort means the same cohort, community means any signed-in
 * learner — and it already enumerates every surface so a new one cannot be
 * forgotten. Writing a second rule here is how two copies of an access policy drift
 * until the quieter one is wrong.
 *
 * THE VIEWER'S COHORT IS READ FRESH, never carried in the ticket. A ticket is a
 * claim about which link was issued; it must not also be a frozen claim about what
 * the holder is entitled to, or a learner removed from a cohort keeps watching until
 * their ticket expires.
 *
 * OWNERSHIP IS TRIED FIRST because it is the cheaper and stricter test: an owner
 * needs no showcase to exist at all, and most playback is an owner watching
 * themselves back.
 */
export async function resolveViewableRecording(
  viewerEnrollmentId: string,
  projectId: string,
  storyId: string,
  recordingId: string,
): Promise<PlaybackResolution> {
  const asOwner = await resolvePlayableRecording(viewerEnrollmentId, projectId, storyId, recordingId);
  // `file_missing` is a real, owned recording whose bytes are gone. Falling through
  // to the audience check would turn that into a flat 404 and lose the distinction.
  if (asOwner.ok || asOwner.reason === 'file_missing') return asOwner;

  if (!isUuid(recordingId)) return { ok: false, reason: 'not_found' };

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT s.id              AS showcase_id,
            s.audience        AS audience,
            s.content_hash    AS content_hash,
            s.draft_json->>'current_content_hash' AS current_content_hash,
            s.author_approved_at, s.staff_approved_at, s.published_at, s.withdrawn_at,
            asg.enrollment_id AS owner_enrollment_id,
            asg.cohort_id     AS cohort_id,
            rr.storage_key    AS storage_key,
            rr.mime_type      AS mime_type,
            r.duration_seconds AS duration_seconds
       FROM presentation_recordings r
       JOIN presentation_attempts    a   ON a.id = r.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
       JOIN presentation_showcases   s   ON s.attempt_id = a.id
       LEFT JOIN room_resources      rr  ON rr.id = r.resource_id
      WHERE asg.project_id = :projectId
        AND asg.story_id   = :storyId
        AND r.id           = :recordingId
        AND r.ingest_status = 'ingested'
      LIMIT 1`,
    { replacements: { projectId, storyId, recordingId } },
  ) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'not_found' };

  // Read now, not at mint time. See the note above.
  const { default: Enrollment } = await import('../../models/Enrollment');
  const viewer = await Enrollment.findByPk(viewerEnrollmentId);
  if (!viewer) return { ok: false, reason: 'not_found' };

  const { canView } = await import('./showcaseAccess');
  const permitted = canView(
    {
      id: String(row.showcase_id),
      ownerEnrollmentId: String(row.owner_enrollment_id),
      cohortId: row.cohort_id ? String(row.cohort_id) : null,
      audience: row.audience,
      contentHash: row.content_hash,
      currentContentHash: row.current_content_hash,
      authorApprovedAt: row.author_approved_at,
      staffApprovedAt: row.staff_approved_at,
      publishedAt: row.published_at,
      withdrawnAt: row.withdrawn_at,
    },
    {
      enrollmentId: viewerEnrollmentId,
      cohortId: (viewer as { cohort_id?: string | null }).cohort_id ?? null,
      // Staff reach recordings through the admin surfaces, which carry their own
      // identity. A participant ticket never confers staff.
      isStaff: false,
    },
    // `media` - serving the bytes IS the media surface. Deliberately not an eighth
    // surface: SHOWCASE_SURFACES is iterated by its own suite so that adding one is
    // a considered act with obligations, and this is not a new kind of access.
    'media',
  );
  // Refused and absent give the same answer, as everywhere else in this subsystem.
  if (!permitted) return { ok: false, reason: 'not_found' };

  const key = row.storage_key ? String(row.storage_key) : '';
  if (!key) return { ok: false, reason: 'file_missing' };
  const safeName = path.basename(key);
  const full = path.join(ROOM_RECORDING_DIR, safeName);
  if (!fs.existsSync(full)) return { ok: false, reason: 'file_missing' };

  const stat = fs.statSync(full);
  return {
    ok: true,
    recording: {
      recordingId: String(recordingId),
      filePath: full,
      sizeBytes: stat.size,
      mimeType: row.mime_type ? String(row.mime_type) : 'video/mp4',
      downloadName: `${storyId}-demo${path.extname(safeName) || '.mp4'}`,
      ownerEnrollmentId: String(row.owner_enrollment_id),
      durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    },
  };
}
