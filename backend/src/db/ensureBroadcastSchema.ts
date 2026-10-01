/**
 * ensureBroadcastSchema — the canonical broadcast occurrence model (Colaberry Live, Phase 2), additive.
 *
 * The repo already has four event-like sources (live_sessions, open_house_events, community_events,
 * room_bookings) plus a fifth in CCPP (EventBrite_Events). None of them can answer "is this live right
 * now": room_bookings declares lobby_open/live/cooldown but nothing ever writes them, community_events
 * has no status column at all, and every feed filters starts_at >= now, which hides an event that has
 * already begun. Rather than merge or re-home those tables, this introduces the smallest additive
 * entity that reconciles them and carries the facts none of them hold: a producer's deliberate go-live,
 * provider health as a SEPARATE axis from editorial intent, and the preview anchor.
 *
 *   broadcast_series       — a recurring show. Occurrences belong to it; it is not the thing that airs.
 *   broadcast_occurrences  — ONE airing. Editorial state (ours) and provider health (the provider's) are
 *                            deliberately separate columns, because §4.1 requires BOTH a producer command
 *                            and verified provider readiness before anything is published. content_started_at
 *                            is the preview anchor and is NOT scheduled_start_at — a waiting-room countdown
 *                            must not consume a viewer's 15 free minutes.
 *   broadcast_source_refs  — (source_type, source_id) -> occurrence, UNIQUE, so one source event maps to
 *                            exactly one occurrence and a recurring series gets distinct occurrences
 *                            rather than one persistent meeting id standing in for every episode.
 *
 * Conventions this follows (and why):
 *  - Additive only. Every statement is CREATE ... IF NOT EXISTS; no existing table is altered. Asserted by
 *    __tests__/ensureBroadcastSchema.test.ts against this exact statement list.
 *  - CHECK constraints are declared INLINE in CREATE TABLE rather than via the
 *    ALTER TABLE DROP CONSTRAINT / ADD CONSTRAINT pair used by ensureLiveSessionSchema. These are brand-new
 *    tables, so inline is sufficient and it keeps the additive-only guarantee literally true. A later state
 *    addition is then a one-line ALTER in a future ensure file, which is the normal path.
 *  - Foreign keys point ONLY at tables created earlier in this same list. Cross-epic links (room_id,
 *    the source ids) are plain columns with no FK, matching the house style at RoomBooking.ts:122-124 —
 *    which is also what lets source_id hold a CCPP EventBrite EventId string alongside our UUIDs.
 *  - sequelize.sync() is off in this repo, so a model alone creates nothing. This file is the only thing
 *    that will make these tables exist; it must be called from server.ts.
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = [
  'broadcast_series',
  'broadcast_occurrences',
  'broadcast_source_refs',
];

/** Editorial intent — ours. Suggested by request §4.1. */
export const EDITORIAL_STATES = [
  'scheduled', 'backstage', 'live', 'reconnecting', 'ended', 'processing', 'replay_ready', 'cancelled',
] as const;

/** Provider health — theirs. Deliberately a separate axis from editorial intent. */
export const PROVIDER_HEALTH = ['unknown', 'ready', 'degraded', 'down'] as const;

/** Access modes — request §4.2. Default is the most restrictive. */
export const ACCESS_MODES = ['free', 'paid', 'preview', 'private'] as const;

/** Source systems this reconciles. VARCHAR source_id, because CCPP EventIds are strings. */
export const SOURCE_TYPES = [
  'live_session', 'open_house_event', 'community_event', 'room_booking', 'ccpp_event',
] as const;

const inList = (vals: ReadonlyArray<string>) => vals.map((v) => `'${v}'`).join(', ');

/**
 * Every DDL statement, hoisted so a test can assert the whole set is additive and that FKs point only at
 * tables created earlier in this same list.
 */
export const BROADCAST_STATEMENTS: ReadonlyArray<string> = [
  // A recurring show. Deliberately thin: the airing is the occurrence, not this.
  `CREATE TABLE IF NOT EXISTS broadcast_series (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     slug VARCHAR(160) NOT NULL,
     title VARCHAR(255) NOT NULL,
     description TEXT,
     cadence VARCHAR(40),
     default_access_mode VARCHAR(20) NOT NULL DEFAULT 'private'
       CHECK (default_access_mode IN (${inList(ACCESS_MODES)})),
     timezone VARCHAR(60) NOT NULL DEFAULT 'America/Chicago',
     is_active BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_series_slug ON broadcast_series (slug)`,

  // ONE airing.
  //
  // editorial_state vs provider_health: a scheduled start time or a stray webhook must never publish
  // backstage content (§4.1), so "the producer said go" and "the feed is actually usable" are two
  // columns and Go Live requires both.
  //
  // content_started_at is the preview anchor. It is NULL until the producer explicitly marks content
  // started, which is why a lobby countdown cannot eat preview time.
  //
  // version is optimistic-concurrency control: two producers clicking Go Live resolve to a version
  // conflict rather than an impossible state.
  //
  // access_policy_snapshot + access_policy_version make a past decision reproducible; a later policy
  // edit is a new version, never an in-place widening of who could watch.
  `CREATE TABLE IF NOT EXISTS broadcast_occurrences (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     series_id UUID REFERENCES broadcast_series(id) ON DELETE SET NULL,
     occurrence_key VARCHAR(200) NOT NULL,
     title VARCHAR(255) NOT NULL,
     room_id UUID,
     editorial_state VARCHAR(20) NOT NULL DEFAULT 'scheduled'
       CHECK (editorial_state IN (${inList(EDITORIAL_STATES)})),
     provider_health VARCHAR(20) NOT NULL DEFAULT 'unknown'
       CHECK (provider_health IN (${inList(PROVIDER_HEALTH)})),
     provider VARCHAR(30) NOT NULL DEFAULT 'zoom',
     provider_session_id VARCHAR(200),
     provider_instance_uuid VARCHAR(200),
     scheduled_start_at TIMESTAMPTZ,
     scheduled_end_at TIMESTAMPTZ,
     content_started_at TIMESTAMPTZ,
     ended_at TIMESTAMPTZ,
     access_mode VARCHAR(20) NOT NULL DEFAULT 'private'
       CHECK (access_mode IN (${inList(ACCESS_MODES)})),
     preview_seconds INTEGER NOT NULL DEFAULT 900
       CHECK (preview_seconds > 0),
     access_policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
     access_policy_version INTEGER NOT NULL DEFAULT 1,
     version INTEGER NOT NULL DEFAULT 1,
     timezone VARCHAR(60) NOT NULL DEFAULT 'America/Chicago',
     created_by_enrollment_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Identity: re-running an import or a backfill converges on one row instead of minting duplicates.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_occurrence_key
     ON broadcast_occurrences (occurrence_key)`,
  // "Active broadcast selection" — §7 line 312 names this as one of four surfaces needing an index and a
  // query plan. Partial, because the live set is tiny next to the table and this is the hot read.
  `CREATE INDEX IF NOT EXISTS idx_broadcast_occ_active
     ON broadcast_occurrences (editorial_state, scheduled_start_at)
     WHERE editorial_state IN ('backstage', 'live', 'reconnecting')`,
  // One room cannot host two simultaneous airings. Partial unique, mirroring the shape already used at
  // server.ts:2209 for community_rooms.linked_live_session_id.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_occ_live_per_room
     ON broadcast_occurrences (room_id)
     WHERE room_id IS NOT NULL AND editorial_state IN ('backstage', 'live', 'reconnecting')`,
  `CREATE INDEX IF NOT EXISTS idx_broadcast_occ_series ON broadcast_occurrences (series_id)`,
  `CREATE INDEX IF NOT EXISTS idx_broadcast_occ_start ON broadcast_occurrences (scheduled_start_at)`,
  `CREATE INDEX IF NOT EXISTS idx_broadcast_occ_provider
     ON broadcast_occurrences (provider, provider_session_id)`,

  // (source_type, source_id) -> occurrence. UNIQUE on the pair is the whole point: it is what stops one
  // persistent Zoom meeting id from standing in for every episode of a recurring series, and what makes a
  // re-run of the P2-07 backfill converge instead of duplicating.
  `CREATE TABLE IF NOT EXISTS broadcast_source_refs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     occurrence_id UUID NOT NULL REFERENCES broadcast_occurrences(id) ON DELETE CASCADE,
     source_type VARCHAR(40) NOT NULL
       CHECK (source_type IN (${inList(SOURCE_TYPES)})),
     source_id VARCHAR(200) NOT NULL,
     is_authoritative BOOLEAN NOT NULL DEFAULT true,
     linked_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_source_ref
     ON broadcast_source_refs (source_type, source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_broadcast_source_ref_occ
     ON broadcast_source_refs (occurrence_id)`,
  // At most one authoritative source per occurrence — the others are aliases.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_source_ref_authoritative
     ON broadcast_source_refs (occurrence_id)
     WHERE is_authoritative`,
];

export async function ensureBroadcastSchema(): Promise<void> {
  for (const sql of BROADCAST_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] broadcast schema stmt skipped:', err?.message);
    }
  }
  await assertBroadcastSchema();
}

/**
 * Post-condition: name any table that failed to appear.
 *
 * bool_or, NOT array_agg: sequelize returns single-column selects as raw arrays, and the array_agg form
 * produced a false-negative SchemaInvariantViolation on a real prod boot (fixed by db3f261b / 40f54d56 —
 * see ensureContractTrackSchema). Every statement above is swallowed into console.warn, so this function
 * is the only thing that actually proves the schema landed.
 */
export async function assertBroadcastSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    const selects = REQUIRED_TABLES.map((t, i) => `bool_or(table_name = '${t}') AS t${i}`).join(', ');
    const [rows] = await sequelize.query(
      `SELECT ${selects} FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const row = (((rows as any[]) || [])[0] || {}) as Record<string, boolean>;
    REQUIRED_TABLES.forEach((t, i) => { if (!row[`t${i}`]) problems.push(`table ${t} missing`); });
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] broadcast schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'broadcast_schema_invariant_violated', outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: {
      problems,
      impact: 'Broadcast occurrence reads/writes will fail; live discovery and replay binding cannot work.',
      remedy: 'Run the CREATE TABLE statements in ensureBroadcastSchema.',
    },
  }));
  return false;
}
