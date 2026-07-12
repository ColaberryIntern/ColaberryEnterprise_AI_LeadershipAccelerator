import { sequelize } from '../../config/database';
import {
  getRetentionReport,
  RETENTION_POLICY,
  RETENTION_DEFAULT_TTL_MONTHS,
} from '../../services/retentionReportService';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: every class has 10 rows, 4 of them expired.
  mockQuery.mockResolvedValue([{ total: '10', expired: '4', oldest: '2023-01-01T00:00:00.000Z' }]);
});

describe('retentionReportService (dry-run)', () => {
  it('aggregates per-class counts into totals and is always a dry-run', async () => {
    const r = await getRetentionReport();
    expect(r.dryRun).toBe(true);
    expect(r.enforcement).toBe('disabled');
    expect(r.defaultTtlMonths).toBe(RETENTION_DEFAULT_TTL_MONTHS);
    expect(r.classes).toHaveLength(RETENTION_POLICY.length);
    expect(r.totals.total).toBe(10 * RETENTION_POLICY.length);
    expect(r.totals.expired).toBe(4 * RETENTION_POLICY.length);
    expect(r.totals.classesOverThreshold).toBe(RETENTION_POLICY.length);
    // retained = total - expired per class
    expect(r.classes[0].retained).toBe(6);
    expect(r.classes[0].oldest).toBe('2023-01-01T00:00:00.000Z');
  });

  it('NEVER issues a delete — every query is a read-only SELECT aggregate', async () => {
    await getRetentionReport();
    expect(mockQuery).toHaveBeenCalledTimes(RETENTION_POLICY.length);
    for (const call of mockQuery.mock.calls) {
      const sql = String(call[0]);
      expect(sql.trim().startsWith('SELECT')).toBe(true);
      expect(/DELETE|DROP|TRUNCATE|UPDATE/i.test(sql)).toBe(false);
    }
  });

  it('flags leads as anonymize_review, not purge (business-critical CRM data)', async () => {
    const r = await getRetentionReport();
    const leads = r.classes.find((c) => c.key === 'leads')!;
    expect(leads.action).toBe('anonymize_review');
    // every other class is a straight purge
    for (const c of r.classes.filter((x) => x.key !== 'leads')) {
      expect(c.action).toBe('purge');
    }
  });

  it('clamps the ttl override to [1,120] and threads it into the query', async () => {
    const r = await getRetentionReport(999);
    expect(r.classes.every((c) => c.ttlMonths === 120)).toBe(true);
    expect(mockQuery.mock.calls[0][1].replacements.ttl).toBe(120);
    const low = await getRetentionReport(0); // 0 → falls back to per-class default (24)
    expect(low.classes.every((c) => c.ttlMonths === 24)).toBe(true);
  });

  it('isolates a per-class query failure without sinking the whole report', async () => {
    mockQuery.mockReset();
    // First class throws; the rest succeed.
    mockQuery
      .mockRejectedValueOnce(new Error('relation does not exist'))
      .mockResolvedValue([{ total: '5', expired: '2', oldest: null }]);
    const r = await getRetentionReport();
    expect(r.classes[0].error).toBeTruthy();
    expect(r.classes[0].expired).toBe(0); // errored class contributes nothing
    expect(r.classes[1].expired).toBe(2);
    // total excludes the errored class (1 failed + 8 good * 5)
    expect(r.totals.total).toBe(5 * (RETENTION_POLICY.length - 1));
  });
});
