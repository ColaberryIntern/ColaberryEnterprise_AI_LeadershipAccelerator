const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../ccppSource', () => ({ fetchCcppInterviews: jest.fn() }));
jest.mock('../jdQuestions', () => ({ questionsFromJd: jest.fn() }));

import { CCPP_OFF_KEY, CCPP_USERS_KEY, ccppType, linkCcppInterviews, linkCcppOnOpen, mappedUser, resetCcppThrottle } from '../ccppInterviews';
import type { CcppInterview } from '../ccppSource';

const iv = (o: Partial<CcppInterview> = {}): CcppInterview => ({ id: 7, company: 'Northwind', role: 'AI Engineer', jd: 'x'.repeat(80), typeId: 2, cancelled: false, startsLocal: '2026-12-01T10:30:00', ...o });
const settings = (o: Record<string, unknown> = {}) => jest.fn(async (k: string) => o[k] ?? null);
const tick = () => new Promise((r) => setTimeout(r, 0));
let inserted = true;

beforeEach(() => {
  resetCcppThrottle();
  inserted = true;
  mockQuery.mockReset().mockImplementation(async (s: string) => {
    if (/FROM enrollments/.test(s)) return [[{ email: ' S@Example.com ' }]];
    if (/INSERT INTO career_interviews/.test(s)) return [[{ id: 'c1', inserted }]];
    if (/DELETE FROM career_interviews/.test(s)) return [[{ id: 'c1' }]];
    return [[]];
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('matches by the enrollment email, links what it finds and writes questions for a NEW interview only', async () => {
  const fetch = jest.fn(async () => [iv()]);
  const questions = jest.fn(async () => ['Q1']);
  expect(await linkCcppInterviews('e1', { fetch, read: settings(), questions })).toEqual({ added: 1, updated: 0, removed: 0 });
  expect(fetch).toHaveBeenCalledWith({ email: 'S@Example.com' });
  await tick();
  expect(questions).toHaveBeenCalledWith(expect.any(String), 'AI Engineer', 'technical');
  inserted = false;
  expect(await linkCcppInterviews('e1', { fetch, read: settings(), questions })).toEqual({ added: 0, updated: 1, removed: 0 });
  await tick();
  expect(questions).toHaveBeenCalledTimes(1);
});
it('a mapped CCPP user id wins over the email; a malformed map is ignored', async () => {
  const fetch = jest.fn(async () => []);
  await linkCcppInterviews('e1', { fetch, read: settings({ [CCPP_USERS_KEY]: { e1: 42 } }) });
  expect(fetch).toHaveBeenLastCalledWith({ userId: 42 });
  for (const bad of [null, 'x', [42], { e1: '42' }, { e1: -1 }, { e1: 1.5 }]) expect(mappedUser(bad, 'e1')).toBeNull();
});
it('a cancelled interview is removed, only for this student and only without a plan', async () => {
  expect(await linkCcppInterviews('e1', { fetch: async () => [iv({ cancelled: true })], read: settings() })).toEqual({ added: 0, updated: 0, removed: 1 });
  const del = mockQuery.mock.calls.find((c) => /DELETE/.test(c[0]))!;
  expect(del[0]).toMatch(/enrollment_id = :e[\s\S]*NOT EXISTS \(SELECT 1 FROM prep_plans/);
  expect(del[1]).toEqual({ replacements: { c: 7, e: 'e1' } });
});
it('blank fields get plain words; a short job description asks for no questions', async () => {
  const questions = jest.fn();
  await linkCcppInterviews('e1', { fetch: async () => [iv({ company: ' ', role: null, jd: 'short', typeId: 1 })], read: settings(), questions });
  const ins = mockQuery.mock.calls.find((c) => /INSERT INTO career_interviews/.test(c[0]))!;
  expect(ins[1].replacements).toMatchObject({ company: 'An employer', role: 'Interview', type: 'recruiter', start: '2026-12-01T10:30:00' });
  await tick();
  expect(questions).not.toHaveBeenCalled();
  expect(ccppType(null)).toBe('technical');
});
it('the kill switch stops it before CCPP is touched', async () => {
  const fetch = jest.fn();
  await linkCcppInterviews('e1', { fetch, read: settings({ [CCPP_OFF_KEY]: true }) });
  expect(fetch).not.toHaveBeenCalled();
});
it('questions failing never fails the link', async () => {
  const questions = jest.fn(async () => { throw new Error('model down'); });
  expect((await linkCcppInterviews('e1', { fetch: async () => [iv()], read: settings(), questions })).added).toBe(1);
  await tick();
  expect(console.warn).toHaveBeenCalled();
});

describe('on open', () => {
  it('runs at most once per 10 minutes per student', async () => {
    const fetch = jest.fn(async () => []);
    const d = { fetch, read: settings() };
    await linkCcppOnOpen('e1', d, 0);
    await linkCcppOnOpen('e1', d, 9 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await linkCcppOnOpen('e2', d, 0);
    await linkCcppOnOpen('e1', d, 10 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('CCPP down: never throws, logged, tried again after 2 minutes', async () => {
    const fetch = jest.fn(async () => { throw Object.assign(new Error('no'), { name: 'ConnectionError' }); });
    const d = { fetch, read: settings() };
    await expect(linkCcppOnOpen('e1', d, 0)).resolves.toBeUndefined();
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('ConnectionError');
    await linkCcppOnOpen('e1', d, 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await linkCcppOnOpen('e1', d, 120_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('CCPP hanging holds a page at most 4 seconds', async () => {
    jest.useFakeTimers();
    try {
      const p = linkCcppOnOpen('e1', { fetch: () => new Promise(() => undefined), read: settings() }, 0);
      await jest.advanceTimersByTimeAsync(4000);
      await expect(p).resolves.toBeUndefined();
    } finally { jest.useRealTimers(); }
  });
});
