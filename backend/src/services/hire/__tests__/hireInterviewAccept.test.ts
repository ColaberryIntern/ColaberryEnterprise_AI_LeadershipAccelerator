/**
 * The employer takes a suggested time with a signed link. The token binds the interview AND its
 * current time, a wrong one is an ordinary 404, and only the POST changes anything.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { acceptProposedTime, acceptToken, acceptUrl, readProposal } from '../hireInterviewAccept';

const q = sequelize.query as unknown as jest.Mock;
const ID = '33333333-3333-4333-8333-333333333333';
const START = '2026-11-18T16:30:00.000Z';
const NOW = new Date('2026-11-13T12:00:00Z');
let row: Record<string, unknown>;

beforeEach(() => {
  row = { id: ID, talent_slug: 'ann-lee', starts_at: START, minutes: 20, format: 'intro', status: 'rescheduled' };
  q.mockReset().mockImplementation(async (sql: string) => {
    if (/^SELECT/.test(sql)) return [[row]];
    if (/UPDATE hire_interviews SET status = 'confirmed'/.test(sql)) return [row.status === 'rescheduled' ? [{ id: ID }] : []];
    throw new Error('unexpected SQL: ' + sql);
  });
});
const updates = () => q.mock.calls.filter(([s]) => /^\s*UPDATE/.test(s));
const t = () => acceptToken(ID, START);

it('signs the id and the time, and the link lands on the schedule page', () => {
  expect(t()).toMatch(/^[0-9a-f]{64}$/);
  expect(acceptToken(ID, START, 'other-secret')).not.toBe(t());
  expect(acceptToken(ID, '2026-11-18T17:00:00.000Z')).not.toBe(t());
  const u = new URL(acceptUrl('https://hire.refactored.ai', { id: ID, talentSlug: 'ann-lee', start: new Date(START) }));
  expect(u.pathname).toBe('/talent/ann-lee/schedule/');
  expect(u.searchParams.get('t')).toBe(t());
});

it('previews a valid link without changing anything', async () => {
  expect(await readProposal(ID, t(), NOW)).toEqual({ status: 'open', http: 200, talentSlug: 'ann-lee', startsAt: START, minutes: 20, format: 'intro' });
  expect(updates()).toHaveLength(0);
});

it('confirms on the POST, with the status and the signed time both in the WHERE', async () => {
  expect(await acceptProposedTime(ID, t(), NOW)).toMatchObject({ status: 'confirmed', http: 200 });
  const [sql, opts] = updates()[0];
  expect(sql).toMatch(/status = 'rescheduled' AND starts_at = \$2/);
  expect(opts.bind).toEqual([ID, new Date(START)]);
});

it('is a 404 for a wrong, malformed or stale token, and for a made-up id', async () => {
  expect((await acceptProposedTime(ID, 'f'.repeat(64), NOW)).status).toBe('invalid');
  expect((await acceptProposedTime(ID, 'nope', NOW)).status).toBe('invalid');
  row.starts_at = '2026-11-19T16:30:00.000Z'; // the candidate moved it again
  expect((await acceptProposedTime(ID, t(), NOW)).status).toBe('invalid');
  expect((await acceptProposedTime('not-a-uuid', t(), NOW)).status).toBe('invalid');
  expect(updates()).toHaveLength(0);
});

it('is harmless twice, and refuses a time that has passed or is no longer on offer', async () => {
  row.status = 'confirmed';
  expect((await acceptProposedTime(ID, t(), NOW)).status).toBe('already');
  row.status = 'declined';
  expect((await acceptProposedTime(ID, t(), NOW)).status).toBe('gone');
  row.status = 'rescheduled';
  expect((await acceptProposedTime(ID, t(), new Date('2026-11-19T00:00:00Z'))).status).toBe('gone');
  expect(updates()).toHaveLength(0);
});
