/**
 * The broadcast schema must be purely ADDITIVE: it may only create new tables/indexes, never alter or drop
 * an existing one, and its foreign keys may only reference the new tables it creates itself. Four event-like
 * tables already own their own rows (live_sessions, open_house_events, community_events, room_bookings) and
 * this model reconciles them WITHOUT re-homing any of them — so an FK reaching into one of those would be a
 * design regression, not just a schema one. Asserted against the actual DDL so a future edit that sneaks in
 * an ALTER, or quietly couples to an existing table, fails here.
 *
 * The remaining tests pin the invariants this schema exists to hold, so that deleting one is a visible act.
 */
import {
  BROADCAST_STATEMENTS,
  REQUIRED_TABLES,
  EDITORIAL_STATES,
  ACCESS_MODES,
  SOURCE_TYPES,
} from '../ensureBroadcastSchema';

const joined = BROADCAST_STATEMENTS.join('\n');

describe('ensureBroadcastSchema is additive-only', () => {
  it('every statement is CREATE ... IF NOT EXISTS (no ALTER, no DROP, no TRUNCATE)', () => {
    for (const sql of BROADCAST_STATEMENTS) {
      const s = sql.trim().toUpperCase();
      expect(
        s.startsWith('CREATE TABLE IF NOT EXISTS')
        || s.startsWith('CREATE INDEX IF NOT EXISTS')
        || s.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS'),
      ).toBe(true);
      expect(s).not.toMatch(/\bALTER\s+TABLE\b/);
      expect(s).not.toMatch(/\bDROP\b/);
      expect(s).not.toMatch(/\bTRUNCATE\b/);
    }
  });

  it('every CREATE TABLE targets one of the new REQUIRED_TABLES (never an existing table)', () => {
    const created = BROADCAST_STATEMENTS
      .map((s) => s.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i)?.[1])
      .filter(Boolean) as string[];
    expect(created.sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('foreign keys reference ONLY the new tables this file creates', () => {
    const refs = joined
      .match(/REFERENCES\s+(\w+)\s*\(/gi)
      ?.map((r) => r.replace(/REFERENCES\s+/i, '').replace(/\s*\(/, '').trim()) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const t of refs) expect(REQUIRED_TABLES).toContain(t);
  });

  it('does NOT foreign-key into any pre-existing event table — those keep owning their own rows', () => {
    for (const existing of ['live_sessions', 'open_house_events', 'community_events', 'room_bookings', 'community_rooms']) {
      expect(joined).not.toMatch(new RegExp(`REFERENCES\\s+${existing}\\b`, 'i'));
    }
  });
});

describe('ensureBroadcastSchema holds the invariants the feature depends on', () => {
  it('editorial state and provider health are SEPARATE columns', () => {
    // §4.1: a producer's Go Live and verified provider readiness are both required. One merged column
    // would make "scheduled time passed" indistinguishable from "the feed is actually usable".
    expect(joined).toMatch(/editorial_state\s+VARCHAR/i);
    expect(joined).toMatch(/provider_health\s+VARCHAR/i);
  });

  it('constrains editorial_state to the declared set, including backstage and reconnecting', () => {
    for (const s of EDITORIAL_STATES) expect(joined).toContain(`'${s}'`);
    expect(joined).toMatch(/CHECK \(editorial_state IN \(/i);
    // The two that carry the §4.1 guarantees specifically.
    expect(EDITORIAL_STATES).toContain('backstage');
    expect(EDITORIAL_STATES).toContain('reconnecting');
  });

  it('carries content_started_at as a column distinct from scheduled_start_at', () => {
    // The preview clock anchors to content_started_at, never the scheduled time, so a waiting-room
    // countdown cannot consume a free viewer's 15 minutes.
    expect(joined).toMatch(/content_started_at\s+TIMESTAMPTZ/i);
    expect(joined).toMatch(/scheduled_start_at\s+TIMESTAMPTZ/i);
  });

  it('defaults preview_seconds to 900 and forbids a non-positive window', () => {
    expect(joined).toMatch(/preview_seconds\s+INTEGER\s+NOT NULL\s+DEFAULT\s+900/i);
    expect(joined).toMatch(/CHECK \(preview_seconds > 0\)/i);
  });

  it('defaults access_mode to the most restrictive value, not the most open', () => {
    // \b matters: broadcast_series.default_access_mode ENDS with "access_mode", so an unanchored
    // pattern matches the series column and the assertion silently passes even when the occurrence
    // default has been changed to 'free'. Caught by mutating this exact line.
    expect(joined).toMatch(/\baccess_mode\s+VARCHAR\(20\)\s+NOT NULL\s+DEFAULT\s+'private'/i);
    expect(joined).not.toMatch(/\baccess_mode\s+VARCHAR\(20\)\s+NOT NULL\s+DEFAULT\s+'(free|paid|preview)'/i);
    expect(ACCESS_MODES).toEqual(expect.arrayContaining(['free', 'paid', 'preview', 'private']));
  });

  it('the series default is also restrictive', () => {
    expect(joined).toMatch(/default_access_mode\s+VARCHAR\(20\)\s+NOT NULL\s+DEFAULT\s+'private'/i);
  });

  it('versions the access policy snapshot so a past decision stays reproducible', () => {
    expect(joined).toMatch(/access_policy_snapshot\s+JSONB/i);
    expect(joined).toMatch(/access_policy_version\s+INTEGER/i);
  });

  it('carries a version column for optimistic concurrency on producer commands', () => {
    expect(joined).toMatch(/\bversion\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1/i);
  });

  it('makes (source_type, source_id) unique so one source event maps to one occurrence', () => {
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS\s+uq_broadcast_source_ref\s+ON broadcast_source_refs \(source_type, source_id\)/i);
    for (const s of SOURCE_TYPES) expect(joined).toContain(`'${s}'`);
  });

  it('keeps source_id a VARCHAR, because CCPP EventBrite ids are strings not UUIDs', () => {
    expect(joined).toMatch(/source_id\s+VARCHAR\(200\)\s+NOT NULL/i);
    expect(SOURCE_TYPES).toContain('ccpp_event');
  });

  it('indexes active broadcast selection — one of the four surfaces request §7 names', () => {
    expect(joined).toMatch(/idx_broadcast_occ_active/i);
    expect(joined).toMatch(/WHERE editorial_state IN \('backstage', 'live', 'reconnecting'\)/i);
  });

  it('prevents two simultaneous airings in one room', () => {
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS\s+uq_broadcast_occ_live_per_room/i);
    expect(joined).toMatch(/WHERE room_id IS NOT NULL AND editorial_state IN/i);
  });

  it('makes occurrence_key unique so a re-run of the backfill converges instead of duplicating', () => {
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS\s+uq_broadcast_occurrence_key/i);
  });
});
