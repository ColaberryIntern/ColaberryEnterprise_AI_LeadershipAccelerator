/**
 * R18: `enrollments.lead_id` is added additively, idempotently, verified after the fact, and
 * never stops the boot. Plus the two agreements that a DDL file can silently break: the model's
 * declaration, and the boot wiring.
 */
import fs from 'fs';
import path from 'path';
import {
  ensureEnrollmentLeadIdSchema,
  ENROLLMENT_LEAD_ID_STATEMENTS,
} from '../ensureEnrollmentLeadIdSchema';
import { sequelize } from '../../config/database';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), define: jest.fn() } }));

const query = sequelize.query as unknown as jest.Mock;
const SRC = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

/** The verification SELECT the function runs last, answering "is the column there now". */
const columnPresent = (names: string[]) => [names.map((column_name) => ({ column_name })), 0];

describe('ensureEnrollmentLeadIdSchema (R18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds exactly lead_id plus its partial index, and nothing destructive', () => {
    expect(ENROLLMENT_LEAD_ID_STATEMENTS).toHaveLength(2);
    expect(ENROLLMENT_LEAD_ID_STATEMENTS[0]).toBe(
      'ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS lead_id INTEGER',
    );
    expect(ENROLLMENT_LEAD_ID_STATEMENTS[1]).toMatch(/CREATE INDEX IF NOT EXISTS idx_enrollments_lead_id/);
    // The index is partial on purpose: on the day this lands every row is NULL, and 100 of
    // production's 1,436 enrollment emails stay NULL permanently because they have no lead row.
    expect(ENROLLMENT_LEAD_ID_STATEMENTS[1]).toMatch(/WHERE lead_id IS NOT NULL/);
    for (const s of ENROLLMENT_LEAD_ID_STATEMENTS) {
      expect(s).not.toMatch(/DROP|DEFAULT|UPDATE |ALTER COLUMN/i);
    }
    // `NOT NULL` is checked only on the ALTER, because a partial index's `WHERE lead_id IS NOT
    // NULL` is the whole point of that statement. An earlier version of this assertion ran the
    // one regex over both and failed on the index it was written to require.
    expect(ENROLLMENT_LEAD_ID_STATEMENTS[0]).not.toMatch(/NOT NULL/i);
  });

  it('is a bare INTEGER with no foreign key, matching page_events.lead_id', () => {
    // A cross-domain reference (revenue -> marketing). ensureMarketingTrackingSchema.ts states
    // the convention; PageEvent.ts states it for this exact column name. A REFERENCES clause
    // appearing here would be a silent change of that decision.
    expect(ENROLLMENT_LEAD_ID_STATEMENTS[0]).not.toMatch(/REFERENCES/i);
    expect(ENROLLMENT_LEAD_ID_STATEMENTS[0]).toContain('INTEGER');
  });

  it('runs every statement, and running it twice issues the same statements (idempotent DDL)', async () => {
    query.mockResolvedValue(columnPresent(['lead_id']));
    await ensureEnrollmentLeadIdSchema();
    await ensureEnrollmentLeadIdSchema();
    const ddl = query.mock.calls.map((c) => c[0]).filter((s: string) => !s.includes('information_schema'));
    expect(ddl).toEqual([...ENROLLMENT_LEAD_ID_STATEMENTS, ...ENROLLMENT_LEAD_ID_STATEMENTS]);
  });

  it('a failing statement is logged and the next one still runs; the boot never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    query.mockRejectedValueOnce(new Error('lock timeout')).mockResolvedValue(columnPresent(['lead_id']));
    await expect(ensureEnrollmentLeadIdSchema()).resolves.toEqual({ ok: true, missing: [] });
    // Against the list's length plus the one verification SELECT, not a hardcoded count.
    expect(query).toHaveBeenCalledTimes(ENROLLMENT_LEAD_ID_STATEMENTS.length + 1);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      event: 'ensure_enrollment_lead_id_statement_failed',
      outcome: 'partial',
    });
    warn.mockRestore();
  });

  it('reports a SchemaInvariantViolation when the column is still absent after the run', async () => {
    // The warning loop alone would leave boot looking clean while the model declares an
    // attribute the table lacks, which breaks every enrollment SELECT in the product, not
    // merely this feature. That blast radius is why the post-condition exists.
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    query.mockRejectedValueOnce(new Error('denied')).mockResolvedValue(columnPresent(['email']));

    await expect(ensureEnrollmentLeadIdSchema()).resolves.toEqual({ ok: false, missing: ['lead_id'] });
    expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
      event: 'SchemaInvariantViolation',
      outcome: 'failure',
      context: { table: 'enrollments', missing_columns: ['lead_id'] },
    });
    error.mockRestore();
    warn.mockRestore();
  });

  // Read from SOURCE: importing the model here would need the real sequelize this file mocks.
  it('the DDL type matches the Enrollment model declaration', () => {
    const src = SRC('models', 'Enrollment.ts');
    expect(src).toMatch(/lead_id: \{[\s\S]*?type: DataTypes\.INTEGER,\s*\n\s*allowNull: true,/);
    expect(src).toMatch(/declare lead_id: number \| null;/);
    // Nullable in BOTH places or the two disagree: the DDL adds no NOT NULL, so a model that
    // declared allowNull:false would reject rows the database accepts.
    expect(ENROLLMENT_LEAD_ID_STATEMENTS[0]).not.toMatch(/NOT NULL/);
  });

  it('the model declares no `references` for lead_id', () => {
    const src = SRC('models', 'Enrollment.ts');
    const block = src.match(/lead_id: \{[\s\S]*?\n    \},/)?.[0] ?? '';
    expect(block).not.toBe('');
    // Comments stripped first. The declaration's own comment explains WHY there is no
    // `references` here, and the word in that sentence is not a foreign key — an earlier
    // version of this assertion failed on the documentation of the thing it was checking.
    const code = block.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/references\s*:/i);
  });

  it('is wired into the boot sequence', () => {
    const server = SRC('server.ts');
    expect(server).toContain("import { ensureEnrollmentLeadIdSchema } from './db/ensureEnrollmentLeadIdSchema';");
    expect(server).toContain('await ensureEnrollmentLeadIdSchema();');
  });

  it('the beforeCreate hook is wired on the Enrollment model, not left to call sites', () => {
    // The whole reason the hook exists is that there are seven enrollment-creation paths and
    // editing each one links the seven that exist and misses the eighth. If this wiring is
    // removed, every new enrollment silently stops carrying its lead and nothing else fails.
    const src = SRC('models', 'Enrollment.ts');
    expect(src).toMatch(/hooks: \{\s*\n\s*beforeCreate: enrollmentLeadLinkHook,/);
    expect(src).toContain("import { enrollmentLeadLinkHook } from '../services/marketing/enrollmentLeadResolver';");
  });
});
