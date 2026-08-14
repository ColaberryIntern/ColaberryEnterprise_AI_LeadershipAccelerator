/**
 * connectChallenge — proof that the student can actually PUSH to the repo they
 * are claiming, using their own credentials rather than the platform's.
 *
 * WHY A CHALLENGE AT ALL. The platform has no student OAuth (see
 * studentWorkspaceService's header): every GitHub call is made with the
 * platform token. So every question we can ask GitHub directly answers "can
 * *we* reach this repo", never "can *they* push to it". A student could paste
 * any public repo on GitHub — someone else's, a framework's — and every
 * server-side check would pass.
 *
 * The one thing only a person with push access can do is push. So we ask them
 * to: write a per-project token into `.colaberry/connect.txt` and push it. The
 * token was handed to an authenticated portal session, so seeing it land in the
 * repo binds three facts together — this session, this project, and somebody
 * who can write to that repo.
 *
 * It is also the cheapest possible dry run of the thing they will do all term:
 * a commit and a push from the folder they are already working in. If the
 * challenge fails, their remote was wrong, and finding that out now is the
 * point.
 *
 * PURE except for `mintChallengeToken`, which needs a CSPRNG. The matching rules
 * are pure so they are testable without a repo.
 */
import { randomBytes, timingSafeEqual } from 'crypto';

/** Inside `.colaberry/**`, which the platform already owns in the write allowlist. */
export const CONNECT_FILE_PATH = '.colaberry/connect.txt';

/** 32 hex chars. Long enough that guessing is not a strategy, short enough to retype. */
const TOKEN_BYTES = 16;
const TOKEN_RE = /^[a-f0-9]{32}$/;

/** Challenges do not live forever — a token pasted into a chat months ago is not proof. */
export const CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function mintChallengeToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function isChallengeToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

/** What we ask them to commit. A comment line so the file explains itself in six months. */
export function renderChallengeFile(token: string): string {
  return [
    '# Colaberry build connection',
    '# This file proves this folder is the one the platform should read.',
    '# Safe to keep. It grants no access to anything.',
    token,
    '',
  ].join('\n');
}

/**
 * Does the file in the repo carry this token?
 *
 * Line-scanned rather than whole-file compared, so a student who adds a note,
 * changes the line endings, or lets their editor strip the trailing newline
 * still passes. Comparison is timing-safe out of habit rather than necessity —
 * the token is short-lived and single-purpose, but a token comparison written
 * the loose way is the one that gets copied into somewhere it matters.
 */
export function matchesChallenge(fileContent: string | null | undefined, expected: string): boolean {
  if (!isChallengeToken(expected)) return false;
  if (typeof fileContent !== 'string' || !fileContent) return false;

  const want = Buffer.from(expected, 'utf8');
  for (const line of fileContent.split(/\r?\n/)) {
    const candidate = line.trim().toLowerCase();
    if (candidate.length !== expected.length) continue;
    const got = Buffer.from(candidate, 'utf8');
    if (got.length === want.length && timingSafeEqual(got, want)) return true;
  }
  return false;
}

export function isChallengeExpired(issuedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!issuedAt) return true;
  const issued = Date.parse(issuedAt);
  if (!Number.isFinite(issued)) return true;
  return now.getTime() - issued > CHALLENGE_TTL_MS;
}

/**
 * The exact commands for a student whose folder already exists and already has
 * a remote — Door A. Written as a list so the UI can render one copy button per
 * block without re-deriving the shell.
 */
export function connectCommands(token: string): string[] {
  return [
    'mkdir -p .colaberry',
    `echo "${token}" > ${CONNECT_FILE_PATH}`,
    `git add ${CONNECT_FILE_PATH}`,
    'git commit -m "chore: connect this folder to Colaberry"',
    'git push',
  ];
}

/**
 * Door B — the folder exists, the remote does not. `git branch -M main` is
 * GitHub's own snippet and matters here: a folder initialised before 2020, or
 * by a tool that still defaults to `master`, would otherwise push a branch the
 * platform does not read.
 *
 * Nothing in this list rewrites history or forces anything. The repo on the
 * other end is created EMPTY precisely so this push is a fast-forward and their
 * existing commits arrive untouched.
 */
export function adoptCommands(repoUrl: string): string[] {
  return [
    '# run these inside the folder you are already working in',
    'git init                      # skip if this is already a git repo',
    `git remote add origin ${repoUrl}   # use "set-url" instead if origin exists`,
    'git add -A',
    'git commit -m "Initial commit"     # skip if everything is already committed',
    'git branch -M main',
    'git push -u origin main',
  ];
}
