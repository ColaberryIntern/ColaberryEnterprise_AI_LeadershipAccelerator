const query = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import { readBuyingSignals, CHECKOUT_GRACE_MINUTES, ENROLL_LINK_HREF_PATTERN } from '../explorerBuyingSignals';

/**
 * C100: abandoned checkout and enroll-link clicks, readable on the learner view and fed into nothing.
 *
 * The SQL is the contract, so these tests pin the predicates that decide what counts, and the shape the view gets:
 * a pending checkout with no payment past the grace window and no paid subscription since; an enroll-link click found
 * through the lead directly OR through the visitor session (most clicks only reach the lead that way).
 */

const ID = '2039513d-307a-4749-ab99-c666a33794d3';
const AS_OF = new Date('2026-11-02T12:00:00Z');
const sqlOf = (i: number) => String(query.mock.calls[i]?.[0] ?? '');
const replOf = (i: number) => (query.mock.calls[i]?.[1] as { replacements: Record<string, unknown> }).replacements;

beforeEach(() => query.mockReset());

describe('readBuyingSignals', () => {
  it('reports a pending, unpaid checkout and the enroll-link clicks, as counts with the latest time', async () => {
    query
      .mockResolvedValueOnce([{ n: '2', last_at: new Date('2026-10-28T05:40:00Z'), plans: ['annual'] }])
      .mockResolvedValueOnce([{ n: 3, last_at: '2026-10-28T05:31:00Z' }]);
    const r = await readBuyingSignals(ID, 24481, { asOf: AS_OF });
    expect(r).toEqual({
      checkout_abandoned: { count: 2, last_at: '2026-10-28T05:40:00.000Z', plans: ['annual'] },
      enroll_link_click: { count: 3, last_at: '2026-10-28T05:31:00.000Z' },
      unavailable: [],
    });
  });

  it('abandoned = pending, no payment, older than the grace window, and no paid subscription since', async () => {
    query.mockResolvedValue([{ n: 0, last_at: null, plans: null }]);
    await readBuyingSignals(ID, 24481, { asOf: AS_OF });
    const sql = sqlOf(0);
    expect(sql).toContain("s.status = 'pending'");
    expect(sql).toContain('s.paysimple_payment_id IS NULL');
    expect(sql).toMatch(/make_interval\(mins => :graceMinutes\)/);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*paid\.status = 'active' AND paid\.plan <> 'comp'/);
    expect(replOf(0)).toEqual({ enrollmentId: ID, asOf: AS_OF.toISOString(), graceMinutes: CHECKOUT_GRACE_MINUTES });
    expect(CHECKOUT_GRACE_MINUTES).toBe(30);
  });

  it('an enroll-link click is found through page_events.lead_id OR the visitor session, by the subscription-tab href', async () => {
    query.mockResolvedValue([{ n: 0, last_at: null }]);
    await readBuyingSignals(ID, 24481, { asOf: AS_OF });
    const sql = sqlOf(1);
    expect(sql).toContain('p.lead_id = :leadId');
    expect(sql).toMatch(/JOIN visitor_sessions v ON v\.id = p\.session_id[\s\S]*v\.lead_id = :leadId/);
    // UNION, not UNION ALL: a click carrying the lead id AND reachable through its session counts once.
    expect(sql).toMatch(/\bUNION\b(?!\s+ALL)/);
    expect(replOf(1)).toEqual({ leadId: 24481, asOf: AS_OF.toISOString(), hrefPattern: ENROLL_LINK_HREF_PATTERN });
    expect(ENROLL_LINK_HREF_PATTERN).toBe('%tab=subscription%');
  });

  it('nothing found is zero, not unknown', async () => {
    query.mockResolvedValue([]);
    const r = await readBuyingSignals(ID, 24481, { asOf: AS_OF });
    expect(r.checkout_abandoned).toEqual({ count: 0, last_at: null, plans: [] });
    expect(r.enroll_link_click).toEqual({ count: 0, last_at: null });
    expect(r.unavailable).toEqual([]);
  });

  it('an unbridged learner (no lead) runs no click query and reports zero clicks', async () => {
    query.mockResolvedValue([{ n: 1, last_at: AS_OF, plans: ['monthly'] }]);
    const r = await readBuyingSignals(ID, null, { asOf: AS_OF });
    expect(query).toHaveBeenCalledTimes(1);
    expect(r.enroll_link_click).toEqual({ count: 0, last_at: null });
    expect(r.checkout_abandoned.count).toBe(1);
  });

  it('a failed read degrades to "unavailable" with a structured warning, and the other signal still reads', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    query
      .mockRejectedValueOnce(Object.assign(new Error('relation "subscriptions" does not exist'), { name: 'SequelizeDatabaseError' }))
      .mockResolvedValueOnce([{ n: 1, last_at: AS_OF }]);
    const r = await readBuyingSignals(ID, 24481, { asOf: AS_OF });
    expect(r.unavailable).toEqual(['checkout_abandoned']);
    expect(r.checkout_abandoned.count).toBe(0);
    expect(r.enroll_link_click.count).toBe(1);
    const logged = JSON.parse(String(warn.mock.calls[0][0]));
    expect(logged).toMatchObject({ event: 'explorer.buying_signal.read_failed', error_class: 'SequelizeDatabaseError', source: 'checkout_abandoned' });
    warn.mockRestore();
  });

  it('is read-only: every statement is a SELECT', async () => {
    query.mockResolvedValue([]);
    await readBuyingSignals(ID, 24481, { asOf: AS_OF });
    for (const [sql] of query.mock.calls) expect(String(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
  });
});
