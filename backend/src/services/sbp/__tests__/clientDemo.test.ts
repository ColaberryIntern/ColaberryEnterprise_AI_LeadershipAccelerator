/**
 * The client door: refuses before spending, starts once, reports honestly.
 */
const mockEnv = { sbpPlatformBuild: 'on', platformBuildDailyMax: 5, platformBuildClientEnrollment: 'enr-1' };
jest.mock('../../../config/env', () => ({ env: mockEnv }));
const mockRuns = jest.fn();
jest.mock('../platformBuild/queue', () => ({ platformBuildOn: () => mockEnv.sbpPlatformBuild === 'on', runsInLastDay: () => mockRuns() }));
const mockView = jest.fn();
jest.mock('../platformBuild/portalView', () => ({ platformBuildForPortal: (...a: unknown[]) => mockView(...a) }));
const mockStart = jest.fn();
jest.mock('../../delivery/buildFromUnderstanding', () => ({ startBuildFromUnderstanding: (...a: unknown[]) => mockStart(...a) }));
const mockFind = jest.fn();
jest.mock('../../../models/ProjectUnderstandingRecord', () => ({ __esModule: true, default: { findByPk: (...a: unknown[]) => mockFind(...a) } }));
const mockIntake = jest.fn();
jest.mock('../planStore', () => ({ getIntake: (...a: unknown[]) => mockIntake(...a) }));

import { startClientDemo, clientDemoStatus, clientDemosLeft } from '../clientDemo';

const U = { understandingId: 'u-1' };
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockEnv, { sbpPlatformBuild: 'on', platformBuildDailyMax: 5, platformBuildClientEnrollment: 'enr-1' });
  mockRuns.mockResolvedValue(0);
  mockFind.mockResolvedValue({ build_handoff: null });
  mockStart.mockResolvedValue({ ok: true, projectId: 'p-1', reused: false });
});

describe('startClientDemo', () => {
  it('starts the one pipeline in platform mode, under the client enrollment', async () => {
    expect(await startClientDemo(U)).toEqual({ ok: true, projectId: 'p-1', reused: false });
    expect(mockStart).toHaveBeenCalledWith({ recordId: 'u-1', enrollmentId: 'enr-1', setupMode: 'platform' });
  });

  it.each([
    ['off', () => { mockEnv.sbpPlatformBuild = 'off'; }],
    ['not_configured', () => { mockEnv.platformBuildClientEnrollment = ''; }],
    ['daily_cap', () => { mockRuns.mockResolvedValue(5); }],
  ])('refuses with %s and starts nothing', async (reason, arrange) => {
    arrange();
    expect(await startClientDemo(U)).toMatchObject({ ok: false, reason });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('answers with the first project on a repeat, even at the cap', async () => {
    mockFind.mockResolvedValue({ build_handoff: { project_id: 'p-0' } });
    mockRuns.mockResolvedValue(99);
    expect(await startClientDemo(U)).toEqual({ ok: true, projectId: 'p-0', reused: true });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('starts once when called twice at the same moment', async () => {
    await Promise.all([startClientDemo(U), startClientDemo(U)]);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('passes a refusal through', async () => {
    mockStart.mockResolvedValue({ ok: false, reason: 'too_thin', error: 'x' });
    expect(await startClientDemo(U)).toMatchObject({ ok: false, reason: 'too_thin' });
  });
});

describe('clientDemoStatus', () => {
  it('is none before a start', async () => {
    expect((await clientDemoStatus('u-1')).state).toBe('none');
  });

  it('gives the links when the build is ready', async () => {
    mockFind.mockResolvedValue({ build_handoff: { project_id: 'p-1' } });
    mockView.mockResolvedValue({ state: 'ready', command_center_url: '/cc/', demo_url: '/cc/demo/', link_expires_at: 'T' });
    expect(await clientDemoStatus('u-1')).toEqual({ state: 'ready', project_id: 'p-1', command_center_url: '/cc/', demo_url: '/cc/demo/', link_expires_at: 'T' });
  });

  it.each([['generating', 'planning'], ['drafted', 'planning'], ['failed', 'failed'], ['gate_failed', 'failed'], ['awaiting_repo', 'failed']])(
    'with no run, intake %s reads as %s', async (status, state) => {
      mockFind.mockResolvedValue({ build_handoff: { project_id: 'p-1' } });
      mockView.mockResolvedValue(null);
      mockIntake.mockResolvedValue({ status });
      expect((await clientDemoStatus('u-1')).state).toBe(state);
    });
});

describe('clientDemosLeft', () => {
  it('is the cap minus today, never negative, and 0 when off', async () => {
    mockRuns.mockResolvedValue(3);
    expect(await clientDemosLeft()).toBe(2);
    mockRuns.mockResolvedValue(9);
    expect(await clientDemosLeft()).toBe(0);
    mockEnv.sbpPlatformBuild = 'off';
    expect(await clientDemosLeft()).toBe(0);
  });
});

describe('who may ask for a paid build', () => {
  it('only clientDemo.ts names platform mode; no route or student service does', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = path.resolve(__dirname, '../../..');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.ts') && /setupMode: 'platform'/.test(fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) hits.push(path.relative(src, full).split(path.sep).join('/'));
      }
    };
    walk(src);
    expect(hits).toEqual(['services/sbp/clientDemo.ts']);
  });
});
