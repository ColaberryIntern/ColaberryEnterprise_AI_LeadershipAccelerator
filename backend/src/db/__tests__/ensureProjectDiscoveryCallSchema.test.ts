/**
 * Schema/model parity for project_discovery_call_requests.
 *
 * The model header says its columns "must match the DDL EXACTLY". This reads
 * both and checks, in both directions, so a column added to one and not the
 * other fails here instead of as an undefined read or a silently dropped
 * write in production (the failure the multi-tenant parity test was written
 * for, and which this repo has shipped before).
 *
 * sequelize.query is mocked, so nothing here proves the DDL RAN; it proves the
 * two declarations agree and that the ensure loop is fault-tolerant.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../config/database', () => {
  const { Sequelize } = jest.requireActual('sequelize');
  // A real Sequelize instance with no connection: models can init and report
  // attributes, and query() is a mock that never reaches a database.
  const sequelize = new Sequelize('postgres://x:y@localhost:1/z', { logging: false, dialect: 'postgres' });
  sequelize.query = jest.fn();
  return { sequelize };
});

import { sequelize } from '../../config/database';
import { ensureProjectDiscoveryCallSchema } from '../ensureProjectDiscoveryCallSchema';
import ProjectDiscoveryCallRequest from '../../models/ProjectDiscoveryCallRequest';

const mockQuery = sequelize.query as unknown as jest.Mock;

/** Column names inside `CREATE TABLE IF NOT EXISTS project_discovery_call_requests ( ... )`. */
function ddlColumns(): string[] {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ensureProjectDiscoveryCallSchema.ts'), 'utf8');
  const m = /CREATE TABLE IF NOT EXISTS project_discovery_call_requests \(([\s\S]*?)\n\s*\)`/.exec(src);
  if (!m) throw new Error('CREATE TABLE block not found');
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK)/i.test(l))
    .map((l) => l.split(/\s+/)[0].replace(/,$/, ''));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('DDL and model agree', () => {
  const ddl = ddlColumns();
  const model = Object.keys(ProjectDiscoveryCallRequest.getAttributes());

  it('the DDL parse found the columns (guards against a vacuous pass)', () => {
    expect(ddl.length).toBeGreaterThan(10);
    expect(ddl).toContain('phone_e164');
  });

  it('every DDL column is a model attribute', () => {
    expect(ddl.filter((c) => !model.includes(c))).toEqual([]);
  });

  it('every model attribute is a DDL column', () => {
    expect(model.filter((c) => !ddl.includes(c))).toEqual([]);
  });

  it('the model points at the table the DDL creates', () => {
    expect(ProjectDiscoveryCallRequest.getTableName()).toBe('project_discovery_call_requests');
  });
});

describe('the ensure loop', () => {
  it('issues the table and both indexes, additive only', async () => {
    await ensureProjectDiscoveryCallSchema();
    const sql = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /CREATE TABLE IF NOT EXISTS project_discovery_call_requests/.test(s))).toBe(true);
    expect(sql.filter((s) => /CREATE INDEX IF NOT EXISTS/.test(s))).toHaveLength(2);
    expect(sql.some((s) => /DROP|ALTER TABLE \w+ DROP/i.test(s))).toBe(false);
  });

  it('keeps going when one statement fails, and never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('permission denied'));
    await expect(ensureProjectDiscoveryCallSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('is idempotent: running twice issues the same statements twice', async () => {
    await ensureProjectDiscoveryCallSchema();
    const first = mockQuery.mock.calls.map((c) => String(c[0]));
    mockQuery.mockClear();
    await ensureProjectDiscoveryCallSchema();
    expect(mockQuery.mock.calls.map((c) => String(c[0]))).toEqual(first);
  });
});
