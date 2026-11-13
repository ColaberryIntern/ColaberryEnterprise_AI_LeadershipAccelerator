import { CLIP_DECISION_STATEMENTS, CLIP_DECISION_TABLE } from '../ensureBroadcastClipDecisionSchema';

/**
 * D11 — the table a keep-or-cut decision lands in.
 *
 * The property worth pinning is what is NOT here: no default rows. A break reads as cut because
 * its template says it is edited out, derived at read time. A row in this table always means a
 * person chose, which is the distinction a half-reviewed list depends on.
 */

const sql = CLIP_DECISION_STATEMENTS.join('\n');

describe('it is additive and rerunnable', () => {
  it('creates, never drops or alters', () => {
    CLIP_DECISION_STATEMENTS.forEach((s) => {
      expect(s).toMatch(/^\s*CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/);
    });
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('creates only its own table', () => {
    const created = Array.from(sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)).map((m) => m[1]);
    expect(created).toEqual([CLIP_DECISION_TABLE]);
  });

  it('writes no default rows', () => {
    // The whole point. A backfill would record a decision no human made as though one had, and
    // destroy the difference between "cut because it is a break" and "cut because I said so".
    expect(sql).not.toMatch(/\bINSERT\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
  });
});

describe('the key decisions, pinned', () => {
  it('hangs off the OCCURRENCE, not the session', () => {
    // A decision about "the break" is a decision about the break in ONE recording. Keyed on the
    // session it would carry last month's edit into this month's footage.
    const refs = Array.from(sql.matchAll(/REFERENCES\s+(\w+)/g)).map((m) => m[1]);
    expect(refs).toEqual(['broadcast_occurrences']);
  });

  it('cascades, so deleting an airing takes its edit decisions with it', () => {
    expect(sql).toMatch(/ON DELETE CASCADE/);
  });

  it('allows exactly two decisions at the database level', () => {
    // The route validates too, but a CHECK means a bad value cannot reach the table through
    // any path, including a script somebody writes later.
    expect(sql).toMatch(/CHECK \(decision IN \('keep', 'cut'\)\)/);
  });

  it('is unique per segment per airing, so the list cannot hold two answers', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_clip_decision_segment\s+ON broadcast_clip_decisions \(occurrence_id, segment_id\)/);
  });
});
