const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { ensureCommsHubSchema, COMMS_HUB_SCHEMA_STATEMENTS } from '../ensureCommsHubSchema';

/**
 * CH2.1 follow-up: the ensure function itself, not only its statements. A second boot, where every
 * ADD CONSTRAINT throws "already exists", must stay quiet and report ok; a missing table must report
 * ok:false with a SchemaInvariantViolation log.
 */
const TABLES = [
  'comms_hub_events', 'comms_hub_thumbnails', 'comms_hub_event_photos', 'comms_hub_settings', 'comms_hub_activity',
  'comms_hub_messages', 'comms_hub_drafts', 'comms_hub_destinations', 'comms_hub_approvals', 'comms_hub_deliveries',
  // CH7.5
  'comms_hub_alerts',
];

function respond(opts: { presentTables: string[]; hasColumn: boolean; secondBoot: boolean }) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/FROM information_schema\.tables/.test(sql)) return [opts.presentTables.map((table_name) => ({ table_name }))];
    if (/FROM information_schema\.columns/.test(sql)) return [opts.hasColumn ? [{ '?column?': 1 }] : []];
    if (opts.secondBoot && /ADD CONSTRAINT/.test(sql)) throw new Error('constraint "x" for relation "y" already exists');
    return [[]];
  });
}

let warn: jest.SpyInstance; let error: jest.SpyInstance; let log: jest.SpyInstance;
beforeEach(() => {
  mockQuery.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { warn.mockRestore(); error.mockRestore(); log.mockRestore(); });

describe('ensureCommsHubSchema()', () => {
  it('first boot: runs every statement, ok', async () => {
    respond({ presentTables: TABLES, hasColumn: true, secondBoot: false });
    expect(await ensureCommsHubSchema()).toEqual({ ok: true, missing: [] });
    const ran = mockQuery.mock.calls.map((c) => c[0]);
    for (const s of COMMS_HUB_SCHEMA_STATEMENTS) expect(ran).toContain(s);
    expect(warn).not.toHaveBeenCalled();
  });

  it('second boot: "already exists" from each ADD CONSTRAINT is swallowed silently, still ok', async () => {
    respond({ presentTables: TABLES, hasColumn: true, secondBoot: true });
    expect(await ensureCommsHubSchema()).toEqual({ ok: true, missing: [] });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('a real failure is warned, not swallowed', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS comms_hub_activity/.test(sql)) throw new Error('permission denied for schema public');
      if (/information_schema\.tables/.test(sql)) return [TABLES.map((table_name) => ({ table_name }))];
      if (/information_schema\.columns/.test(sql)) return [[{}]];
      return [[]];
    });
    await ensureCommsHubSchema();
    expect(warn).toHaveBeenCalledWith('[DB] comms hub schema stmt skipped:', 'permission denied for schema public');
  });

  it('post-condition: a missing table or the missing column reports ok:false with a SchemaInvariantViolation', async () => {
    respond({ presentTables: TABLES.filter((t) => t !== 'comms_hub_activity'), hasColumn: false, secondBoot: false });
    const r = await ensureCommsHubSchema();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['comms_hub_activity', 'community_events.hub_event_id']);
    const logged = JSON.parse(error.mock.calls[0][0]);
    expect(logged).toMatchObject({ event: 'SchemaInvariantViolation', context: { area: 'comms_hub' } });
  });
});
