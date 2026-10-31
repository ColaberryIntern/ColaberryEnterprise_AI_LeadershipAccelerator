/**
 * C94: the two attribution columns are added additively, idempotently, and never stop the boot.
 */
import fs from 'fs';
import path from 'path';
import { ensureLeadAttributionColumns, LEAD_ATTRIBUTION_STATEMENTS } from '../ensureLeadAttributionColumns';
import { sequelize } from '../../config/database';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), define: jest.fn() } }));

const query = sequelize.query as unknown as jest.Mock;

describe('ensureLeadAttributionColumns (C94)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds exactly utm_content and utm_term to leads, each IF NOT EXISTS, nothing else', () => {
    expect(LEAD_ATTRIBUTION_STATEMENTS).toEqual([
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255)',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255)',
    ]);
    for (const s of LEAD_ATTRIBUTION_STATEMENTS) {
      expect(s).not.toMatch(/DROP|DEFAULT|NOT NULL|UPDATE/i);
    }
  });

  it('runs every statement, and running it twice issues the same statements (idempotent DDL)', async () => {
    query.mockResolvedValue([[], 0]);
    await ensureLeadAttributionColumns();
    await ensureLeadAttributionColumns();
    expect(query.mock.calls.map((c) => c[0])).toEqual([...LEAD_ATTRIBUTION_STATEMENTS, ...LEAD_ATTRIBUTION_STATEMENTS]);
  });

  it('a failing statement is logged and the next one still runs; the boot never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    query.mockRejectedValueOnce(new Error('lock timeout')).mockResolvedValueOnce([[], 0]);
    await expect(ensureLeadAttributionColumns()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ event: 'ensure_lead_attribution_columns_statement_failed', outcome: 'partial' });
    warn.mockRestore();
  });

  // Read from the model's SOURCE: importing the model here would need the real sequelize this file mocks. The
  // schema-cap = model-width half is asserted in services/__tests__/freeSignupAcquisition.test.ts.
  it('the DDL widths match the Lead model declaration', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'models', 'Lead.ts'), 'utf8');
    for (const col of ['utm_content', 'utm_term']) {
      expect(src).toMatch(new RegExp(`\\n    ${col}: \\{\\s*type: DataTypes\\.STRING\\(255\\),\\s*allowNull: true,`));
      expect(LEAD_ATTRIBUTION_STATEMENTS.some((s) => s.includes(`${col} VARCHAR(255)`))).toBe(true);
    }
  });
});
