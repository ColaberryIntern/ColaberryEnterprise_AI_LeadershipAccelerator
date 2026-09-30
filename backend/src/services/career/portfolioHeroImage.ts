/**
 * portfolioHeroImage - finds the one image in a learner's own repository that can
 * stand as a project's hero.
 *
 * WHY FROM THE REPO. Ali: "The project should grab a picture from the repo and use
 * that as a hero image." The alternative was stock art, and stock art on a portfolio
 * is the one element that is not the person's work - it makes every other claim on
 * the page look decorated rather than evidenced. A screenshot the learner committed
 * is theirs, and it is the thing the project actually looks like.
 *
 * WHY PUBLIC REPOS ONLY. The URL this produces is handed to a stranger's browser, so
 * it must be readable without the platform's token. A private repo is checked and
 * skipped rather than proxied: proxying would mean this server re-serving private
 * repository contents to anonymous readers, which is a different and much larger
 * decision than "show a screenshot".
 *
 * WHEN IT RUNS. At review/approval time, never on a public page view. The resolved
 * URL is FROZEN into `approved_identity` with the rest of the learner-authored text,
 * so a stranger's page load costs zero GitHub calls and a reviewer approves the exact
 * image that will publish.
 */
import { githubApiRequest } from '../sbp/repoConnect/githubRepoClient';

/**
 * Raster formats only.
 *
 * SVG is deliberately absent: it is a script-bearing document, and raw.githubusercontent
 * serves it as text/plain anyway, so including it would only ever produce broken frames.
 */
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** 8MB. Above this a browser on a phone pays for a hero nobody asked to download. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Paths that are never a project's hero, whatever they are named. */
const EXCLUDED_SEGMENTS = [
  'node_modules', '.git', '.github', 'vendor', 'dist', 'build', 'out', 'coverage',
  '__tests__', 'test', 'tests', 'spec', 'fixtures', '__snapshots__', 'venv',
  'site-packages', '.next', '.cache',
];

/** Names that are branding or chrome rather than a look at the thing. */
const DEMOTED = /(logo|icon|favicon|avatar|badge|sprite|placeholder|thumbnail|profile)/i;

/** Names that suggest someone is showing the product working. */
const PROMOTED = /(screenshot|screen-shot|hero|demo|preview|banner|cover|dashboard|architecture|diagram|ui|app|home|landing|result)/i;

/** Directories people put presentation images in. */
const PROMOTED_DIRS = /^(docs?|assets?|screenshots?|images?|img|media|static|public|examples?)(\/|$)/i;

export interface RepoRef { owner: string; repo: string }

/**
 * The owner/repo in a GitHub URL, or null.
 *
 * Anything not literally github.com is rejected rather than guessed at, because the
 * result is used to build a raw.githubusercontent URL - a host that must never be
 * derived from an attacker-controlled string.
 */
export function parseGithubRepoUrl(url: unknown): RepoRef | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
  return { owner, repo };
}

export interface TreeEntry { path: string; size?: number }

/**
 * Score one candidate. Higher wins; negative means "only if nothing else".
 *
 * The weights encode one judgement: a picture of the product beats a picture of the
 * brand. A file called `logo.png` at the root loses to `docs/screenshot-home.png`
 * even though the first is easier to find.
 */
function scorePath(path: string): number {
  const lower = path.toLowerCase();
  const name = lower.split('/').pop() || '';
  const depth = lower.split('/').length - 1;

  let score = 0;
  if (PROMOTED.test(name)) score += 6;
  if (PROMOTED_DIRS.test(lower)) score += 3;
  if (DEMOTED.test(name)) score -= 8;
  // A README image is usually the one the author chose to show first.
  if (/readme/i.test(name)) score += 2;
  // Shallower is more likely to be deliberate; deep paths are usually incidental.
  score -= Math.min(depth, 5);
  return score;
}

/**
 * The best hero candidate in a repository tree, or null.
 *
 * DETERMINISTIC by construction: ties break on score, then shortest path, then
 * lexicographic order, so the same repository always yields the same hero and a
 * re-approval does not silently swap the image.
 */
export function pickHeroImagePath(entries: TreeEntry[]): string | null {
  if (!Array.isArray(entries)) return null;
  const candidates = entries.filter((e) => {
    const p = e?.path;
    if (typeof p !== 'string' || !IMAGE_EXT.test(p)) return false;
    if (typeof e.size === 'number' && e.size > MAX_IMAGE_BYTES) return false;
    const segments = p.toLowerCase().split('/');
    return !segments.some((s) => EXCLUDED_SEGMENTS.includes(s));
  });
  if (!candidates.length) return null;

  let best = candidates[0];
  let bestScore = scorePath(best.path);
  for (const c of candidates.slice(1)) {
    const s = scorePath(c.path);
    if (
      s > bestScore
      || (s === bestScore && c.path.length < best.path.length)
      || (s === bestScore && c.path.length === best.path.length && c.path < best.path)
    ) {
      best = c;
      bestScore = s;
    }
  }
  return best.path;
}

/** The public raw URL for a path in a repo's default branch. */
export function rawImageUrl(ref: RepoRef, path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/HEAD/${encoded}`;
}

interface HeroDeps {
  apiRequest?: typeof githubApiRequest;
}

/**
 * Resolve one repository to a hero image URL, or null.
 *
 * Never throws. Every failure mode here - a private repo, a deleted repo, a rate
 * limit, a malformed body - has the same correct answer for this feature: no hero
 * image, render the typographic fallback. A portfolio must not fail to publish
 * because GitHub was slow.
 */
export async function resolveHeroImageUrl(
  repoUrl: unknown,
  deps: HeroDeps = {},
): Promise<string | null> {
  const ref = parseGithubRepoUrl(repoUrl);
  if (!ref) return null;
  const apiRequest = deps.apiRequest || githubApiRequest;
  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;

  try {
    // 1. PUBLIC ONLY. This check is the whole safety property of this module.
    const meta = await apiRequest('GET', base);
    if (!meta.ok) return null;
    const parsedMeta = JSON.parse(meta.body);
    if (!parsedMeta || parsedMeta.private !== false) return null;

    // 2. One recursive tree read on the default branch.
    const tree = await apiRequest('GET', `${base}/git/trees/HEAD?recursive=1`);
    if (!tree.ok) return null;
    const parsedTree = JSON.parse(tree.body);
    const items: TreeEntry[] = Array.isArray(parsedTree?.tree)
      ? parsedTree.tree
        .filter((t: any) => t && t.type === 'blob' && typeof t.path === 'string')
        .map((t: any) => ({ path: t.path, size: typeof t.size === 'number' ? t.size : undefined }))
      : [];

    const path = pickHeroImagePath(items);
    return path ? rawImageUrl(ref, path) : null;
  } catch {
    return null;
  }
}

/**
 * Attach `hero_image_url` to each project row that has a GitHub repo.
 *
 * Resolves at most MAX_LOOKUPS repositories so one learner with twenty projects
 * cannot turn a reviewer's page load into twenty GitHub round trips; the rest keep
 * the typographic fallback. Bounded, and logged where it is called.
 */
const MAX_LOOKUPS = 8;

export async function withHeroImages<T extends Record<string, any>>(
  projects: T[],
  deps: HeroDeps = {},
): Promise<T[]> {
  if (!Array.isArray(projects) || !projects.length) return projects || [];
  const out: T[] = [];
  let lookups = 0;
  for (const p of projects) {
    const url = p?.github_repo_url;
    if (!url || lookups >= MAX_LOOKUPS) {
      out.push({ ...p, hero_image_url: p?.hero_image_url ?? null });
      continue;
    }
    lookups += 1;
    // eslint-disable-next-line no-await-in-loop -- bounded to MAX_LOOKUPS and kept
    // sequential on purpose: a burst of parallel calls is what trips GitHub's
    // secondary rate limit, and this runs at review time where latency is cheap.
    const hero = await resolveHeroImageUrl(url, deps);
    out.push({ ...p, hero_image_url: hero });
  }
  return out;
}
