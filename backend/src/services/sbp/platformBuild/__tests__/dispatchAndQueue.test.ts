/**
 * dispatch: bounded retries, the right error classes, never throws.
 * queue: the five ways publish's call can end, and the run state each one leaves.
 */
jest.mock('../runStore', () => ({
  queueRun: jest.fn(),
  countFailedRuns: jest.fn(),
  transitionRun: jest.fn(async () => true),
  failStaleRuns: jest.fn(async () => 0),
}));
jest.mock('../../../../config/env', () => ({
  env: { sbpPlatformBuild: 'all', platformBuildRepo: 'o/r', platformBuildWorkflow: 'platform-build-runner.yml' },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const runStore = require('../runStore') as { queueRun: jest.Mock; countFailedRuns: jest.Mock; transitionRun: jest.Mock; failStaleRuns: jest.Mock };
const { env } = require('../../../../config/env') as { env: { sbpPlatformBuild: string } };
import { dispatchRun } from '../dispatch';

const noSleep = async () => undefined;
const cfg = { repo: 'o/r', workflowFile: 'platform-build-runner.yml', token: 't' };

describe('dispatchRun', () => {
  it('succeeds on 204 and sends only the run id', async () => {
    const f = jest.fn(async () => ({ status: 204 }));
    const v = await dispatchRun('run-1', cfg, { fetchImpl: f as any, sleepImpl: noSleep });
    expect(v).toEqual({ ok: true, status: 204, attempts: 1, errorClass: null });
    const [url, init] = (f.mock.calls[0] as unknown) as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe('https://api.github.com/repos/o/r/actions/workflows/platform-build-runner.yml/dispatches');
    expect(JSON.parse(init.body)).toEqual({ ref: 'main', inputs: { run_id: 'run-1' } });
  });

  it('retries 5xx and network errors at most 3 times', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce({ status: 502 })
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ status: 204 });
    const v = await dispatchRun('r', cfg, { fetchImpl: f as any, sleepImpl: noSleep });
    expect(v.ok).toBe(true);
    expect(v.attempts).toBe(3);

    const always = jest.fn(async () => ({ status: 503 }));
    const gaveUp = await dispatchRun('r', cfg, { fetchImpl: always as any, sleepImpl: noSleep });
    expect(gaveUp).toMatchObject({ ok: false, attempts: 3, errorClass: 'UpstreamUnavailable' });
    expect(always).toHaveBeenCalledTimes(3);
  });

  it('never retries an auth or contract failure', async () => {
    const f = jest.fn(async () => ({ status: 401 }));
    expect(await dispatchRun('r', cfg, { fetchImpl: f as any, sleepImpl: noSleep })).toMatchObject({ ok: false, errorClass: 'AuthError', attempts: 1 });
    const g = jest.fn(async () => ({ status: 404 }));
    expect(await dispatchRun('r', cfg, { fetchImpl: g as any, sleepImpl: noSleep })).toMatchObject({ errorClass: 'ContractViolation' });
  });

  it('refuses without a token and classifies a timeout', async () => {
    expect(await dispatchRun('r', { ...cfg, token: '' })).toMatchObject({ ok: false, attempts: 0, errorClass: 'AuthError' });
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const t = jest.fn(async () => { throw abort; });
    expect(await dispatchRun('r', cfg, { fetchImpl: t as any, sleepImpl: noSleep })).toMatchObject({ errorClass: 'TimeoutError' });
  });
});

describe('queuePlatformBuild', () => {
  const input = { projectId: 'p', enrollmentId: 'e', planVersion: 2, planSha256: 'sha', correlationId: 'c' };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { queuePlatformBuild } = require('../queue') as typeof import('../queue');
  const realFetch = global.fetch;

  beforeEach(() => {
    runStore.queueRun.mockReset();
    runStore.countFailedRuns.mockReset().mockResolvedValue(0);
    runStore.transitionRun.mockReset().mockResolvedValue(true);
    env.sbpPlatformBuild = 'all';
    process.env.GITHUB_TOKEN = 'gh';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  it('does nothing when the flag does not cover the enrollment', async () => {
    env.sbpPlatformBuild = 'off';
    expect(await queuePlatformBuild(input)).toBe('flag_off');
    expect(runStore.queueRun).not.toHaveBeenCalled();
    env.sbpPlatformBuild = 'someone-else';
    expect(await queuePlatformBuild(input)).toBe('flag_off');
  });

  it('does not start a second run when one is live (republish is idempotent)', async () => {
    runStore.queueRun.mockResolvedValue({ run: null, created: false });
    expect(await queuePlatformBuild(input)).toBe('already_built_or_running');
    expect(runStore.transitionRun).not.toHaveBeenCalled();
  });

  it('stops after three failed runs', async () => {
    runStore.countFailedRuns.mockResolvedValue(3);
    expect(await queuePlatformBuild(input)).toBe('attempts_exhausted');
    expect(runStore.queueRun).not.toHaveBeenCalled();
  });

  it('dispatches and marks the run dispatched', async () => {
    runStore.queueRun.mockResolvedValue({ run: { id: 'run-9' }, created: true });
    global.fetch = jest.fn(async () => ({ status: 204 })) as any;
    expect(await queuePlatformBuild(input)).toBe('dispatched');
    expect(runStore.transitionRun).toHaveBeenCalledWith('run-9', ['queued'], 'dispatched');
  });

  it('marks the run failed with an error class when dispatch fails', async () => {
    runStore.queueRun.mockResolvedValue({ run: { id: 'run-9' }, created: true });
    global.fetch = jest.fn(async () => ({ status: 403 })) as any;
    expect(await queuePlatformBuild(input)).toBe('dispatch_failed');
    expect(runStore.transitionRun).toHaveBeenCalledWith('run-9', ['queued'], 'failed', expect.objectContaining({ errorClass: 'AuthError' }));
  });

  it('clears a stuck run before queueing, so one lost dispatch cannot block the project forever', async () => {
    runStore.failStaleRuns.mockResolvedValueOnce(1);
    runStore.queueRun.mockResolvedValue({ run: { id: 'run-10' }, created: true });
    global.fetch = jest.fn(async () => ({ status: 204 })) as any;
    expect(await queuePlatformBuild(input)).toBe('dispatched');
    expect(runStore.failStaleRuns.mock.invocationCallOrder[0]).toBeLessThan(runStore.queueRun.mock.invocationCallOrder[0]);
  });

  it('never throws, even when the database does', async () => {
    runStore.countFailedRuns.mockRejectedValue(new Error('db down'));
    expect(await queuePlatformBuild(input)).toBe('error');
  });
});
