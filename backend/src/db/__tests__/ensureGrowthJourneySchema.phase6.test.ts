import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const m = { query: jest.fn(), killSwitchRow: jest.fn() };
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => m.query(...a) } }));
jest.mock('../../services/launchSafety', () => ({ ensureKillSwitchRow: (...a: unknown[]) => m.killSwitchRow(...a) }));

import { ensureGrowthJourneySchema, GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { MULTI_TENANT_SCHEMA_STATEMENTS } from '../ensureMultiTenantSchema';
import { GROWTH_JOURNEY_PHASE4_STATEMENTS } from '../growthJourneyPhase4Statements';
import { GROWTH_JOURNEY_PHASE5_STATEMENTS } from '../growthJourneyPhase5Statements';

/**
 * T602 (Growth Journey Phase 6, the hardening set) — the boot-time half.
 *
 * Two additive boot steps and one non-change:
 *
 *   1. `event_ledger` gets its first three indexes, in the ensure that already
 *      owns the ledger's tenancy columns (`ensureMultiTenantSchema`), each a
 *      `CREATE INDEX CONCURRENTLY IF NOT EXISTS` in its own statement, after
 *      the columns it indexes. The journey's own statement list creates no
 *      index on a table it does not own - the statements test refuses that,
 *      and this task keeps it that way rather than moving the pin.
 *   2. `ensureGrowthJourneySchema()` seeds the kill-switch row LAST, once, after
 *      every statement, through `launchSafety.ensureKillSwitchRow` - and a
 *      failed statement earlier in the loop does not skip it.
 *   3. The Phase 4 and Phase 5 statement modules are byte-for-byte what they
 *      were (md5 of the joined text), and the ensure stays under the ceiling.
 */

const md5 = (a: readonly string[]) => createHash('md5').update(a.join('\n')).digest('hex');
const ws = (s: string) => s.replace(/\s+/g, ' ').trim();
const ENSURE = path.join(__dirname, '..', 'ensureGrowthJourneySchema.ts');

const LEDGER_INDEXES: Array<[string, string]> = [
  ['idx_event_ledger_entity_created', '(entity_type, entity_id, created_at)'],
  ['idx_event_ledger_type_created', '(event_type, created_at)'],
  ['idx_event_ledger_tenant_brand_created', '(tenant_id, brand_id, created_at)'],
];

beforeEach(() => {
  jest.clearAllMocks();
  m.query.mockResolvedValue([]);
  m.killSwitchRow.mockResolvedValue({ created: false });
});

describe('the event_ledger indexes', () => {
  it('are three, each CONCURRENTLY and IF NOT EXISTS, each its own statement, on the columns the reads use', () => {
    const found = MULTI_TENANT_SCHEMA_STATEMENTS.filter((s) => /ON\s+event_ledger\s*\(/i.test(ws(s)));
    expect(found).toHaveLength(3);
    for (const [i, [name, columns]] of LEDGER_INDEXES.entries()) {
      expect(ws(found[i])).toBe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON event_ledger ${columns}`);
    }
  });

  it('come after the two event_ledger columns they index, in the same list that adds those columns', () => {
    const at = (rx: RegExp) => MULTI_TENANT_SCHEMA_STATEMENTS.findIndex((s) => rx.test(ws(s)));
    const tenantCol = at(/ALTER TABLE event_ledger ADD COLUMN IF NOT EXISTS tenant_id/i);
    const brandCol = at(/ALTER TABLE event_ledger ADD COLUMN IF NOT EXISTS brand_id/i);
    const firstIndex = at(/idx_event_ledger_entity_created/);
    expect(tenantCol).toBeGreaterThanOrEqual(0);
    expect(brandCol).toBeGreaterThan(tenantCol);
    expect(firstIndex).toBeGreaterThan(brandCol);
  });

  it('are the only CONCURRENTLY statements in that list, and nothing else there changed shape: every other statement is still IF NOT EXISTS', () => {
    const concurrent = MULTI_TENANT_SCHEMA_STATEMENTS.filter((s) => /CONCURRENTLY/i.test(s));
    expect(concurrent).toHaveLength(3);
    for (const s of MULTI_TENANT_SCHEMA_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/i);
  });

  it('the journey\'s own statement list still creates no index on event_ledger (the statements test\'s boundary holds)', () => {
    expect(GROWTH_JOURNEY_STATEMENTS.filter((s) => /event_ledger/i.test(s))).toEqual([]);
    expect(GROWTH_JOURNEY_STATEMENTS.filter((s) => /CONCURRENTLY/i.test(s))).toEqual([]);
  });
});

describe('the kill-switch row at the end of the journey ensure', () => {
  it('is seeded once, after the last statement has been issued', async () => {
    const order: string[] = [];
    m.query.mockImplementation(async (sql: string) => { order.push(`q:${ws(sql).slice(0, 30)}`); return []; });
    m.killSwitchRow.mockImplementation(async () => { order.push('kill_switch_row'); return { created: true }; });
    await ensureGrowthJourneySchema();
    expect(m.query).toHaveBeenCalledTimes(GROWTH_JOURNEY_STATEMENTS.length);
    expect(m.killSwitchRow).toHaveBeenCalledTimes(1);
    expect(order[order.length - 1]).toBe('kill_switch_row');
    expect(order.filter((o) => o === 'kill_switch_row')).toHaveLength(1);
  });

  it('a statement that fails earlier in the loop is warned about and does not skip the row', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    m.query.mockImplementation(async (sql: string) => { if (/journey_programs/i.test(sql) && /CREATE TABLE/i.test(sql)) throw new Error('relation "tenants" does not exist'); return []; });
    await expect(ensureGrowthJourneySchema()).resolves.toBeUndefined();
    expect(m.query).toHaveBeenCalledTimes(GROWTH_JOURNEY_STATEMENTS.length);
    expect(m.killSwitchRow).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[ensureGrowthJourneySchema] statement failed:'))).toBe(true);
    warn.mockRestore();
  });

  it('the hook is the last line of the function, after the loop, in the source', () => {
    const src = fs.readFileSync(ENSURE, 'utf8');
    const fn = src.slice(src.indexOf('export async function ensureGrowthJourneySchema('));
    const loopEnd = fn.search(/\r?\n  }\r?\n/); // the loop's closing brace, whatever the checkout's line endings
    const hook = fn.indexOf('await ensureKillSwitchRow();');
    expect(loopEnd).toBeGreaterThan(0);
    expect(hook).toBeGreaterThan(loopEnd);
    expect(src.match(/ensureKillSwitchRow\(\)/g)).toHaveLength(1);
    expect(src).toContain("import { ensureKillSwitchRow } from '../services/launchSafety';");
  });
});

describe('what did not change', () => {
  it('the Phase 4 and Phase 5 statement modules are byte-for-byte what they were', () => {
    expect([GROWTH_JOURNEY_PHASE4_STATEMENTS.length, md5(GROWTH_JOURNEY_PHASE4_STATEMENTS)]).toEqual([15, 'a27538288060451bb2672408d20a4c41']);
    expect([GROWTH_JOURNEY_PHASE5_STATEMENTS.length, md5(GROWTH_JOURNEY_PHASE5_STATEMENTS)]).toEqual([13, 'ee7a7f406d34ca09c289747bf9c83c5d']);
  });

  it('the ensure stays under the ceiling with room for nothing careless: at most 499 lines', () => {
    const src = fs.readFileSync(ENSURE, 'utf8');
    const lines = src.split(/\r?\n/).length - (src.endsWith('\n') ? 1 : 0); // wc -l
    expect(lines).toBeLessThanOrEqual(499);
  });

  it('the journey list has no ALTER beyond the brands pointer (the two Phase 6 decision columns are T608\'s deliberate move, not this task\'s)', () => {
    const alters = GROWTH_JOURNEY_STATEMENTS.filter((s) => /^\s*ALTER/i.test(s));
    expect(alters).toHaveLength(1);
    expect(alters[0]).toMatch(/ALTER\s+TABLE\s+brands\b/i);
  });
});
