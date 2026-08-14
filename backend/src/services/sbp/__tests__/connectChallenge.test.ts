/**
 * connectChallenge — the proof-of-push rules.
 *
 * The matcher has to be forgiving about everything that is not the token (line
 * endings, a comment the student added, a missing trailing newline) and
 * unforgiving about the token itself.
 */
import {
  CONNECT_FILE_PATH, mintChallengeToken, isChallengeToken, matchesChallenge,
  isChallengeExpired, renderChallengeFile, connectCommands, adoptCommands,
  CHALLENGE_TTL_MS,
} from '../repoConnect/connectChallenge';

describe('mintChallengeToken', () => {
  it('produces a 32-char hex token', () => {
    const token = mintChallengeToken();
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(isChallengeToken(token)).toBe(true);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => mintChallengeToken()));
    expect(tokens.size).toBe(200);
  });

  it.each([['', false], ['short', false], ['A'.repeat(32), false], [undefined, false], [null, false], [12, false]])(
    'isChallengeToken(%p) is %p', (value, expected) => {
      expect(isChallengeToken(value)).toBe(expected);
    });
});

describe('matchesChallenge', () => {
  const token = 'a'.repeat(32);

  it('matches the rendered file', () => {
    expect(matchesChallenge(renderChallengeFile(token), token)).toBe(true);
  });

  it.each([
    ['bare token', token],
    ['trailing newline', `${token}\n`],
    ['CRLF line endings', `# comment\r\n${token}\r\n`],
    ['surrounded by the student\'s own notes', `my build\n${token}\ndo not delete\n`],
    ['leading and trailing spaces', `   ${token}   `],
    ['uppercase, because an editor or a human retyped it', token.toUpperCase()],
  ])('accepts %s', (_name, content) => {
    expect(matchesChallenge(content, token)).toBe(true);
  });

  it.each([
    ['an empty file', ''],
    ['a missing file', null],
    ['a different token', 'b'.repeat(32)],
    ['the token with a character changed', `${'a'.repeat(31)}b`],
    ['the token as a substring of a longer line', `prefix${token}suffix`],
    ['only part of the token', token.slice(0, 20)],
  ])('rejects %s', (_name, content) => {
    expect(matchesChallenge(content, token)).toBe(false);
  });

  it('rejects a malformed EXPECTED token rather than matching loosely', () => {
    expect(matchesChallenge('short', 'short')).toBe(false);
    expect(matchesChallenge('', '')).toBe(false);
  });
});

describe('isChallengeExpired', () => {
  const now = new Date('2026-08-14T12:00:00Z');

  it('is live inside the window', () => {
    expect(isChallengeExpired(new Date(now.getTime() - 1000).toISOString(), now)).toBe(false);
    expect(isChallengeExpired(new Date(now.getTime() - CHALLENGE_TTL_MS + 60_000).toISOString(), now)).toBe(false);
  });

  it('is expired past the window', () => {
    expect(isChallengeExpired(new Date(now.getTime() - CHALLENGE_TTL_MS - 1000).toISOString(), now)).toBe(true);
  });

  it('treats missing or unparseable timestamps as expired, never as valid', () => {
    expect(isChallengeExpired(null, now)).toBe(true);
    expect(isChallengeExpired(undefined, now)).toBe(true);
    expect(isChallengeExpired('not a date', now)).toBe(true);
  });
});

describe('the commands a student runs', () => {
  it('connect commands write the token to the allowlisted path and push', () => {
    const cmds = connectCommands('c'.repeat(32));
    expect(cmds.join('\n')).toContain(CONNECT_FILE_PATH);
    expect(cmds.join('\n')).toContain('c'.repeat(32));
    expect(cmds[cmds.length - 1]).toBe('git push');
    // Nothing here rewrites history or touches their source.
    expect(cmds.join('\n')).not.toMatch(/--force|reset --hard|clean -/);
  });

  it('adopt commands point an EXISTING folder at the new remote without forcing', () => {
    const cmds = adoptCommands('https://github.com/ColaberryIntern/night-shift-abc12345').join('\n');
    expect(cmds).toContain('git remote add origin https://github.com/ColaberryIntern/night-shift-abc12345');
    expect(cmds).toContain('git push -u origin main');
    // `git branch -M main` matters: a folder that still defaults to master would
    // otherwise push a branch the platform does not read.
    expect(cmds).toContain('git branch -M main');
    expect(cmds).not.toMatch(/--force|-f\b|reset --hard/);
    // Never `git clone` — the whole point is that their folder already exists.
    expect(cmds).not.toContain('git clone');
  });
});

describe('the challenge file itself', () => {
  it('explains what it is, so it is not deleted as junk in six months', () => {
    const content = renderChallengeFile('d'.repeat(32));
    expect(content).toMatch(/Colaberry/);
    expect(content).toMatch(/grants no access/i);
  });

  it('lives inside .colaberry/, which the platform already owns', () => {
    expect(CONNECT_FILE_PATH.startsWith('.colaberry/')).toBe(true);
  });
});
