/**
 * The candidate's interview inbox: only their own rows, no employer email, and the confirm /
 * decline / propose transitions (a repeat is a no-op, anything else a 409).
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { actOnInterview, listMyInterviews } from '../hireInterviewInbox';

const q = sequelize.query as unknown as jest.Mock;
const E1 = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-12T16:00:00Z');
const row = (status: string, o: Record<string, unknown> = {}) => ({
  id: ID, format: 'intro', case_study_slug: null, starts_at: '2026-11-16T15:00:00Z', minutes: 20, status,
  employer_name: 'Jane Roe', employer_company: 'Acme', employer_role: 'Head of Data', message: 'Hi',
  extra_count: 2, record_requested: true, room_url: null, created_at: '2026-11-12T15:00:00Z', ...o,
});

beforeEach(() => q.mockReset());

it('lists only the caller\'s interviews, without any employer email', async () => {
  q.mockResolvedValueOnce([[row('requested')]]);
  const out = await listMyInterviews(E1);
  const [sql, opts] = q.mock.calls[0];
  expect(sql).toMatch(/WHERE enrollment_id = \$1/);
  expect(sql).not.toMatch(/employer_email/);
  expect(sql).toMatch(/array_length\(extra_interviewers, 1\)/); // a count, never the addresses
  expect(opts.bind).toEqual([E1]);
  expect(out[0]).toMatchObject({ status: 'requested', extraInterviewers: 2, employer: { name: 'Jane Roe', company: 'Acme' } });
  expect(JSON.stringify(out)).not.toMatch(/@/);
});

it('confirms a request, scoped to the caller and guarded on the status it read', async () => {
  q.mockResolvedValueOnce([[row('requested')]]).mockResolvedValueOnce([[row('confirmed')]]);
  expect((await actOnInterview(E1, ID, 'confirm', {}, NOW)).status).toBe('confirmed');
  // The read that decides the transition is scoped to the caller as well as the write.
  expect(q.mock.calls[0][0]).toMatch(/WHERE id = \$1 AND enrollment_id = \$2/);
  expect(q.mock.calls[0][1]).toEqual({ bind: [ID, E1] });
  const [sql, opts] = q.mock.calls[1];
  expect(sql).toMatch(/WHERE id = \$1 AND enrollment_id = \$2 AND status = ANY/);
  expect(opts.bind).toEqual([ID, E1, 'confirmed', null, ['requested']]);
});

it('is a no-op 200 to confirm twice, and a 409 to confirm a declined one', async () => {
  q.mockResolvedValueOnce([[row('confirmed')]]);
  expect((await actOnInterview(E1, ID, 'confirm', {}, NOW)).status).toBe('confirmed');
  expect(q).toHaveBeenCalledTimes(1);
  q.mockResolvedValueOnce([[row('declined')]]);
  await expect(actOnInterview(E1, ID, 'confirm', {}, NOW)).rejects.toMatchObject({ status: 409 });
});

it('proposes a new future time, and refuses a past one or a malformed body', async () => {
  q.mockResolvedValueOnce([[row('requested')]]).mockResolvedValueOnce([[row('rescheduled', { starts_at: '2026-11-18T16:00:00Z' })]]);
  const out = await actOnInterview(E1, ID, 'propose', { startsAt: '2026-11-18T16:00:00Z' }, NOW);
  expect(out).toMatchObject({ status: 'rescheduled', startsAt: '2026-11-18T16:00:00.000Z' });
  await expect(actOnInterview(E1, ID, 'propose', { startsAt: '2026-11-01T16:00:00Z' }, NOW)).rejects.toMatchObject({ status: 400 });
  await expect(actOnInterview(E1, ID, 'propose', { when: 'tomorrow' }, NOW)).rejects.toMatchObject({ status: 400 });
});

it('is the same 404 for somebody else\'s interview and a made-up id', async () => {
  q.mockResolvedValueOnce([[]]);
  await expect(actOnInterview(E1, ID, 'decline', {}, NOW)).rejects.toMatchObject({ status: 404 });
  await expect(actOnInterview(E1, 'not-a-uuid', 'decline', {}, NOW)).rejects.toMatchObject({ status: 404 });
});

it('loses cleanly (409) when the row changed between the read and the write', async () => {
  q.mockResolvedValueOnce([[row('requested')]]).mockResolvedValueOnce([[]]);
  await expect(actOnInterview(E1, ID, 'decline', {}, NOW)).rejects.toMatchObject({ status: 409 });
});
