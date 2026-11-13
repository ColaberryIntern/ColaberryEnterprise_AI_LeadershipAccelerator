import { sequelize } from '../config/database';

/**
 * D10 — a moment somebody CHOSE, as against a moment the deck produced.
 *
 * `broadcast_clip_markers` already records one row per slide the instructor advanced to. This is
 * the other half: a producer watching the class presses "mark this moment" when something worth
 * cutting happens, and nothing on the rundown marks it because no slide changed.
 *
 * ## Why this is a second table and not a column on the first
 *
 * The honest answer is that I tried the column first and this repository stopped me, correctly.
 *
 * `broadcast_clip_markers` is UNIQUE on (occurrence_id, slide_index), which is exactly right for
 * advances: stepping back and forward again is the same moment, so the second write is discarded
 * by ON CONFLICT DO NOTHING. It is exactly WRONG for presses: a press can happen many times on
 * one long slide, and each press is a different moment. A good student question and a crisp
 * explanation ten minutes later are two clips inside one segment.
 *
 * Making that index partial would have fixed it, and would also have meant an ALTER TABLE and a
 * DROP INDEX on a shipped table. `ensureBroadcastClipMarkerSchema.test.ts` asserts that file
 * "creates, never drops or alters" — a deliberate, testable invariant rather than an accident.
 * Overriding a guard because my first design wanted it gone is the wrong way round, so the
 * design changed instead.
 *
 * What that buys, beyond compliance: nothing already recorded can change meaning, the advance
 * path keeps the identical ON CONFLICT clause it has today (a partial index would have required
 * rewriting it, and the caller SWALLOWS failures — so a mismatch there would have stopped every
 * marker being written with nothing in the UI to show for it), and this is reversible by
 * dropping one table nothing else references.
 *
 * The two are reunited where they belong, at the read: `buildClipRows` already sorts every
 * marker by timecode, so one ordered clip list comes out of two tables.
 *
 * ## The key
 *
 * UNIQUE ON (occurrence_id, timecode_seconds). Losing the other table's uniqueness is not the
 * same as not needing one — a double-tap, a retried request or a jittery touchscreen must not
 * produce two clips of one moment. Two presses inside the same second are one moment; a second
 * apart is two deliberate marks. Same ON CONFLICT DO NOTHING, same reason: the database
 * arbitrates rather than a check-then-write in the app, which would race with itself.
 *
 * Additive, in its own file, per the rule in ensureBroadcastSchema's header.
 */
export const CLIP_MARK_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS broadcast_clip_marks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     -- The occurrence, not the session, for the same reason as the markers table: a timecode is
     -- only meaningful against one recording, and a session is taught many times.
     occurrence_id UUID NOT NULL REFERENCES broadcast_occurrences(id) ON DELETE CASCADE,
     -- Seconds into the recording, from the occurrence's content_started_at.
     timecode_seconds INTEGER NOT NULL CHECK (timecode_seconds >= 0),
     -- Where the class was when the press happened, so the clip list can say which segment it
     -- fell in. An INDEX, never a slide id: ids are not unique.
     slide_index INTEGER NOT NULL,
     -- What the moment is worth, when the slide resolved and the deck had not drifted. The
     -- policy substitutes a neutral label rather than a wrong one, and never drops the mark.
     label TEXT NOT NULL,
     segment_id TEXT,
     segment_label TEXT,
     slide_title TEXT,
     -- Whether the label column is authored or the fallback. Stored rather than derived, because the
     -- markers table's own export comment records the cost of guessing this after the fact:
     -- a publicValue written character-for-character like the segment label is read back as a
     -- fallback and silently loses its candidate flag.
     labelled BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_clip_mark_second
     ON broadcast_clip_marks (occurrence_id, timecode_seconds)`,
  // The clip list is always read as "every mark for this airing, in order".
  `CREATE INDEX IF NOT EXISTS idx_broadcast_clip_mark_timecode
     ON broadcast_clip_marks (occurrence_id, timecode_seconds)`,
];

export const CLIP_MARK_TABLE = 'broadcast_clip_marks';

export async function ensureBroadcastClipMarkSchema(): Promise<void> {
  for (const sql of CLIP_MARK_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] broadcast clip mark schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Broadcast clip mark schema ensured');
}
