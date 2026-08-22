#!/usr/bin/env node
/**
 * Extraction boundary validator.
 *
 * Proves that each public application could be lifted out of this repository without
 * dragging the platform with it. A convention alone does not survive a deadline; this
 * is a script that fails a build.
 *
 * Allowed edges:
 *     apps/*      ->  packages/*
 *     apps/*      ->  the platform HTTP API (a URL, not an import)
 *     packages/*  ->  packages/*
 *
 * Forbidden edges:
 *     apps/A      ->  apps/B          (apps must not know about each other)
 *     apps/*      ->  frontend/src/*  (would tie an app to the platform frontend build)
 *     apps/*      ->  backend/src/*   (would tie a browser bundle to server code)
 *     packages/*  ->  apps/*          (inverts the dependency direction)
 *     packages/*  ->  frontend|backend
 *
 * Run: node scripts/validate-app-boundaries.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['apps', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

/** ES import, dynamic import, and CommonJS require — all three, because one is not enough. */
const IMPORT_PATTERNS = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function extractImports(contents) {
  const specifiers = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(contents)) !== null) specifiers.push(match[1]);
  }
  return specifiers;
}

/** Which workspace does a file belong to? e.g. 'apps/cpn-public'. */
function workspaceOf(relativePath) {
  const parts = relativePath.split(path.sep);
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * Resolve an import to the workspace it targets, or null when it is an external package
 * (which is always allowed — npm dependencies are not a boundary concern).
 */
function targetWorkspace(fromFile, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    // A scoped workspace alias such as @refactored/ui-core is an allowed package edge.
    if (specifier.startsWith('@refactored/')) return `packages/${specifier.split('/')[1]}`;
    return null;
  }
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  const relative = path.relative(ROOT, resolved);
  if (relative.startsWith('..')) return null;
  return workspaceOf(relative);
}

function isForbidden(fromWorkspace, toWorkspace) {
  if (!toWorkspace || fromWorkspace === toWorkspace) return null;

  const [fromRoot] = fromWorkspace.split('/');
  const [toRoot] = toWorkspace.split('/');

  if (fromRoot === 'apps') {
    if (toRoot === 'apps') return 'an application must not import another application';
    if (toRoot === 'frontend') return 'an application must not import the platform frontend';
    if (toRoot === 'backend') return 'an application must not import backend source';
  }
  if (fromRoot === 'packages') {
    if (toRoot === 'apps') return 'a shared package must not depend on an application';
    if (toRoot === 'frontend' || toRoot === 'backend') {
      return 'a shared package must not depend on the platform build';
    }
  }
  return null;
}

function main() {
  const violations = [];
  let filesScanned = 0;

  for (const scanRoot of SCAN_ROOTS) {
    for (const file of walk(path.join(ROOT, scanRoot))) {
      filesScanned += 1;
      const relative = path.relative(ROOT, file);
      const fromWorkspace = workspaceOf(relative);
      const contents = fs.readFileSync(file, 'utf8');

      for (const specifier of extractImports(contents)) {
        const toWorkspace = targetWorkspace(file, specifier);
        const reason = isForbidden(fromWorkspace, toWorkspace);
        if (reason) {
          violations.push({ file: relative, specifier, from: fromWorkspace, to: toWorkspace, reason });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(`[boundaries] OK — ${filesScanned} file(s) scanned, no forbidden edges.`);
    process.exit(0);
  }

  console.error(`[boundaries] ${violations.length} forbidden edge(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    imports "${v.specifier}"  (${v.from} -> ${v.to})`);
    console.error(`    ${v.reason}\n`);
  }
  process.exit(1);
}

main();
