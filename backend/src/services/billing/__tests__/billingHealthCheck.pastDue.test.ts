/**
 * The billing watch must say when an automatic payment declined.
 *
 * On 2026-10-31 six schedule members had declined, four of them two months
 * running, and the watch was silent because nothing looked for it.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { runBillingHealthCheck, PAST_DUE_SCHEDULED_SQL } from '../billingHealthCheck';

const query = sequelize.query as jest.Mock;

beforeEach(() => query.mockReset());

describe('past_due scheduled members', () => {
  it('reads past_due rows, one per member', () => {
    expect(PAST_DUE_SCHEDULED_SQL).toContain("s.status = 'past_due'");
    expect(PAST_DUE_SCHEDULED_SQL).toContain('DISTINCT ON (s.enrollment_id)');
  });

  it('raises an act_now finding that tells the reader NOT to send a link', async () => {
    query.mockImplementation(async (sql: string) => (sql === PAST_DUE_SCHEDULED_SQL
      ? [{ full_name: 'Sonya Parker', email: 's@example.com', schedule_id: '4511898', period_end: '2026-10-30', reason: 'Closed account' }]
      : []));
    const r = await runBillingHealthCheck({}, '2026-11-01');
    const f = r.findings.find((x) => x.code === 'scheduled_charge_failed');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('act_now');
    expect(f!.action).toMatch(/do not send a payment link/i);
    expect(f!.rows![0]).toContain('Sonya Parker');
    expect(f!.rows![0]).toContain('Closed account');
    expect(r.needsAttention).toBe(true);
  });

  it('stays silent when nobody is past due', async () => {
    query.mockResolvedValue([]);
    const r = await runBillingHealthCheck({}, '2026-11-01');
    expect(r.findings.find((x) => x.code === 'scheduled_charge_failed')).toBeUndefined();
  });
});
