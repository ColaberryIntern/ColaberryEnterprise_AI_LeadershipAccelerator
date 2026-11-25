/** L13.7: when the demo starts, when it is tried again, and what a person is told. */
const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
const mockUpdate = jest.fn();
const mockStart = jest.fn();
const mockStatus = jest.fn();
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a), findAll: (...a: any[]) => mockFindAll(...a), update: (...a: any[]) => mockUpdate(...a) },
}));
jest.mock('../../sbp/clientDemo', () => ({ startClientDemo: (...a: any[]) => mockStart(...a), clientDemoStatus: (...a: any[]) => mockStatus(...a) }));

import { Op } from 'sequelize';
import { DEMO_LOOKBACK_MS, MAX_DEMO_ATTEMPTS, MAX_DEMO_FAILURES, RETRY_AFTER_MS, clientDemoView, demoDue, startDemoOnce, syncClientDemos } from '../enterpriseIntakeDemo';

const NOW = new Date('2026-11-25T20:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const row = (over: Record<string, any> = {}): any => ({
  id: 'i-1', understanding_id: 'u-1', interviewed_at: ago(60_000), demo_started_at: null, demo_attempts: 0, demo_failures: 0,
  demo_reason: null, demo_attempted_at: null, signed_at: null, lost_at: null, ...over,
});
const last = () => mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0];

beforeEach(() => {
  jest.resetAllMocks();
  mockUpdate.mockResolvedValue([1]);
  mockStart.mockResolvedValue({ ok: true, projectId: 'p-1', reused: false });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('due', () => {
  it.each(Object.entries(RETRY_AFTER_MS))('%s is retried, but only after its wait', (reason, wait) => {
    expect(demoDue(row({ demo_reason: reason, demo_attempts: 1, demo_attempted_at: ago(wait! - 1) }), NOW)).toBe(false);
    expect(demoDue(row({ demo_reason: reason, demo_attempts: 1, demo_attempted_at: ago(wait!) }), NOW)).toBe(true);
  });

  it.each(['too_thin', 'not_found', 'not_extracted', 'not_confirmed', 'something_new'])('%s is never retried', (reason) => {
    expect(demoDue(row({ demo_reason: reason, demo_attempts: 1, demo_attempted_at: ago(DEMO_LOOKBACK_MS) }), NOW)).toBe(false);
  });

  it.each([
    ['at the attempt limit', { demo_attempts: MAX_DEMO_ATTEMPTS }],
    ['at the failure limit', { demo_failures: MAX_DEMO_FAILURES }],
    ['older than the window', { interviewed_at: ago(DEMO_LOOKBACK_MS + 1) }],
    ['already started', { demo_started_at: NOW }],
    ['signed', { signed_at: NOW }],
    ['lost', { lost_at: NOW }],
    ['no interview', { interviewed_at: null }],
    ['no understanding', { understanding_id: null }],
  ] as Array<[string, Record<string, any>]>)('not when %s', (_n, over) => {
    expect(demoDue(row(over), NOW)).toBe(false);
  });

  it('inside the window and under the limits it is', () => {
    expect(demoDue(row({ interviewed_at: ago(DEMO_LOOKBACK_MS), demo_attempts: MAX_DEMO_ATTEMPTS - 1, demo_failures: MAX_DEMO_FAILURES - 1 }), NOW)).toBe(true);
  });

  it('the waits let an off switch be retried through the whole window', () => {
    expect(RETRY_AFTER_MS.off! * MAX_DEMO_ATTEMPTS).toBeGreaterThanOrEqual(DEMO_LOOKBACK_MS);
  });
});

describe('startDemoOnce', () => {
  it('claims first, then starts, then records it, with no link stored', async () => {
    mockFindByPk.mockResolvedValue(row());
    expect(await startDemoOnce('i-1', NOW)).toBe('started');
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ demo_claimed_at: NOW, demo_attempts: 1 });
    expect(mockUpdate.mock.calls[0][1].where).toMatchObject({ id: 'i-1', demo_started_at: null, demo_attempts: 0 });
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockStart.mock.invocationCallOrder[0]);
    expect(last()).toEqual({ demo_started_at: NOW, demo_claimed_at: null, demo_reason: null, demo_error: null });
  });

  it('a lost claim starts nothing', async () => {
    mockFindByPk.mockResolvedValue(row());
    mockUpdate.mockResolvedValue([0]);
    expect(await startDemoOnce('i-1', NOW)).toBe('claimed_elsewhere');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('stores a refusal and its reason, and it is not a failure', async () => {
    mockFindByPk.mockResolvedValue(row());
    mockStart.mockResolvedValue({ ok: false, reason: 'daily_cap', error: 'cap' });
    expect(await startDemoOnce('i-1', NOW)).toBe('refused');
    expect(last()).toEqual({ demo_claimed_at: null, demo_reason: 'daily_cap', demo_error: 'cap', demo_failures: 0 });
  });

  it('a throw is a stored failure, and the last one is a dead letter', async () => {
    mockFindByPk.mockResolvedValue(row({ demo_failures: MAX_DEMO_FAILURES - 1 }));
    mockStart.mockRejectedValue(new Error('boom'));
    expect(await startDemoOnce('i-1', NOW)).toBe('failed');
    expect(last()).toMatchObject({ demo_reason: 'failed', demo_error: 'boom', demo_failures: MAX_DEMO_FAILURES });
    expect(JSON.parse((console.error as jest.Mock).mock.calls[0][0]).event).toBe('enterprise_intake_dead_letter');
  });

  it('says so when there is no such intake', async () => {
    mockFindByPk.mockResolvedValue(null);
    expect(await startDemoOnce('x', NOW)).toBe('missing');
  });
});

describe('the sweep', () => {
  const serve = (rows: any[]) => {
    mockFindAll.mockResolvedValue(rows);
    mockFindByPk.mockImplementation(async (id: string) => rows.find((r) => r.id === id));
  };

  it('asks only for recent, open, unstarted, retryable interviews', async () => {
    serve([]);
    await syncClientDemos(50, NOW);
    const w = mockFindAll.mock.calls[0][0].where;
    expect(w).toMatchObject({ demo_started_at: null, signed_at: null, lost_at: null });
    expect(w.interviewed_at[Op.gte]).toEqual(ago(DEMO_LOOKBACK_MS));
    expect(w.demo_reason[Op.or][1][Op.in].sort()).toEqual(['daily_cap', 'failed', 'not_configured', 'off']);
  });

  it('starts at most one new build a run', async () => {
    serve([row({ id: 'a' }), row({ id: 'b' })]);
    expect(await syncClientDemos(50, NOW)).toEqual({ started: 1, refused: 0, failed: 0 });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('skips what is not due, and one that throws does not stop the next', async () => {
    serve([row({ id: 'old', interviewed_at: ago(DEMO_LOOKBACK_MS + 1) }), row({ id: 'thin', demo_reason: 'too_thin' }), row({ id: 'a' }), row({ id: 'b' })]);
    mockUpdate.mockRejectedValueOnce(new Error('db'));
    expect(await syncClientDemos(50, NOW)).toEqual({ started: 1, refused: 0, failed: 1 });
    expect(mockFindByPk.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });
});

describe('what a person is told', () => {
  const S = (over: any) => mockStatus.mockResolvedValue({ state: 'none', project_id: null, command_center_url: null, demo_url: null, link_expires_at: null, ...over });

  it('ready: absolute links, read for this call', async () => {
    S({ state: 'ready', command_center_url: '/api/platform-view/t/', demo_url: '/api/platform-view/t/demo/', link_expires_at: 'T' });
    expect(await clientDemoView(row(), NOW)).toEqual({
      state: 'ready', message: 'The Command Center and demo are ready to show.', linkExpiresAt: 'T',
      commandCenterUrl: 'https://enterprise.colaberry.ai/api/platform-view/t/', demoUrl: 'https://enterprise.colaberry.ai/api/platform-view/t/demo/',
    });
  });

  it('ready without a demo page says so', async () => {
    S({ state: 'ready', command_center_url: '/cc/' });
    expect(await clientDemoView(row(), NOW)).toMatchObject({ state: 'ready', demoUrl: null, message: expect.stringContaining('demo page did not build') });
  });

  it.each(['planning', 'building', 'failed'])('%s carries no links', async (state) => {
    S({ state });
    expect(await clientDemoView(row({ demo_started_at: NOW }), NOW)).toMatchObject({ state, commandCenterUrl: null, demoUrl: null });
  });

  it.each([
    ['off', /switched off.*tried again automatically/],
    ['not_configured', /enrollment.*tried again/],
    ['daily_cap', /daily limit.*tried again/],
    ['failed', /could not be started.*It will be tried again/],
    ['too_thin', /not give us enough.*will not be tried again/],
    ['not_found', /could not be found.*will not/],
    ['not_extracted', /not finished.*will not/],
    ['not_confirmed', /not been confirmed.*will not/],
  ] as Array<[string, RegExp]>)('refused %s, in plain words', async (reason, words) => {
    S({});
    const v = await clientDemoView(row({ demo_reason: reason, demo_attempts: 1, demo_attempted_at: NOW }), NOW);
    expect(v.state).toBe('refused');
    expect(v.message).toMatch(words);
  });

  it('never promises a retry once the limit is reached', async () => {
    S({});
    expect((await clientDemoView(row({ demo_reason: 'off', demo_attempts: MAX_DEMO_ATTEMPTS }), NOW)).message).toContain('will not be tried again');
  });

  it('waiting, no interview, an old interview and a lost project', async () => {
    S({});
    expect((await clientDemoView(row(), NOW)).state).toBe('waiting');
    expect((await clientDemoView(row({ interviewed_at: null }), NOW)).state).toBe('no_interview');
    expect((await clientDemoView(row({ interviewed_at: ago(DEMO_LOOKBACK_MS + 1) }), NOW)).state).toBe('refused');
    expect((await clientDemoView(row({ demo_started_at: NOW }), NOW)).state).toBe('failed');
  });

  it('a status that cannot be read never throws', async () => {
    mockStatus.mockRejectedValue(new Error('down'));
    expect((await clientDemoView(row(), NOW)).state).toBe('unknown');
  });
});
