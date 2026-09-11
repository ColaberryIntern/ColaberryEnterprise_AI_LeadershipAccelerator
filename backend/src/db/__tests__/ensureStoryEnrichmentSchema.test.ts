/**
 * Schema/model parity for story_truth_enrichments, both directions, plus the
 * ensure loop's fault tolerance. sequelize.query is mocked: nothing here
 * proves the DDL ran, only that the two declarations agree.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../config/database', () => {
  const { Sequelize } = jest.requireActual('sequelize');
  const sequelize = new Sequelize('postgres://x:y@localhost:1/z', { logging: false, dialect: 'postgres' });
  sequelize.query = jest.fn();
  return { sequelize };
});

import { sequelize } from '../../config/database';
import { ensureStoryEnrichmentSchema } from '../ensureStoryEnrichmentSchema';
import StoryTruthEnrichmentRecord from '../../models/StoryTruthEnrichmentRecord';

const mockQuery = sequelize.query as unknown as jest.Mock;

function ddlColumns(): string[] {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ensureStoryEnrichmentSchema.ts'), 'utf8');
  const m = /CREATE TABLE IF NOT EXISTS story_truth_enrichments \(([\s\S]*?)\n\s*\)`/.exec(src);
  if (!m) throw new Error('CREATE TABLE block not found');
  return m[1].split('\n').map((l) => l.trim())
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
  const model = Object.keys(StoryTruthEnrichmentRecord.getAttributes());

  it('the parse found the columns', () => {
    expect(ddl.length).toBeGreaterThan(10);
    expect(ddl).toContain('idempotency_key');
  });
  it('every DDL column is a model attribute', () => { expect(ddl.filter((c) => !model.includes(c))).toEqual([]); });
  it('every model attribute is a DDL column', () => { expect(model.filter((c) => !ddl.includes(c))).toEqual([]); });
  it('the model points at the table the DDL creates', () => {
    expect(StoryTruthEnrichmentRecord.getTableName()).toBe('story_truth_enrichments');
  });
});

describe('the ensure loop', () => {
  it('creates the table, the UNIQUE key index and the project index; nothing destructive', async () => {
    await ensureStoryEnrichmentSchema();
    const sql = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /CREATE TABLE IF NOT EXISTS story_truth_enrichments/.test(s))).toBe(true);
    expect(sql.some((s) => /CREATE UNIQUE INDEX IF NOT EXISTS idx_story_truth_enrichments_key/.test(s))).toBe(true);
    expect(sql.filter((s) => /CREATE (UNIQUE )?INDEX IF NOT EXISTS/.test(s))).toHaveLength(2);
    expect(sql.some((s) => /\bDROP\b/i.test(s))).toBe(false);
  });

  it('keeps going when one statement fails, and never throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('permission denied'));
    await expect(ensureStoryEnrichmentSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
