import { GOV_AI_VETTING_STATEMENTS } from '../ensureGovAiVettingSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import '../../models/GovAiVetting';

/** A dropped column here would silently lose a saved verdict, so the DDL and the model must agree both ways. */
describe('ensureGovAiVettingSchema: DDL and model agree', () => {
  const created = parseCreatedTables(GOV_AI_VETTING_STATEMENTS);

  it('creates exactly the one table', () => {
    expect(created.map((c) => c.table)).toEqual(['gov_ai_vettings']);
  });

  it('every created column is a model attribute, and every model attribute is created', () => {
    const model = modelsByTable().gov_ai_vettings;
    expect(model).toBeDefined();
    const mapped = modelColumnNames(model);
    const columns = new Set(created[0].columns);
    expect(created[0].columns.filter((c: string) => !mapped.has(c))).toEqual([]);
    expect(Array.from(mapped).filter((c) => !columns.has(c as string))).toEqual([]);
  });

  it('every statement is additive and safe to re-run', () => {
    for (const sql of GOV_AI_VETTING_STATEMENTS) expect(sql).toMatch(/IF NOT EXISTS/);
    expect(GOV_AI_VETTING_STATEMENTS.join(' ')).not.toMatch(/\b(DROP|ALTER)\b/i);
  });

  it('holds one row per tenant, qualification and ZIP', () => {
    expect(GOV_AI_VETTING_STATEMENTS.join(' ')).toMatch(/UNIQUE INDEX[^;]*\(tenant_id, qualification_key, sha256\)/);
  });
});
