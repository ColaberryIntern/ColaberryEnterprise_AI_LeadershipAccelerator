#!/usr/bin/env node
/**
 * Capture ONE Claude Code tab's state into the shared handoff bundle.
 *
 * WHY THIS EXISTS
 * A tab's useful state is not its scrollback. It is the branch it is on, the
 * worktree it lives in, the uncommitted diff, the PR it is waiting on and the
 * session log that says what it was doing. All of that is a few kilobytes,
 * against 5.4 GB of transcripts for a day's tabs. This script collects the few
 * kilobytes that actually let the work continue somewhere else.
 *
 * WHY IT TAKES --session RATHER THAN GUESSING
 * Around twenty tabs run against this repo at once, so "the most recently
 * modified transcript" is whichever tab typed last, not this one. Claude knows
 * its own session id (its scratchpad path ends in it) and passes it, which
 * makes the capture deterministic instead of a race.
 *
 * READ-ONLY AGAINST GIT, ALWAYS
 * The working tree is shared with every other tab. This script never commits,
 * never stages, never stashes and never checks out. It reads, and writes only
 * into the bundle folder.
 *
 * FAILURE MODES HANDLED: no upstream branch, detached HEAD, gh missing or
 * unauthenticated, no scratchpad, no session log, a diff too large to be
 * sensible, a transcript folder that does not match the derived slug.
 * NOT HANDLED: background shells, which no child process can enumerate; Claude
 * passes those as --note.
 *
 * Usage:
 *   node scripts/handoff/captureTab.js --session <uuid> [--log CC-20261108-ab12]
 *                                      [--note "..."] [--bundle <dir>] [--new]
 *                                      [--no-patch] [--no-extras] [--with-scratchpad]
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const B = require('./handoffBundle');

const MAX_UNTRACKED_LISTED = 200;
const MAX_SCRATCHPAD_FILE_BYTES = 1024 * 1024;
const MAX_SCRATCHPAD_TOTAL_BYTES = 10 * 1024 * 1024;

// New files are untracked, so `git diff HEAD` cannot see them, and new files are
// often the whole point of a workstream. They are copied rather than listed, but
// only when they look like work: small, textual, not build output.
const MAX_EXTRA_FILE_BYTES = 256 * 1024;
const MAX_EXTRA_TOTAL_BYTES = 20 * 1024 * 1024;
const EXTRA_SKIP = /(^|\/)(node_modules|dist|build|coverage|\.git)\/|\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|exe|dll|node|mp4|mov|woff2?|ttf|eot|jsonl)$/i;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

/** Read-only git. Returns trimmed stdout, or null when the command is not meaningful here. */
function git(cwd, args, { timeoutMs = 60000 } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim();
}

function gitState(cwd) {
  const branch = git(cwd, ['branch', '--show-current']) || null;
  const head = git(cwd, ['rev-parse', 'HEAD']);
  const upstream = git(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);

  // No upstream is ordinary for a fresh workstream branch, so it is recorded
  // rather than treated as an error; the unpushed list simply widens to
  // everything this branch adds on top of origin/main.
  const range = upstream ? `${upstream}..HEAD` : 'origin/main..HEAD';
  const unpushed = (git(cwd, ['log', range, '--oneline', '--no-decorate']) || '')
    .split('\n')
    .filter(Boolean);

  // -uall lists untracked FILES rather than collapsing a new directory to one
  // entry, which matters because the entries drive what gets carried.
  const porcelain = (git(cwd, ['status', '--porcelain', '-uall']) || '').split('\n').filter(Boolean);
  const untracked = porcelain.filter((l) => l.startsWith('??')).map((l) => l.slice(3));
  const trackedChanged = porcelain.filter((l) => !l.startsWith('??')).map((l) => l.slice(3));

  return {
    branch,
    head,
    headShort: head ? head.slice(0, 8) : null,
    upstream: upstream || null,
    detached: !branch,
    unpushedCount: unpushed.length,
    unpushed: unpushed.slice(0, 50),
    trackedChangedCount: trackedChanged.length,
    trackedChanged: trackedChanged.slice(0, MAX_UNTRACKED_LISTED),
    untrackedCount: untracked.length,
    // Untracked files are LISTED, never copied: there are hundreds of them on
    // this machine and they are mostly generated output, not work in progress.
    untracked: untracked.slice(0, MAX_UNTRACKED_LISTED),
    untrackedTruncated: untracked.length > MAX_UNTRACKED_LISTED,
    // The full list drives which files get copied. Stripped before the tab JSON
    // is written, so hundreds of generated paths do not bloat the bundle.
    untrackedAll: untracked,
  };
}

/** The tracked diff, written as a patch bootstrap can `git apply --3way`. */
function writePatch(cwd, paths, sessionId) {
  const diff = git(cwd, ['diff', 'HEAD'], { timeoutMs: 120000 });
  if (!diff) return null;
  const file = path.join(paths.patches, `${sessionId}.patch`);
  fs.mkdirSync(paths.patches, { recursive: true });
  B.writeTextAtomic(file, `${diff}\n`);
  return { file, bytes: Buffer.byteLength(diff, 'utf8') };
}

/**
 * Copy the untracked files that look like work in progress.
 *
 * WHY THIS IS NOT JUST A LIST
 * `git diff HEAD` only sees files git already tracks, so a workstream whose
 * value is six NEW files would hand over a patch of nothing. Staging them with
 * `git add -N` would make them visible to the diff, but the index is shared with
 * every other tab in this worktree, and this script does not mutate shared
 * state. So they are copied instead.
 *
 * Generated output is excluded by extension and path, and anything large is
 * skipped by name so the bundle stays emailable. Skips are reported, never
 * silent: a file that did not travel must be visible as a decision.
 */
function copyUntracked(cwd, untracked, sessionId, paths) {
  const destRoot = path.join(paths.root, 'extras', sessionId);
  let total = 0;
  const copied = [];
  const skipped = [];

  for (const rel of untracked) {
    const norm = rel.replace(/\\/g, '/');
    if (EXTRA_SKIP.test(norm)) {
      skipped.push({ path: norm, why: 'generated or binary' });
      continue;
    }
    const from = path.join(cwd, rel);
    let st;
    try {
      st = fs.statSync(from);
    } catch {
      continue; // vanished between the status call and now
    }
    if (!st.isFile()) continue;
    if (st.size > MAX_EXTRA_FILE_BYTES) {
      skipped.push({ path: norm, why: `${Math.round(st.size / 1024)}KB over the per-file cap` });
      continue;
    }
    if (total + st.size > MAX_EXTRA_TOTAL_BYTES) {
      skipped.push({ path: norm, why: 'bundle size cap reached' });
      continue;
    }
    const to = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    total += st.size;
    copied.push(norm);
  }

  if (!copied.length) {
    try { fs.rmdirSync(destRoot); } catch { /* may not exist */ }
    return { copied: [], skipped, bytes: 0 };
  }
  return { copied, skipped, bytes: total };
}

/** Open PRs for this branch. Best effort: gh may be absent or unauthenticated. */
function openPrs(cwd, branch) {
  if (!branch) return [];
  const r = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url,title'], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (r.status !== 0) return [];
  try {
    return JSON.parse(r.stdout || '[]');
  } catch {
    return [];
  }
}

/**
 * Claude's per-session scratchpad sits under the temp dir, keyed on the same
 * project slug as the transcript plus the session id. The probe scripts there
 * are small and are often the only record of how something was measured, so
 * they travel; anything large is skipped by name.
 */
function copyScratchpad(sessionId, slug, paths) {
  const src = path.join(os.tmpdir(), 'claude', slug, sessionId, 'scratchpad');
  if (!fs.existsSync(src)) return { copied: 0, skipped: [], source: null };

  const dest = path.join(paths.scratchpad, sessionId);
  fs.mkdirSync(dest, { recursive: true });

  let total = 0;
  let copied = 0;
  const skipped = [];
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const st = fs.statSync(from);
    if (!st.isFile()) continue;
    if (st.size > MAX_SCRATCHPAD_FILE_BYTES || total + st.size > MAX_SCRATCHPAD_TOTAL_BYTES) {
      skipped.push({ name, bytes: st.size });
      continue;
    }
    fs.copyFileSync(from, path.join(dest, name));
    total += st.size;
    copied += 1;
  }
  return { copied, skipped, source: src, bytes: total };
}

/** The session log for this tab, per CLAUDE.md's docs/sessions convention. */
function copySessionLog(logId, paths) {
  if (!logId) return null;
  const src = path.join(B.REPO_ROOT, 'docs', 'sessions', `${logId}.md`);
  if (!fs.existsSync(src)) return null;
  const destDir = path.join(paths.root, 'session-logs');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, `${logId}.md`));
  return path.join('session-logs', `${logId}.md`);
}

function renderMarkdown(tab) {
  const L = [];
  L.push(`# Tab ${tab.sessionId}`);
  L.push('');
  L.push(`- **Captured:** ${tab.capturedAt}`);
  L.push(`- **Session log:** ${tab.sessionLogId || '(none given)'}`);
  L.push(`- **Working dir:** \`${tab.cwd}\``);
  L.push(`- **Worktree:** \`${tab.worktree}\``);
  L.push(`- **Branch:** \`${tab.git.branch || '(detached)'}\` at \`${tab.git.headShort}\``);
  L.push(`- **Upstream:** ${tab.git.upstream || 'none yet'}`);
  L.push(`- **Unpushed commits:** ${tab.git.unpushedCount}`);
  L.push(`- **Tracked changes:** ${tab.git.trackedChangedCount}${tab.patch ? ` (patch: \`patches/${tab.sessionId}.patch\`)` : ' (no patch captured)'}`);
  const extras = tab.extras;
  L.push(
    `- **Untracked files:** ${tab.git.untrackedCount} seen` +
      (extras ? `, ${extras.copied.length} carried in \`extras/${tab.sessionId}/\`, ${extras.skipped.length} left behind` : ', none carried')
  );
  L.push(`- **Transcript:** ${tab.transcript ? `${(tab.transcript.bytes / 1048576).toFixed(1)} MB, last written ${tab.transcript.modified}` : 'not found'}`);
  if (tab.prs.length) {
    L.push('');
    L.push('## Open PRs');
    for (const p of tab.prs) L.push(`- #${p.number} ${p.title}`, `  ${p.url}`);
  }
  if (tab.git.unpushed.length) {
    L.push('');
    L.push('## Unpushed commits');
    for (const c of tab.git.unpushed) L.push(`- ${c}`);
  }
  if (tab.note) {
    L.push('');
    L.push('## In flight (reported by the tab)');
    L.push('');
    L.push(tab.note);
  }
  L.push('');
  L.push('## Resume on the new machine');
  L.push('');
  L.push(`1. \`cd ${path.basename(tab.worktree)}\` (bootstrap recreates it on branch \`${tab.git.branch}\`)`);
  if (tab.patch) L.push('2. The tracked diff is applied by bootstrap unless you passed -SkipPatches.');
  L.push(`${tab.patch ? 3 : 2}. Read \`${tab.sessionLogCopied || 'docs/sessions/<this tab\'s log>'}\` for where the work stood.`);
  L.push('');
  return L.join('\n');
}

function main() {
  const sessionId = arg('session');
  if (!sessionId) B.fail('--session <uuid> is required (Claude: it is the last path segment of your scratchpad dir)');

  const cwd = path.resolve(arg('cwd', process.cwd()));
  const worktree = path.resolve(arg('worktree', git(cwd, ['rev-parse', '--show-toplevel']) || cwd));
  const paths = B.ensureBundle({ explicitPath: arg('bundle'), fresh: flag('new'), sessionId });

  const slugDir = B.resolveTranscriptDir(cwd);
  const slug = path.basename(slugDir);
  const transcript = B.listTranscripts(slugDir).find((t) => t.sessionId === sessionId) || null;

  const g = gitState(worktree);
  const untrackedAll = g.untrackedAll;
  delete g.untrackedAll;

  const tab = {
    schema: 'colaberry.handoff.tab/1',
    sessionId,
    capturedAt: new Date().toISOString(),
    sessionLogId: arg('log'),
    note: arg('note'),
    cwd,
    worktree,
    transcriptSlug: slug,
    transcript: transcript && { file: transcript.file, bytes: transcript.bytes, modified: transcript.modified },
    git: g,
    prs: openPrs(worktree, g.branch),
    patch: flag('no-patch') ? null : writePatch(worktree, paths, sessionId),
    extras: flag('no-extras') ? null : copyUntracked(worktree, untrackedAll, sessionId, paths),
    // OPT-IN, not opt-out. The first real bundle built here tripped the secret
    // gate four times and three were scratchpad files: ad-hoc probe scripts
    // holding service URLs and account identifiers. They are the highest-risk
    // and lowest-value thing in the bundle, and they are reconstructable from
    // the transcript, so they only travel when asked for.
    scratchpad: flag('with-scratchpad') ? copyScratchpad(sessionId, slug, paths) : null,
  };
  tab.sessionLogCopied = copySessionLog(tab.sessionLogId, paths);

  // One file per session id, so concurrent tabs never contend. Re-running this
  // tab's capture replaces only this tab's files.
  B.writeJsonAtomic(path.join(paths.tabs, `${sessionId}.json`), tab);
  B.writeTextAtomic(path.join(paths.tabs, `${sessionId}.md`), renderMarkdown(tab));

  console.log(`captured tab ${sessionId}`);
  console.log(`  bundle   ${paths.root}`);
  console.log(`  branch   ${g.branch || '(detached)'} @ ${g.headShort}  unpushed=${g.unpushedCount}`);
  console.log(`  changes  tracked=${g.trackedChangedCount} untracked=${g.untrackedCount}  patch=${tab.patch ? `${tab.patch.bytes}B` : 'none'}`);
  if (tab.extras) {
    console.log(`  extras   ${tab.extras.copied.length} new files carried (${Math.round(tab.extras.bytes / 1024)}KB), ${tab.extras.skipped.length} skipped`);
  }
  console.log(`  prs      ${tab.prs.length ? tab.prs.map((p) => `#${p.number}`).join(' ') : 'none'}`);
  console.log('');
  console.log('Not yet sendable: run `node scripts/handoff/captureMachine.js --finalize` once every tab has reported.');
}

if (require.main === module) main();

module.exports = { gitState, renderMarkdown };
