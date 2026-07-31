import { sequelize } from '../../config/database';
import { emitAiEvent } from '../../services/aiEventService';
import { enforceRetention } from '../../services/retentionEnforcementService';
import { RETENTION_POLICY } from '../../services/retentionReportService';

jest.mock('../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn((cb: (t: unknown) => Promise<unknown>) => cb({})),
  },
}));
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockEmit = emitAiEvent as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([undefined, 7]); // pretend 7 rows affected per class
});

describe('retentionEnforcementService.enforceRetention', () => {
  it('runs one transaction per policy class and reports per-class affected counts', async () => {
    const r = await enforceRetention();
    expect(r.classes).toHaveLength(RETENTION_POLICY.length);
    expect(r.totals.affected).toBe(7 * RETENTION_POLICY.length);
    expect(r.totals.errors).toBe(0);
    expect(sequelize.transaction).toHaveBeenCalledTimes(RETENTION_POLICY.length);
  });

  it('purges (DELETE) every class except leads, which it anonymizes (UPDATE, never DELETE)', async () => {
    await enforceRetention();
    const sqlByTable = new Map<string, string>();
    for (const call of mockQuery.mock.calls) {
      const sql = String(call[0]);
      const tableMatch = sql.match(/(?:FROM|UPDATE)\s+"?(\w+)"?/i);
      if (tableMatch) sqlByTable.set(tableMatch[1], sql);
    }
    expect(sqlByTable.get('leads')?.trim().toUpperCase().startsWith('UPDATE')).toBe(true);
    expect(sqlByTable.get('leads')).not.toMatch(/DELETE/i);
    for (const def of RETENTION_POLICY.filter((d) => d.key !== 'leads')) {
      expect(sqlByTable.get(def.table)?.trim().toUpperCase().startsWith('DELETE')).toBe(true);
    }
  });

  it('the leads anonymize query excludes already-anonymized rows, making a second run a no-op by construction', async () => {
    await enforceRetention();
    const leadsCall = mockQuery.mock.calls.find((c) => /UPDATE\s+"?leads"?/i.test(String(c[0])));
    expect(String(leadsCall?.[0])).toMatch(/email IS NOT NULL/i);
  });

  it('emits a governance.retention_enforced ai_event per class, success and failure alike', async () => {
    mockQuery
      .mockResolvedValueOnce([undefined, 3])
      .mockRejectedValueOnce(new Error('relation does not exist'));
    await enforceRetention();
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'governance.retention_enforced', outcome: 'success' }));
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'governance.retention_enforced', outcome: 'failure' }));
  });

  it('isolates a per-class failure — one bad table does not abort the remaining classes', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([undefined, 2]);
    const r = await enforceRetention();
    expect(r.totals.errors).toBe(1);
    expect(r.classes).toHaveLength(RETENTION_POLICY.length);
    expect(r.classes.filter((c) => !c.error)).toHaveLength(RETENTION_POLICY.length - 1);
  });
});
