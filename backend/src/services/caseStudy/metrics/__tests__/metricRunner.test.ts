import type { CaseStudyRepoFacts } from '../../caseStudyRepoAnalyzer';

/**
 * The orchestrator: resolve → analyse → fetch the pins that need it → compute →
 * write.
 *
 * NO DATABASE, NO NETWORK. Every collaborator is replaced, which is what lets
 * this suite assert the two properties that matter most about the sequence: that
 * a blocked run spends NO GitHub quota, and that a pin already answered by the
 * analysis costs no request.
 */

const listRepositories = jest.fn();
const resolveApprovedSnapshot = jest.fn();
const analyzeRepositories = jest.fn();
const readCommitDate = jest.fn();
const writeMetricRun = jest.fn();

jest.mock('../../caseStudyRepoCollection', () => ({
  __esModule: true,
  listRepositories: (...a: any[]) => listRepositories(...a),
}));
jest.mock('../../caseStudyPublicationStore', () => ({
  __esModule: true,
  resolveApprovedSnapshot: (...a: any[]) => resolveApprovedSnapshot(...a),
}));
jest.mock('../../caseStudyRepoAnalyzer', () => ({
  __esModule: true,
  analyzeRepositories: (...a: any[]) => analyzeRepositories(...a),
}));
jest.mock('../../caseStudyRepoReader', () => {
  const actual = jest.requireActual('../../caseStudyRepoReader');
  return { __esModule: true, ...actual, readCommitDate: (...a: any[]) => readCommitDate(...a) };
});
jest.mock('../metricRunStore', () => ({
  __esModule: true,
  writeMetricRun: (...a: any[]) => writeMetricRun(...a),
}));

import { runMetric } from '../metricRunner';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const SHA_HEAD = 'aaaaaaa1111111111111111111111111111111aa';
const SHA_PIN = 'ccccccc3333333333333333333333333333333cc';
const AT = '2026-08-29T09:00:00Z';

function facts(owner: string, name: string, over: Record<string, unknown> = {}): CaseStudyRepoFacts {
  return {
    repoOwner: owner,
    repoName: name,
    repoUrl: `https://github.com/${owner}/${name}`,
    metadata: {
      createdAt: '2026-01-01T00:00:00Z',
      latestCommitSha: SHA_HEAD,
      latestCommitAt: '2026-01-12T00:00:00Z',
      ...over,
    },
  } as unknown as CaseStudyRepoFacts;
}

function happyPath(over: { sourceCommitMap?: Record<string, string> } = {}): void {
  resolveApprovedSnapshot.mockResolvedValue({
    id: 'snap-1',
    source_commit_map: over.sourceCommitMap ?? { 'acme/atlas': SHA_HEAD },
  });
  listRepositories.mockResolvedValue([{ repoOwner: 'acme', repoName: 'atlas' }]);
  analyzeRepositories.mockResolvedValue({
    status: 'success',
    analyzed: [facts('acme', 'atlas')],
    failures: [],
    issues: [],
  });
  writeMetricRun.mockResolvedValue({
    status: 'written', metricId: 'm1', evidenceId: 'e1', runId: 'r1', created: true,
  });
}

const run = (over: Partial<Parameters<typeof runMetric>[0]> = {}) =>
  runMetric({
    caseStudyId: CASE_ID,
    definitionKey: 'delivery_elapsed_days',
    computedAt: AT,
    correlationId: 'cid-runner',
    ...over,
  });

beforeEach(() => {
  jest.clearAllMocks();
  readCommitDate.mockResolvedValue(null);
});

describe('runMetric', () => {
  describe('blocking before anything is spent', () => {
    it('blocks an unknown definition without touching the database', async () => {
      const outcome = await run({ definitionKey: 'not_a_metric' });
      expect(outcome.status).toBe('blocked');
      if (outcome.status !== 'blocked') throw new Error('unreachable');
      expect(outcome.reason).toBe('unknown_definition');
      expect(resolveApprovedSnapshot).not.toHaveBeenCalled();
      expect(listRepositories).not.toHaveBeenCalled();
    });

    it('blocks with no approved snapshot BEFORE spending any GitHub quota', async () => {
      resolveApprovedSnapshot.mockResolvedValue(null);
      const outcome = await run();
      if (outcome.status !== 'blocked') throw new Error('expected blocked');
      expect(outcome.reason).toBe('no_approved_snapshot');
      // The reads are the expensive part of this operation. Without a pin the
      // result could only ever be a refusal, so buying the reads first would be
      // spending quota to learn something already known.
      expect(analyzeRepositories).not.toHaveBeenCalled();
      expect(readCommitDate).not.toHaveBeenCalled();
      expect(writeMetricRun).not.toHaveBeenCalled();
      expect(outcome.message).toContain('Approve a snapshot first');
    });

    it('blocks when no repository is attached, again before analysing', async () => {
      resolveApprovedSnapshot.mockResolvedValue({ id: 'snap-1', source_commit_map: {} });
      listRepositories.mockResolvedValue([]);
      const outcome = await run();
      if (outcome.status !== 'blocked') throw new Error('expected blocked');
      expect(outcome.reason).toBe('no_repositories');
      expect(analyzeRepositories).not.toHaveBeenCalled();
      expect(writeMetricRun).not.toHaveBeenCalled();
    });
  });

  describe('the happy path', () => {
    it('computes and writes, reporting what it read', async () => {
      happyPath();
      const outcome = await run();
      expect(outcome.status).toBe('written');
      if (outcome.status !== 'written') throw new Error('unreachable');
      expect(outcome.repoStats).toEqual({
        attempted: 1, analysed: 1, unreadable: 0, pinnedDatesFetched: 0, issues: [],
      });
    });

    it('costs NO extra request when the snapshot pin is still the head', async () => {
      happyPath();
      await run();
      // The analysis already returned this sha's date. A freshly built snapshot
      // therefore resolves entirely from what has already been fetched.
      expect(readCommitDate).not.toHaveBeenCalled();
    });

    it('fetches only the pin whose head has moved on', async () => {
      happyPath({ sourceCommitMap: { 'acme/atlas': SHA_PIN } });
      readCommitDate.mockResolvedValue('2026-01-08T00:00:00Z');
      const outcome = await run();
      if (outcome.status !== 'written') throw new Error('unreachable');
      expect(readCommitDate).toHaveBeenCalledTimes(1);
      expect(readCommitDate.mock.calls[0][2]).toBe(SHA_PIN);
      expect(outcome.repoStats.pinnedDatesFetched).toBe(1);
    });

    it('passes the computed figure and the snapshot pin to the writer', async () => {
      happyPath();
      await run();
      const written = writeMetricRun.mock.calls[0][0];
      expect(written.caseStudyId).toBe(CASE_ID);
      expect(written.definition.key).toBe('delivery_elapsed_days');
      expect(written.pinnedCommitSha).toBe(SHA_HEAD);
      expect(written.computedAt).toBe(AT);
      // 2026-01-01 to 2026-01-12 is 11 days — the figure this pipeline exists to
      // be able to back.
      expect(written.computation.numericValue).toBe(11);
    });

    it('never stamps its own clock — `computedAt` is the caller\'s', async () => {
      happyPath();
      await run({ computedAt: '2020-01-01T00:00:00Z' });
      expect(writeMetricRun.mock.calls[0][0].computedAt).toBe('2020-01-01T00:00:00Z');
    });
  });

  describe('degraded reads', () => {
    it('counts unreadable repositories so the denominator can disclose them', async () => {
      happyPath();
      analyzeRepositories.mockResolvedValue({
        status: 'partial',
        analyzed: [facts('acme', 'atlas')],
        failures: [{ status: 'failed', repoOwner: 'acme', repoName: 'closed', error: { error_class: 'RepoNotFound', message: 'gone' } }],
        issues: [],
      });
      const outcome = await run();
      if (outcome.status !== 'written') throw new Error('unreachable');
      expect(outcome.repoStats.unreadable).toBe(1);
      expect(writeMetricRun.mock.calls[0][0].computation.sample).toContain('of 2');
    });

    it('still writes a null figure with its reason when the pin cannot be dated', async () => {
      happyPath({ sourceCommitMap: { 'acme/atlas': SHA_PIN } });
      readCommitDate.mockResolvedValue(null);
      const outcome = await run();
      if (outcome.status !== 'written') throw new Error('unreachable');
      const computation = writeMetricRun.mock.calls[0][0].computation;
      // A refusal is recorded, not skipped: the run happened, and the row says
      // why it has no number rather than saying zero.
      expect(computation.numericValue).toBeNull();
      expect(computation.methodology).toContain('no end date');
    });
  });

  describe('a promoted figure', () => {
    it('reports the writer\'s refusal as a refusal, not as a success', async () => {
      happyPath();
      writeMetricRun.mockResolvedValue({
        status: 'refused', reason: 'published_row', metricId: 'm1',
        publishedValue: 11, computedValue: 40, diverged: true, message: 'published at 11',
      });
      const outcome = await run();
      // The caller must be able to tell "the figure was written" from "the figure
      // was left alone because a human had published it".
      expect(outcome.status).toBe('refused');
      if (outcome.status !== 'refused') throw new Error('unreachable');
      expect(outcome.write.status).toBe('refused');
    });
  });
});
