/**
 * portfolioVerifiedCommits - the rule that puts a clickable commit on a public page.
 *
 * These tests are written against the ways this can hurt somebody rather than the happy path:
 * a rejected commit cited as evidence, a learner's failures leaking, a link built from a
 * repository that does not contain the commit, and junk becoming a URL.
 */
import {
  buildCommitUrl, toPublicVerifiedCommit, verifiedCommitsForEnrollment,
  restrictCommitsToRepos, VERIFIED_COMMITS_SQL,
} from '../portfolioVerifiedCommits';

const SHA = 'e7959eab52c067d074c40e3b377f29265d62cba3';
const REPO = 'https://github.com/acme/widget';

const verified = (over: Record<string, unknown> = {}) => ({
  story_id: 'STORY-007',
  title: 'Add the ingest endpoint',
  repo_url: REPO,
  verification_json: {
    state: 'verified',
    commit_sha: SHA,
    commit_at: '2026-09-15T13:07:05Z',
    criteria_passed: 3,
    criteria_total: 3,
    reasons: [],
    outstanding: [],
    rejected_claims: [],
    ...over,
  },
});

describe('buildCommitUrl', () => {
  it('builds a GitHub commit deep link', () => {
    expect(buildCommitUrl(REPO, SHA)).toBe(`${REPO}/commit/${SHA}`);
  });

  it('normalises a .git suffix and a trailing slash rather than refusing them', () => {
    expect(buildCommitUrl(`${REPO}.git`, SHA)).toBe(`${REPO}/commit/${SHA}`);
    expect(buildCommitUrl(`${REPO}/`, SHA)).toBe(`${REPO}/commit/${SHA}`);
  });

  it('refuses a host that is not github.com, by the same guard composeFeatured applies', () => {
    expect(buildCommitUrl('https://gitlab.com/acme/widget', SHA)).toBeNull();
    expect(buildCommitUrl('http://github.com/acme/widget', SHA)).toBeNull();
    expect(buildCommitUrl('https://github.com.evil.test/acme/widget', SHA)).toBeNull();
  });

  it('refuses anything that is not a sha, so junk cannot become a URL', () => {
    for (const bad of ['', 'not-a-sha', '123', '../../etc/passwd', `${SHA} extra`, null, 42]) {
      expect(buildCommitUrl(REPO, bad as unknown)).toBeNull();
    }
  });

  it('refuses a repo URL that is not exactly owner/name', () => {
    expect(buildCommitUrl('https://github.com/acme', SHA)).toBeNull();
    expect(buildCommitUrl('https://github.com/acme/widget/tree/main', SHA)).toBeNull();
  });
});

describe('toPublicVerifiedCommit', () => {
  it('maps a verified row to the public shape', () => {
    const c = toPublicVerifiedCommit(verified())!;
    expect(c.story_id).toBe('STORY-007');
    expect(c.commit_sha_short).toBe('e7959ea');
    expect(c.commit_url).toBe(`${REPO}/commit/${SHA}`);
    expect(c.criteria_passed).toBe(3);
    expect(c.criteria_total).toBe(3);
    expect(c.committed_at).toBe('2026-09-15T13:07:05.000Z');
  });

  it('NEVER exposes the learner\'s failures', () => {
    const c = toPublicVerifiedCommit(verified({
      reasons: ['missing error handling'],
      outstanding: ['criterion 2'],
      rejected_claims: ['claimed tests that do not exist'],
    }))!;
    const serialised = JSON.stringify(c);
    for (const leak of ['missing error handling', 'criterion 2', 'do not exist']) {
      expect(serialised).not.toContain(leak);
    }
    expect(Object.keys(c).sort()).toEqual([
      'commit_sha_short', 'commit_url', 'committed_at',
      'criteria_passed', 'criteria_total', 'story_id', 'title',
    ]);
  });

  it('refuses a commit the pipeline did NOT verify', () => {
    // The page would otherwise cite, as evidence, a commit that failed its own check.
    for (const state of ['failed', 'pending', 'rejected', undefined, null]) {
      expect(toPublicVerifiedCommit(verified({ state }))).toBeNull();
    }
  });

  it('yields nothing when the repository is private, because it has no public URL', () => {
    expect(toPublicVerifiedCommit({ ...verified(), repo_url: null })).toBeNull();
  });

  it('drops a junk commit date rather than rendering an invalid one', () => {
    expect(toPublicVerifiedCommit(verified({ commit_at: 'not a date' }))!.committed_at).toBeNull();
  });

  it('survives a malformed record without throwing', () => {
    for (const bad of [{}, { verification_json: null }, { verification_json: 'x' },
      { ...verified(), story_id: '' }]) {
      expect(() => toPublicVerifiedCommit(bad as never)).not.toThrow();
      expect(toPublicVerifiedCommit(bad as never)).toBeNull();
    }
  });
});

describe('verifiedCommitsForEnrollment', () => {
  it('deduplicates a story that two connection rows both match', async () => {
    const q = async () => [verified(), verified()];
    expect(await verifiedCommitsForEnrollment('e1', q)).toHaveLength(1);
  });

  it('keeps the SAME story id from different projects, which are different stories', async () => {
    // Measured 2026-10-17: 45 verified rows on one page carry 14 distinct story ids,
    // because each project numbers its own from STORY-001. Keyed on the id alone this
    // published 14 of 45 and three of the learner's four projects showed nothing.
    const q = async () => [
      { story_id: 'STORY-001', title: 'Import CMS HCRIS Data',
        repo_url: 'https://github.com/qninying/HosPulse',
        verification_json: { state: 'verified', commit_sha: '066d9b2321f5d172800cf4a8f8500d4402b55ed0', criteria_passed: 3, criteria_total: 3 } },
      { story_id: 'STORY-001', title: 'Process a job with idempotency',
        repo_url: 'https://github.com/qninying/relay',
        verification_json: { state: 'verified', commit_sha: '8c371aca1b2c3d4e5f60718293a4b5c6d7e8f901', criteria_passed: 3, criteria_total: 3 } },
      { story_id: 'STORY-001', title: 'Issue and enforce a token',
        repo_url: 'https://github.com/qninying/ambit',
        verification_json: { state: 'verified', commit_sha: '25c54db546d3d67ad124f243776c173fd19a5ba6', criteria_passed: 3, criteria_total: 3 } },
    ];
    const out = await verifiedCommitsForEnrollment('e1', q as never);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((c) => c.commit_url)).size).toBe(3);
  });

  it('keeps two stories that share ONE commit, because they are two awards', async () => {
    // Also real: commit cbac954 satisfied STORY-000 and STORY-011 in the same repository.
    const base = 'cbac954e43ccfc7244b40407877349d94d119d88';
    const q = async () => [
      { ...verified(), story_id: 'STORY-000', verification_json: { state: 'verified', commit_sha: base } },
      { ...verified(), story_id: 'STORY-011', verification_json: { state: 'verified', commit_sha: base } },
    ];
    expect(await verifiedCommitsForEnrollment('e1', q as never)).toHaveLength(2);
  });

  it('orders newest commit first', async () => {
    const q = async () => [
      verified({ commit_at: '2026-01-01T00:00:00Z' }),
      { ...verified({ commit_at: '2026-09-01T00:00:00Z' }), story_id: 'STORY-009' },
    ];
    const out = await verifiedCommitsForEnrollment('e1', q);
    expect(out.map((c) => c.story_id)).toEqual(['STORY-009', 'STORY-007']);
  });

  it('returns nothing for an empty enrollment id without querying', async () => {
    let called = false;
    const q = async () => { called = true; return [verified()]; };
    expect(await verifiedCommitsForEnrollment('', q)).toEqual([]);
    expect(called).toBe(false);
  });

  it('degrades to an empty list when the query returns junk', async () => {
    expect(await verifiedCommitsForEnrollment('e1', (async () => null) as never)).toEqual([]);
  });
});

describe('the SQL', () => {
  it('joins github_connections on the PROJECT, never the enrollment', () => {
    // Measured 2026-10-17: the enrollment join inflates 46 verified stories to 182 and
    // attaches commits to repositories that do not contain them, for the 7 learners who
    // have more than one repository.
    expect(VERIFIED_COMMITS_SQL).toContain('github_connections gc ON gc.project_id = pr.id');
    expect(VERIFIED_COMMITS_SQL).not.toContain('gc.enrollment_id');
  });

  it('asks only for verified rows', () => {
    expect(VERIFIED_COMMITS_SQL).toContain("st.verified_by = 'build_pipeline:repo_verification'");
  });

  it('selects verification_json wholesale, so the MAPPER is what protects the learner', () => {
    // Precise rather than flattering: the query must read the whole json to get
    // `state` and `commit_sha`, so reasons, outstanding and rejected_claims DO reach
    // the application. Nothing in the SQL prevents that and this test does not pretend
    // it does. The protection is `toPublicVerifiedCommit`, which has no shape for them.
    expect(VERIFIED_COMMITS_SQL).toContain('st.verification_json');
    const mapped = toPublicVerifiedCommit(verified({
      reasons: ['xx'], outstanding: ['yy'], rejected_claims: ['zz'],
    }))!;
    expect(JSON.stringify(mapped)).not.toMatch(/xx|yy|zz/);
  });
});

describe('restrictCommitsToRepos', () => {
  const commit = (repo: string) => ({
    story_id: 'S-' + repo, title: 't', commit_sha_short: 'abc1234',
    committed_at: null, criteria_passed: 1, criteria_total: 1,
    commit_url: repo + '/commit/' + SHA,
  });

  it('drops the commit whose repository a stranger cannot open', () => {
    // Probed anonymously 2026-10-17, controls at both ends: 128 of 129 links returned 200
    // and this one returned 404 at the commit AND at the repository root.
    const out = restrictCommitsToRepos(
      [commit('https://github.com/baidhani/Sifra'),
        commit('https://github.com/baidhani/HomeHub')],
      new Set(['https://github.com/baidhani/Sifra']),
    );
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain('HomeHub');
  });

  it('publishes NOTHING when reachability was never measured', () => {
    // An unchecked link is exactly what the hostile reader in the ticket is looking for,
    // so the absence of a measurement is treated as a failed measurement.
    expect(restrictCommitsToRepos([commit('https://github.com/a/b')], undefined)).toEqual([]);
  });

  it('publishes nothing when the measurement came back empty', () => {
    expect(restrictCommitsToRepos([commit('https://github.com/a/b')], new Set())).toEqual([]);
  });

  it('survives junk in place of a commit list', () => {
    for (const bad of [null, undefined, 'x', 42, {}]) {
      expect(restrictCommitsToRepos(bad as never, new Set(['https://github.com/a/b'])))
        .toEqual([]);
    }
  });

  it('drops a row whose URL cannot be split back to a repository', () => {
    const broken = { ...commit('https://github.com/a/b'), commit_url: 'nonsense' };
    expect(restrictCommitsToRepos([broken as never], new Set(['https://github.com/a/b'])))
      .toEqual([]);
  });
});
