import { assembleMetricRunContext, pinnedCommitNeeds } from '../metricRunContext';
import { opaqueRepoRef } from '../../caseStudyRepoReader';
import type { CaseStudyRepoFacts } from '../../caseStudyRepoAnalyzer';

/**
 * Assembling the context a metric computes over.
 *
 * NO DATABASE, NO NETWORK. The module is pure by design: it decides what needs
 * fetching and assembles the result, and the orchestrator does the fetching.
 */

const SHA_A = 'aaaaaaa1111111111111111111111111111111aa';
const SHA_B = 'bbbbbbb2222222222222222222222222222222bb';
const SHA_OLD = 'ccccccc3333333333333333333333333333333cc';

function facts(owner: string, name: string, over: Record<string, unknown> = {}): CaseStudyRepoFacts {
  return {
    repoOwner: owner,
    repoName: name,
    repoUrl: `https://github.com/${owner}/${name}`,
    metadata: { createdAt: '2026-01-01T00:00:00Z', latestCommitSha: null, latestCommitAt: null, ...over },
  } as unknown as CaseStudyRepoFacts;
}

describe('pinnedCommitNeeds', () => {
  it('needs no request when the analysed head IS the pinned sha', () => {
    const needs = pinnedCommitNeeds(
      [facts('acme', 'atlas', { latestCommitSha: SHA_A, latestCommitAt: '2026-02-01T00:00:00Z' })],
      { 'acme/atlas': SHA_A }
    );
    expect(needs).toHaveLength(1);
    // The analysis already returned this sha's date, so fetching it again would
    // be pure waste. A freshly built snapshot therefore costs zero extra calls.
    expect(needs[0].knownDate).toBe('2026-02-01T00:00:00Z');
  });

  it('needs a request when the branch has moved past the pin', () => {
    const needs = pinnedCommitNeeds(
      [facts('acme', 'atlas', { latestCommitSha: SHA_A, latestCommitAt: '2026-02-01T00:00:00Z' })],
      { 'acme/atlas': SHA_OLD }
    );
    // The head's date is NOT the pin's date. Substituting it would make a
    // published figure grow every time somebody pushes.
    expect(needs[0].knownDate).toBeNull();
    expect(needs[0].sha).toBe(SHA_OLD);
  });

  it('skips a repository the snapshot did not pin, rather than falling back to its head', () => {
    const needs = pinnedCommitNeeds(
      [
        facts('acme', 'atlas', { latestCommitSha: SHA_A, latestCommitAt: '2026-02-01T00:00:00Z' }),
        facts('acme', 'unpinned', { latestCommitSha: SHA_B, latestCommitAt: '2026-03-01T00:00:00Z' }),
      ],
      { 'acme/atlas': SHA_A }
    );
    // Falling back would quietly substitute today's state for what was approved.
    expect(needs.map((n) => n.repoName)).toEqual(['atlas']);
  });

  it('matches the commit map case-insensitively, as the repository key is', () => {
    const needs = pinnedCommitNeeds(
      [facts('Acme', 'Atlas', { latestCommitSha: SHA_A, latestCommitAt: '2026-02-01T00:00:00Z' })],
      { 'acme/atlas': SHA_A }
    );
    expect(needs).toHaveLength(1);
    expect(needs[0].knownDate).toBe('2026-02-01T00:00:00Z');
  });

  it('carries the opaque ref, never the owner or name, as the identifier', () => {
    const needs = pinnedCommitNeeds(
      [facts('acme', 'secret-thing', { latestCommitSha: SHA_A })],
      { 'acme/secret-thing': SHA_A }
    );
    expect(needs[0].ref).toBe(opaqueRepoRef('acme', 'secret-thing'));
    expect(needs[0].ref).not.toContain('acme');
    // Owner and name are still present as fields, because the FETCH needs them.
    // What matters is that the ref is what travels onward into a computation.
    expect(needs[0].repoOwner).toBe('acme');
  });
});

describe('assembleMetricRunContext', () => {
  const analysed = [
    facts('acme', 'atlas', { latestCommitSha: SHA_A, latestCommitAt: '2026-02-01T00:00:00Z' }),
    facts('acme', 'beacon', { latestCommitSha: SHA_B, latestCommitAt: '2026-03-15T00:00:00Z' }),
  ];

  const assemble = (over: Partial<Parameters<typeof assembleMetricRunContext>[0]> = {}) =>
    assembleMetricRunContext({
      caseStudyId: 'cs-1',
      correlationId: 'cid-ctx',
      analysed,
      unreadableRepoCount: 0,
      needs: pinnedCommitNeeds(analysed, { 'acme/atlas': SHA_A, 'acme/beacon': SHA_B }),
      fetchedDates: {},
      ...over,
    });

  it('takes the LATEST pinned commit as the end of the measurement', () => {
    const ctx = assemble();
    // "When did the work this snapshot describes conclude" is answered by the
    // last commit it pins — not by whichever repository sorts first, and not by
    // the one tagged primary, which would ignore work in every other repository.
    expect(ctx.pinnedCommitSha).toBe(SHA_B);
    expect(ctx.pinnedCommitAt).toBe('2026-03-15T00:00:00Z');
  });

  it('uses a fetched date for a pin whose head had moved on', () => {
    const stale = [facts('acme', 'atlas', { latestCommitSha: SHA_A, latestCommitAt: '2026-09-01T00:00:00Z' })];
    const ctx = assemble({
      analysed: stale,
      needs: pinnedCommitNeeds(stale, { 'acme/atlas': SHA_OLD }),
      fetchedDates: { [SHA_OLD]: '2026-02-10T00:00:00Z' },
    });
    // The pin's date, not the head's — the whole reason the extra read exists.
    expect(ctx.pinnedCommitSha).toBe(SHA_OLD);
    expect(ctx.pinnedCommitAt).toBe('2026-02-10T00:00:00Z');
  });

  it('excludes a pin whose date could not be read, without losing a readable one', () => {
    const ctx = assemble({
      needs: [
        { ref: 'r1', repoOwner: 'acme', repoName: 'atlas', sha: SHA_A, knownDate: null },
        { ref: 'r2', repoOwner: 'acme', repoName: 'beacon', sha: SHA_B, knownDate: '2026-03-15T00:00:00Z' },
      ],
      fetchedDates: { [SHA_A]: null },
    });
    expect(ctx.pinnedCommitSha).toBe(SHA_B);
  });

  it('reports no pin at all when no date could be established', () => {
    const ctx = assemble({ needs: [], fetchedDates: {} });
    // Null, so the definition refuses with a stated reason rather than measuring
    // to something it invented.
    expect(ctx.pinnedCommitSha).toBeNull();
    expect(ctx.pinnedCommitAt).toBeNull();
  });

  it('ignores an unparseable date rather than letting it win the comparison', () => {
    const ctx = assemble({
      needs: [
        { ref: 'r1', repoOwner: 'acme', repoName: 'atlas', sha: SHA_A, knownDate: 'not a date' },
        { ref: 'r2', repoOwner: 'acme', repoName: 'beacon', sha: SHA_B, knownDate: '2026-03-15T00:00:00Z' },
      ],
      fetchedDates: {},
    });
    expect(ctx.pinnedCommitSha).toBe(SHA_B);
  });

  it('passes every analysed repository through, keyed by opaque ref', () => {
    const ctx = assemble();
    expect(ctx.repositories).toHaveLength(2);
    expect(ctx.repositories.map((r) => r.ref)).toEqual([
      opaqueRepoRef('acme', 'atlas'),
      opaqueRepoRef('acme', 'beacon'),
    ]);
  });

  it('carries the unreadable count through, because the denominator depends on it', () => {
    const ctx = assemble({ unreadableRepoCount: 3 });
    expect(ctx.unreadableRepoCount).toBe(3);
  });

  it('is stable when the same inputs arrive in a different order', () => {
    const forward = assemble();
    const reversed = assemble({
      analysed: [...analysed].reverse(),
      needs: pinnedCommitNeeds([...analysed].reverse(), { 'acme/atlas': SHA_A, 'acme/beacon': SHA_B }),
    });
    expect(reversed.pinnedCommitSha).toBe(forward.pinnedCommitSha);
    expect(reversed.pinnedCommitAt).toBe(forward.pinnedCommitAt);
  });
});
