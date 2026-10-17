/**
 * Who has watched a demo — counted as PEOPLE, never as requests.
 *
 * A video player issues many requests for one viewing: a probe, a tail read for the
 * MP4 moov atom, then one per seek. Incrementing a counter per request would report
 * hundreds of views for a single watch, and a learner would believe it. So this
 * stores a row per (recording, viewer) and the count is the row count — immune to
 * how chatty the player is, and the answer to the question a student actually asks.
 *
 * THE OWNER IS NEVER COUNTED. Watching yourself back is the entire point of the
 * Practice stage; a student rehearsing six times must not see "6 views" and think
 * their cohort watched. The caller passes the owner so this can tell them apart.
 *
 * RECORDING A VIEW NEVER BLOCKS PLAYBACK. It happens alongside serving bytes, and a
 * failure here must not turn a working video into an error. The count being one
 * short is a smaller harm than a player that will not start.
 */

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Note that this viewer has seen this recording.
 *
 * Returns true when this call recorded a NEW viewer. Idempotent on
 * `(recording_id, viewer_enrollment_id)`: a rewatch moves `last_viewed_at` and
 * leaves the count alone.
 */
export async function recordView(
  recordingId: string,
  viewerEnrollmentId: string,
  ownerEnrollmentId: string | null,
): Promise<boolean> {
  // Not a view. See the note above.
  if (ownerEnrollmentId && viewerEnrollmentId === ownerEnrollmentId) return false;
  if (!isUuid(recordingId) || !isUuid(viewerEnrollmentId)) return false;

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `INSERT INTO presentation_recording_views (recording_id, viewer_enrollment_id)
     VALUES (:rec, :viewer)
     ON CONFLICT (recording_id, viewer_enrollment_id)
       DO UPDATE SET last_viewed_at = NOW()
     RETURNING (xmax = 0) AS inserted`,
    { replacements: { rec: recordingId, viewer: viewerEnrollmentId } },
  ) as [Array<{ inserted: boolean }>, unknown];

  // `xmax = 0` is true only on a genuine INSERT; on the DO UPDATE path it is the
  // id of the updating transaction. It is how Postgres distinguishes the two
  // without a second round trip.
  return Boolean(rows?.[0]?.inserted);
}

/**
 * How many distinct people have watched each of these recordings.
 *
 * Through the MODEL, unlike `recordView` above. This is a plain grouped count that
 * Sequelize expresses perfectly well, and the model is the schema contract the
 * parity suite enforces — a table whose only access is raw SQL drifts from its model
 * silently. The upsert stays raw solely because it needs `RETURNING (xmax = 0)`.
 */
export async function viewCounts(recordingIds: string[]): Promise<Record<string, number>> {
  const ids = recordingIds.filter(isUuid);
  if (ids.length === 0) return {};

  const { fn, col } = await import('sequelize');
  const { default: PresentationRecordingView } = await import('../../models/PresentationRecordingView');
  const found = await PresentationRecordingView.findAll({
    attributes: ['recording_id', [fn('COUNT', col('id')), 'n']],
    where: { recording_id: ids },
    group: ['recording_id'],
    raw: true,
  }) as unknown as Array<{ recording_id: string; n: number | string }>;
  const rows = found || [];

  const out: Record<string, number> = {};
  // Every id asked about gets an answer. A recording nobody has watched is 0, not
  // absent — the caller should not have to tell "no views" from "not asked".
  for (const id of ids) out[id] = 0;
  for (const r of rows || []) out[String(r.recording_id)] = Number(r.n) || 0;
  return out;
}

/** "No views yet" / "1 person has watched this" / "9 people have watched this". */
export function describeViews(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'No views yet';
  if (count === 1) return '1 person has watched this';
  return `${count} people have watched this`;
}
