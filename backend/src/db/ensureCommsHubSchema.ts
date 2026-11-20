import { sequelize } from '../config/database';

/**
 * Communications Hub, events half (CH2.1). Additive and idempotent, like every ensure* here.
 *
 * - comms_hub_events: the event as the organizer enters it. The member calendar keeps reading
 *   community_events, which this event writes through to (one row per audience cohort, linked by
 *   community_events.hub_event_id), so no existing reader changes (readers audit, CH2.2).
 * - comms_hub_thumbnails: one row per generated or uploaded option; never overwritten.
 * - comms_hub_settings: a single row (id = 1): the global pause, quiet hours, alert recipients and
 *   the test cohort every rehearsal and E2E sends to.
 * - comms_hub_activity: the human-readable trail the Schedule tab shows. The generic audit_logs
 *   middleware still records every admin write, but it cannot say "approved", "paused" or "sent
 *   by the worker" (the worker has no request), so the hub keeps its own.
 *
 * Message tables (drafts, approvals, deliveries) arrive with CH6.1.
 */
export const COMMS_HUB_EVENT_TYPES = ['session', 'open_house', 'office_hours', 'workshop', 'other'] as const;
export const COMMS_HUB_EVENT_STATUSES = ['draft', 'scheduled', 'live', 'ended', 'cancelled'] as const;
export const COMMS_HUB_THUMBNAIL_SOURCES = ['template', 'upload', 'ai'] as const;

const list = (xs: readonly string[]): string => xs.map((x) => `'${x}'`).join(', ');

export const COMMS_HUB_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS comms_hub_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title VARCHAR(255) NOT NULL,
     event_type VARCHAR(32) NOT NULL DEFAULT 'other',
     audience JSONB NOT NULL DEFAULT '{"kind":"all_members"}'::jsonb,
     starts_at TIMESTAMPTZ NOT NULL,
     ends_at TIMESTAMPTZ,
     repeat_rule JSONB,
     join_url TEXT,
     registration_url TEXT,
     hosts JSONB NOT NULL DEFAULT '[]'::jsonb,
     description TEXT,
     placement JSONB NOT NULL DEFAULT '{"calendar":true,"events_page":true,"campus_rail":true}'::jsonb,
     status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
     thumbnail_id UUID,
     broadcast_occurrence_id UUID,
     created_by VARCHAR(64),
     updated_by VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE comms_hub_events ADD CONSTRAINT comms_hub_events_status_check
     CHECK (status IN (${list(COMMS_HUB_EVENT_STATUSES)}))`,
  `ALTER TABLE comms_hub_events ADD CONSTRAINT comms_hub_events_type_check
     CHECK (event_type IN (${list(COMMS_HUB_EVENT_TYPES)}))`,
  `ALTER TABLE comms_hub_events ADD CONSTRAINT comms_hub_events_window_check
     CHECK (ends_at IS NULL OR ends_at > starts_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_events_starts ON comms_hub_events (starts_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_events_status ON comms_hub_events (status, starts_at)`,

  `CREATE TABLE IF NOT EXISTS comms_hub_thumbnails (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     event_id UUID NOT NULL REFERENCES comms_hub_events(id) ON DELETE CASCADE,
     source VARCHAR(16) NOT NULL,
     style_family VARCHAR(64),
     prompt_used TEXT,
     inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
     asset_16x9_id UUID,
     asset_1x1_id UUID,
     asset_3x1_id UUID,
     model VARCHAR(64),
     cost_usd NUMERIC(10,4),
     latency_ms INTEGER,
     created_by VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE comms_hub_thumbnails ADD CONSTRAINT comms_hub_thumbnails_source_check
     CHECK (source IN (${list(COMMS_HUB_THUMBNAIL_SOURCES)}))`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_thumbnails_event ON comms_hub_thumbnails (event_id, created_at)`,

  // CH4.1: the pictures an organizer adds to an event (inputs to its thumbnails). The bytes live in
  // the media library; this row only links them. One picture once per event (the unique index), at
  // most 6 per event (enforced in eventPhotos.ts, inside a row lock).
  `CREATE TABLE IF NOT EXISTS comms_hub_event_photos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     event_id UUID NOT NULL REFERENCES comms_hub_events(id) ON DELETE CASCADE,
     media_asset_id UUID NOT NULL,
     position SMALLINT NOT NULL DEFAULT 0,
     created_by VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_event_photos_asset ON comms_hub_event_photos (event_id, media_asset_id)`,

  `CREATE TABLE IF NOT EXISTS comms_hub_settings (
     id SMALLINT PRIMARY KEY DEFAULT 1,
     sending_paused BOOLEAN NOT NULL DEFAULT false,
     quiet_hours JSONB,
     alert_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
     test_cohort_id UUID,
     updated_by VARCHAR(64),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE comms_hub_settings ADD CONSTRAINT comms_hub_settings_singleton CHECK (id = 1)`,
  `INSERT INTO comms_hub_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,

  `CREATE TABLE IF NOT EXISTS comms_hub_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_id VARCHAR(64),
     actor_label VARCHAR(255),
     action VARCHAR(64) NOT NULL,
     entity_type VARCHAR(32) NOT NULL,
     entity_id UUID,
     detail JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_activity_created ON comms_hub_activity (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_activity_entity ON comms_hub_activity (entity_type, entity_id)`,

  // Write-through link: the calendar rows this hub event owns. Nullable, so every existing row is untouched.
  `ALTER TABLE community_events ADD COLUMN IF NOT EXISTS hub_event_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_community_events_hub_event ON community_events (hub_event_id)`,
];

const REQUIRED_TABLES = ['comms_hub_events', 'comms_hub_thumbnails', 'comms_hub_event_photos', 'comms_hub_settings', 'comms_hub_activity'];

export async function ensureCommsHubSchema(): Promise<{ ok: boolean; missing: string[] }> {
  for (const stmt of COMMS_HUB_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(stmt);
    } catch (err: unknown) {
      const message = String((err as { message?: string })?.message ?? '').split('\n')[0];
      if (!/already exists/i.test(message)) console.warn('[DB] comms hub schema stmt skipped:', message);
    }
  }
  let missing: string[] = [];
  try {
    const [rows] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (:names)`,
      { replacements: { names: REQUIRED_TABLES } },
    );
    const present = new Set((rows as Array<{ table_name: string }>).map((r) => r.table_name));
    const [cols] = await sequelize.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'community_events' AND column_name = 'hub_event_id'`,
    );
    missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    if ((cols as unknown[]).length === 0) missing.push('community_events.hub_event_id');
    if (missing.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: { area: 'comms_hub', missing, impact: 'the Communications Hub cannot save events or show their activity' },
      }));
    }
  } catch (err: unknown) {
    console.warn('[DB] comms hub schema verification failed:', (err as { message?: string })?.message);
  }
  console.log('[DB] Communications Hub schema ensured');
  return { ok: missing.length === 0, missing };
}
