/**
 * Locate the repository root for the static source-scanning security agents.
 *
 * These agents read TypeScript source off disk. Where that source lives depends
 * entirely on the runtime:
 *   - dev / CI:  the repo is checked out, so walking up from __dirname finds it
 *   - production: the image ships only compiled `dist` — there is no source tree
 *
 * The previous hardcoded `path.resolve(__dirname, '../../../../..')` resolved to
 * `/` inside the container, so the agents looked for `/backend/src` and failed
 * every single run. Returning null lets callers skip deliberately instead of
 * reporting a phantom failure.
 */
import fs from 'fs';
import path from 'path';

/** A directory only counts as the repo root if the source we intend to scan is actually there. */
function isProjectRoot(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, 'backend', 'src', 'routes'));
}

/**
 * Returns the repo root containing `backend/src`, or null when no source tree is
 * available in this runtime (the normal production case).
 */
export function resolveProjectRoot(): string | null {
  const explicit = process.env.PROJECT_ROOT;
  if (explicit) {
    return isProjectRoot(explicit) ? explicit : null;
  }

  // Walk up from this file. Depth is bounded so a missing tree terminates fast
  // rather than probing all the way to the filesystem root on every run.
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (isProjectRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
