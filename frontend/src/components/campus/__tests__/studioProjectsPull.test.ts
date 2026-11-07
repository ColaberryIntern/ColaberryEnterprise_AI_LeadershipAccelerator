/**
 * C124: the Project Studio room pulls the learner's builds from the server when it opens (pull only, never the push half), so a
 * browser that never opened /portal/projects no longer shows just the training sample. One pull per cache window; a failed pull
 * is not remembered, so the next open tries again.
 */
import * as fs from 'fs';
import * as path from 'path';
import { refreshStudioProjects, clearSummaryCache } from '../interior/usePageSummary';
import { refreshProjectsFromBackend, syncProjectsWithBackend } from '../../../pages/portal/projects/projectSync';

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../../../pages/portal/projects/projectSync', () => ({
  refreshProjectsFromBackend: jest.fn(),
  syncProjectsWithBackend: jest.fn(),
}));

const pull = refreshProjectsFromBackend as jest.Mock;
const fullSync = syncProjectsWithBackend as jest.Mock;

beforeEach(() => { clearSummaryCache(); pull.mockReset(); fullSync.mockReset(); });

describe('Project Studio pulls the real builds (C124)', () => {
  it('opening the room pulls once; a second open inside the cache window does not pull again', async () => {
    pull.mockResolvedValue(undefined);
    await refreshStudioProjects();
    await refreshStudioProjects();
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it('a failed pull is not remembered: the next open tries again', async () => {
    pull.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    await expect(refreshStudioProjects()).rejects.toThrow('offline');
    await refreshStudioProjects();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it('never runs the push half (the full sync mirrors this device over the server)', async () => {
    pull.mockResolvedValue(undefined);
    await refreshStudioProjects();
    expect(fullSync).not.toHaveBeenCalled();
  });

  it('the studio room effect calls the pull when the room opens', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'interior', 'usePageSummary.ts'), 'utf8');
    const effect = src.slice(src.indexOf("id !== 'studio'"), src.indexOf("id !== 'studio'") + 400);
    expect(effect).toContain('refreshStudioProjects()');
  });
});
