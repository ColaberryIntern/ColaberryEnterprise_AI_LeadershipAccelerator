#!/usr/bin/env node
/**
 * Import one commit from an intern's public repository into this one, as a pull request
 * nobody but a reviewer can land (AF4.5, acceptance criterion 3).
 *
 *   node scripts/importInternChange.js --repo qninying/ambit --commit 25d68f53
 *   node scripts/importInternChange.js --repo qninying/ambit --commit 25d68f53 --apply
 *
 * DRY RUN BY DEFAULT. Without `--apply` it fetches, scans, evaluates, REHEARSES THE APPLY
 * in a throwaway worktree, and writes nothing anywhere.
 *
 * The rehearsal is not decoration. Until 2026-11-01 the dry run checked policy and the
 * secret scan and then printed "Would push ... and open a pull request" without ever
 * trying to apply the patch. It said that about a commit editing
 * `.colaberry/progress.json` -- a file only the intern's own repository has -- and the
 * real run then died at `git am` with exit 128. A rehearsal that never applies cannot
 * tell "importable" from "explodes on contact", so now it applies for real and discards.
 *
 * ## Why this exists at all
 *
 * Ali ruled EXTRACT rather than fork on 2026-10-31. A GitHub pull request requires
 * shared commit history -- the same fork network -- and every intern repository is a
 * standalone project with unrelated history. So an intern CANNOT open a pull request
 * here, however much access they are given short of write. The path has to be a patch
 * that something else applies.
 *
 * That constraint turns out to be the safer design. The thing holding write access is
 * this file, which is reviewable, version-controlled and refuses things a tired reviewer
 * at 11pm would wave through. It is not an intern's credential, and it cannot be
 * persuaded.
 *
 * ## What it will not do
 *
 * - Approve or merge anything. It opens a pull request and stops. `main` requires an
 *   approving review, so the branch it pushes is inert until a human acts.
 * - Import a change that touches `.github/`, infrastructure, the secret gate, CI, code
 *   ownership, the governance files, or anything credential-bearing. See
 *   ./lib/internChangePolicy.js -- the refusals are named and unit tested.
 * - Push a patch the secret scan flagged. The scan runs BEFORE the push, because pushing
 *   is what publishes it.
 * - Touch the current working branch. The patch is applied in a throwaway git worktree
 *   created from `origin/main`, which is removed afterwards.
 *
 * ## Idempotency
 *
 * Re-running for the same repo and commit is safe and is expected after a timeout. The
 * branch name is derived from the commit, an existing branch is reused rather than
 * duplicated, and an existing open pull request is reported and left alone rather than
 * opened a second time.
 *
 * ## Authorship
 *
 * The patch is fetched in mail format and applied with `git am`, so the commit keeps the
 * intern as its author. The reviewer sees whose work it is, and the contribution is
 * theirs on the record. The importer is the committer, not the author.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ensure } = require('./ensure-gitleaks');
const { evaluateChange } = require('./lib/internChangePolicy');

const ROOT = path.join(__dirname, '..');
const GITLEAKS_CONFIG = path.join(ROOT, '.gitleaks.toml');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
  if (r.error) throw new Error(`${cmd} could not run: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args[0]} failed (${r.status}): `
      + `${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ').slice(0, 400)}`);
  }
  return r.stdout;
}

/** The commit, in mail format, so `git am` can preserve authorship. */
function fetchPatch(repo, sha) {
  return run('gh', ['api', `repos/${repo}/commits/${sha}`,
    '-H', 'Accept: application/vnd.github.patch']);
}

function fetchMeta(repo, sha) {
  const j = JSON.parse(run('gh', ['api', `repos/${repo}/commits/${sha}`]));
  return {
    sha: j.sha,
    short: String(j.sha).slice(0, 8),
    author: (j.commit && j.commit.author && j.commit.author.name) || '(unknown)',
    email: (j.commit && j.commit.author && j.commit.author.email) || '',
    date: String((j.commit && j.commit.author && j.commit.author.date) || '').slice(0, 10),
    subject: String((j.commit && j.commit.message) || '').split('\n')[0],
    paths: (j.files || []).map((f) => f.filename),
  };
}

/** Scan the patch text itself. A flagged patch is refused before anything is pushed. */
async function patchHasSecret(patchText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icpatch-'));
  const file = path.join(dir, 'change.patch');
  fs.writeFileSync(file, patchText, 'utf8');
  try {
    const gitleaks = await ensure();
    const r = spawnSync(gitleaks, [
      'dir', file, '--config', GITLEAKS_CONFIG,
      '--redact=100', '--no-banner', '--exit-code', '1',
    ], { encoding: 'utf8' });
    if (r.status !== 0 && r.status !== 1) {
      /* An unreadable scan is not a clean scan. */
      throw new Error(`gitleaks exited ${r.status} scanning the patch`);
    }
    return r.status === 1;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
}

function branchFor(repo, short) {
  /* Derived from the commit, so a re-run lands on the same branch instead of a second. */
  return `intern-cr/${repo.split('/')[0].toLowerCase()}/${short}`;
}

function existingPr(branch) {
  const out = run('gh', ['pr', 'list', '--head', branch, '--state', 'all',
    '--json', 'number,url,state']);
  const list = JSON.parse(out || '[]');
  return list.length ? list[0] : null;
}

/** This repository's tracked paths at origin/main, for the no-footprint refusal. */
function repoPathsAtMain() {
  run('git', ['fetch', 'origin', 'main', '--quiet'], { cwd: ROOT });
  return new Set(run('git', ['ls-tree', '-r', '--name-only', 'origin/main'], { cwd: ROOT })
    .split('\n').map((s) => s.trim()).filter(Boolean));
}

/** A patch that will not apply. Carried as a class so the top level can report specifics. */
class PatchConflict extends Error {
  constructor(detail) {
    super('the patch does not apply to origin/main');
    this.name = 'PatchConflict';
    this.detail = detail;
  }
}

/**
 * What `git am` actually objected to.
 *
 * `run()` keeps only the last few lines of stderr, and git prints its advice hints last,
 * so a real failure arrived as `hint: If you prefer to skip this patch...` with the
 * `error: could not apply` line already scrolled past. This reads the specifics instead,
 * because "it conflicted" without the filename sends the reader back to the terminal.
 */
function conflictDetail(wt, am) {
  const reasons = `${am.stdout || ''}\n${am.stderr || ''}`.split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(error:|fatal:|CONFLICT|Applying:|Patch failed)/.test(l));
  const unmerged = (spawnSync('git', ['diff', '--name-only', '--diff-filter=U'],
    { cwd: wt, encoding: 'utf8' }).stdout || '')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  return { exit: am.status, reasons, unmerged };
}

/**
 * Apply the patch in a THROWAWAY worktree built on origin/main, and push only when asked.
 *
 * Never the caller's working branch: this applies somebody else's patch, and doing that
 * in a shared tree is how an unrelated session's uncommitted work gets caught up in it.
 *
 * `push: false` is the rehearsal the dry run performs. It stays DETACHED so it leaves no
 * branch behind, applies the patch for real, and throws `PatchConflict` if it will not
 * go on. Without that, a dry run can only report on policy and the secret scan, and will
 * cheerfully promise a pull request for a patch that cannot be applied at all.
 */
function applyInWorktree({ branch, patchText, meta, push }) {
  run('git', ['fetch', 'origin', 'main', '--quiet'], { cwd: ROOT });
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'icwt-'));
  const patchFile = path.join(wt, '..', `${meta.short}.patch`);
  fs.writeFileSync(patchFile, patchText, 'utf8');

  try {
    run('git', ['worktree', 'add', '--quiet', '--detach', wt, 'origin/main'], { cwd: ROOT });
    if (push) run('git', ['checkout', '-q', '-b', branch], { cwd: wt });
    /* `am` keeps the intern as author; -3 lets it fall back to a merge resolution. */
    const am = spawnSync('git', ['-c', 'user.name=Colaberry Importer',
      '-c', 'user.email=ali@colaberry.com',
      'am', '-3', patchFile], { cwd: wt, encoding: 'utf8', maxBuffer: 1 << 26 });
    if (am.status !== 0) {
      const detail = conflictDetail(wt, am);
      /* Leave no half-applied state behind for the worktree removal to trip over. */
      try { run('git', ['am', '--abort'], { cwd: wt }); } catch { /* best effort */ }
      throw new PatchConflict(detail);
    }
    const head = run('git', ['rev-parse', 'HEAD'], { cwd: wt }).trim().slice(0, 8);
    if (push) run('git', ['push', '--quiet', '-u', 'origin', `${branch}:${branch}`], { cwd: wt });
    return head;
  } finally {
    try { run('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT }); } catch { /* best effort */ }
    try { fs.rmSync(patchFile, { force: true }); } catch { /* best effort */ }
  }
}

function prBody({ repo, meta, branch }) {
  return [
    `**Imported from an intern repository.** Source: \`${repo}@${meta.short}\``,
    '',
    `| | |`,
    `|---|---|`,
    `| Author | ${meta.author} |`,
    `| Authored | ${meta.date} |`,
    `| Source commit | https://github.com/${repo}/commit/${meta.sha} |`,
    `| Files | ${meta.paths.length} |`,
    '',
    'This branch was pushed by `scripts/importInternChange.js`, not by the author. The',
    'author has no write access to this repository and cannot approve this pull request;',
    '`main` requires an approving review from someone else.',
    '',
    '**Checked before the branch was pushed:**',
    '',
    '- The refusal policy in `scripts/lib/internChangePolicy.js` (workflows, infrastructure,',
    '  the secret gate, CI, code ownership, governance files, credential-bearing files,',
    '  path traversal, patch size, and whether the patch touches this repository at all)',
    '  — no rule fired.',
    '- The pinned gitleaks over the patch text with this repository\'s `.gitleaks.toml` — clean.',
    '- The patch was applied onto `origin/main` in a throwaway worktree before this branch',
    '  existed, so it is known to apply rather than assumed to.',
    '',
    'See `docs/INTERN_DEV_ENVIRONMENT.md` for the contract this path implements.',
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n');
}

async function main() {
  const repo = arg('repo');
  const commit = arg('commit');
  const apply = has('apply');
  if (!repo || !commit) {
    console.error('Usage: --repo owner/name --commit <sha> [--apply]');
    process.exit(2);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error(`--repo must be owner/name, got ${repo}`);
    process.exit(2);
  }

  console.log(`source:  ${repo}@${commit}`);
  const meta = fetchMeta(repo, commit);
  const patchText = fetchPatch(repo, commit);
  const branch = branchFor(repo, meta.short);

  console.log(`author:  ${meta.author} (${meta.date})`);
  console.log(`subject: ${meta.subject}`);
  console.log(`files:   ${meta.paths.length}`);
  console.log(`branch:  ${branch}`);
  console.log(`mode:    ${apply ? 'APPLY' : 'dry run (pass --apply to actually push)'}\n`);

  const secretFound = await patchHasSecret(patchText);
  const verdict = evaluateChange({
    paths: meta.paths, secretFound, repoPaths: repoPathsAtMain(),
  });

  if (!verdict.allowed) {
    console.error(`REFUSED -- ${verdict.refusals.length} rule(s) fired. Nothing was pushed.\n`);
    for (const r of verdict.refusals) {
      console.error(`  ${r.name}`);
      console.error(`      ${r.why}`);
      if (r.paths) for (const p of r.paths) console.error(`      - ${p}`);
    }
    console.error('\nThese are refusals, not review comments: they cannot be approved past.');
    process.exit(1);
  }
  console.log('policy: no refusal fired, and the patch scans clean.');

  const prior = existingPr(branch);
  if (prior) {
    console.log(`\nalready imported: PR #${prior.number} (${prior.state}) ${prior.url}`);
    console.log('Nothing to do -- this importer is idempotent on the source commit.');
    return;
  }

  /* Rehearse the apply for real, so the dry run cannot promise a pull request for a
     patch that will not go on. This is the check whose absence let a commit through on
     2026-11-01 that then failed at `git am` with exit 128. */
  if (!apply) {
    const rehearsed = applyInWorktree({ branch, patchText, meta, push: false });
    console.log(`apply:   rehearsed on origin/main and it applies clean (would be ${rehearsed})`);
    console.log(`\nWould push ${branch} and open a pull request. Re-run with --apply.`);
    return;
  }

  const head = applyInWorktree({ branch, patchText, meta, push: true });
  console.log(`pushed ${branch} at ${head}`);
  const url = run('gh', ['pr', 'create', '--base', 'main', '--head', branch,
    '--title', `Intern change: ${meta.subject}`.slice(0, 120),
    '--body', prBody({ repo, meta, branch })]).trim();
  console.log(`opened ${url}`);
  console.log('\nNot approved and not merged. A reviewer who is not the author decides.');
}

main().catch((e) => {
  if (e instanceof PatchConflict) {
    console.error('\nDOES NOT APPLY -- nothing was pushed.\n');
    console.error(`  git am exited ${e.detail.exit} applying this patch onto origin/main.`);
    for (const r of e.detail.reasons) console.error(`  ${r}`);
    if (e.detail.unmerged.length) {
      console.error('\n  conflicted paths:');
      for (const p of e.detail.unmerged) console.error(`      - ${p}`);
    }
    console.error('\nA patch is applied, never merged by hand here. Rebase it in the source');
    console.error('repository against what this one actually contains, then import the new commit.');
    process.exit(1);
  }
  console.error(`IMPORT FAILED: ${e.message}`);
  process.exit(1);
});
