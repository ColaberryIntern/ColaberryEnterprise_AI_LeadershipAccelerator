#!/usr/bin/env node
/**
 * Shared primitives for the session handoff bundle.
 *
 * WHY THIS EXISTS
 * Roughly twenty Claude Code tabs run against this repo at once, each one a
 * separate session with its own transcript, worktree and branch. Moving that
 * work to a new machine means collecting state from every live tab into one
 * portable folder. This module owns the parts all the handoff scripts share:
 * where the bundle lives, how a tab finds the bundle its siblings are already
 * writing to, and how the manifest is produced.
 *
 * THE CONCURRENCY RULE, AND WHY IT IS SHAPED THIS WAY
 * No script ever read-modify-writes a shared file. Each tab writes exactly one
 * file named after its own session id, and `manifest.json` is DERIVED from the
 * directory listing at finalize time. CLAUDE.md learned this lesson on
 * PROGRESS.md, where concurrent instances mis-attributed and clobbered each
 * other's entries. A derived manifest cannot be clobbered because nobody
 * appends to it.
 *
 * FAILURE MODES HANDLED: a stale bundle pointer whose folder was deleted, two
 * tabs racing to create the first bundle, a transcript folder whose name does
 * not match the derived slug, a cwd with trailing separators, an interrupted
 * write leaving a half-file.
 * NOT HANDLED: two tabs passing the same --session id (they would overwrite one
 * file, which is the correct outcome anyway).
 *
 * Usage:  require('./handoffBundle')
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');

// First tab to run /handoff creates the bundle and records it here, so every
// other tab writes into the SAME folder without the tabs having to talk.
// Both locations are overridable so handoffSelfTest.js can exercise the
// first-writer-wins and stale-pointer behaviour without touching the real
// pointer a live tab may be using. An untestable contract is a weak one.
const POINTER = process.env.HANDOFF_POINTER || path.join(CLAUDE_HOME, 'handoff-current.json');

const DEFAULT_BUNDLE_PARENT = process.env.HANDOFF_PARENT || path.join(os.homedir(), 'Downloads');

function fail(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

/**
 * Claude Code names a project's transcript folder after the absolute working
 * directory the session started in, with every non-alphanumeric character
 * replaced by a hyphen (`c:\Users\ali_m\...\docs` becomes
 * `c--Users-ali-m-...-docs`).
 *
 * That rule is derived by inspection, so it is never trusted blind:
 * resolveTranscriptDir() below asserts the directory actually exists and fails
 * loudly instead of silently producing an empty capture.
 */
function projectSlug(absCwd) {
  const normalized = path.resolve(String(absCwd)).replace(/[\\/]+$/, '');
  return normalized.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * The transcript folder for a given working directory. Windows paths are
 * case-insensitive but the folder name preserves whatever case the session was
 * started with, so an exact miss falls back to a case-insensitive match before
 * giving up.
 */
function resolveTranscriptDir(absCwd, { required = true } = {}) {
  const slug = projectSlug(absCwd);
  const exact = path.join(PROJECTS_DIR, slug);
  if (fs.existsSync(exact)) return exact;

  const lower = slug.toLowerCase();
  const hit = safeReaddir(PROJECTS_DIR).find((d) => d.toLowerCase() === lower);
  if (hit) return path.join(PROJECTS_DIR, hit);

  if (required) {
    fail(
      `no transcript folder for ${absCwd}\n` +
        `  derived slug: ${slug}\n` +
        `  looked in:    ${PROJECTS_DIR}\n` +
        '  The slug rule may have changed. Fix projectSlug() rather than guessing.'
    );
  }
  return null;
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every transcript in a project folder, newest first. Cheap: stat only. */
function listTranscripts(slugDir) {
  return safeReaddir(slugDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = path.join(slugDir, f);
      const st = fs.statSync(full);
      return {
        sessionId: path.basename(f, '.jsonl'),
        file: full,
        bytes: st.size,
        modified: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.modified < b.modified ? 1 : -1));
}

/** Transcripts touched within `hours` - the working definition of "a live tab". */
function recentTranscripts(slugDir, hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return listTranscripts(slugDir).filter((t) => Date.parse(t.modified) >= cutoff);
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function bundlePaths(root) {
  return {
    root,
    tabs: path.join(root, 'tabs'),
    patches: path.join(root, 'patches'),
    machine: path.join(root, 'machine'),
    memory: path.join(root, 'memory'),
    scratchpad: path.join(root, 'scratchpad'),
    transcripts: path.join(root, 'transcripts'),
    manifest: path.join(root, 'manifest.json'),
  };
}

function readPointer() {
  try {
    const p = JSON.parse(fs.readFileSync(POINTER, 'utf8'));
    // A pointer whose folder was deleted or moved is worse than no pointer:
    // it would silently send captures into nowhere.
    if (p && p.bundlePath && fs.existsSync(p.bundlePath)) return p;
  } catch {
    /* absent or unreadable: treated as no pointer */
  }
  return null;
}

/**
 * Resolve the bundle every tab should write into, creating it if this is the
 * first tab to ask. `wx` makes creation first-writer-wins, so two tabs racing
 * cannot end up with two bundles: the loser re-reads and joins the winner's.
 */
function ensureBundle({ explicitPath = null, fresh = false, sessionId = null } = {}) {
  if (explicitPath) return mkBundle(path.resolve(explicitPath));

  if (!fresh) {
    const existing = readPointer();
    if (existing) return mkBundle(existing.bundlePath);
  }

  const root = path.join(DEFAULT_BUNDLE_PARENT, `claude-handoff-${stamp()}`);
  mkBundle(root);
  try {
    fs.mkdirSync(CLAUDE_HOME, { recursive: true });
    fs.writeFileSync(
      POINTER,
      JSON.stringify({ bundlePath: root, createdAt: new Date().toISOString(), createdBySession: sessionId }, null, 2),
      { flag: fresh ? 'w' : 'wx' }
    );
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const winner = readPointer();
    if (winner) return mkBundle(winner.bundlePath);
  }
  return mkBundle(root);
}

function mkBundle(root) {
  const p = bundlePaths(root);
  for (const dir of [p.root, p.tabs, p.patches, p.machine]) fs.mkdirSync(dir, { recursive: true });
  return p;
}

/** Write via temp file + rename so an interrupted run never leaves half a file. */
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function writeTextAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/**
 * Build manifest.json from what is on disk. Derived, never appended to, so the
 * tabs never contend for it. Also the integrity record bootstrap checks before
 * it touches the new machine.
 */
function deriveManifest(root) {
  const p = bundlePaths(root);
  const tabs = safeReaddir(p.tabs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(p.tabs, f), 'utf8')));

  let machine = null;
  const machineFile = path.join(p.machine, 'machine.json');
  if (fs.existsSync(machineFile)) machine = JSON.parse(fs.readFileSync(machineFile, 'utf8'));

  return {
    schema: 'colaberry.handoff/1',
    generatedAt: new Date().toISOString(),
    bundlePath: root,
    machineCaptured: Boolean(machine),
    tabCount: tabs.length,
    tabs: tabs.map((t) => ({
      sessionId: t.sessionId,
      sessionLogId: t.sessionLogId || null,
      branch: t.git ? t.git.branch : null,
      worktree: t.worktree || null,
      patch: t.patch ? path.basename(t.patch.file) : null,
      prs: t.prs || [],
    })),
    machine,
  };
}

module.exports = {
  REPO_ROOT,
  CLAUDE_HOME,
  PROJECTS_DIR,
  POINTER,
  fail,
  projectSlug,
  resolveTranscriptDir,
  listTranscripts,
  recentTranscripts,
  bundlePaths,
  ensureBundle,
  readPointer,
  writeJsonAtomic,
  writeTextAtomic,
  deriveManifest,
  stamp,
};
