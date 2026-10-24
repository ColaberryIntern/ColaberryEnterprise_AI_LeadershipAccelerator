import { sequelize } from '../config/database';

/**
 * L7.3 — where the clips are, recorded while the show runs.
 *
 * The deck has had a "mark this moment" button for as long as it has existed. It pushes into an
 * in-memory array and offers a CSV download; close the tab and the clip list is gone. Nothing
 * server-side has ever recorded a marker, and no marker has ever been joined to a recording — so
 * the editing pass after a class starts with a human scrubbing a 38-minute video.
 *
 * ONE ROW PER MOMENT THE INSTRUCTOR ADVANCED TO, with its position in the RECORDING rather than
 * on anybody's wall clock.
 *
 * WHY IT HANGS OFF THE OCCURRENCE AND NOT THE SESSION. A session can be taught many times and
 * recorded separately each time; a timecode is only meaningful against one recording. Keying on
 * the occurrence means a marker can never be read against the wrong airing, and ON DELETE
 * CASCADE means deleting an occurrence takes its clip list with it rather than leaving markers
 * pointing at a recording nobody can find.
 *
 * UNIQUE ON (occurrence_id, slide_index), DELIBERATELY. An instructor who steps back and forward
 * again should not produce two markers for one moment: the first arrival is when the thing
 * happened. The write uses ON CONFLICT DO NOTHING, so idempotency is the database's job rather
 * than a check-then-write race in the app.
 *
 * Additive, in its own file, per the rule in ensureBroadcastSchema's header.
 */
export const CLIP_MARKER_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS broadcast_clip_markers (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     occurrence_id UUID NOT NULL REFERENCES broadcast_occurrences(id) ON DELETE CASCADE,
     -- The position on the rundown. An INDEX, never a slide id: ids are not unique (the cover
     -- and the cold-open segment slide are both 'cold-open-0'), which is why presenter notes
     -- already refuse to key on them.
     slide_index INTEGER NOT NULL,
     -- Seconds into the recording, from the occurrence's content_started_at. Not from the
     -- deck's localStorage clock, which is per-browser and gone when the tab closes.
     timecode_seconds INTEGER NOT NULL CHECK (timecode_seconds >= 0),
     -- What this moment is worth as public content. Authored on the timeline as publicValue.
     label TEXT NOT NULL,
     segment_id TEXT,
     segment_label TEXT,
     slide_title TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_clip_marker_slide
     ON broadcast_clip_markers (occurrence_id, slide_index)`,
  // The clip list is always read as "every marker for this airing, in order".
  `CREATE INDEX IF NOT EXISTS idx_broadcast_clip_marker_timecode
     ON broadcast_clip_markers (occurrence_id, timecode_seconds)`,
];

export const CLIP_MARKER_TABLE = 'broadcast_clip_markers';

export async function ensureBroadcastClipMarkerSchema(): Promise<void> {
  for (const sql of CLIP_MARKER_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] broadcast clip marker schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Broadcast clip markers ensured');
}
