/**
 * Design system sync — the pure half.
 *
 * WHY THIS EXISTS. The five brand design systems are authored in their own public
 * repositories under github.com/aleemcolaberry, each published to GitHub Pages with an
 * interactive explorer. Before this, their token CSS was copied into the apps by hand.
 * A hand copy is correct exactly once: the moment a designer changes an accent colour
 * upstream, every vendored copy is silently stale and nothing reports it.
 *
 * WHY NOT LINK THE PUBLISHED CSS DIRECTLY. It would be genuinely automatic, and it would
 * make five live sites depend on a third-party host on every page load. refactored.ai
 * already demonstrates how that ends: 94 of its assets come from a CloudFront
 * distribution last written to in 2022 that nobody here is sure we still control. Tokens
 * stay vendored so the build is hermetic; the sync keeps the vendored copy honest.
 *
 * WHY FOLLOW styles.css RATHER THAN LIST FILES. The five repos do not agree on layout.
 * AI Flotation keeps components at `base/components.css`, Refactored at
 * `css/components.css`, the rest at `components/components.css`. Every repo does,
 * however, publish a `styles.css` that imports its own files in its own order, and that
 * file is the contract its own explorer uses. Following it absorbs the differences that
 * exist today and the reorganisations that happen later, without this module needing to
 * know anything about any particular brand.
 *
 * This module does no I/O. It parses and plans; the caller fetches and writes. That
 * split is what makes the interesting behaviour testable without a network.
 */

'use strict';

const RAW_BASE = 'https://raw.githubusercontent.com/aleemcolaberry';

/**
 * The five brand design systems.
 *
 * `target` is deliberately nullable. Two of the five have no place to land in this
 * repository yet, and recording that with a reason is the point — a brand missing from
 * this list looks like an oversight, whereas a brand present with `target: null` is a
 * decision someone can read and reverse.
 *
 * `stripExternalImports` (optional) rewrites external `@import`s out of synced CSS; see
 * stripExternalImports below.
 *
 * @type {ReadonlyArray<{brandSlug: string, repo: string, target: string|null, note: string,
 *   stripExternalImports?: boolean}>}
 */
const DESIGN_SYSTEMS = Object.freeze([
  {
    brandSlug: 'ai-flotation',
    repo: 'AI-Flotation-Design-System',
    target: 'apps/ai-flotation-public/src/assets/design',
    note: 'Consumed by the static site.',
  },
  {
    brandSlug: 'cpn',
    repo: 'Career-Pathways-Network-Design-System',
    target: 'apps/cpn-public/src/assets/design',
    note: 'Consumed by the static site. Ships two directions, Grove and Vestry.',
  },
  {
    brandSlug: 'refactored',
    repo: 'Refactored.ai-Design-System',
    target: 'apps/refactored-public/src/assets/design',
    note:
      'Lands but is NOT yet imported: refactored.ai is still the legacy Bootstrap 4 port ' +
      'and links no local stylesheet. Syncing now means the tokens are current on the day ' +
      'that site is redesigned, rather than a fresh copy being taken by hand again.',
  },
  {
    brandSlug: 'colaberry-enterprise',
    repo: 'Colaberry-Enterprise-Design-System',
    target: 'apps/colaberry-enterprise-design/src/assets/design',
    note:
      'Vendored 2026-10-13 so the landing page renderer can read it. The note here used to ' +
      'say "no target", because the React app in frontend/ consumes CSS through the CRA ' +
      'build rather than as a linked stylesheet - true, and it meant these tokens were in a ' +
      'repository nobody here read. Four brands resolve to this theme key and every one of ' +
      'them rendered a landing page in a navy that belongs to no brand. ' +
      'The directory is "-design", not "-public": there is no site here, only the vendored ' +
      'system, which the backend pins its copy against. The src/assets/design tail is not ' +
      'decoration: every target must match one known shape, because this script WRITES to ' +
      'that path, and a test enforces it. The CRA question is untouched.',
  },
  {
    brandSlug: 'colaberry-training',
    repo: 'Colaberry-Training-Design-System',
    target: null,
    note:
      'No target: training.colaberry.com is not served from this repository. The brand is ' +
      'registered in brand_domains and records no events; there is no application here to ' +
      'style.',
  },
  {
    brandSlug: 'colaberry-app',
    repo: 'colaberry-design-system',
    target: 'frontend/src/colaberry',
    stripExternalImports: true,
    note:
      'The copy the React app in frontend/ (portal and admin) actually paints from: ' +
      'index.tsx imports ./colaberry/styles.css and brand-bridge.css re-points the legacy ' +
      'tokens at it. Cherry #FB2832 primary. Vendored by hand on 2026-06-25 and never ' +
      'synced until 2026-11-15; the only differences from upstream were four recorded ' +
      'local edits (see frontend/src/colaberry/PROVENANCE.md). Only the token layer ' +
      'reachable from styles.css is synced; components/core, assets/logo and PROVENANCE.md ' +
      'are not reachable from it and are never touched. Platform-only tokens live in ' +
      'frontend/src/styles/colaberry-platform-tokens.css so this copy can match upstream. ' +
      'External @imports are stripped because upstream fonts.css fetches Google Fonts on ' +
      'every page before consent, which was removed here on 2026-08-13.',
  },
]);

/**
 * Write targets outside apps/*\/src/assets/design.
 *
 * The sync WRITES to its target, so every target must match a known shape. This list is
 * the one deliberate exception and it names exact paths, never a pattern: a typo in the
 * registry must fail rather than land files somewhere new.
 */
const NON_APP_TARGETS = Object.freeze(['frontend/src/colaberry']);

const APP_TARGET_RE = /^apps\/[a-z0-9-]+\/src\/assets\/design$/;

/** True when the sync is allowed to write to this repo-relative directory. */
function isAllowedTarget(target) {
  return APP_TARGET_RE.test(String(target)) || NON_APP_TARGETS.includes(target);
}

/**
 * One whole `@import` statement, in any of its legal forms. IMPORT_RE above is built to
 * find the referenced path and stops at the first `;`, which is wrong for removal: a
 * Google Fonts URL carries `;` inside its quotes (`wght@0,400;0,500`), so removing what
 * IMPORT_RE matched would leave half a statement behind.
 */
const IMPORT_STMT_RE =
  /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')[^;]*;/gi;

/**
 * Replace every external `@import` with a comment naming what was removed.
 *
 * WHY. The build is hermetic by design (see the header), and an external `@import` is a
 * request to a third-party host on every page load. In frontend/src/colaberry it was also
 * a privacy defect: Google Fonts fetched before consent. Stripping deterministically at
 * sync time means the fix survives every future sync instead of being reverted by it.
 *
 * Comments are left alone, so a commented-out import is not rewritten and no comment is
 * nested inside another. Idempotent: the output contains no external import to strip.
 *
 * @param {string} css raw stylesheet text
 * @returns {string} the same text with external imports replaced
 */
function stripExternalImports(css) {
  return String(css)
    .split(/(\/\*[\s\S]*?\*\/)/)
    .map((segment) => {
      if (segment.startsWith('/*')) return segment;
      return segment.replace(IMPORT_STMT_RE, (stmt, ...groups) => {
        const ref = groups.slice(0, 5).find((g) => g !== undefined) || '';
        if (!isExternal(ref)) return stmt;
        return `/* design-sync: external @import removed (${ref}); the build is hermetic */`;
      });
    })
    .join('');
}

/** The one file every repo publishes, and the only entry point this module assumes. */
const ENTRY = 'styles.css';

/**
 * `@import url('tokens/colors.css');`, `@import url(tokens/colors.css);` and
 * `@import "tokens/colors.css";` are all legal CSS and all appear in the wild. Matching
 * only the first form would silently sync a subset of a repo that had been reformatted,
 * which is the failure mode this whole module exists to prevent.
 */
const IMPORT_RE = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*;/gi;

/** `url(...)` inside a stylesheet: fonts, background images, mask images. */
const URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

/** Absolute URLs and data URIs are somebody else's problem, not ours to vendor. */
function isExternal(ref) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref) || /^data:/i.test(ref);
}

/**
 * Strip CSS comments before scanning.
 *
 * A commented-out `@import` is not an import. Without this, a repo that had disabled a
 * stylesheet would still have it synced, and the vendored copy would carry a file the
 * design system itself no longer uses.
 */
function stripComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract the relative references a stylesheet declares.
 *
 * @param {string} css raw stylesheet text
 * @returns {{imports: string[], urls: string[]}} relative refs, de-duplicated, external
 *   and data: refs removed
 */
function parseReferences(css) {
  const clean = stripComments(css);
  const imports = [];
  const urls = [];

  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(clean)) !== null) {
    if (!isExternal(m[1])) imports.push(stripQuery(m[1]));
  }

  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(clean)) !== null) {
    const ref = stripQuery(m[1]);
    // An @import written as url(...) matches both patterns. Imports are followed as
    // stylesheets; counting them again as plain assets would fetch them twice and, worse,
    // stop them being parsed for their own imports.
    if (!isExternal(m[1]) && !imports.includes(ref)) urls.push(ref);
  }

  return { imports: unique(imports), urls: unique(urls) };
}

/** `fonts.css?v=3` and `fonts.css` are the same file in the repository. */
function stripQuery(ref) {
  return String(ref).split(/[?#]/)[0];
}

function unique(list) {
  return Array.from(new Set(list));
}

/**
 * Resolve a reference against the directory of the file that declared it.
 *
 * Returns null for anything that climbs out of the repository root. A design repo has no
 * legitimate reason to reference `../../etc/passwd`, and since the resolved path is used
 * to build both a fetch URL and a write path, a traversal here would write outside the
 * target directory. Refusing is cheaper than sanitising later.
 *
 * @param {string} fromPath repo-relative path of the referencing file
 * @param {string} ref the relative reference it declared
 * @returns {string|null} normalised repo-relative path, or null if it escapes the root
 */
function resolveRepoPath(fromPath, ref) {
  const baseParts = String(fromPath).split('/').slice(0, -1);
  const refParts = String(ref).replace(/^\.\//, '').split('/');
  const out = baseParts.slice();

  for (const part of refParts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null; // escapes the repository root
      out.pop();
    } else {
      out.push(part);
    }
  }

  if (out.length === 0) return null;
  return out.join('/');
}

/** The raw.githubusercontent URL for one file in one design repo. */
function rawUrl(repo, branch, repoPath) {
  return `${RAW_BASE}/${repo}/${branch}/${repoPath}`;
}

/**
 * Walk a design system from its entry point and produce the complete file list.
 *
 * Stylesheets are parsed recursively so a token file that imports another token file is
 * followed; non-CSS references (fonts) are collected but not parsed. `readFile` is
 * injected rather than imported so the traversal can be tested against a fixture repo
 * with no network involved.
 *
 * @param {object} options
 * @param {(repoPath: string) => Promise<string|Buffer|null>} options.readFile returns file
 *   contents, or null when the file does not exist
 * @param {string} [options.entry] entry stylesheet, defaults to styles.css
 * @returns {Promise<{files: string[], missing: string[]}>} every repo-relative path the
 *   design system reaches, entry first, plus anything referenced but absent
 */
async function collectFiles({ readFile, entry = ENTRY }) {
  const seen = new Set();
  const files = [];
  const missing = [];
  const queue = [{ path: entry, isCss: true }];

  while (queue.length > 0) {
    const item = queue.shift();
    if (seen.has(item.path)) continue;
    seen.add(item.path);

    const contents = await readFile(item.path);
    if (contents === null || contents === undefined) {
      missing.push(item.path);
      continue;
    }
    files.push(item.path);

    if (!item.isCss) continue;

    const { imports, urls } = parseReferences(String(contents));
    for (const ref of imports) {
      const resolved = resolveRepoPath(item.path, ref);
      if (resolved && !seen.has(resolved)) queue.push({ path: resolved, isCss: true });
    }
    for (const ref of urls) {
      const resolved = resolveRepoPath(item.path, ref);
      if (resolved && !seen.has(resolved)) queue.push({ path: resolved, isCss: false });
    }
  }

  return { files, missing };
}

/**
 * Compare what upstream holds against what is on disk.
 *
 * Buffers are compared byte for byte rather than as decoded strings, because the fonts
 * are binary and a string round-trip would corrupt them while still comparing equal.
 *
 * @param {Map<string, Buffer>} upstream repo-relative path to contents
 * @param {Map<string, Buffer>} local same, as currently vendored
 * @returns {{added: string[], changed: string[], removed: string[], unchanged: string[]}}
 */
function diffTrees(upstream, local) {
  const added = [];
  const changed = [];
  const unchanged = [];
  const removed = [];

  for (const [path, bytes] of upstream) {
    if (!local.has(path)) {
      added.push(path);
    } else if (!Buffer.from(bytes).equals(Buffer.from(local.get(path)))) {
      changed.push(path);
    } else {
      unchanged.push(path);
    }
  }
  for (const path of local.keys()) {
    if (!upstream.has(path)) removed.push(path);
  }

  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
  };
}

/** True when a diff would change the working tree. */
function hasDrift(diff) {
  return diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;
}

/**
 * The name of the ownership manifest written into every synced directory.
 *
 * WHY THIS EXISTS. The target directory is not exclusively the sync's. It also holds
 * hand-authored files: `DESIGN_SYSTEM.md`, which `site.css` tells the next developer to
 * read before changing anything, and `ai-flotation-mark.svg`, which the site references
 * but which no stylesheet imports so the walk never reaches it. A sync that treated
 * "not upstream" as "delete" would remove both on its first run, and the deletion would
 * look deliberate in the diff.
 *
 * So the sync removes only what it previously wrote. Anything it has never owned is left
 * exactly where it is.
 */
const MANIFEST = '.design-sync-manifest.json';

/**
 * Decide which files to delete on this run.
 *
 * @param {string[]} previouslyOwned paths from the last run's manifest
 * @param {Iterable<string>} upstreamPaths what upstream publishes now
 * @returns {string[]} files the sync owns and upstream has dropped
 */
function orphansToRemove(previouslyOwned, upstreamPaths) {
  const current = new Set(upstreamPaths);
  return (previouslyOwned || []).filter((p) => !current.has(p)).sort();
}

/**
 * Serialise the manifest.
 *
 * `generatedAt` is deliberately absent. A timestamp would make every run produce a diff
 * even when no design changed, which would open a pull request every night and train
 * everyone to ignore them. The manifest changes only when the owned file set changes.
 */
function buildManifest({ repo, branch, entry, files }) {
  return `${JSON.stringify(
    {
      note:
        'Generated by backend/src/scripts/syncDesignSystems.js. Lists the files this ' +
        'directory owns so the sync never deletes hand-authored ones. Do not edit.',
      repo,
      branch,
      entry,
      files: [...files].sort(),
    },
    null,
    2
  )}\n`;
}

module.exports = {
  DESIGN_SYSTEMS,
  NON_APP_TARGETS,
  isAllowedTarget,
  stripExternalImports,
  ENTRY,
  RAW_BASE,
  parseReferences,
  resolveRepoPath,
  rawUrl,
  collectFiles,
  diffTrees,
  hasDrift,
  isExternal,
  stripComments,
  MANIFEST,
  orphansToRemove,
  buildManifest,
};
