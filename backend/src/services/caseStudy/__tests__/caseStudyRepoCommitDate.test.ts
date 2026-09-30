/**
 * The head commit's DATE, which the analyzer used to discard.
 *
 * WHY THIS EXISTS. `GET /commits?per_page=1` has always returned the commit
 * object, and `commitsPayloadSchema` parsed `{ sha }` and threw the rest away.
 * The consequence was that no commit date existed anywhere in the analyzer's
 * output, so `delivery_elapsed_days` — specified in
 * `METRIC_PROVENANCE_PIPELINE.md` §4 as running to "the commit date of the sha
 * pinned in the approved snapshot" — was not computable from data the platform
 * records, failing that document's own first admissibility test.
 *
 * The fix costs no additional API call. This suite exists because it would
 * otherwise be invisible: every pre-existing fixture returns `[{ sha }]` with no
 * commit object, so the whole feature can be absent and 825 tests still pass.
 *
 * NO DATABASE, NO NETWORK. Every request goes through an injected `fetchImpl`,
 * matching the sibling analyzer suites.
 */
import { analyzeRepository } from '../caseStudyRepoAnalyzer';
import type { RepoAnalysisOutcome, RepoAnalysisSuccess } from '../caseStudyRepoAnalyzer';
import { readCommitDate } from '../caseStudyRepoReader';
import type { RepoAnalysisIssue } from '../caseStudyRepoReader';
import { makeGitHubFake, json, SENTINEL_TOKEN } from './githubFetchFake';

const SHA = 'c0ffee0000000000000000000000000000000000';
const COMMITTED = '2026-03-14T09:30:00Z';
const AUTHORED = '2026-03-01T08:00:00Z';

// Without a token every read fails `Unauthorized` before reaching the fake, and
// each assertion below would then be reading a metadata object that no response
// produced. Restored afterwards so the variable does not leak between suites.
const realToken = process.env.GITHUB_TOKEN;
beforeEach(() => { process.env.GITHUB_TOKEN = SENTINEL_TOKEN; });
afterEach(() => {
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

function ok(outcome: RepoAnalysisOutcome): RepoAnalysisSuccess {
  if (outcome.status === 'failed') {
    throw new Error(`expected an analysis, got failed (${outcome.error.error_class})`);
  }
  return outcome;
}

/** One analysis against a chosen `/commits` reply. */
async function analyseWithCommits(body: unknown): Promise<RepoAnalysisSuccess> {
  const gh = makeGitHubFake({ commits: json(body) });
  return ok(
    await analyzeRepository({
      owner: 'acme',
      repo: 'atlas',
      correlationId: 'cid-commit-date',
      fetchImpl: gh.impl,
    })
  );
}

describe('the analyzer keeps the head commit date it already receives', () => {
  it('reads the committer date onto the facts', async () => {
    const result = await analyseWithCommits([
      { sha: SHA, commit: { author: { date: AUTHORED }, committer: { date: COMMITTED } } },
    ]);
    expect(result.facts.metadata.latestCommitSha).toBe(SHA);
    // The COMMITTER date, not the author date. They differ after a rebase or a
    // cherry-pick, and the committer date is when the commit landed on this
    // branch — which is what an elapsed-delivery measurement is about.
    expect(result.facts.metadata.latestCommitAt).toBe(COMMITTED);
    expect(result.facts.metadata.latestCommitAt).not.toBe(AUTHORED);
  });

  it('falls back to the author date when the commit carries no committer', async () => {
    const result = await analyseWithCommits([
      { sha: SHA, commit: { author: { date: AUTHORED } } },
    ]);
    // Answering with the other date beats answering with nothing; a commit
    // object missing its committer is still a commit that happened.
    expect(result.facts.metadata.latestCommitAt).toBe(AUTHORED);
  });

  it('keeps the sha and reports a null date when there is no commit object', async () => {
    // This is the shape every pre-existing fixture in this repository sends.
    const result = await analyseWithCommits([{ sha: SHA }]);
    expect(result.facts.metadata.latestCommitSha).toBe(SHA);
    expect(result.facts.metadata.latestCommitAt).toBeNull();
  });

  it('keeps the sha when the date is the WRONG TYPE, rather than losing the analysis', async () => {
    // The claim this test defends was wrong when first written, and measuring it
    // is what corrected it. With plain `.optional()` a numeric date fails the
    // whole array parse, the read reports "commit head was not the expected
    // shape", and the repository loses its SHA to protect a date nothing needed.
    // `.catch(undefined)` is what makes a GitHub shape change cost one metric
    // instead of the analysis.
    const result = await analyseWithCommits([
      { sha: SHA, commit: { committer: { date: 1773481800 } } },
    ]);
    expect(result.facts.metadata.latestCommitSha).toBe(SHA);
    expect(result.facts.metadata.latestCommitAt).toBeNull();
  });

  it('keeps the sha when the whole commit branch is a nonsense type', async () => {
    const result = await analyseWithCommits([{ sha: SHA, commit: 'not an object' }]);
    expect(result.facts.metadata.latestCommitSha).toBe(SHA);
    expect(result.facts.metadata.latestCommitAt).toBeNull();
  });

  it('still refuses a payload with no sha, which is a real shape failure', async () => {
    // The tolerance above is deliberately scoped to the date. A missing sha is
    // not a degraded read — there is nothing to pin evidence to — so the
    // analysis must not quietly continue as though it had one.
    const gh = makeGitHubFake({ commits: json([{ commit: { committer: { date: COMMITTED } } }]) });
    const outcome = await analyzeRepository({
      owner: 'acme',
      repo: 'atlas',
      correlationId: 'cid-no-sha',
      fetchImpl: gh.impl,
    });
    const analysed = ok(outcome);
    expect(analysed.facts.metadata.latestCommitSha).toBeNull();
    expect(analysed.facts.metadata.latestCommitAt).toBeNull();
  });

  it('costs no additional GitHub request', async () => {
    // The date is in a response the analyzer was already making. If this count
    // moves, the feature has stopped being free and the trade changes.
    const gh = makeGitHubFake({
      commits: json([{ sha: SHA, commit: { committer: { date: COMMITTED } } }]),
    });
    await analyzeRepository({
      owner: 'acme',
      repo: 'atlas',
      correlationId: 'cid-count',
      fetchImpl: gh.impl,
    });
    expect(gh.urls.filter((u) => u.includes('/commits'))).toHaveLength(1);
  });
});

describe('readCommitDate — the date of ONE NAMED commit', () => {
  const PINNED = '0123456789abcdef0123456789abcdef01234567';

  /** One read against a chosen `/commits/{sha}` reply. */
  async function readPinned(body: unknown, status = 200) {
    const gh = makeGitHubFake({ commits: { status, body: JSON.stringify(body) } });
    const issues: RepoAnalysisIssue[] = [];
    const date = await readCommitDate(
      'acme', 'atlas', PINNED,
      { fetchImpl: gh.impl, correlationId: 'cid-pinned' },
      issues
    );
    return { date, issues, gh };
  }

  it('reads the committer date of the sha it was asked for', async () => {
    const { date, issues, gh } = await readPinned({
      sha: PINNED,
      commit: { author: { date: AUTHORED }, committer: { date: COMMITTED } },
    });
    expect(date).toBe(COMMITTED);
    expect(issues).toEqual([]);
    // The sha must be IN the path. Reading the branch head instead would make a
    // published figure grow every time somebody pushes.
    expect(gh.urls.some((u) => u.includes(`/commits/${PINNED}`))).toBe(true);
  });

  it('falls back to the author date when there is no committer', async () => {
    const { date } = await readPinned({ sha: PINNED, commit: { author: { date: AUTHORED } } });
    expect(date).toBe(AUTHORED);
  });

  it('returns null and classifies a 404 — a pin that is gone cannot be reproduced', async () => {
    const { date, issues } = await readPinned({ message: 'No commit found for SHA' }, 404);
    // Force-pushed away, or its branch deleted. That is a fact about the
    // evidence, not a broken read, and it must not read as a zero.
    expect(date).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].error_class).toBe('RepoNotFound');
  });

  it('returns null on a malformed payload rather than throwing', async () => {
    const { date, issues } = await readPinned({ nonsense: true });
    expect(date).toBeNull();
    expect(issues[0].message).toContain('not the expected shape');
  });

  it('keeps a wrong-typed date from costing the read', async () => {
    // Same `.catch(undefined)` tolerance as the head read: the commit branch
    // degrades, the parse still succeeds, and the caller gets a null date rather
    // than a classified shape failure.
    const { date, issues } = await readPinned({ sha: PINNED, commit: { committer: { date: 1773481800 } } });
    expect(date).toBeNull();
    expect(issues).toEqual([]);
  });

  it('costs exactly one request', async () => {
    const { gh } = await readPinned({ sha: PINNED, commit: { committer: { date: COMMITTED } } });
    expect(gh.urls).toHaveLength(1);
  });
});
