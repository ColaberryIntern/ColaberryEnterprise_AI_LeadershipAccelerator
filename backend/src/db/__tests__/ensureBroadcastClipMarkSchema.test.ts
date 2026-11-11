import { CLIP_MARK_STATEMENTS, CLIP_MARK_TABLE } from '../ensureBroadcastClipMarkSchema';
import { CLIP_MARKER_STATEMENTS } from '../ensureBroadcastClipMarkerSchema';

/**
 * D10 — the table a deliberate press lands in.
 *
 * The assertions that carry weight are about what this table does NOT do. It exists as a second
 * table precisely so that the shipped `broadcast_clip_markers` is not altered, and a later
 * change that "tidies" the two together would undo the reason it was split.
 */

const sql = CLIP_MARK_STATEMENTS.join('\n');

describe('it is additive and rerunnable', () => {
  it('creates, never drops or alters', () => {
    CLIP_MARK_STATEMENTS.forEach((s) => {
      expect(s).toMatch(/^\s*CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/);
    });
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('creates only its own table', () => {
    const created = Array.from(sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)).map((m) => m[1]);
    expect(created).toEqual([CLIP_MARK_TABLE]);
  });

  /**
   * THE WHOLE REASON THIS FILE EXISTS.
   *
   * The first design added a `source` column to `broadcast_clip_markers` and made its unique
   * index partial, which meant an ALTER TABLE and a DROP INDEX on a shipped table. That file's
   * own test forbids both, deliberately. This asserts the split held - a later change that moves
   * these statements back into the markers file would fail there, and this says why here.
   */
  it('does not touch the markers table at all', () => {
    expect(sql).not.toMatch(/broadcast_clip_markers/);
    expect(sql).not.toMatch(/uq_broadcast_clip_marker_slide/);
  });

  it('CONTROL: the markers file is still the additive, unaltered one it was', () => {
    const markerSql = CLIP_MARKER_STATEMENTS.join('\n');
    expect(markerSql).not.toMatch(/\bDROP\b/i);
    expect(markerSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    // Its uniqueness is unconditional, which is what makes an advance idempotent and what
    // made it the wrong home for a press.
    expect(markerSql).toMatch(/uq_broadcast_clip_marker_slide/);
    expect(markerSql).not.toMatch(/WHERE\s+source/i);
  });
});

describe('the key decisions, pinned', () => {
  it('hangs off the OCCURRENCE, not the session', () => {
    const refs = Array.from(sql.matchAll(/REFERENCES\s+(\w+)/g)).map((m) => m[1]);
    expect(refs).toEqual(['broadcast_occurrences']);
    expect(sql).not.toMatch(/REFERENCES\s+live_sessions/i);
  });

  it('cascades, so deleting an airing takes its marks with it', () => {
    expect(sql).toMatch(/ON DELETE CASCADE/);
  });

  /**
   * A PRESS IS IDEMPOTENT ON ITS OWN SECOND, and that is the deliberate difference from the
   * markers table. There, one slide may hold one marker. Here, one slide may hold many marks -
   * a long segment can contain several moments - but one SECOND may hold only one, so a
   * double-tap or a retried request cannot mint two clips of one moment.
   */
  it('is unique per second, not per slide', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_clip_mark_second\s+ON broadcast_clip_marks \(occurrence_id, timecode_seconds\)/);
    // The mistake this guards: copying the markers table's key would silently discard every
    // press after the first on any given slide.
    expect(sql).not.toMatch(/UNIQUE INDEX[^;]*\(occurrence_id, slide_index\)/);
  });

  it('refuses a negative timecode, which cannot point into a recording', () => {
    expect(sql).toMatch(/timecode_seconds INTEGER NOT NULL CHECK \(timecode_seconds >= 0\)/);
  });

  it('stores whether the label was authored rather than leaving it to be guessed later', () => {
    // The markers export derives this and documents its own false negative: a publicValue
    // written character-for-character like the segment label reads back as a fallback.
    expect(sql).toMatch(/labelled BOOLEAN NOT NULL DEFAULT FALSE/);
  });
});
