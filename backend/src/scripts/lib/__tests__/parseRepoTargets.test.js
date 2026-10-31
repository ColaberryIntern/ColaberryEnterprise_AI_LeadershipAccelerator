/**
 * Tests for the AF4.5 intern-repository target list.
 *
 * The thing worth guarding here is the ARITHMETIC: the audit reports "N clean", and that
 * number is only meaningful if every input line was either scanned or explicitly
 * rejected. A parser that quietly drops a malformed line produces a report that is both
 * green and wrong.
 */
const { parseRepoTargets } = require('../../../../../scripts/lib/parseRepoTargets');

describe('parseRepoTargets', () => {
  it('accepts a plain owner/name list', () => {
    const { repos, rejected } = parseRepoTargets(['qninying/platform-reliability-agent', 'vessette/Simple']);
    expect(repos).toEqual(['qninying/platform-reliability-agent', 'vessette/Simple']);
    expect(rejected).toEqual([]);
  });

  it('accepts the dots, hyphens and underscores GitHub allows', () => {
    const { repos, rejected } = parseRepoTargets([
      'sainisarbjit83-ai/Colaberry_Marketing_Agent',
      'tashdiah-Data/ai-project',
      'owner.name/repo.js',
    ]);
    expect(repos).toHaveLength(3);
    expect(rejected).toEqual([]);
  });

  it('ignores blank lines and whole-line comments', () => {
    const { repos, rejected } = parseRepoTargets([
      '# Ellis - platform - Quincy Nkwain Ninying',
      '',
      '   ',
      'qninying/ambit',
    ]);
    expect(repos).toEqual(['qninying/ambit']);
    expect(rejected).toEqual([]);
  });

  it('strips a trailing comment rather than rejecting the line', () => {
    const { repos } = parseRepoTargets(['Kalkidan2129/admissions  # Maya']);
    expect(repos).toEqual(['Kalkidan2129/admissions']);
  });

  it('splits a comma-separated string, for the --repos flag', () => {
    const { repos } = parseRepoTargets('a/one,b/two , c/three');
    expect(repos).toEqual(['a/one', 'b/two', 'c/three']);
  });

  /**
   * REGRESSION. Splitting on newlines and commas in one pass cut a comment containing a
   * comma into fragments, and the fragments after the comma had lost the leading `#`.
   * The real list did this -- "repositories, from github_connections" -- and the audit
   * refused to start, naming "from" as an unscannable repository.
   */
  it('does not let a comma inside a comment escape comment-stripping', () => {
    const { repos, rejected } = parseRepoTargets([
      '# The seven interns\' connected public repositories, from github_connections',
      '# measured 2026-10-31, AF4.5 criterion 2, read from production',
      'qninying/ambit',
    ]);
    expect(repos).toEqual(['qninying/ambit']);
    expect(rejected).toEqual([]);
  });

  it('still splits commas on a line that also carries a trailing comment', () => {
    const { repos, rejected } = parseRepoTargets(['a/one, b/two  # Ellis and Maru']);
    expect(repos).toEqual(['a/one', 'b/two']);
    expect(rejected).toEqual([]);
  });

  /* The arithmetic rule: a bad line is REPORTED, never dropped. */
  it.each([
    ['no slash', 'justaname'],
    ['too many segments', 'owner/repo/extra'],
    ['empty owner', '/repo'],
    ['empty name', 'owner/'],
    ['a full URL', 'https://github.com/owner/repo'],
    ['spaces inside', 'owner/my repo'],
  ])('rejects %s rather than silently dropping it', (_label, value) => {
    const { repos, rejected } = parseRepoTargets([value]);
    expect(repos).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].value).toBe(value);
  });

  it('refuses a path-traversal segment', () => {
    const { repos, rejected } = parseRepoTargets(['../../etc/passwd', 'owner/..']);
    expect(repos).toEqual([]);
    expect(rejected.map((r) => r.reason)).toContain('path traversal in owner or name');
  });

  it('deduplicates an exact repeat without reporting it as a problem', () => {
    const { repos, rejected } = parseRepoTargets(['a/one', 'a/one']);
    expect(repos).toEqual(['a/one']);
    expect(rejected).toEqual([]);
  });

  /**
   * GitHub treats owner/name case-insensitively, so these are ONE repository. Scanning
   * it twice would clone the same history twice and report two clean repositories,
   * inflating the denominator of the audit.
   */
  it('treats a case variant as the same repository and says so', () => {
    const { repos, rejected } = parseRepoTargets(['Vessette/Simple', 'vessette/simple']);
    expect(repos).toEqual(['Vessette/Simple']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicate of Vessette\/Simple/);
  });

  it('returns empty for empty, null and undefined input', () => {
    for (const input of [[], '', null, undefined]) {
      expect(parseRepoTargets(input)).toEqual({ repos: [], rejected: [] });
    }
  });

  /**
   * CONTROL. If this ever fails, the regex has been loosened and the suite above is no
   * longer proving anything: a parser that accepts everything passes every "accepts"
   * test while accepting garbage.
   */
  it('CONTROL: the validator still rejects something', () => {
    const { rejected } = parseRepoTargets(['this is not a repo at all']);
    expect(rejected).toHaveLength(1);
  });
});
