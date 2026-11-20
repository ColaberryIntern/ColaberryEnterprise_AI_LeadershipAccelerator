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
];

describe('ensureCommsHubSchema: DDL and models agree', () => {
  const created = parseCreatedTables(COMMS_HUB_SCHEMA_STATEMENTS);

  it('creates exactly the ten hub tables', () => {
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

  it('adds hub_event_id to community_events, and the CommunityEvent model declares it', () => {
    expect(parseAddedColumns(COMMS_HUB_SCHEMA_STATEMENTS)).toEqual([{ table: 'community_events', column: 'hub_event_id' }]);
    expect(modelColumnNames(modelsByTable().community_events).has('hub_event_id')).toBe(true);
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
    for (const s of COMMS_HUB_SCHEMA_STATEMENTS) {
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
  it('nine message statuses (the brief eight plus needs_approval), WhatsApp left for after the build', () => {
    expect(COMMS_HUB_MESSAGE_STATUSES).toHaveLength(9);
    expect(COMMS_HUB_CHANNELS).toEqual(['community_post', 'in_app']);
    expect(joined).not.toMatch(/whatsapp/i);
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
    expect(joined).toMatch(/uq_comms_hub_messages_plan ON comms_hub_messages \(event_id, plan_kind, occurrence_starts_at\) WHERE plan_kind IS NOT NULL/);
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
