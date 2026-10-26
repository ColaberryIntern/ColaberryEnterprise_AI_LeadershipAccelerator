/**
 * govBuildCommitSync — the gov build cockpit's commit→story completion loop. The rails under test:
 *  - citedKeys matches a project's OWN requirement ids case-insensitively on id boundaries, and NEVER lets a
 *    shorter id (REQ-10) match a longer superset (REQ-100).
 *  - matchCommitsToGovStories files a cited commit as evidence for the story (via fileGithubPushEvidence, which is
 *    submitted-only — the never-self-verify rail lives there), credits the story's ASSIGNEE, SKIPS+logs a match on
 *    an unassigned story (no system identity to credit), ignores an id that is not a story in THIS project, and is
 *    idempotent (a re-filed commit counts 0).
 *  - resolveGovDeliveryProjectForRepo does the two hops repo → student project → solution_build delivery project,
 *    and fails closed to null at each.
 *
 * The real deriveGovBuildPlan runs (requirement rows carry tracks:['solution_build']), so the story ids the matcher
 * produces are the SAME STORY-<canonical_req_id> the assignment writer and projection use — the load-bearing join.
 */
const findRepoBinding = jest.fn();
const trackFindOne = jest.fn();
const reqFindAll = jest.fn();
const listBuildStoryAssignments = jest.fn();
const fileGithubPushEvidence = jest.fn();

jest.mock('../../githubIntegrationService', () => ({ __esModule: true, findRepoBinding: (...a: any[]) => findRepoBinding(...a) }));
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findOne: (...a: any[]) => trackFindOne(...a) } }));
jest.mock('../../../models/ContractRequirement', () => ({ __esModule: true, default: { findAll: (...a: any[]) => reqFindAll(...a) } }));
jest.mock('../govBuildAssignment', () => ({ __esModule: true, listBuildStoryAssignments: (...a: any[]) => listBuildStoryAssignments(...a) }));
jest.mock('../govBuildEvidence', () => ({ __esModule: true, fileGithubPushEvidence: (...a: any[]) => fileGithubPushEvidence(...a) }));
// NOTE: ./proposal/govBuildPlan is deliberately NOT mocked — the real, pure derivation runs.

import { citedKeys, matchCommitsToGovStories, resolveGovDeliveryProjectForRepo } from '../govBuildCommitSync';

// A build-signal requirement that ALREADY carries tracks:['solution_build'] (reviewer-set), so the real
// deriveGovBuildPlan keeps it as a story without re-classifying its text.
const req = (canonical: string, statement = 'The vendor shall provide an online case management system.', over: any = {}) => ({
  canonical_req_id: canonical, statement, priority: 'binding', tracks: ['solution_build'], evidence_state: 'unassessed', kind: 'requirement', ...over,
});
const commit = (sha: string, message: string, username = 'dev') => ({ sha, message, authorLogin: username });

beforeEach(() => {
  jest.clearAllMocks();
  fileGithubPushEvidence.mockResolvedValue(true); // default: a new row was created
  listBuildStoryAssignments.mockResolvedValue([]);
  reqFindAll.mockResolvedValue([]);
});

describe('citedKeys — pure id matching over a project\'s own keys', () => {
  it('matches a real id, case-insensitively, regardless of surrounding punctuation', () => {
    expect(citedKeys('Implement search [REQ-033]', ['REQ-033'])).toEqual(['REQ-033']);
    expect(citedKeys('done req-033 today', ['REQ-033'])).toEqual(['REQ-033']);     // case-insensitive
    expect(citedKeys('fixes (C.2.1) edge case', ['C.2.1'])).toEqual(['C.2.1']);    // dots are escaped, not wildcards
  });

  it('NEVER lets a shorter id match a longer superset id (the off-by-one trap)', () => {
    expect(citedKeys('done REQ-100', ['REQ-10'])).toEqual([]);   // REQ-10 must not match REQ-100
    expect(citedKeys('done REQ-10', ['REQ-10', 'REQ-100'])).toEqual(['REQ-10']); // only the exact one
  });

  it('does not treat a key as a regex (special chars are literal) and dedupes repeats', () => {
    expect(citedKeys('touches A+B and A+B again', ['A+B'])).toEqual(['A+B']);     // '+' is literal, one hit
    expect(citedKeys('no ids here', ['REQ-1'])).toEqual([]);
  });

  it('is total on empty / garbage input', () => {
    expect(citedKeys('', ['REQ-1'])).toEqual([]);
    expect(citedKeys('anything', [])).toEqual([]);
    expect(citedKeys(undefined as any, undefined as any)).toEqual([]);
  });
});

describe('resolveGovDeliveryProjectForRepo — repo → student project → solution_build delivery project', () => {
  it('resolves through both hops to the delivery project id', async () => {
    findRepoBinding.mockResolvedValue({ enrollmentId: 'e1', projectId: 'student-proj-1' });
    trackFindOne.mockResolvedValue({ delivery_project_id: 'dp-gov-1' });
    expect(await resolveGovDeliveryProjectForRepo('acme', 'repo')).toBe('dp-gov-1');
    expect(trackFindOne).toHaveBeenCalledWith({ where: { solution_student_project_id: 'student-proj-1', track_type: 'solution_build' } });
  });

  it('fails closed to null when the repo is unbound, has no student project, or no solution_build track', async () => {
    findRepoBinding.mockResolvedValueOnce(null);
    expect(await resolveGovDeliveryProjectForRepo('acme', 'repo')).toBeNull();

    findRepoBinding.mockResolvedValueOnce({ enrollmentId: 'e1', projectId: null }); // legacy, unbound
    expect(await resolveGovDeliveryProjectForRepo('acme', 'repo')).toBeNull();

    findRepoBinding.mockResolvedValueOnce({ enrollmentId: 'e1', projectId: 'student-proj-1' });
    trackFindOne.mockResolvedValueOnce(null); // no solution_build track points at it
    expect(await resolveGovDeliveryProjectForRepo('acme', 'repo')).toBeNull();

    expect(await resolveGovDeliveryProjectForRepo('', '')).toBeNull(); // guard
  });
});

describe('matchCommitsToGovStories — file an assigned story\'s cited commit as evidence', () => {
  const repo = { owner: 'acme', name: 'case-system' };

  it('files a cited commit as evidence for the ASSIGNED story, crediting its assignee, via the commit SHA', async () => {
    reqFindAll.mockResolvedValue([req('REQ-033'), req('REQ-100')]);
    listBuildStoryAssignments.mockResolvedValue([{ storyId: 'STORY-REQ-033', assigneeIdentityId: 'intern-1' }]);

    const r = await matchCommitsToGovStories('dp-gov-1', [commit('abc123', 'Build case search [REQ-033]')], repo);

    expect(r).toMatchObject({ deliveryProjectId: 'dp-gov-1', matched: 1, filed: 1, skippedNoIdentity: 0 });
    expect(fileGithubPushEvidence).toHaveBeenCalledTimes(1);
    const arg = fileGithubPushEvidence.mock.calls[0][0];
    expect(arg).toMatchObject({
      deliveryProjectId: 'dp-gov-1',
      storyId: 'STORY-REQ-033',          // the SAME id the assignment writer and projection use
      canonicalReqId: 'REQ-033',
      submittedByIdentityId: 'intern-1',  // credited to the story's assignee, never a fabricated actor
      commitSha: 'abc123',                // carries the SHA so the (story, sha) dedupe can hold
    });
    expect(arg.artifactRef).toBe('https://github.com/acme/case-system/commit/abc123');
  });

  it('SKIPS + logs a match on an UNASSIGNED story (no system identity to credit) and files nothing', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    reqFindAll.mockResolvedValue([req('REQ-033')]);
    listBuildStoryAssignments.mockResolvedValue([]); // nobody assigned

    const r = await matchCommitsToGovStories('dp-gov-1', [commit('abc123', 'work on REQ-033')], repo);

    expect(r).toMatchObject({ matched: 1, filed: 0, skippedNoIdentity: 1 });
    expect(fileGithubPushEvidence).not.toHaveBeenCalled();
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('gov_commit_match_skipped_no_identity'))).toBe(true);
    errSpy.mockRestore();
  });

  it('IGNORES a commit citing an id that is not a story in THIS project (cross-project id)', async () => {
    reqFindAll.mockResolvedValue([req('REQ-033')]);
    listBuildStoryAssignments.mockResolvedValue([{ storyId: 'STORY-REQ-033', assigneeIdentityId: 'intern-1' }]);

    const r = await matchCommitsToGovStories('dp-gov-1', [commit('abc123', 'citing OTHER-PROJECT-REQ-999')], repo);

    expect(r).toMatchObject({ matched: 0, filed: 0, skippedNoIdentity: 0 });
    expect(fileGithubPushEvidence).not.toHaveBeenCalled();
  });

  it('is IDEMPOTENT: a re-delivered commit already filed counts 0 (fileGithubPushEvidence returns created=false)', async () => {
    reqFindAll.mockResolvedValue([req('REQ-033')]);
    listBuildStoryAssignments.mockResolvedValue([{ storyId: 'STORY-REQ-033', assigneeIdentityId: 'intern-1' }]);
    fileGithubPushEvidence.mockResolvedValue(false); // the (story, sha) row already exists

    const r = await matchCommitsToGovStories('dp-gov-1', [commit('abc123', 'work [REQ-033]')], repo);

    expect(r).toMatchObject({ matched: 1, filed: 0 }); // matched, but nothing newly filed
    expect(fileGithubPushEvidence).toHaveBeenCalledTimes(1);
  });

  it('is total on no project / no commits, and never loads stories needlessly', async () => {
    expect(await matchCommitsToGovStories('', [commit('a', 'REQ-1')], repo)).toMatchObject({ matched: 0, filed: 0 });
    expect(await matchCommitsToGovStories('dp-gov-1', [], repo)).toMatchObject({ matched: 0, filed: 0 });
    expect(reqFindAll).not.toHaveBeenCalled();
  });

  it('one bad commit never aborts the batch — a commit with no sha is skipped, the next still files', async () => {
    reqFindAll.mockResolvedValue([req('REQ-033')]);
    listBuildStoryAssignments.mockResolvedValue([{ storyId: 'STORY-REQ-033', assigneeIdentityId: 'intern-1' }]);

    const r = await matchCommitsToGovStories('dp-gov-1', [
      commit('', 'no sha [REQ-033]'),      // skipped (no sha)
      commit('def456', 'good one [REQ-033]'),
    ], repo);

    expect(r).toMatchObject({ matched: 1, filed: 1 });
    expect(fileGithubPushEvidence).toHaveBeenCalledTimes(1);
    expect(fileGithubPushEvidence.mock.calls[0][0].commitSha).toBe('def456');
  });
});
