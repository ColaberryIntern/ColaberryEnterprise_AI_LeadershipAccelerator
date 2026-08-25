import type * as adminApi from '../../../services/caseStudyAdminApi';
import {
  CASE_STUDY_ID, SNAPSHOT_DRAFT_ID, SNAPSHOT_PUBLISHED_ID, detailFixture, previewFixture,
  repositoriesFixture, snapshotFixture, summaryFixture, syncResultFixture, syncRunsFixture,
} from './caseStudyAdminFixtures';

/**
 * The happy-path answer for every call the Case Study admin pages make.
 *
 * A suite installs these and then overrides only the ONE call it is about, so a
 * test that fails does so because of the behaviour it names rather than because
 * an unrelated auto-mock resolved `undefined`. `publishBlockersFrom` in
 * particular must return an array by default: the detail page reads `.length`
 * off it on every refused publish, and an auto-mocked `undefined` would throw a
 * TypeError that looks nothing like the bug it is hiding.
 */
export function installCaseStudyApiMocks(api: jest.Mocked<typeof adminApi>): void {
  api.listCaseStudies.mockResolvedValue({
    items: [summaryFixture()], total: 1, limit: 25, offset: 0,
  });
  api.getCaseStudy.mockResolvedValue(detailFixture());
  api.listCaseStudyRepositories.mockResolvedValue(repositoriesFixture());
  api.previewCaseStudy.mockResolvedValue(previewFixture());
  api.listCaseStudySyncRuns.mockResolvedValue({ items: syncRunsFixture(), limit: 20, offset: 0 });
  api.syncCaseStudy.mockResolvedValue(syncResultFixture());
  api.createCaseStudyFromProject.mockResolvedValue({
    caseStudy: summaryFixture(), repositories: [], warnings: [],
  });
  api.createCaseStudyFromRepositories.mockResolvedValue({
    caseStudy: summaryFixture(), repositories: repositoriesFixture(), warnings: [],
  });
  api.updateCaseStudy.mockResolvedValue(summaryFixture());
  api.archiveCaseStudy.mockResolvedValue(summaryFixture({ status: 'archived' }));
  api.applyCaseStudyOverride.mockResolvedValue({
    outcome: 'created', snapshotId: SNAPSHOT_DRAFT_ID, version: 4, contentHash: 'h4',
    path: 'identity.standfirst',
  });
  api.approveCaseStudySnapshot.mockResolvedValue({
    outcome: 'approved', snapshot: snapshotFixture(SNAPSHOT_DRAFT_ID, 3, 'approved'),
    supersededSnapshotIds: [], caseStudyStatus: 'approved',
  });
  api.publishCaseStudy.mockResolvedValue({
    outcome: 'published', publicationId: 'pub-1', caseStudyId: CASE_STUDY_ID,
    surfaceKey: 'enterprise', publishedSnapshotId: SNAPSHOT_DRAFT_ID, snapshotVersion: 3,
    publishedAt: '2026-08-21T00:00:00.000Z',
  });
  api.unpublishCaseStudy.mockResolvedValue({
    outcome: 'unpublished', publicationId: 'pub-1',
    publishedSnapshotId: SNAPSHOT_PUBLISHED_ID, unpublishedAt: '2026-08-21T00:00:00.000Z',
  });
  api.attachCaseStudyRepository.mockResolvedValue({
    repository: repositoriesFixture()[0], collectionId: 'col-1', created: true,
  });
  api.setCaseStudyRepositoryRole.mockResolvedValue(repositoriesFixture()[0]);
  api.removeCaseStudyRepository.mockResolvedValue({ removed: true });
  api.publishBlockersFrom.mockReturnValue([]);
  api.describeApiError.mockReturnValue('Could not load Case Studies (HTTP 500).');
}
