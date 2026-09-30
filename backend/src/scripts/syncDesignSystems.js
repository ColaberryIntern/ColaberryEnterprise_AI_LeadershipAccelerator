#!/usr/bin/env node
/**
 * Pull the brand design systems from their source repositories into this one.
 *
 *   node backend/src/scripts/syncDesignSystems.js            # write changes
 *   node backend/src/scripts/syncDesignSystems.js --check    # report only, exit 1 on drift
 *   node backend/src/scripts/syncDesignSystems.js --brand cpn
 *
 * The five design systems are authored at github.com/aleemcolaberry, one repository per
 * brand, each published to GitHub Pages. This script vendors their token CSS and fonts so
 * the platform build stays hermetic while the vendored copy stays honest. The planning
 * and parsing live in lib/designSystemSync.js and are unit tested; this file is the I/O.
 *
 * FAILURE MODEL. Every fetch has a timeout and a capped retry. A brand that fails is
 * reported and skipped, and the process exits non-zero, but the brands that succeeded are
 * still written — a transient failure on one repository should not hold back four others.
 * Writes are staged in memory and only committed to disk once a brand's whole file set has
 * been fetched, so an interrupted run cannot leave an app with half a design system, which
 * would render as a page styled by whichever files happened to arrive first.
 *
 * IDEMPOTENCY. Same upstream, same bytes on disk, no diff. Running it twice in a row
 * produces no second change. That is what makes it safe to schedule.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  DESIGN_SYSTEMS,
  ENTRY,
  rawUrl,
  collectFiles,
  diffTrees,
  hasDrift,
  MANIFEST,
  orphansToRemove,
  buildManifest,
} = require('./lib/designSystemSync');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BRANCH = 'main';
const TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;

/** Fetch one file, returning null for 404 and throwing for anything else. */
async function fetchFile(repo, repoPath) {
  const url = rawUrl(repo, BRANCH, repoPath);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      // Exponential backoff, capped attempts. An unbounded retry against a repository
      // that has been deleted would hang the scheduled job rather than report the fact.
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`fetch failed after ${MAX_ATTEMPTS} attempts: ${url} (${lastError && lastError.message})`);
}

/** Read the currently vendored copy as a path -> Buffer map. */
function readLocalTree(absTargetDir) {
  const tree = new Map();
  if (!fs.existsSync(absTargetDir)) return tree;

  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (rel !== MANIFEST) tree.set(rel, fs.readFileSync(abs));
    }
  };
  walk(absTargetDir, '');
  return tree;
}

/** The file list this sync wrote last time, or empty on a first run. */
function readManifest(absTargetDir) {
  const file = path.join(absTargetDir, MANIFEST);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    // A corrupt manifest must not authorise deletions. Owning nothing is the safe read:
    // the sync will still add and update, it just will not remove anything this run.
    console.log(`        (unreadable ${MANIFEST}; treating as owning nothing)`);
    return [];
  }
}

/** Write the staged tree, removing files upstream no longer publishes. */
function writeTree(absTargetDir, upstream, removed) {
  for (const [rel, bytes] of upstream) {
    const abs = path.join(absTargetDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
  }
  for (const rel of removed) {
    const abs = path.join(absTargetDir, rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  pruneEmptyDirs(absTargetDir);
}

/** A directory left behind after its last file was removed is noise in every future diff. */
function pruneEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name));
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

async function syncOne(system, { check }) {
  const label = `${system.brandSlug} (${system.repo})`;

  if (!system.target) {
    console.log(`  SKIP  ${label}`);
    console.log(`        ${system.note}`);
    return { brandSlug: system.brandSlug, skipped: true, drift: false };
  }

  const cache = new Map();
  const readFile = async (repoPath) => {
    if (!cache.has(repoPath)) cache.set(repoPath, await fetchFile(system.repo, repoPath));
    return cache.get(repoPath);
  };

  const { files, missing } = await collectFiles({ readFile, entry: ENTRY });
  if (files.length === 0) {
    throw new Error(`${system.repo} published no ${ENTRY}; nothing to sync`);
  }

  // Everything is already in the cache from the walk, so this stages without re-fetching.
  const upstream = new Map();
  for (const repoPath of files) upstream.set(repoPath, cache.get(repoPath));

  const absTargetDir = path.join(REPO_ROOT, system.target);
  const local = readLocalTree(absTargetDir);

  // Only files this sync previously wrote are candidates for deletion. Everything else in
  // the directory is hand-authored and stays: DESIGN_SYSTEM.md, brand marks, anything a
  // developer added. Without this the first run would delete them and the diff would make
  // it look intentional.
  const owned = readManifest(absTargetDir);
  const removed = orphansToRemove(owned, upstream.keys());

  const raw = diffTrees(upstream, local);
  const diff = { added: raw.added, changed: raw.changed, unchanged: raw.unchanged, removed };
  const drift = hasDrift(diff);

  console.log(`  ${drift ? 'DRIFT' : 'OK   '} ${label}`);
  console.log(
    `        ${files.length} files: ${diff.added.length} added, ${diff.changed.length} changed, ` +
      `${diff.removed.length} removed, ${diff.unchanged.length} unchanged`
  );
  for (const p of diff.added) console.log(`          + ${p}`);
  for (const p of diff.changed) console.log(`          ~ ${p}`);
  for (const p of diff.removed) console.log(`          - ${p}`);
  if (missing.length > 0) {
    // Referenced but absent upstream. Not fatal: the design system still renders without
    // it in its own explorer, so this is the repository's business, not ours to fail on.
    for (const p of missing) console.log(`          ? referenced but missing upstream: ${p}`);
  }

  if (drift && !check) {
    writeTree(absTargetDir, upstream, diff.removed);
    fs.writeFileSync(
      path.join(absTargetDir, MANIFEST),
      buildManifest({ repo: system.repo, branch: BRANCH, entry: ENTRY, files: upstream.keys() })
    );
  }

  return { brandSlug: system.brandSlug, skipped: false, drift, diff, missing };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const brandArg = args.indexOf('--brand');
  const only = brandArg >= 0 ? args[brandArg + 1] : null;

  const systems = only
    ? DESIGN_SYSTEMS.filter((d) => d.brandSlug === only)
    : DESIGN_SYSTEMS;

  if (systems.length === 0) {
    console.error(`no design system registered for brand "${only}"`);
    process.exit(2);
  }

  console.log(`Design system sync${check ? ' (check only, nothing written)' : ''}`);
  console.log(`  source: github.com/aleemcolaberry, branch ${BRANCH}\n`);

  const results = [];
  const failures = [];

  for (const system of systems) {
    try {
      results.push(await syncOne(system, { check }));
    } catch (err) {
      // One unreachable repository must not stop the other four from syncing.
      failures.push({ brandSlug: system.brandSlug, message: err.message });
      console.log(`  FAIL  ${system.brandSlug} (${system.repo})`);
      console.log(`        ${err.message}`);
    }
  }

  const drifted = results.filter((r) => r.drift);
  console.log('');
  console.log(
    `  ${results.filter((r) => !r.skipped).length} synced, ` +
      `${results.filter((r) => r.skipped).length} skipped, ` +
      `${drifted.length} with changes, ${failures.length} failed`
  );

  if (failures.length > 0) process.exit(1);
  // --check is a gate: drift means the vendored copy is stale and a PR is owed.
  if (check && drifted.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(`design system sync failed: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
