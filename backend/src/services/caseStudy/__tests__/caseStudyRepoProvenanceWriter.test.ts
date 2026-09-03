const update = jest.fn();
jest.mock('../../../models/CaseStudyRepository', () => ({ __esModule: true, default: { update: (...a: unknown[]) => update(...a) } }));

import { writeRepoProvenance } from '../caseStudyRepoProvenanceWriter';
import type { CaseStudyRepositoryRecord } from '../caseStudyRepoRecord';

/**
 * `last_seen_sha`, `last_synced_at` and `default_branch` were declared on the
 * model, read by `toRecord`, projected to the public page — and written by
 * NOTHING. They were permanently null on every Case Study.
 *
 * It surfaced from the far end: repository-backed evidence for a published case
 * study could not be pinned to a commit, twice, because there was no commit
 * recorded to pin to. The sync knew it the whole time.
 */

const facts = (over: Record<string, unknown> = {}) => ({
  repoOwner: 'acme', repoName: 'monorepo', repoUrl: 'https://github.com/acme/monorepo',
  metadata: { latestCommitSha: 'abc123', latestCommitAt: '2026-09-01T00:00:00Z', defaultBranch: 'main', ...over },
  derived: {},
} as never);

const record = (over: Partial<CaseStudyRepositoryRecord> = {}): CaseStudyRepositoryRecord => ({
  id: 'r1', collectionId: 'c1', repoOwner: 'acme', repoName: 'monorepo',
  repoUrl: 'https://github.com/acme/monorepo', role: 'primary', visibility: 'public',
  accessStatus: 'connected', allowPublicRepoLink: true, ...over,
});

const AT = new Date('2026-09-03T12:00:00Z');
beforeEach(() => { jest.clearAllMocks(); update.mockResolvedValue([1]); });

describe('writeRepoProvenance', () => {
  it('WRITES the commit sha the sync read — the whole point', async () => {
    const r = await writeRepoProvenance([facts()], [record()], AT);
    expect(r.updated).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_seen_sha: 'abc123', last_synced_at: AT, default_branch: 'main' }),
      expect.objectContaining({ where: { id: 'r1' } }),
    );
  });

  it('records that a read HAPPENED even when no sha could be established', async () => {
    // "We looked and could not establish a head" is a different fact from "we
    // never looked", and only the timestamp can tell them apart.
    await writeRepoProvenance([facts({ latestCommitSha: null })], [record()], AT);
    const [patch] = update.mock.calls[0];
    expect(patch.last_synced_at).toBe(AT);
    expect('last_seen_sha' in patch).toBe(false);
  });

  it('never stores a commit DATE without its sha', async () => {
    // Half a fact looks like provenance without being any: the sha is what makes
    // the date checkable.
    await writeRepoProvenance([facts({ latestCommitSha: null, latestCommitAt: '2026-09-01T00:00:00Z' })], [record()], AT);
    const [patch] = update.mock.calls[0];
    expect(Object.keys(patch)).toEqual(['last_synced_at', 'default_branch']);
  });

  it('matches repositories case-insensitively', async () => {
    const r = await writeRepoProvenance([facts()], [record({ repoOwner: 'ACME', repoName: 'MonoRepo' })], AT);
    expect(r.updated).toBe(1);
  });

  it('skips an analysed repo that is no longer attached, and writes nothing for it', async () => {
    const r = await writeRepoProvenance([facts()], [record({ repoName: 'somethingelse' })], AT);
    expect(r).toEqual({ updated: 0, skipped: 1, failed: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it('NEVER throws — a bookkeeping write must not fail a good sync', async () => {
    // A sync that produced a valid snapshot and then threw here would turn a
    // complete run into a failed one.
    update.mockRejectedValue(new Error('database is on fire'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(writeRepoProvenance([facts()], [record()], AT)).resolves.toEqual(
      { updated: 0, skipped: 0, failed: 1 },
    );
  });

  it('is idempotent in the fields that should not move', async () => {
    await writeRepoProvenance([facts()], [record()], AT);
    await writeRepoProvenance([facts()], [record()], AT);
    const [a] = update.mock.calls[0];
    const [b] = update.mock.calls[1];
    expect(a).toEqual(b);
  });
});
