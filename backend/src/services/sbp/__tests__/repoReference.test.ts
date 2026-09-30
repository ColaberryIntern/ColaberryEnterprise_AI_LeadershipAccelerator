/**
 * repoReference — what a student actually pastes must parse, and what they
 * paste by mistake must be rejected with a sentence naming the mistake.
 *
 * "Never a generic 400" is a testable claim, and the last block tests it: every
 * rejection carries the class `InvalidRepoReference` and a message that names
 * the offending part rather than restating the rule.
 */
import { parseRepoReference, isRepoReference, sameRepo } from '../repoConnect/repoReference';
import { RepoConnectError } from '../repoConnect/connectErrors';

describe('parseRepoReference — the shapes students paste', () => {
  it.each([
    ['https://github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world.git', 'octocat', 'hello-world'],
    ['http://github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['https://www.github.com/octocat/hello-world', 'octocat', 'hello-world'],
    // Copied out of the browser while looking at a branch or a file.
    ['https://github.com/octocat/hello-world/tree/main', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/blob/main/src/index.ts', 'octocat', 'hello-world'],
    ['https://github.com/octocat/hello-world/pull/12', 'octocat', 'hello-world'],
    // From their terminal history.
    ['git@github.com:octocat/hello-world.git', 'octocat', 'hello-world'],
    ['ssh://git@github.com/octocat/hello-world.git', 'octocat', 'hello-world'],
    // How GitHub itself writes a repo.
    ['octocat/hello-world', 'octocat', 'hello-world'],
    ['github.com/octocat/hello-world', 'octocat', 'hello-world'],
    ['  octocat/hello-world  ', 'octocat', 'hello-world'],
    // Names with the other legal characters in them.
    ['octocat/hello.world', 'octocat', 'hello.world'],
    ['octocat/hello_world', 'octocat', 'hello_world'],
    ['a-student-99/night-shift.v2', 'a-student-99', 'night-shift.v2'],
  ])('parses %p', (input, owner, repo) => {
    const ref = parseRepoReference(input);
    expect(ref.owner).toBe(owner);
    expect(ref.repo).toBe(repo);
    expect(ref.url).toBe(`https://github.com/${owner}/${repo}`);
  });

  it('a .git suffix is stripped only from the end', () => {
    expect(parseRepoReference('me/my.github.thing').repo).toBe('my.github.thing');
    expect(parseRepoReference('me/my.git').repo).toBe('my');
  });
});

describe('parseRepoReference — rejections name the problem', () => {
  function rejection(input: unknown): RepoConnectError {
    try {
      parseRepoReference(input);
    } catch (err) {
      if (err instanceof RepoConnectError) return err;
      throw err;
    }
    throw new Error(`expected ${String(input)} to be rejected`);
  }

  it.each([
    ['', 'nothing pasted at all'],
    ['   ', 'whitespace'],
    ['hello-world', 'a bare repo name with no owner'],
    ['https://gitlab.com/me/thing', 'a non-GitHub host'],
    ['git@bitbucket.org:me/thing.git', 'a non-GitHub SSH remote'],
    ['https://github.com/', 'a URL with no repo in it'],
    ['https://github.com/octocat', 'an owner with no repo'],
    ['me/thing/extra', 'a third path segment that is not a browser path'],
    ['-bad/thing', 'an owner that cannot exist'],
    ['me/..', 'a reserved repo name'],
    ['me/thing with spaces', 'a name with spaces'],
  ])('rejects %p (%s)', (input) => {
    const err = rejection(input);
    expect(err.error_class).toBe('InvalidRepoReference');
    expect(err.http_status).toBe(400);
    // The message must be usable, not a rule restatement.
    expect(err.student_message.length).toBeGreaterThan(30);
  });

  it('says WHICH host is wrong rather than "invalid URL"', () => {
    expect(rejection('https://gitlab.com/me/thing').student_message).toContain('gitlab.com');
  });

  it('says an owner is missing rather than "malformed"', () => {
    expect(rejection('hello-world').student_message).toMatch(/owner/i);
  });

  it('names the offending segment', () => {
    expect(rejection('me/thing/extra').student_message).toContain('extra');
  });

  it('rejects non-strings without throwing something unclassified', () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(rejection(value).error_class).toBe('InvalidRepoReference');
    }
  });
});

describe('isRepoReference', () => {
  it('is a boolean view of the same rules', () => {
    expect(isRepoReference('me/thing')).toBe(true);
    expect(isRepoReference('thing')).toBe(false);
  });
});

describe('sameRepo', () => {
  it('is case-insensitive, because GitHub is', () => {
    expect(sameRepo({ owner: 'OctoCat', repo: 'Hello-World' }, { owner: 'octocat', repo: 'hello-world' })).toBe(true);
  });
  it('is false when either side is missing — a half-known repo is not a match', () => {
    expect(sameRepo({ owner: 'a', repo: null }, { owner: 'a', repo: 'b' })).toBe(false);
    expect(sameRepo({}, {})).toBe(false);
  });
});
