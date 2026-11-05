/**
 * captureStoryArtifact — pure helpers (demo-URL allowlist, story→requirement id), demo validation, idempotent
 * capture (skips an already-captured story+commit), and the enqueue no-op for a project with no demo. Playwright,
 * fs and the models are mocked.
 */
const artFindOne = jest.fn();
const artFindByPk = jest.fn();
const artCreate = jest.fn();
const demoFindByPk = jest.fn();
const demoUpsert = jest.fn();
const launchMock = jest.fn();
const gotoMock = jest.fn();
const screenshotMock = jest.fn();
const writeFileMock = jest.fn();

jest.mock('../../../../models/GovBuildArtifact', () => ({ __esModule: true, default: { findOne: (...a: any[]) => artFindOne(...a), findByPk: (...a: any[]) => artFindByPk(...a), create: (...a: any[]) => artCreate(...a) } }));
jest.mock('../../../../models/GovBuildDemo', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => demoFindByPk(...a), upsert: (...a: any[]) => demoUpsert(...a) } }));
jest.mock('../../../../config/upload', () => ({ GOV_BUILD_ARTIFACT_DIR: '/tmp/gov-artifacts' }));
jest.mock('../../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('fs/promises', () => ({ __esModule: true, default: { mkdir: (...a: any[]) => Promise.resolve(), writeFile: (...a: any[]) => writeFileMock(...a) }, mkdir: () => Promise.resolve(), writeFile: (...a: any[]) => writeFileMock(...a) }));
jest.mock('playwright', () => ({ chromium: { launch: (...a: any[]) => launchMock(...a) } }));

import { isAllowedDemoUrl, requirementIdsFromStoryId, setGovBuildDemo, captureOneStoryArtifact, enqueueStoryArtifactCaptures, GovBuildDemoError } from '../captureStoryArtifact';

beforeEach(() => {
  jest.clearAllMocks();
  writeFileMock.mockResolvedValue(undefined);
  screenshotMock.mockResolvedValue(Buffer.from('PNGDATA'));
  gotoMock.mockResolvedValue(undefined);
  launchMock.mockResolvedValue({ newContext: async () => ({ newPage: async () => ({ goto: gotoMock, screenshot: screenshotMock }) }), close: async () => {} });
});

describe('pure helpers', () => {
  it('isAllowedDemoUrl: https + allowlisted host (and subdomains) only', () => {
    expect(isAllowedDemoUrl('https://saratoga-demo.colaberry.dev/')).toBe(true);
    expect(isAllowedDemoUrl('https://app.refactored.ai/x')).toBe(true);
    expect(isAllowedDemoUrl('http://saratoga-demo.colaberry.dev/')).toBe(false); // not https
    expect(isAllowedDemoUrl('https://evil.com/')).toBe(false); // host not allowed
    expect(isAllowedDemoUrl('not a url')).toBe(false);
  });
  it('requirementIdsFromStoryId strips the STORY- prefix', () => {
    expect(requirementIdsFromStoryId('STORY-REQ-7')).toEqual(['REQ-7']);
    expect(requirementIdsFromStoryId('')).toEqual([]);
  });
});

describe('setGovBuildDemo validation', () => {
  it('rejects a non-https url', async () => {
    await expect(setGovBuildDemo('dp-1', { demoUrl: 'http://x.colaberry.dev' })).rejects.toMatchObject({ reason: 'not_https' });
  });
  it('rejects a host not on the allowlist', async () => {
    await expect(setGovBuildDemo('dp-1', { demoUrl: 'https://evil.com' })).rejects.toMatchObject({ reason: 'host_not_allowed' });
  });
  it('upserts a valid demo url', async () => {
    demoUpsert.mockResolvedValue([{}, true]);
    await setGovBuildDemo('dp-1', { demoUrl: 'https://saratoga-demo.colaberry.dev', identityId: 'a' });
    expect(demoUpsert).toHaveBeenCalledWith(expect.objectContaining({ delivery_project_id: 'dp-1', demo_url: 'https://saratoga-demo.colaberry.dev' }));
  });
});

describe('captureOneStoryArtifact', () => {
  it('is idempotent — an already-captured (story, commit) is skipped without launching the browser', async () => {
    artFindOne.mockResolvedValue({ id: 'a1', status: 'captured' });
    const r = await captureOneStoryArtifact('dp-1', 'STORY-REQ-1', 'abc123');
    expect(r.status).toBe('skipped');
    expect(launchMock).not.toHaveBeenCalled();
  });
  it('captures fresh: navigates the demo, writes the PNG, and inserts a captured row', async () => {
    artFindOne.mockResolvedValue(null);
    demoFindByPk.mockResolvedValue({ demo_url: 'https://saratoga-demo.colaberry.dev', capture_root: '/dashboard', story_capture_paths: {} });
    artCreate.mockResolvedValue({ id: 'a2' });
    const r = await captureOneStoryArtifact('dp-1', 'STORY-REQ-1', 'abc123');
    expect(r.status).toBe('captured');
    expect(gotoMock).toHaveBeenCalledWith('https://saratoga-demo.colaberry.dev/dashboard', expect.objectContaining({ timeout: expect.any(Number) }));
    expect(writeFileMock).toHaveBeenCalled();
    expect(artCreate).toHaveBeenCalledWith(expect.objectContaining({ story_id: 'STORY-REQ-1', requirement_ids: ['REQ-1'], status: 'captured' }));
  });
  it('skips when the project has no demo configured', async () => {
    artFindOne.mockResolvedValue(null);
    demoFindByPk.mockResolvedValue(null);
    const r = await captureOneStoryArtifact('dp-1', 'STORY-REQ-1', 'abc123');
    expect(r.status).toBe('skipped');
    expect(launchMock).not.toHaveBeenCalled();
  });
});

describe('enqueueStoryArtifactCaptures', () => {
  it('is a no-op for a project with no demo (safe to call for any verified story)', async () => {
    demoFindByPk.mockResolvedValue(null);
    await enqueueStoryArtifactCaptures('dp-1', [{ storyId: 'STORY-REQ-1', commitSha: 'abc' }]);
    expect(launchMock).not.toHaveBeenCalled();
    expect(artCreate).not.toHaveBeenCalled();
  });
});
