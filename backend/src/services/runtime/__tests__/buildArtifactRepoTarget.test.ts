/**
 * A build artifact syncs to the repo of the student's ACTIVE build.
 *
 * The lookup was `Project.findOne({ where: { enrollment_id } })` — no order, no
 * archived filter. With one project per student that is right by accident; with
 * two it returns whichever row the database hands back first, so a learner's
 * weekly artifact could land in the other build's repo, or in an archived
 * project that has none. Found 2026-09-28, when a learner starting his second
 * project asked whether it should have its own repo. It should, which is the
 * moment an arbitrary pick starts costing someone their evidence.
 */
const mockGetProjectByEnrollment = jest.fn();
const mockSyncArtifactsToRepo = jest.fn();
const mockProjectFindOne = jest.fn();

jest.mock('../../projectService', () => ({ getProjectByEnrollment: (...a: any[]) => mockGetProjectByEnrollment(...a) }));
jest.mock('../../artifacts/artifactRepoSync', () => ({ syncArtifactsToRepo: (...a: any[]) => mockSyncArtifactsToRepo(...a) }));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockProjectFindOne(...a) } }));

import { syncArtifactsForEnrollment } from '../buildArtifactService';

describe('which repo a build artifact syncs to', () => {
  beforeEach(() => {
    mockGetProjectByEnrollment.mockReset();
    mockSyncArtifactsToRepo.mockReset();
    mockProjectFindOne.mockReset();
  });

  it('syncs to the ACTIVE project, and never reaches for an arbitrary row', async () => {
    mockGetProjectByEnrollment.mockResolvedValue({ id: 'active-project' });
    mockSyncArtifactsToRepo.mockResolvedValue({ outcome: 'written', repo: { owner: 'learner', name: 'second-build' } });

    const out = await syncArtifactsForEnrollment('enr-1');

    expect(mockGetProjectByEnrollment).toHaveBeenCalledWith('enr-1');
    expect(mockSyncArtifactsToRepo).toHaveBeenCalledWith('active-project');
    expect(mockProjectFindOne).not.toHaveBeenCalled();
    expect(out).toEqual({ outcome: 'written', reason: undefined, repo: { owner: 'learner', name: 'second-build' } });
  });

  it('says there is no repo, rather than throwing, when the student has no project', async () => {
    mockGetProjectByEnrollment.mockResolvedValue(null);
    await expect(syncArtifactsForEnrollment('enr-2')).resolves.toEqual({ outcome: 'no_repo', reason: 'No project yet.' });
    expect(mockSyncArtifactsToRepo).not.toHaveBeenCalled();
  });

  it('carries the repo and reason through, so the upload can offer the fix', async () => {
    mockGetProjectByEnrollment.mockResolvedValue({ id: 'p1' });
    mockSyncArtifactsToRepo.mockResolvedValue({ outcome: 'no_access', reason: 'cannot push', repo: { owner: 'o', name: 'r' } });
    await expect(syncArtifactsForEnrollment('enr-3')).resolves.toEqual({ outcome: 'no_access', reason: 'cannot push', repo: { owner: 'o', name: 'r' } });
  });

  it('a lookup failure is reported, never thrown at the student mid-upload', async () => {
    mockGetProjectByEnrollment.mockRejectedValue(new Error('db down'));
    await expect(syncArtifactsForEnrollment('enr-4')).resolves.toEqual({ outcome: 'failed' });
  });
});
