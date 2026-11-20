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
 * Messages (CH6.1), minus WhatsApp groups (after the build, Ali 2026-11-20):
 * - comms_hub_messages: one message, about an event or a subject, with its status and send time. A
 *   promotion-plan message (CH6.4) is unique per event + kind + occurrence, so re-ticking cannot
 *   duplicate it (partial unique index; ad-hoc messages have no plan_kind and are not constrained).
 * - comms_hub_drafts: the text per channel, VERSIONED: every regenerate or edit is a new row, never
 *   an update (unique message + channel + version).
 * - comms_hub_destinations: who it goes to, per channel (a cohort feed, an in-app audience).
 * - comms_hub_approvals: who approved, when, and the hash of the exact drafts, destinations and send
 *   time approved. A change voids it (voided_at + reason); rows are never deleted.
 * - comms_hub_deliveries: ONE row per destination per message (unique), with a UNIQUE idempotency key,
 *   so neither a retry nor a re-approval can post twice; a destination with deliveries cannot be
 *   deleted (its history stays).
 */
export const COMMS_HUB_EVENT_TYPES = ['session', 'open_house', 'office_hours', 'workshop', 'other'] as const;
export const COMMS_HUB_EVENT_STATUSES = ['draft', 'scheduled', 'live', 'ended', 'cancelled'] as const;
export const COMMS_HUB_THUMBNAIL_SOURCES = ['template', 'upload', 'ai'] as const;
/** CH6: the two channels this build sends to (WhatsApp is added after the build). */
export const COMMS_HUB_CHANNELS = ['community_post', 'in_app'] as const;
/** CH6.2's status machine owns the transitions; these are the values the column may hold. */
export const COMMS_HUB_MESSAGE_STATUSES = ['draft', 'needs_approval', 'approved', 'scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled'] as const;
export const COMMS_HUB_MESSAGE_KINDS = ['announcement', 'reminder', 'starting_soon', 'recording_thanks', 'update', 'other'] as const;
export const COMMS_HUB_PLAN_KINDS = ['announcement', 'reminder', 'starting_soon', 'recording_thanks'] as const;
export const COMMS_HUB_DESTINATION_TYPES = ['cohort_feed', 'in_app_audience'] as const;
export const COMMS_HUB_DELIVERY_STATUSES = ['pending', 'sending', 'sent', 'failed', 'cancelled', 'skipped'] as const;

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
     promotion_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
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

  // ---- CH6.1 messages ----
  `CREATE TABLE IF NOT EXISTS comms_hub_messages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     event_id UUID REFERENCES comms_hub_events(id),
     occurrence_starts_at TIMESTAMPTZ,
     plan_kind VARCHAR(32),
     subject TEXT,
     kind VARCHAR(32) NOT NULL DEFAULT 'other',
     tone VARCHAR(32),
     notes TEXT,
     status VARCHAR(24) NOT NULL DEFAULT 'draft',
     send_at TIMESTAMPTZ,
     created_by VARCHAR(64),
     updated_by VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE comms_hub_messages ADD CONSTRAINT comms_hub_messages_status_check
     CHECK (status IN (${list(COMMS_HUB_MESSAGE_STATUSES)}))`,
  `ALTER TABLE comms_hub_messages ADD CONSTRAINT comms_hub_messages_kind_check
     CHECK (kind IN (${list(COMMS_HUB_MESSAGE_KINDS)}))`,
  `ALTER TABLE comms_hub_messages ADD CONSTRAINT comms_hub_messages_plan_check
     CHECK (plan_kind IS NULL OR (plan_kind IN (${list(COMMS_HUB_PLAN_KINDS)}) AND event_id IS NOT NULL AND occurrence_starts_at IS NOT NULL))`,
  `ALTER TABLE comms_hub_messages ADD CONSTRAINT comms_hub_messages_about_check
     CHECK (event_id IS NOT NULL OR subject IS NOT NULL)`,
  // A plan message's kind is its plan entry (an Announcement row is an announcement).
  `ALTER TABLE comms_hub_messages ADD CONSTRAINT comms_hub_messages_plan_kind_match
     CHECK (plan_kind IS NULL OR kind = plan_kind)`,
  // Cancelled plan messages stay as history and do not block a new one (untick, then tick again).
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_messages_plan ON comms_hub_messages (event_id, plan_kind, occurrence_starts_at) WHERE plan_kind IS NOT NULL AND status <> 'cancelled'`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_messages_status ON comms_hub_messages (status, send_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_messages_event ON comms_hub_messages (event_id)`,

  `CREATE TABLE IF NOT EXISTS comms_hub_drafts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID NOT NULL REFERENCES comms_hub_messages(id) ON DELETE CASCADE,
     channel VARCHAR(24) NOT NULL,
     version INTEGER NOT NULL,
     title TEXT,
     body TEXT NOT NULL,
     author VARCHAR(64) NOT NULL,
     instruction VARCHAR(32),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE comms_hub_drafts ADD CONSTRAINT comms_hub_drafts_channel_check
     CHECK (channel IN (${list(COMMS_HUB_CHANNELS)}))`,
  `ALTER TABLE comms_hub_drafts ADD CONSTRAINT comms_hub_drafts_version_check CHECK (version >= 1)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_drafts_version ON comms_hub_drafts (message_id, channel, version)`,

  `CREATE TABLE IF NOT EXISTS comms_hub_destinations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID NOT NULL REFERENCES comms_hub_messages(id) ON DELETE CASCADE,
     channel VARCHAR(24) NOT NULL,
     target_type VARCHAR(32) NOT NULL,
     target_id VARCHAR(64) NOT NULL,
     label VARCHAR(255),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE comms_hub_destinations ADD CONSTRAINT comms_hub_destinations_channel_check
     CHECK (channel IN (${list(COMMS_HUB_CHANNELS)}))`,
  `ALTER TABLE comms_hub_destinations ADD CONSTRAINT comms_hub_destinations_type_check
     CHECK (target_type IN (${list(COMMS_HUB_DESTINATION_TYPES)}))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_destinations_target ON comms_hub_destinations (message_id, channel, target_type, target_id)`,

  `CREATE TABLE IF NOT EXISTS comms_hub_approvals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID NOT NULL REFERENCES comms_hub_messages(id) ON DELETE CASCADE,
     approved_by VARCHAR(64) NOT NULL,
     approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     content_hash CHAR(64) NOT NULL,
     voided_at TIMESTAMPTZ,
     voided_reason VARCHAR(64),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_approvals_message ON comms_hub_approvals (message_id, approved_at DESC)`,
  // At most one approval in force per message: a new approval needs the previous one voided first.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_approvals_active ON comms_hub_approvals (message_id) WHERE voided_at IS NULL`,

  `CREATE TABLE IF NOT EXISTS comms_hub_deliveries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID NOT NULL REFERENCES comms_hub_messages(id) ON DELETE CASCADE,
     -- RESTRICT: a destination that has been sent to keeps its delivery history (CH7.4 shows per-row
     -- results); recipients that were never sent to can still be removed.
     destination_id UUID NOT NULL REFERENCES comms_hub_destinations(id) ON DELETE RESTRICT,
     channel VARCHAR(24) NOT NULL,
     idempotency_key VARCHAR(128) NOT NULL,
     status VARCHAR(16) NOT NULL DEFAULT 'pending',
     attempt_count INTEGER NOT NULL DEFAULT 0,
     next_attempt_at TIMESTAMPTZ,
     -- When a worker claimed it (CH7.2): a row left 'sending' by a crash is reclaimable after a lease.
     claimed_at TIMESTAMPTZ,
     provider_message_id VARCHAR(255),
     error TEXT,
     sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE comms_hub_deliveries ADD CONSTRAINT comms_hub_deliveries_status_check
     CHECK (status IN (${list(COMMS_HUB_DELIVERY_STATUSES)}))`,
  `ALTER TABLE comms_hub_deliveries ADD CONSTRAINT comms_hub_deliveries_channel_check
     CHECK (channel IN (${list(COMMS_HUB_CHANNELS)}))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_deliveries_key ON comms_hub_deliveries (idempotency_key)`,
  // ONE delivery row per destination per message (the build prompt's Data table): an edit and
  // re-approval after a partly failed send reuses the row, so a destination that already received the
  // post cannot get a second row; CH7.2 retries only rows that are not sent, on their own key.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_deliveries_destination ON comms_hub_deliveries (message_id, destination_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_deliveries_due ON comms_hub_deliveries (status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comms_hub_deliveries_message ON comms_hub_deliveries (message_id)`,

  // Write-through link: the calendar rows this hub event owns. Nullable, so every existing row is untouched.
  `ALTER TABLE community_events ADD COLUMN IF NOT EXISTS hub_event_id UUID`,
  `CREATE INDEX IF NOT EXISTS idx_community_events_hub_event ON community_events (hub_event_id)`,
];

const REQUIRED_TABLES = [
  'comms_hub_events', 'comms_hub_thumbnails', 'comms_hub_event_photos', 'comms_hub_settings', 'comms_hub_activity',
  'comms_hub_messages', 'comms_hub_drafts', 'comms_hub_destinations', 'comms_hub_approvals', 'comms_hub_deliveries',
];

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
        context: { area: 'comms_hub', missing, impact: 'the Communications Hub cannot save events, messages or deliveries, or show their activity' },
      }));
    }
  } catch (err: unknown) {
    console.warn('[DB] comms hub schema verification failed:', (err as { message?: string })?.message);
  }
  console.log('[DB] Communications Hub schema ensured');
  return { ok: missing.length === 0, missing };
}
