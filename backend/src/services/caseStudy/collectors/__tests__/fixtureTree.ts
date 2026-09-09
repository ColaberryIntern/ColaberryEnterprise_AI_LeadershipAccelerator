import type { CollectorCommit, CollectorInput } from '../collectorTypes';

/**
 * A fixture repository, built as a path list rather than files on disk.
 *
 * NO NETWORK, NO FILESYSTEM, NO CLOCK. A collector reads a tree and a commit
 * log and nothing else, so a fixture is literally an array of strings. That is
 * the point of keeping the collectors pure: the tests below describe repository
 * shapes in one screen each, and they run in milliseconds.
 */
export const SHA = 'd6e3db66f0a04c1e9a7b2f5c8e3d1a0b6c4f9e27';

export function treeInput(paths: readonly string[], truncated = false): CollectorInput {
  return { sha: SHA, tree: { paths, truncated }, commits: [] };
}

export function commitInput(dates: readonly string[]): CollectorInput {
  const commits: CollectorCommit[] = dates.map((authoredDate, i) => ({
    sha: `${i}`.padStart(40, 'a'),
    authoredDate,
  }));
  return { sha: SHA, tree: { paths: [], truncated: false }, commits };
}

/** A small, realistic TypeScript service: four modules, two of them tested. */
export const SMALL_SERVICE: readonly string[] = [
  'README.md',
  'package.json',
  'package-lock.json',
  'src/index.ts',
  'src/abacEvaluator.ts',
  'src/auditLog.ts',
  'src/transportSelector.ts',
  'src/demoUnsafeAction.ts',
  'src/__tests__/abacEvaluator.test.ts',
  'src/__tests__/auditLog.test.ts',
  'docs/decisions/0001-pin-the-sha.md',
  'docs/decisions/0002-refuse-to-guess-a-figure.md',
  'docs/decisions/README.md',
  'node_modules/left-pad/index.js',
  'node_modules/left-pad/__tests__/left-pad.test.js',
];
