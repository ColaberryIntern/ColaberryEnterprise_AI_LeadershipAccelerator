import { COMMS_HUB_SCHEMA_STATEMENTS, COMMS_HUB_EVENT_STATUSES, COMMS_HUB_EVENT_TYPES, COMMS_HUB_THUMBNAIL_SOURCES } from '../ensureCommsHubSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables, parseAddedColumns } from './schemaParityHelpers';
import '../../models';

/**
 * CH2.1 Communications Hub schema: DDL and models agree, every statement is idempotent, and the
 * one change to an existing table is a nullable column.
 */
const TABLES = ['comms_hub_events', 'comms_hub_thumbnails', 'comms_hub_settings', 'comms_hub_activity'];

describe('ensureCommsHubSchema: DDL and models agree', () => {
  const created = parseCreatedTables(COMMS_HUB_SCHEMA_STATEMENTS);

  it('creates exactly the four hub tables', () => {
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
      // ON DELETE CASCADE on the thumbnails FK is a rule, not a statement; strip it before looking for deletes.
      expect(s.replace(/ON DELETE CASCADE/gi, '')).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\b|ALTER COLUMN/i);
      const altered = /ALTER TABLE (\w+)/i.exec(s)?.[1];
      if (altered && !TABLES.includes(altered)) expect(s).toMatch(/ALTER TABLE community_events ADD COLUMN IF NOT EXISTS hub_event_id UUID$/);
    }
  });

  it('CHECK constraints list exactly the status, type and source values the models use', () => {
    const joined = COMMS_HUB_SCHEMA_STATEMENTS.join('\n');
    for (const v of [...COMMS_HUB_EVENT_STATUSES, ...COMMS_HUB_EVENT_TYPES, ...COMMS_HUB_THUMBNAIL_SOURCES]) expect(joined).toContain(`'${v}'`);
    expect(joined).toMatch(/CHECK \(ends_at IS NULL OR ends_at > starts_at\)/);
  });
});
