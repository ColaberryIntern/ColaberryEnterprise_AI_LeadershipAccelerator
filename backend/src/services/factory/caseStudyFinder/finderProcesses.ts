/**
 * finderProcesses - turn a repository's file list into candidate BUSINESS PROCESSES. PURE.
 *
 * A business process here is a module a person could tell a story about: a directory with enough real code to be
 * one capability (an inbox triage, a gap detector, a call scorer), with its tests and any docs that name it.
 *
 *   platform repo   each directory under backend/src/services/ (and one level deeper when a sub-directory is big
 *                   enough to stand alone), because that is where this repo keeps one capability per directory;
 *   other repos     each directory directly under the first source root found (src/, app/, backend/src/, server/,
 *                   lib/, or the repo root); a small repo with no such split is ONE process.
 * Bounded: at most MAX_PROCESSES_PER_REPO, biggest first.
 */
import type { ProcessCandidate, RepoRef } from './finderTypes';
import { humanName, tokens } from './finderText';

export const MIN_CODE_FILES = 4;
export const MAX_PROCESSES_PER_REPO = 80;
const MAX_SAMPLE = 12;
const MAX_DOCS = 6;
const MAX_KEYWORDS = 25;

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|cs|rb|php|sql|ipynb|kt|swift|rs)$/i;
const TEST = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$/i;
const IGNORE = /(^|\/)(node_modules|dist|build|coverage|vendor|\.git|\.github|\.next|__pycache__|venv|\.venv|migrations?|seeds?|__fixtures__|fixtures|public|static|assets)\//i;
const DOC = /\.md$/i;
const SOURCE_ROOTS = ['backend/src', 'src', 'app', 'server', 'lib', 'api'];
export const PLATFORM_SERVICES_ROOT = 'backend/src/services';

interface Bucket { root: string; code: string[]; tests: string[] }

function bucketsUnder(paths: readonly string[], base: string, depth2: boolean): Map<string, Bucket> {
  const prefix = base ? `${base}/` : '';
  const map = new Map<string, Bucket>();
  const add = (root: string, p: string): void => {
    const b = map.get(root) ?? { root, code: [], tests: [] };
    if (TEST.test(p)) b.tests.push(p); else b.code.push(p);
    map.set(root, b);
  };
  for (const p of paths) {
    if (!p.startsWith(prefix) || !CODE.test(p) || IGNORE.test(`/${p}`)) continue;
    const rest = p.slice(prefix.length).split('/');
    if (rest.length < 2) continue; // a file directly in the base is not a process
    const top = `${prefix}${rest[0]}`;
    if (depth2 && rest.length >= 3 && !/^(__tests__|tests?)$/i.test(rest[1])) add(`${top}/${rest[1]}`, p);
    else add(top, p);
  }
  if (!depth2) return map;
  // A sub-directory too small to stand alone folds back into its parent, so its files are not lost.
  for (const b of [...map.values()]) {
    const depth = b.root.slice(prefix.length).split('/').length;
    if (depth < 2 || b.code.length >= MIN_CODE_FILES) continue;
    const parent = b.root.split('/').slice(0, -1).join('/');
    const into = map.get(parent) ?? { root: parent, code: [], tests: [] };
    into.code.push(...b.code); into.tests.push(...b.tests);
    map.set(parent, into); map.delete(b.root);
  }
  return map;
}

function docsFor(paths: readonly string[], nameTokens: string[]): string[] {
  if (!nameTokens.length) return [];
  const out: string[] = [];
  for (const p of paths) {
    if (!DOC.test(p) || IGNORE.test(`/${p}`)) continue;
    const base = p.split('/').pop() ?? '';
    const t = new Set(tokens(base));
    if (nameTokens.every((n) => t.has(n))) out.push(p);
    if (out.length >= MAX_DOCS) break;
  }
  return out;
}

function keywordsOf(root: string, files: string[]): string[] {
  const freq = new Map<string, number>();
  const seg = root.split('/').pop() ?? root;
  for (const t of tokens(seg)) freq.set(t, (freq.get(t) ?? 0) + 5);
  for (const f of files) for (const t of tokens(f.split('/').pop() ?? '')) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_KEYWORDS).map(([t]) => t);
}

function toCandidate(ref: RepoRef, b: Bucket, allPaths: readonly string[]): ProcessCandidate {
  const seg = b.root.split('/').pop() || ref.repo;
  const name = humanName(seg);
  return {
    key: `${ref.owner}/${ref.repo}:${b.root}`,
    owner: ref.owner, repo: ref.repo, source: ref.source, root: b.root, name,
    codeFiles: b.code.length, testFiles: b.tests.length,
    docPaths: docsFor(allPaths, tokens(seg)),
    samplePaths: [...b.code].sort((x, y) => x.length - y.length).slice(0, MAX_SAMPLE),
    keywords: keywordsOf(b.root, [...b.code, ...b.tests]),
  };
}

/** Candidate processes for one repo's file list. */
export function findProcesses(ref: RepoRef, paths: readonly string[]): ProcessCandidate[] {
  let buckets: Map<string, Bucket>;
  if (ref.source === 'platform') {
    buckets = bucketsUnder(paths, PLATFORM_SERVICES_ROOT, true);
  } else {
    const root = SOURCE_ROOTS.find((r) => paths.some((p) => p.startsWith(`${r}/`))) ?? '';
    buckets = bucketsUnder(paths, root, false);
    const big = [...buckets.values()].filter((b) => b.code.length >= MIN_CODE_FILES);
    if (!big.length) {
      // A small repo is one process: the whole thing.
      const code = paths.filter((p) => CODE.test(p) && !IGNORE.test(`/${p}`));
      if (code.length < MIN_CODE_FILES - 1) return [];
      buckets = new Map([['', { root: '', code: code.filter((p) => !TEST.test(p)), tests: code.filter((p) => TEST.test(p)) }]]);
    }
  }
  return [...buckets.values()]
    .filter((b) => b.code.length >= (b.root === '' ? 1 : MIN_CODE_FILES))
    .sort((a, b) => b.code.length - a.code.length)
    .slice(0, MAX_PROCESSES_PER_REPO)
    .map((b) => toCandidate(ref, b, paths));
}
