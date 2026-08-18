/**
 * repoReference — turn whatever a student pastes into `{ owner, repo }`, or say
 * precisely why it is not a repo reference.
 *
 * PURE. No I/O. This runs before any network call, so a typo costs nothing and
 * a hostile string never reaches GitHub.
 *
 * What students actually paste, observed rather than imagined: the browser URL
 * with a `/tree/main` on the end because they were looking at a branch, the
 * clone box's `.git` suffix, the SSH form from their terminal history, and
 * `owner/name` because that is how GitHub itself writes it. All four are the
 * same repo and all four are accepted.
 *
 * What is deliberately refused: a bare repo name with no owner (ambiguous — we
 * would have to guess whose repo it is), and any host that is not GitHub (the
 * platform reads through the GitHub API; a GitLab URL cannot work and saying so
 * now is kinder than a 404 later).
 */
import { RepoConnectError } from './connectErrors';

export interface RepoReference {
  owner: string;
  repo: string;
  /** Canonical https URL — what we persist and show. */
  url: string;
}

/** GitHub account names: 1–39 chars, alphanumeric or single interior hyphens. */
const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
/** GitHub repo names: 1–100 chars of [A-Za-z0-9._-]; "." and ".." are reserved. */
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

/** Path segments that follow the repo in a browser URL and are not part of it. */
const TRAILING_SEGMENTS = new Set([
  'tree', 'blob', 'commits', 'commit', 'pull', 'pulls', 'issues', 'settings',
  'actions', 'releases', 'branches', 'wiki', 'compare', 'tags', 'archive',
]);

function reject(input: string, why: string): never {
  throw new RepoConnectError(
    'InvalidRepoReference',
    `"${input.slice(0, 120)}" is not a GitHub repository reference — ${why}. ` +
      'Paste the repo URL from your browser (https://github.com/you/your-project) or just "you/your-project".',
    { given: input.slice(0, 200) },
  );
}

/**
 * Parse a repo reference. Throws `RepoConnectError('InvalidRepoReference')` with
 * a message that names what was wrong rather than restating the rule.
 */
export function parseRepoReference(input: unknown): RepoReference {
  if (typeof input !== 'string' || !input.trim()) {
    throw new RepoConnectError(
      'InvalidRepoReference',
      'Paste the GitHub URL of the repo you want to use — for example https://github.com/you/your-project.',
    );
  }

  const raw = input.trim();
  let rest = raw;

  // scp-style SSH: git@github.com:owner/repo.git — the form with NO scheme.
  // Anything carrying `scheme://` goes to the URL branch below; without this
  // guard `ssh://git@github.com/...` backtracks into reading "ssh" as the host.
  const scp = /^(?:[\w.-]+@)?([\w.-]+):(.+)$/.exec(rest);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(rest)) {
    const host = scp[1].toLowerCase();
    if (!GITHUB_HOSTS.has(host)) reject(raw, `${scp[1]} is not GitHub, and the platform reads builds through the GitHub API`);
    rest = scp[2];
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rest) || /^(www\.)?github\.com\//i.test(rest)) {
    // Full or scheme-less URL. Normalise so the URL parser always has a scheme.
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rest) ? rest : `https://${rest}`;
    let parsed: URL;
    try {
      parsed = new URL(withScheme);
    } catch {
      reject(raw, 'it is not a URL the platform can read');
    }
    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (!['http', 'https', 'ssh', 'git'].includes(scheme)) {
      reject(raw, `"${scheme}" is not a supported scheme`);
    }
    if (!GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) {
      reject(raw, `${parsed.hostname} is not GitHub, and the platform reads builds through the GitHub API`);
    }
    rest = parsed.pathname;
  }

  // Now `rest` is a path: /owner/repo[.git][/tree/main][/]
  const segments = rest.split('/').filter(Boolean);
  if (segments.length < 2) {
    reject(raw, segments.length === 1
      ? 'it names a repo but not its owner — the platform needs "owner/repo"'
      : 'it has no owner or repo in it');
  }

  const owner = segments[0];
  let repo = segments[1];

  // Anything after the repo must be a known browser path, not a third path
  // segment we are silently discarding — "you/repo/extra" is a typo, not a URL.
  if (segments.length > 2 && !TRAILING_SEGMENTS.has(segments[2].toLowerCase())) {
    reject(raw, `"${segments[2]}" is not part of a repository address`);
  }

  if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4);

  if (!OWNER_RE.test(owner)) {
    reject(raw, `"${owner}" is not a valid GitHub account name`);
  }
  if (!REPO_RE.test(repo) || repo === '.' || repo === '..') {
    reject(raw, `"${repo}" is not a valid GitHub repository name`);
  }

  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

/** True when the reference parses. For callers that want a boolean, not a throw. */
export function isRepoReference(input: unknown): boolean {
  try {
    parseRepoReference(input);
    return true;
  } catch (err) {
    // Deliberately narrow: only OUR classified rejection means "not a reference".
    // Anything else is a defect and must not be reported as bad student input.
    if (err instanceof RepoConnectError) return false;
    throw err;
  }
}

/** Case-insensitive identity — GitHub owners and repo names are not case-sensitive. */
export function sameRepo(
  a: { owner?: string | null; repo?: string | null },
  b: { owner?: string | null; repo?: string | null },
): boolean {
  return (
    !!a.owner && !!a.repo && !!b.owner && !!b.repo &&
    a.owner.toLowerCase() === b.owner.toLowerCase() &&
    a.repo.toLowerCase() === b.repo.toLowerCase()
  );
}
