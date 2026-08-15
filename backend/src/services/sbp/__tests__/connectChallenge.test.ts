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

/**
 * These read as pedantic string assertions, and they are, deliberately.
 *
 * On 2026-08-15 an agent ran the connect block in a real student-shaped folder
 * and stopped: not a git repo, no remote, and it would not guess the URL. Every
 * assertion below pins one line whose ABSENCE caused that. A future edit that
 * "tidies" the block by dropping `git init`, the remote, or the everything-goes-up
 * warning has to delete a test that says why it is there.
 */
const REPO_URL = 'https://github.com/ColaberryIntern/night-shift-abc12345';

describe('the commands a student runs', () => {
  const token = 'c'.repeat(32);
  const connect = () => connectCommands(token, REPO_URL).join('\n');

  it('writes the token to the allowlisted path', () => {
    expect(connect()).toContain(CONNECT_FILE_PATH);
    expect(connect()).toContain(token);
  });

  // ── requirement 1: a plain folder is the DEFAULT, not an error ────────────
  it('takes a folder that is not a git repo yet all the way to a pushed repo', () => {
    const cmds = connect();
    expect(cmds).toContain('git init');
    expect(cmds).toContain('git branch -M main');
    expect(cmds).toContain(`git remote add origin ${REPO_URL}`);
    expect(cmds).toContain('git push -u origin main');
  });

  it('never emits a bare `git push` with no upstream', () => {
    // The original block ended in `git push`, which fails on a fresh repo with
    // "no upstream branch". Every push here names its remote and branch.
    for (const line of connectCommands(token, REPO_URL)) {
      const command = line.split('#')[0].trim();
      if (command.startsWith('git push')) expect(command).toBe('git push -u origin main');
    }
  });

  it('says plainly that this is the normal starting point', () => {
    // The agent stalled partly because the block gave it no signal that a
    // missing .git was expected rather than a broken setup.
    expect(connect()).toMatch(/not a git repo yet/i);
  });

  // ── requirement 2: the URL is in the commands, never guessed ──────────────
  it('names the remote URL so nobody has to guess it', () => {
    expect(connect()).toContain(REPO_URL);
    // And again in the recovery line, so a student whose origin already exists
    // does not have to reconstruct it.
    expect(connect()).toContain(`git remote set-url origin ${REPO_URL}`);
  });

  it('carries whatever URL the platform holds, not a hardcoded one', () => {
    const other = 'https://github.com/someone-else/their-repo';
    expect(connectCommands(token, other).join('\n')).toContain(`git remote add origin ${other}`);
    expect(connectCommands(token, other).join('\n')).not.toContain(REPO_URL);
  });

  // ── requirement 3: the first push carries the whole folder ────────────────
  it('warns that the whole folder goes up, not just the connection file', () => {
    expect(connect()).toMatch(/uploads EVERYTHING in this folder/);
  });

  it('offers a .gitignore that covers the things that actually hurt', () => {
    const cmds = connect();
    for (const pattern of ['.env', 'tmp/', 'node_modules/']) expect(cmds).toContain(`'${pattern}'`);
    // Guarded, so it can never clobber a .gitignore the student wrote.
    expect(cmds).toContain('[ -f .gitignore ] ||');
  });

  it('shows the student what is staged BEFORE the commit, not after', () => {
    const cmds = connectCommands(token, REPO_URL).map((l) => l.split('#')[0].trim());
    const review = cmds.findIndex((l) => l.startsWith('git status'));
    const commit = cmds.findIndex((l) => l.startsWith('git commit'));
    expect(review).toBeGreaterThan(cmds.findIndex((l) => l.startsWith('git add')));
    expect(review).toBeLessThan(commit);
  });

  // ── requirement 4: the token cannot read as a credential ──────────────────
  it('states inline what the token is, so an agent does not stall on "no secrets"', () => {
    const cmds = connect();
    expect(cmds).toMatch(/grants no access/i);
    expect(cmds).toMatch(/not a credential/i);
    expect(cmds).toMatch(/meant to be committed/i);
  });

  // ── the panel is student-facing: the OneDrive note is NOT here ────────────
  it('leaves sync-folder advice out of the panel entirely', () => {
    expect(connect()).not.toMatch(/OneDrive|Dropbox|iCloud/i);
    expect(adoptCommands(REPO_URL).join('\n')).not.toMatch(/OneDrive|Dropbox|iCloud/i);
  });

  // ── nothing destructive, in either door ───────────────────────────────────
  it.each([
    ['connect', () => connectCommands(token, REPO_URL)],
    ['adopt', () => adoptCommands(REPO_URL)],
  ])('%s commands never rewrite history or force', (_name, build) => {
    // Comment lines are stripped FIRST. The block deliberately contains the
    // string "--force" inside a "never do this" warning, and a naive scan of the
    // whole block flags that warning as if it were a command — which would make
    // the safest line in the file the one that fails the safety test.
    const executable = build().filter((line) => line.trim() && !line.trim().startsWith('#'));
    for (const line of executable) {
      expect(line).not.toMatch(/--force|reset --hard|clean -[a-z]*f\b/);
    }
    // Never `git clone` — the whole point is that their folder already exists.
    expect(executable.join('\n')).not.toContain('git clone');
  });

  it('tells a student whose push is rejected what to do instead of --force', () => {
    // The repo they pasted may already have a README. Without this line the
    // move a student reaches for is --force, which destroys the remote.
    const cmds = connect();
    expect(cmds).toContain('git pull --rebase origin main --allow-unrelated-histories');
    expect(cmds).toMatch(/[Nn]ever --force/);
  });

  it('adopt commands point an EXISTING folder at the new remote', () => {
    const cmds = adoptCommands(REPO_URL).join('\n');
    expect(cmds).toContain(`git remote add origin ${REPO_URL}`);
    expect(cmds).toContain('git push -u origin main');
    expect(cmds).toContain('git init');
    // `git branch -M main` matters: a folder that still defaults to master would
    // otherwise push a branch the platform does not read.
    expect(cmds).toContain('git branch -M main');
    // Door B pushes the whole folder too, so it carries the same warning.
    expect(cmds).toMatch(/uploads EVERYTHING in this folder/);
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
