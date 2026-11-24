import { voiceStudioStatements, VOICE_TABLE_SPECS, createTableSql } from '../voiceStudioTableSpecs';
import { VOICE_STUDIO_TABLES } from '../ensureVoiceStudioSchema';
import { VOICE_STUDIO_MODELS } from '../../models/voiceStudioModels';
import { activeBootCall } from './helpers/bootCalls';

/**
 * VS1.4 schema shape, without a database. The integration twin
 * (ensureVoiceStudioSchema.integration.test.ts) proves the same DDL against real Postgres.
 */
const SQL = voiceStudioStatements().join('\n');

describe('Voice Studio schema: additive and scoped', () => {
  it('creates exactly the 13 voice_* tables and nothing else', () => {
    const created = (SQL.match(/CREATE TABLE IF NOT EXISTS (\w+)/g) || []).map((s) => s.replace('CREATE TABLE IF NOT EXISTS ', ''));
    expect(created).toEqual([...VOICE_STUDIO_TABLES]);
    expect(created).toHaveLength(13);
    for (const t of created) expect(t).toMatch(/^voice_/);
  });

  it('never alters, drops, renames or truncates anything (additive only)', () => {
    expect(SQL).not.toMatch(/\b(ALTER|DROP|RENAME|TRUNCATE)\b/i);
    // DELETE/UPDATE as statements; `ON DELETE CASCADE` inside a foreign key is the intended retention behavior.
    for (const s of voiceStudioStatements()) expect(s).not.toMatch(/^\s*(DELETE|UPDATE|INSERT)\b/i);
  });

  it('every statement is idempotent (IF NOT EXISTS)', () => {
    for (const s of voiceStudioStatements()) expect(s).toMatch(/^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS /);
  });

  it('every table is tenant-scoped with a NOT NULL tenant_id', () => {
    for (const t of VOICE_TABLE_SPECS) expect(t.columns.find((c) => c.name === 'tenant_id')?.sql).toBe('UUID NOT NULL');
  });

  it('call-scoped tables cascade from voice_calls so a retention delete removes them', () => {
    for (const t of ['voice_call_events', 'voice_turns', 'voice_tool_runs', 'voice_artifacts', 'voice_usage']) {
      const spec = VOICE_TABLE_SPECS.find((s) => s.table === t)!;
      expect(createTableSql(spec)).toMatch(/REFERENCES voice_calls\(id\) ON DELETE CASCADE/);
    }
  });

  it('creates voice_calls before any table that references it (dependency order)', () => {
    const order = VOICE_TABLE_SPECS.map((s) => s.table);
    for (const t of ['voice_call_events', 'voice_turns', 'voice_tool_runs', 'voice_artifacts', 'voice_usage']) {
      expect(order.indexOf('voice_calls')).toBeLessThan(order.indexOf(t));
    }
    expect(order.indexOf('voice_agent_profiles')).toBeLessThan(order.indexOf('voice_agent_versions'));
  });

  it('has the directive indexes: tenant+time, route+status, provider id, session sequence, contact+time, idempotency, retention', () => {
    for (const re of [/voice_calls \(tenant_id, created_at\)/, /voice_calls \(route_id, state\)/, /voice_calls \(engine, provider_call_id\)/,
      /voice_call_events \(call_id, seq\)/, /voice_calls \(lead_id, created_at\)/, /voice_calls \(tenant_id, idempotency_key\)/,
      /voice_calls \(retention_until\)/, /voice_calls \(consent_ref\)/, /voice_dial_reservations \(tenant_id, idempotency_key\)/]) {
      expect(SQL).toMatch(re);
    }
  });
});

describe('Voice Studio schema: privacy by structure', () => {
  it('stores no raw audio (no binary column anywhere)', () => {
    expect(SQL).not.toMatch(/BYTEA|BLOB|\bOID\b/i);
  });

  it('the only column that may hold a phone number is the restricted voice_numbers.e164_restricted', () => {
    const phoneish = VOICE_TABLE_SPECS.flatMap((t) => t.columns.filter((c) => /phone|e164|destination(?!_hash)/i.test(c.name)).map((c) => `${t.table}.${c.name}`));
    expect(phoneish).toEqual(['voice_numbers.e164_restricted']);
  });

  it('reservations count caps by a destination HASH, not a number', () => {
    expect(SQL).toMatch(/destination_hash VARCHAR\(64\) NOT NULL/);
  });
});

describe('Voice Studio models equal the DDL', () => {
  it.each(VOICE_TABLE_SPECS.map((s) => [s.model, s] as const))('%s attributes equal its table columns', (_m, spec) => {
    const model = VOICE_STUDIO_MODELS[spec.model];
    expect(model.getTableName()).toBe(spec.table);
    expect(Object.keys(model.getAttributes()).sort()).toEqual(spec.columns.map((c) => c.name).sort());
    for (const col of spec.columns) expect(model.getAttributes()[col.name].allowNull).toBe(col.allowNull);
  });
});

describe('Voice Studio schema is boot-wired', () => {
  it('server.ts actively awaits ensureVoiceStudioSchema()', () => {
    expect(activeBootCall('await ensureVoiceStudioSchema()')).toBeGreaterThan(-1);
  });
});
