import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { env } from '../../config/env';

const run = promisify(execFile);

/**
 * The master copy of every landing page, in git.
 *
 * Ali, 2026-10-01: "There should be a git repo stored somewhere for each one. That is where the
 * main copy will always be." The database row is what gets served; this is what it is served
 * FROM, in the sense that matters - a reviewable history that survives a bad edit, a bad deploy,
 * or a dropped table.
 *
 * ── WHERE, AND WHY THIS ONE ───────────────────────────────────────────────────────────────
 *
 * A dedicated repo on the production host, `LANDING_PAGE_REPO_PATH`, default
 * `/opt/colaberry-landing-pages`. Chosen over the two alternatives because it works TODAY:
 *
 *   - A repo per brand, or any GitHub remote, needs a credential the production container does
 *     not have. Minting one is a decision with a blast radius, not an implementation detail.
 *   - This application's own repo is checked out at /opt/colaberry-accelerator and is `git pull`ed
 *     by every deploy. Committing page content into it would dirty that tree, and a dirty tree
 *     makes a deploy silently ship stale code. That one is not a preference, it is a trap.
 *
 * So: a separate repo, no credentials, no interference with the deploy tree, real history from
 * the first publish. Set `LANDING_PAGE_REPO_REMOTE` and it also pushes - that is the only change
 * needed to move the master copy to GitHub once someone decides which GitHub.
 *
 * BE HONEST ABOUT WHAT A LOCAL REPO IS. On one host it is version history, not an offsite backup:
 * it survives a bad edit and a bad deploy, not a lost disk. The remote is what makes it durable,
 * and until it is set this returns `pushed: false` so nobody reads more into it than is there.
 *
 * ── FAIL SOFT, LOUDLY ─────────────────────────────────────────────────────────────────────
 *
 * A failed commit never blocks a publish. The operator's goal is the page being live; the archive
 * is a consequence of that, and refusing to publish because an archive write failed would be the
 * tail wagging the dog. But it is logged at error and the row's `repo_commit` stays null, so
 * "this page has no master copy" is a readable state rather than a silent one.
 *
 * ── NO SHELL STRINGS ──────────────────────────────────────────────────────────────────────
 *
 * Every git call is `execFile` with an argument array. A brand slug and a page slug both reach
 * this code from operator input, and a shell string would make them injection.
 */

export interface RepoCommitInput {
  brandSlug: string;
  pageSlug: string;
  pageName: string;
  /** The structured content - this is the master copy. */
  content: unknown;
  /** Who published it, for the commit author trailer. */
  actorEmail: string | null;
}

export interface RepoCommitResult {
  ok: boolean;
  /** Path of the file inside the repo, for `landing_pages.repo_path`. */
  repoPath: string | null;
  /** Commit SHA, for `landing_pages.repo_commit`. */
  commit: string | null;
  /** True only when a remote is configured AND the push succeeded. */
  pushed: boolean;
  /** Why it failed, when it did. */
  error: string | null;
}

/** Slugs come from operator input; a path separator or a `..` in one would escape the repo. */
function safeSegment(value: string): string | null {
  const trimmed = String(value ?? '').trim();
  return /^[a-z0-9][a-z0-9-]{0,200}$/.test(trimmed) ? trimmed : null;
}

async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', repo, ...args], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  return String(stdout).trim();
}

/**
 * Make sure the repo exists and has an identity.
 *
 * `init` is idempotent, and the identity is set per-repo rather than globally so this cannot
 * change how any other git on the host behaves.
 */
async function ensureRepo(repo: string): Promise<void> {
  await fs.mkdir(repo, { recursive: true });
  try {
    await git(repo, ['rev-parse', '--git-dir']);
  } catch {
    await git(repo, ['init', '--quiet']);
    await git(repo, ['config', 'user.email', 'marketing-ops@colaberry.com']);
    await git(repo, ['config', 'user.name', 'Colaberry Marketing Ops']);
    await fs.writeFile(
      path.join(repo, 'README.md'),
      [
        '# Landing pages',
        '',
        'The master copy of every landing page this platform serves at `/lp/:brand/:slug`.',
        'Written automatically when a page is published. One JSON file per page, under its brand.',
        '',
        'The JSON is the source of truth; the HTML the public route serves is rendered from it.',
        '',
      ].join('\n'),
      'utf8',
    );
    await git(repo, ['add', 'README.md']);
    await git(repo, ['commit', '--quiet', '-m', 'Landing page archive']);
  }
}

/**
 * Commit a published page. Returns a result rather than throwing: the caller is mid-publish and
 * must not be derailed by the archive.
 */
export async function commitPublishedPage(input: RepoCommitInput): Promise<RepoCommitResult> {
  const fail = (error: string): RepoCommitResult =>
    ({ ok: false, repoPath: null, commit: null, pushed: false, error });

  const brand = safeSegment(input.brandSlug);
  const page = safeSegment(input.pageSlug);
  if (!brand || !page) return fail('brand or page slug is not a safe path segment');

  const repo = String(env.landingPageRepoPath ?? '').trim();
  if (!repo) return fail('LANDING_PAGE_REPO_PATH is not set');

  const relative = path.posix.join(brand, `${page}.json`);

  try {
    await ensureRepo(repo);

    const absolute = path.join(repo, brand, `${page}.json`);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    // Pretty-printed and newline-terminated so a diff between two revisions is readable - the
    // whole point of keeping this in git rather than a blob column.
    await fs.writeFile(absolute, `${JSON.stringify(input.content, null, 2)}\n`, 'utf8');

    await git(repo, ['add', '--', relative]);

    // Nothing changed is a success, not a failure: re-publishing an unedited page is normal.
    const staged = await git(repo, ['diff', '--cached', '--name-only']);
    if (staged === '') {
      const head = await git(repo, ['rev-parse', 'HEAD']).catch(() => '');
      return { ok: true, repoPath: relative, commit: head || null, pushed: false, error: null };
    }

    const message = [
      `Publish ${input.pageName} (/lp/${brand}/${page})`,
      '',
      input.actorEmail ? `Published by: ${input.actorEmail}` : 'Published by: unknown',
    ].join('\n');
    await git(repo, ['commit', '--quiet', '-m', message]);
    const commit = await git(repo, ['rev-parse', 'HEAD']);

    let pushed = false;
    const remote = String(env.landingPageRepoRemote ?? '').trim();
    if (remote) {
      try {
        await git(repo, ['push', remote, 'HEAD']);
        pushed = true;
      } catch (err: any) {
        // The commit is already made and recorded; a failed push is worth saying but does not
        // undo the archive.
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error', service: 'landing-page-repo', event: 'landing_page_repo_push_failed',
          outcome: 'failure', error_class: 'RepoPushFailed',
          context: { repoPath: relative, commit, message: String(err?.message ?? err).slice(0, 200) },
        }));
      }
    }

    return { ok: true, repoPath: relative, commit, pushed, error: null };
  } catch (err: any) {
    return fail(String(err?.message ?? err).slice(0, 300));
  }
}
