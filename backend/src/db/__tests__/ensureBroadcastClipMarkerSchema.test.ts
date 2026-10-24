import { CLIP_MARKER_STATEMENTS, CLIP_MARKER_TABLE } from '../ensureBroadcastClipMarkerSchema';

/**
 * L7.3 — the table that finally makes a clip list survive the tab closing.
 *
 * Two properties carry weight here, and neither is obvious from reading the DDL in passing.
 * The unique key is what makes an advance idempotent, so stepping back and forward cannot mint
 * a second marker for one moment. And the foreign key is to the OCCURRENCE, not the session: a
 * session is taught many times and recorded separately each time, so a timecode keyed on the
 * session would be ambiguous the second time the class ran.
 */

const sql = CLIP_MARKER_STATEMENTS.join('\n');

describe('it is additive and rerunnable', () => {
  it('creates, never drops or alters', () => {
    CLIP_MARKER_STATEMENTS.forEach((s) => {
      expect(s).toMatch(/^\s*CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/);
    });
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('creates only its own table', () => {
    const created = Array.from(sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)).map((m) => m[1]);
    expect(created).toEqual([CLIP_MARKER_TABLE]);
  });
});

describe('the key decisions, pinned', () => {
  it('hangs off the OCCURRENCE, not the session', () => {
    // A session is taught many times and recorded separately each time. A timecode keyed on the
    // session is ambiguous the second time the class runs.
    const refs = Array.from(sql.matchAll(/REFERENCES\s+(\w+)/g)).map((m) => m[1]);
    expect(refs).toEqual(['broadcast_occurrences']);
    expect(sql).not.toMatch(/REFERENCES\s+live_sessions/i);
  });

  it('cascades, so deleting an airing takes its clip list with it', () => {
    // Otherwise markers outlive the recording they point into, and nobody can tell.
    expect(sql).toMatch(/ON DELETE CASCADE/);
  });

  it('is UNIQUE on (occurrence, slide_index), which is what makes an advance idempotent', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*\(occurrence_id, slide_index\)/);
  });

  it('keys on the INDEX, never the slide id', () => {
    // Slide ids are not unique: the cover and the cold-open segment slide are both
    // 'cold-open-0'. Presenter notes already refuse to key on them.
    expect(sql).toMatch(/slide_index INTEGER NOT NULL/);
    expect(sql).not.toMatch(/slide_id\s+(TEXT|VARCHAR)[^\n]*NOT NULL/i);
  });

  it('refuses a negative timecode at the database', () => {
    // A marker before the content started is a bug upstream, and the column should not be able
    // to hold the evidence of it.
    expect(sql).toMatch(/timecode_seconds INTEGER NOT NULL CHECK \(timecode_seconds >= 0\)/);
  });

  it('requires a label, because an unlabelled clip is not a clip', () => {
    expect(sql).toMatch(/label TEXT NOT NULL/);
  });

  it('CONTROL: a column that is not in this table is not matched', () => {
    expect(sql).not.toMatch(/\bprovider_session_id\b/);
  });
});
