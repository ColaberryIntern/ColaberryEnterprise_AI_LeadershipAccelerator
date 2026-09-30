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
 * ── The command blocks ───────────────────────────────────────────────────────
 *
 * WHO ACTUALLY RUNS THESE. Not a student typing into a terminal — a student
 * pasting them into Claude Code, which reads them, reasons about them, and
 * refuses anything it cannot justify. The first version of this block was
 * written for the terminal and an agent stopped dead on it (2026-08-15), for
 * four reasons that were all correct:
 *
 *   1. The folder was not a git repo, so `git add` failed. The block had no
 *      `git init` because it assumed a clone. Almost nobody has a clone: they
 *      have two weeks of class work in a folder they made by hand.
 *   2. `git push` with no remote and no upstream. The agent said "I'd be
 *      guessing at the URL" and declined to guess. It was right to. We know the
 *      URL — the student just pasted it — so it is in the commands now.
 *   3. Nothing said the first push uploads the WHOLE folder. `git add <one
 *      file>` looks narrow and is, but the push that follows carries every
 *      untracked file with it, including a stray `.env`.
 *   4. The repo's own "no secrets" rule vs an unexplained 32-hex string. The
 *      agent could not tell a pairing ID from a credential and correctly
 *      refused to commit something that might be the latter.
 *
 * So every comment below is load-bearing: each one closes one of those four,
 * plus the two failure modes a student hits next (a remote that already exists,
 * and a non-fast-forward push). Comments are the interface here, not decoration.
 * Trim them and the agent stalls again.
 */

/**
 * Written only when the student has no `.gitignore` at all — never over one they
 * wrote. `printf` rather than a heredoc keeps it to a single line and avoids the
 * backslash-escape traps a heredoc brings.
 */
const GITIGNORE_GUARD =
  "[ -f .gitignore ] || printf '%s\\n' '.env' '.env.*' 'tmp/' 'node_modules/' '__pycache__/' > .gitignore";

/** Staged, so it respects `.gitignore` and shows exactly what the push will carry. */
const REVIEW_STAGED = 'git status --short          # this list is exactly what goes to GitHub — check it now';

/**
 * NOT HERE: the OneDrive warning. A folder inside a sync client is a real hazard
 * — the client and git fight over `.git` locks and can corrupt the repo — and it
 * is what the first agent to run this block flagged. It is still not in the
 * panel, because the person it happened to was Ali on his own machine and
 * roughly twenty-nine students in thirty will never have a synced folder. A line
 * every student reads to warn one of them is noise, and noise is what makes the
 * other lines here stop being read. It lives in the build-student-project
 * skill's troubleshooting table instead, where whoever is helping the one stuck
 * student looks it up by symptom. (Ali Muwwakkil, 2026-08-15.)
 */

/**
 * Door A — connect the repo the student already made. Assumes the LEAST: a
 * plain folder, no git, no remote, and a repo on the other end that may or may
 * not be empty.
 *
 * `git init` on an existing repo re-initialises harmlessly, so this block is
 * safe to re-run; the only non-idempotent command is `git remote add`, which is
 * why its recovery sits on the very next line.
 */
export function connectCommands(token: string, repoUrl: string): string[] {
  return [
    '# Your folder is probably not a git repo yet. That is the normal starting point.',
    'git init',
    'git branch -M main',
    `git remote add origin ${repoUrl}`,
    `# ^ "remote origin already exists" just means you were set up: git remote set-url origin ${repoUrl}`,
    '',
    '# The code below is a one-time proof that you can push to this repo. It expires',
    '# in 7 days and grants no access to anything: a pairing ID, not a credential.',
    '# It is meant to be committed.',
    'mkdir -p .colaberry',
    `echo "${token}" > ${CONNECT_FILE_PATH}`,
    '',
    '# This first push uploads EVERYTHING in this folder, not just the file above.',
    GITIGNORE_GUARD,
    'git add -A',
    REVIEW_STAGED,
    'git commit -m "Connect this folder to Colaberry"',
    'git push -u origin main',
    '',
    '# Push rejected? The repo already has commits. Run:',
    '#   git pull --rebase origin main --allow-unrelated-histories',
    '# then push again. Never --force: that erases what is already up there.',
  ];
}

/**
 * Door B — the folder exists, the remote does not, and the platform just made
 * one. `git branch -M main` is GitHub's own snippet and matters here: a folder
 * initialised before 2020, or by a tool that still defaults to `master`, would
 * otherwise push a branch the platform does not read.
 *
 * Nothing in this list rewrites history or forces anything. The repo on the
 * other end is created EMPTY precisely so this push is a fast-forward and their
 * existing commits arrive untouched — which is also why, unlike Door A, there
 * is no non-fast-forward recovery note to write.
 */
export function adoptCommands(repoUrl: string): string[] {
  return [
    '# Run these inside the folder you are already working in.',
    '# Not a git repo yet? That is the normal starting point — this makes it one.',
    'git init',
    'git branch -M main',
    `git remote add origin ${repoUrl}`,
    `# ^ "remote origin already exists"? Instead run: git remote set-url origin ${repoUrl}`,
    '',
    '# This first push uploads EVERYTHING in this folder. Your history goes up intact.',
    GITIGNORE_GUARD,
    'git add -A',
    REVIEW_STAGED,
    'git commit -m "Initial commit"     # skip if everything is already committed',
    'git push -u origin main',
  ];
}
