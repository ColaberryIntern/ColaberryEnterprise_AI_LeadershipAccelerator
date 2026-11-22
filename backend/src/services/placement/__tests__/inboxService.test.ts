const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { getInbox, listReceived, saveInboxAddress } from '../inboxService';

/** CP6.1 (kit F2): the student's job-search inbox, always the caller's own. */
const NOW = new Date('2026-11-21T18:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({ address: 'ann.lee.careers@gmail.com', verified_at: null, forwarding_confirmed_at: null, last_received_at: null, last_test_at: null, last_test_ms: null, this_month: 0, ...over });
beforeEach(() => mockQuery.mockReset());

describe('getInbox', () => {
  it('reads ONLY the caller\'s enrollment and computes health (no stored status)', async () => {
    mockQuery.mockResolvedValueOnce([[row({ verified_at: '2026-11-10T00:00:00Z', forwarding_confirmed_at: '2026-11-09T00:00:00Z', last_received_at: '2026-11-21T10:00:00Z', this_month: 4 })], 1]);
    const v = await getInbox('enr-1', NOW);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/WHERE i\.enrollment_id = :e/);
    expect(mockQuery.mock.calls[0][1].replacements.e).toBe('enr-1');
    expect(String(mockQuery.mock.calls[0][0])).not.toMatch(/\bstatus\b/);
    expect(v).toMatchObject({ address: 'ann.lee.careers@gmail.com', health: 'healthy', healthLabel: 'Forwarding healthy', receivedThisMonth: 4,
      steps: { create: true, added: true, forwarding: true, tested: true } });
  });
  it('with nothing set up yet: no address, Not set up yet, no step done, zero this month', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    expect(await getInbox('enr-1', NOW)).toEqual({ address: null, health: 'setup', healthLabel: 'Not set up yet', verifiedAt: null, forwardingConfirmedAt: null,
      lastReceivedAt: null, lastTestAt: null, lastTestMs: null, receivedThisMonth: 0, steps: { create: false, added: false, forwarding: false, tested: false } });
  });
  it('T11: a stored broken spell keeps the inbox broken while the next test is still on its way', async () => {
    mockQuery.mockResolvedValueOnce([[row({ verified_at: '2026-11-10T00:00:00Z', last_received_at: '2026-11-21T10:00:00Z', last_test_at: '2026-11-21T17:59:00Z', broken_since: '2026-11-20T15:00:00Z' })], 1]);
    const v = await getInbox('enr-1', NOW);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/i\.broken_since/);
    expect([v.health, v.healthLabel]).toEqual(['broken', 'Forwarding broken']);
  });
  it('counts this month in Central time', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await getInbox('enr-1', NOW);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/AT TIME ZONE 'America\/Chicago'/);
  });
});

describe('saveInboxAddress', () => {
  it('refuses a non-Gmail address without touching the database', async () => {
    expect(await saveInboxAddress('enr-1', 'ann@yahoo.com', NOW)).toEqual({ status: 'invalid', reason: 'not_gmail' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
  it('another learner already using that inbox (even written with dots or a +tag) is "taken"', async () => {
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: 'enr-2' }], 1]);
    expect(await saveInboxAddress('enr-1', 'Ann.Lee.Careers+jobs@gmail.com', NOW)).toEqual({ status: 'taken' });
    expect(mockQuery.mock.calls[0][1].replacements.m).toBe('annleecareers@gmail.com');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
  it('a race lost on the UNIQUE index is "taken", not a 500', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]).mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "uq_job_search_inboxes_mailbox"'), { name: 'SequelizeUniqueConstraintError' }));
    expect(await saveInboxAddress('enr-1', 'abc@gmail.com', NOW)).toEqual({ status: 'taken' });
  });
  it('a first save inserts one row for this learner; a DIFFERENT address restarts the setup (verification cleared)', async () => {
    mockQuery.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[{ id: 'x' }], 1]).mockResolvedValueOnce([[row()], 1]);
    const r = await saveInboxAddress('enr-1', 'ann.lee.careers@gmail.com', NOW);
    expect(r.status).toBe('saved');
    const sql = String(mockQuery.mock.calls[1][0]);
    expect(sql).toMatch(/ON CONFLICT \(enrollment_id\) DO UPDATE/);
    // Verification and the last test are cleared ONLY when the mailbox changes (proved on Postgres in inboxService.integration).
    for (const col of ['verified_at', 'forwarding_confirmed_at', 'last_test_at', 'last_test_ms', 'broken_since', 'broken_alerted_at']) {
      expect(sql).toMatch(new RegExp(`${col} = CASE WHEN job_search_inboxes\\.mailbox IS DISTINCT FROM EXCLUDED\\.mailbox THEN NULL ELSE job_search_inboxes\\.${col} END`));
    }
    expect(sql).toMatch(/WHERE job_search_inboxes\.mailbox IS DISTINCT FROM EXCLUDED\.mailbox OR job_search_inboxes\.address IS DISTINCT FROM EXCLUDED\.address/);
    expect(mockQuery.mock.calls[1][1].replacements).toEqual({ e: 'enr-1', a: 'ann.lee.careers@gmail.com', m: 'annleecareers@gmail.com' });
  });
  it('saving the SAME mailbox again changes nothing (idempotent)', async () => {
    mockQuery.mockResolvedValueOnce([[{ enrollment_id: 'enr-1' }], 1]).mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[row({ verified_at: '2026-11-10T00:00:00Z' })], 1]);
    const r = await saveInboxAddress('enr-1', 'annleecareers@gmail.com', NOW);
    expect(r.status).toBe('unchanged');
  });
});

describe('listReceived', () => {
  it('lists the caller\'s own messages newest first, with the limit bounded', async () => {
    mockQuery.mockResolvedValueOnce([[{ message_id: '<m1>', received_at: '2026-11-21T12:00:00Z', from_name: 'Recruiter', subject: 'Interview', category: 'interview', confidence: '0.97', outcome: 'Booking link held' }], 1]);
    const items = await listReceived('enr-1', 999);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ e: 'enr-1', n: 200 });
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/WHERE enrollment_id = :e ORDER BY received_at DESC/);
    expect(items[0]).toEqual({ messageId: '<m1>', receivedAt: '2026-11-21T12:00:00.000Z', fromName: 'Recruiter', subject: 'Interview', category: 'interview', confidence: 0.97, outcome: 'Booking link held' });
  });
});
