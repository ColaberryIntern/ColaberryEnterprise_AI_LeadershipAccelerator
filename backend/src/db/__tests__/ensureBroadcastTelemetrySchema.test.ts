import {
  BROADCAST_TELEMETRY_STATEMENTS,
  REQUIRED_TABLES,
  BEAT_STATES,
  VIEWER_INTENTS,
} from '../ensureBroadcastTelemetrySchema';

/**
 * The telemetry schema must be purely ADDITIVE, and — uniquely in this build — it must also be
 * BOUNDED. This is the only write path whose volume scales with audience, so the design claim
 * that distinguishes it from an append-only beat log is that both hot tables are keyed for
 * upsert: one row per tab, one row per person, never one row per beat. A future edit that
 * added a surrogate id or dropped a primary key would silently turn this back into a firehose
 * that grows for ever, and nothing else in the codebase would complain.
 *
 * These tests therefore assert the KEYS, not just the columns.
 */

const statements = BROADCAST_TELEMETRY_STATEMENTS.join('\n');

describe('ensureBroadcastTelemetrySchema is additive-only', () => {
  it('every statement is CREATE ... IF NOT EXISTS (no ALTER, no DROP, no TRUNCATE)', () => {
    BROADCAST_TELEMETRY_STATEMENTS.forEach((s) => {
      expect(s).toMatch(/^\s*CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/);
    });
    expect(statements).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(statements).not.toMatch(/\bDROP\b/i);
    expect(statements).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('every CREATE TABLE targets one of the new REQUIRED_TABLES', () => {
    const created = Array.from(statements.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g))
      .map((m) => m[1]);
    expect(created.sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('foreign-keys ONLY into broadcast_occurrences, never into a person or event table', () => {
    // Telemetry must stay deletable independently of the people in it, which is why identity
    // is a plain enrollment_id column with no FK. An FK to enrollments would also make a
    // routine student deletion fail against a telemetry row, which is the wrong dependency
    // direction for derived data.
    const refs = Array.from(statements.matchAll(/REFERENCES\s+(\w+)/g)).map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    expect(Array.from(new Set(refs))).toEqual(['broadcast_occurrences']);
    expect(statements).not.toMatch(/REFERENCES\s+enrollments/i);
    expect(statements).not.toMatch(/REFERENCES\s+(live_sessions|community_events|open_house_events)/i);
  });

  it('cascades on occurrence delete, because that is the documented rollback', () => {
    // "Flag off stops ingestion, then delete by occurrence id." That only works in one
    // statement if the child rows go with the parent.
    const tableBlocks = BROADCAST_TELEMETRY_STATEMENTS.filter((s) => s.includes('CREATE TABLE'));
    tableBlocks.forEach((s) => {
      expect(s).toMatch(/REFERENCES broadcast_occurrences\(id\) ON DELETE CASCADE/);
    });
  });
});

describe('the tables are BOUNDED — one row per tab and per person, never per beat', () => {
  it('sessions are keyed on (occurrence_id, session_id), so a beat UPDATES', () => {
    // The property that separates this from session_presence_events. Without this key a beat
    // is an INSERT, and 1 000 viewers at 15s is 240 000 rows an hour for one broadcast.
    const sessions = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_sessions/.test(s))!;
    expect(sessions).toMatch(/PRIMARY KEY \(occurrence_id, session_id\)/);
  });

  it('people are keyed on (occurrence_id, enrollment_id), which is the dedup', () => {
    const people = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_people/.test(s))!;
    expect(people).toMatch(/PRIMARY KEY \(occurrence_id, enrollment_id\)/);
  });

  it('neither hot table has a surrogate serial id', () => {
    // A surrogate key is how an upsert table quietly becomes an append log: every beat gets
    // its own row and the natural key stops being unique.
    const hot = BROADCAST_TELEMETRY_STATEMENTS.filter(
      (s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_(sessions|people)/.test(s),
    );
    expect(hot).toHaveLength(2);
    hot.forEach((s) => {
      expect(s).not.toMatch(/\b(SERIAL|BIGSERIAL|GENERATED\s+ALWAYS\s+AS\s+IDENTITY)\b/i);
      expect(s).not.toMatch(/id\s+UUID\s+PRIMARY KEY/i);
    });
  });

  it('the rollup is one row per occurrence', () => {
    const metrics = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_occurrence_metrics/.test(s))!;
    expect(metrics).toMatch(/occurrence_id\s+UUID PRIMARY KEY/);
  });
});

describe('the active-selection query has an index that matches it', () => {
  it('leads with occurrence_id then last_beat_at, so freshness is a range scan', () => {
    // P3-06 must record the plan for "distinct people with a fresh playing beat for this
    // occurrence". An index that led with state or enrollment_id would leave the time window
    // as a filter over every session ever opened for the occurrence.
    const idx = BROADCAST_TELEMETRY_STATEMENTS.find((s) => s.includes('idx_bvs_active'))!;
    expect(idx).toMatch(/ON broadcast_viewer_sessions \(occurrence_id, last_beat_at DESC, state, enrollment_id\)/);
  });

  it('covers enrollment_id, so the DISTINCT need not touch the heap', () => {
    const idx = BROADCAST_TELEMETRY_STATEMENTS.find((s) => s.includes('idx_bvs_active'))!;
    expect(idx).toContain('enrollment_id');
  });

  it('indexes the exclusion columns, because every reporting read filters on them', () => {
    const idx = BROADCAST_TELEMETRY_STATEMENTS.find((s) => s.includes('idx_bvp_reportable'))!;
    expect(idx).toMatch(/\(occurrence_id, is_staff, is_test\)/);
  });
});

describe('the columns the measurement rules depend on', () => {
  it('constrains state to exactly the policy module\'s beat states', () => {
    const sessions = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_sessions/.test(s))!;
    BEAT_STATES.forEach((st) => expect(sessions).toContain(`'${st}'`));
    expect(sessions).toMatch(/state\s+TEXT NOT NULL DEFAULT 'playing' CHECK \(state IN \(/);
  });

  it('keeps last_playing_at SEPARATE from last_beat_at', () => {
    // The buffering grace rule measures from the last real `playing`, not from the last beat
    // of any kind — a tab stalled for a minute keeps beating, and collapsing these two
    // columns would make a permanent buffer look like continuous watching.
    const sessions = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_sessions/.test(s))!;
    expect(sessions).toMatch(/last_beat_at\s+TIMESTAMPTZ NOT NULL/);
    expect(sessions).toMatch(/last_playing_at TIMESTAMPTZ NULL/);
  });

  it('carries last_credited_at on the PERSON, which is what makes two tabs count once', () => {
    const people = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_people/.test(s))!;
    expect(people).toMatch(/last_credited_at TIMESTAMPTZ NULL/);
    // and NOT on the session, where it would credit per tab
    const sessions = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_sessions/.test(s))!;
    expect(sessions).not.toContain('last_credited_at');
  });

  it('defaults intent to auto, the conservative answer', () => {
    // Defaulting to `deliberate` would report every automatic muted exposure as audience
    // interest, which the metrics dictionary forbids outright.
    const people = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_people/.test(s))!;
    expect(people).toMatch(/intent\s+TEXT NOT NULL DEFAULT 'auto'/);
    VIEWER_INTENTS.forEach((i) => expect(people).toContain(`'${i}'`));
  });

  it('defaults the exclusion flags to FALSE and forbids negative counters', () => {
    const people = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_people/.test(s))!;
    expect(people).toMatch(/is_staff\s+BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(people).toMatch(/is_test\s+BOOLEAN NOT NULL DEFAULT FALSE/);
    expect(people).toMatch(/playing_seconds\s+INTEGER NOT NULL DEFAULT 0 CHECK \(playing_seconds >= 0\)/);
  });

  it('stores access_mode NULLABLE, because it is unknown until the server decides', () => {
    // A NOT NULL default would have to invent a mode, and an invented mode lands in a
    // published split.
    const people = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_viewer_people/.test(s))!;
    expect(people).toMatch(/access_mode\s+TEXT NULL/);
  });

  it('uses BIGINT for summed watch seconds', () => {
    // 1 000 viewers x 90 minutes is 5.4M seconds for ONE broadcast; INTEGER would hold a
    // season and then overflow silently in aggregate.
    const metrics = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_occurrence_metrics/.test(s))!;
    expect(metrics).toMatch(/watch_seconds\s+BIGINT NOT NULL/);
  });

  it('keeps peak_at beside peak_concurrency, so the maximum has a timestamp', () => {
    const metrics = BROADCAST_TELEMETRY_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS broadcast_occurrence_metrics/.test(s))!;
    expect(metrics).toMatch(/peak_concurrency\s+INTEGER NOT NULL/);
    expect(metrics).toMatch(/peak_at\s+TIMESTAMPTZ NULL/);
  });
});
