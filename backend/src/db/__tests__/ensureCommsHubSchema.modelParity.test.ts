import {
  COMMS_HUB_SCHEMA_STATEMENTS, COMMS_HUB_EVENT_STATUSES, COMMS_HUB_EVENT_TYPES, COMMS_HUB_THUMBNAIL_SOURCES,
  COMMS_HUB_CHANNELS, COMMS_HUB_MESSAGE_STATUSES, COMMS_HUB_MESSAGE_KINDS, COMMS_HUB_PLAN_KINDS, COMMS_HUB_DESTINATION_TYPES, COMMS_HUB_DELIVERY_STATUSES,
} from '../ensureCommsHubSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables, parseAddedColumns } from './schemaParityHelpers';
import '../../models';

/**
 * CH2.1 Communications Hub schema: DDL and models agree, every statement is idempotent, and the
 * one change to an existing table is a nullable column.
 */
const TABLES = [
  'comms_hub_events', 'comms_hub_thumbnails', 'comms_hub_event_photos', 'comms_hub_settings', 'comms_hub_activity',
  // CH6.1
  'comms_hub_messages', 'comms_hub_drafts', 'comms_hub_destinations', 'comms_hub_approvals', 'comms_hub_deliveries',
  // CH7.5
  'comms_hub_alerts',
  // CH10.2
  'comms_hub_whatsapp_groups',
];

describe('ensureCommsHubSchema: DDL and models agree', () => {
  const created = parseCreatedTables(COMMS_HUB_SCHEMA_STATEMENTS);

  it('creates exactly the twelve hub tables', () => {
    expect(created.map((t) => t.table).sort()).toEqual([...TABLES].sort());
  });

  it.each(TABLES)('every DDL column of %s is on the model, and vice versa', (table) => {
    const model = modelsByTable()[table];
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    const ddl = created.find((t) => t.table === table)!.columns;
    expect(ddl.filter((c) => !mapped.has(c))).toEqual([]);
    expect(Array.from(mapped).filter((c) => !ddl.includes(c))).toEqual([]);
  });

  it('adds hub_event_id to community_events and, CH9.5, the three Eventbrite columns to comms_hub_events; each model declares them', () => {
    expect(parseAddedColumns(COMMS_HUB_SCHEMA_STATEMENTS)).toEqual([
      { table: 'comms_hub_events', column: 'ccpp_event_id' },
      { table: 'comms_hub_events', column: 'source_image_url' },
      { table: 'comms_hub_events', column: 'ccpp_missing_since' },
      // CH10.4 WhatsApp sending state on the settings row.
      ...['whatsapp_next_send_at', 'whatsapp_day', 'whatsapp_day_count', 'whatsapp_breaker_until', 'whatsapp_breaker_reason', 'whatsapp_breaker_alerted_for'].map((column) => ({ table: 'comms_hub_settings', column })),
      { table: 'community_events', column: 'hub_event_id' },
    ]);
    expect(modelColumnNames(modelsByTable().community_events).has('hub_event_id')).toBe(true);
    for (const c of ['ccpp_event_id', 'source_image_url', 'ccpp_missing_since']) expect(modelColumnNames(modelsByTable().comms_hub_events).has(c)).toBe(true);
    for (const c of ['whatsapp_next_send_at', 'whatsapp_day', 'whatsapp_day_count', 'whatsapp_breaker_until', 'whatsapp_breaker_reason', 'whatsapp_breaker_alerted_for']) expect(modelColumnNames(modelsByTable().comms_hub_settings).has(c)).toBe(true);
  });
});

describe('ensureCommsHubSchema: safe to run on every boot', () => {
  it('every CREATE is IF NOT EXISTS and every ADD COLUMN is IF NOT EXISTS', () => {
    for (const s of COMMS_HUB_SCHEMA_STATEMENTS) {
      if (/CREATE (TABLE|INDEX|UNIQUE INDEX)/i.test(s)) expect(s).toMatch(/IF NOT EXISTS/i);
      if (/ADD COLUMN/i.test(s)) expect(s).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    }
  });

  it('the settings seed cannot duplicate (ON CONFLICT DO NOTHING) and the table is a singleton', () => {
    expect(COMMS_HUB_SCHEMA_STATEMENTS.some((s) => /INSERT INTO comms_hub_settings[\s\S]*ON CONFLICT \(id\) DO NOTHING/.test(s))).toBe(true);
    expect(COMMS_HUB_SCHEMA_STATEMENTS.some((s) => /CHECK \(id = 1\)/.test(s))).toBe(true);
  });

  it('touches no existing table except the one nullable column, and drops nothing', () => {
    // CH9.6 / CH10.3: the ONLY allowed DROPs. Widening a CHECK an earlier phase created with fewer
    // values replaces the constraint in a single ALTER, only when its definition lacks the newest value.
    // It drops a rule, never data, and the table is never without the check. Exactly these four, and
    // each re-adds the SAME constraint on the SAME table.
    const WIDEN = /^DO \$\$ BEGIN\s+IF EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = '(\w+)'\s+AND pg_get_constraintdef\(oid\) NOT LIKE '%(\w+)%'\) THEN\s+ALTER TABLE (\w+) DROP CONSTRAINT \1,\s+ADD CONSTRAINT \1 CHECK \((\w+) IN \(([^)]*)\)\);\s+END IF;\s+END \$\$$/;
    const widened = COMMS_HUB_SCHEMA_STATEMENTS.map((s) => WIDEN.exec(s)).filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ constraint: m[1], marker: m[2], table: m[3], column: m[4], lists: m[5].includes(`'${m[2]}'`) }));
    expect(widened).toEqual([
      { constraint: 'comms_hub_drafts_channel_check', marker: 'whatsapp', table: 'comms_hub_drafts', column: 'channel', lists: true },
      { constraint: 'comms_hub_destinations_channel_check', marker: 'whatsapp', table: 'comms_hub_destinations', column: 'channel', lists: true },
      { constraint: 'comms_hub_destinations_type_check', marker: 'whatsapp_group', table: 'comms_hub_destinations', column: 'target_type', lists: true },
      { constraint: 'comms_hub_deliveries_channel_check', marker: 'whatsapp', table: 'comms_hub_deliveries', column: 'channel', lists: true },
    ]);
    expect(COMMS_HUB_SCHEMA_STATEMENTS.filter((s) => /\bDROP\b/i.test(s))).toHaveLength(4);
    for (const s of COMMS_HUB_SCHEMA_STATEMENTS) {
      if (WIDEN.test(s)) continue;
      // ON DELETE CASCADE / RESTRICT on a FK is a rule, not a statement; strip it before looking for deletes.
      expect(s.replace(/ON DELETE (CASCADE|RESTRICT)/gi, '')).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\b|ALTER COLUMN/i);
      const altered = /ALTER TABLE (\w+)/i.exec(s)?.[1];
      if (altered && !TABLES.includes(altered)) expect(s).toMatch(/ALTER TABLE community_events ADD COLUMN IF NOT EXISTS hub_event_id UUID$/);
    }
  });

  it('CHECK constraints list exactly the status, type and source values the models use', () => {
    const joined = COMMS_HUB_SCHEMA_STATEMENTS.join('\n');
    for (const v of [
      ...COMMS_HUB_EVENT_STATUSES, ...COMMS_HUB_EVENT_TYPES, ...COMMS_HUB_THUMBNAIL_SOURCES,
      ...COMMS_HUB_CHANNELS, ...COMMS_HUB_MESSAGE_STATUSES, ...COMMS_HUB_MESSAGE_KINDS, ...COMMS_HUB_PLAN_KINDS, ...COMMS_HUB_DESTINATION_TYPES, ...COMMS_HUB_DELIVERY_STATUSES,
    ]) expect(joined).toContain(`'${v}'`);
    expect(joined).toMatch(/CHECK \(ends_at IS NULL OR ends_at > starts_at\)/);
  });
});

describe('CH6.1 the guarantees the message tables carry', () => {
  const joined = COMMS_HUB_SCHEMA_STATEMENTS.join('\n');
  it('nine message statuses (the brief eight plus needs_approval); CH10.3 three channels and the WhatsApp group destination', () => {
    expect(COMMS_HUB_MESSAGE_STATUSES).toHaveLength(9);
    expect(COMMS_HUB_CHANNELS).toEqual(['community_post', 'in_app', 'whatsapp']);
    expect(COMMS_HUB_DESTINATION_TYPES).toEqual(['cohort_feed', 'in_app_audience', 'event_registrants', 'whatsapp_group']);
    // Every channel CHECK, created fresh or widened, lists whatsapp; the destination type CHECKs list whatsapp_group.
    for (const con of ['comms_hub_drafts_channel_check', 'comms_hub_destinations_channel_check', 'comms_hub_deliveries_channel_check']) {
      const defs = COMMS_HUB_SCHEMA_STATEMENTS.filter((s) => s.includes(`CONSTRAINT ${con}`));
      expect(defs.length).toBe(2);
      for (const d of defs) expect(d).toContain("'whatsapp'");
    }
    for (const d of COMMS_HUB_SCHEMA_STATEMENTS.filter((s) => s.includes('CONSTRAINT comms_hub_destinations_type_check'))) expect(d).toContain("'whatsapp_group'");
  });

  it('CH10.2 WhatsApp groups: one row per provider group (unique), the id shape checked, every group starts not enabled', () => {
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_whatsapp_groups_provider ON comms_hub_whatsapp_groups \(provider_group_id\)/);
    expect(joined).toMatch(/CHECK \(provider_group_id ~ '\^\[0-9-\]\{10,31\}@g\[\.\]us\$'\)/);
    expect(joined).toMatch(/enabled BOOLEAN NOT NULL DEFAULT false/);
  });

  it('a draft version is never overwritten: unique message + channel + version, version >= 1', () => {
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_drafts_version ON comms_hub_drafts \(message_id, channel, version\)/);
    expect(joined).toMatch(/CHECK \(version >= 1\)/);
  });

  it('a delivery cannot happen twice: ONE row per destination per message, and the idempotency key is unique', () => {
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_deliveries_key ON comms_hub_deliveries \(idempotency_key\)/);
    expect(joined).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_hub_deliveries_destination ON comms_hub_deliveries \(message_id, destination_id\)/);
  });

  it('delivery history survives a recipients edit: a destination with deliveries cannot be deleted', () => {
    expect(joined).toMatch(/destination_id UUID NOT NULL REFERENCES comms_hub_destinations\(id\) ON DELETE RESTRICT/);
  });

  it('one approval in force per message; a plan message is the kind of its plan entry; a claimed send can be recovered', () => {
    expect(joined).toMatch(/uq_comms_hub_approvals_active ON comms_hub_approvals \(message_id\) WHERE voided_at IS NULL/);
    expect(joined).toMatch(/CHECK \(plan_kind IS NULL OR kind = plan_kind\)/);
    expect(joined).toMatch(/claimed_at TIMESTAMPTZ/);
  });

  it('a promotion-plan message is unique per event + kind + occurrence; ad-hoc messages are not constrained', () => {
    expect(joined).toMatch(/uq_comms_hub_messages_plan ON comms_hub_messages \(event_id, plan_kind, occurrence_starts_at\) WHERE plan_kind IS NOT NULL AND status <> 'cancelled'/);
    expect(joined).toMatch(/plan_kind IS NULL OR \(plan_kind IN \([^)]*\) AND event_id IS NOT NULL AND occurrence_starts_at IS NOT NULL\)/);
  });

  it('a message is about an event or a subject', () => {
    expect(joined).toMatch(/CHECK \(event_id IS NOT NULL OR subject IS NOT NULL\)/);
  });

  it('every message-child table hangs off comms_hub_messages (cascade), deliveries also off their destination (restrict)', () => {
    for (const t of ['comms_hub_drafts', 'comms_hub_destinations', 'comms_hub_approvals', 'comms_hub_deliveries']) {
      const ddl = COMMS_HUB_SCHEMA_STATEMENTS.find((x) => x.includes(`CREATE TABLE IF NOT EXISTS ${t} (`))!;
      expect(ddl).toMatch(/message_id UUID NOT NULL REFERENCES comms_hub_messages\(id\) ON DELETE CASCADE/);
    }
    expect(joined).toMatch(/destination_id UUID NOT NULL REFERENCES comms_hub_destinations\(id\) ON DELETE RESTRICT/);
  });
});
