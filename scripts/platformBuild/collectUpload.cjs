'use strict';
/*
 * collectUpload - the files the agent produced that the platform will accept.
 *
 * This runs OUTSIDE the agent's sandbox, in a process that can read what the agent cannot. The
 * agent can create symlinks, so following one here would publish any file the runner can read
 * (index.html -> /proc/self/environ). Every path is therefore required to be its own real path.
 */
const fs = require('node:fs');
const path = require('node:path');

const UPLOAD_EXT = /\.(html|css|js|json|md)$/;

function collectUpload(workspace) {
  const root = fs.realpathSync(workspace);
  const files = {};
  let skipped = 0;

  /** lstat, but null for a missing path or one reached through a symlink at any level. */
  const real = (rel) => {
    const abs = path.join(root, rel);
    const st = fs.lstatSync(abs, { throwIfNoEntry: false });
    if (!st) return null;
    if (st.isSymbolicLink() || fs.realpathSync(abs) !== abs) { skipped += 1; return null; }
    return st;
  };
  const add = (rel) => {
    const st = real(rel);
    if (!st) return;
    if (!st.isFile() || st.nlink > 1 || !UPLOAD_EXT.test(rel)) { skipped += 1; return; }
    files[rel] = fs.readFileSync(path.join(root, rel), 'utf8');
  };
  const walk = (relDir) => {
    const st = real(relDir);
    if (!st || !st.isDirectory()) return;
    for (const entry of fs.readdirSync(path.join(root, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.name.startsWith('.')) { skipped += 1; continue; }
      if (entry.isDirectory()) walk(rel);
      else add(rel);
    }
  };

  add('index.html');
  walk('command-center');
  add('demo/demo-spec.json');
  return { files, skipped };
}

module.exports = { collectUpload };
