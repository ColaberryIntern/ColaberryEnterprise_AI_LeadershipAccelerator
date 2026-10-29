/**
 * AF10.7 — read the Release 0 documents out of an intern's repository.
 *
 * Ali, 20 Oct: "I want to see their artifacts as they build them so I can look them over."
 *
 * ## Three answers, never two
 *
 * Every path comes back as exactly one of `present`, `absent` or `unreadable`, and collapsing the
 * last two is the specific defect this ticket forbids ("nothing is posted for a repository the
 * platform cannot read, and the reason is stated"). `absent` is a 404 and is the NORMAL early
 * state for a cohort that has not pushed yet. `unreadable` carries a reason and an `error_class`.
 *
 * That distinction is not re-implemented here. `fetchRepoFile` already draws it — 404 returns
 * null, every other failure throws classified — and it is injected rather than imported so this
 * module stays a pure function of its dependencies and its tests need no container.
 *
 * ## Why the injected reader and not the legacy one
 *
 * `githubService.readFileFromRepo` swallows every failure into `null`, so an unreadable private
 * repo is indistinguishable from an absent file. Worse, tokens are stored as EMPTY STRINGS rather
 * than null (`githubService.ts:21`, `access_token_encrypted: accessToken || ''`), and
 * `if (token)` is falsy for `''`, so that path silently degrades to an ANONYMOUS request which
 * 404s on a private repo. The injected `fetchRepoFile` raises a ConfigError naming the platform
 * instead of pretending the file is not there.
 *
 * Pure except for the injected reader. No I/O of its own, no Basecamp, no database.
 */

/**
 * A document larger than this is read but truncated for the comment body, and says so. Basecamp
 * comments are not a document store, and a 300KB paste helps nobody.
 */
const MAX_DOC_BYTES = 100000;

/** The statuses, exported so callers and tests cannot drift on a string literal. */
const PRESENT = 'present';
const ABSENT = 'absent';
const UNREADABLE = 'unreadable';

/**
 * Read every deliverable path for one repo.
 *
 * @param {object} args
 * @param {{owner: string, name: string, url?: string}|null} args.repo  resolved repo pointer
 * @param {Record<string,string>} args.deliverables  RESEARCH_DELIVERABLES, injected from dist
 * @param {(owner: string, repo: string, path: string, opts?: object) => Promise<string|null>} args.fetchRepoFile
 * @param {string} [args.correlationId]
 * @returns {Promise<Array<object>>} one entry per deliverable, in a stable key order
 */
async function readDeliverables({ repo, deliverables, fetchRepoFile, correlationId }) {
  const keys = Object.keys(deliverables || {}).sort();

  // No repo is a real answer and it applies to every path at once. Stated once per path so the
  // caller never has to special-case a missing repo to explain itself.
  if (!repo || !repo.owner || !repo.name) {
    return keys.map((key) => ({
      key,
      path: deliverables[key],
      status: UNREADABLE,
      reason: 'No repository is connected to this project yet, so there is nothing to read.',
      error_class: 'RepoNotConnected',
    }));
  }

  const out = [];
  for (const key of keys) {
    const path = deliverables[key];
    try {
      // Sequential on purpose. Six paths across seven repos is 42 reads; firing them all at once
      // is how a read job earns a 403 from GitHub's secondary rate limit.
      // eslint-disable-next-line no-await-in-loop
      const content = await fetchRepoFile(repo.owner, repo.name, path, { correlationId });
      if (content === null || content === undefined) {
        out.push({ key, path, status: ABSENT });
        continue;
      }
      const bytes = Buffer.byteLength(content, 'utf8');
      const truncated = bytes > MAX_DOC_BYTES;
      out.push({
        key,
        path,
        status: PRESENT,
        content: truncated ? content.slice(0, MAX_DOC_BYTES) : content,
        bytes,
        truncated,
      });
    } catch (err) {
      // `fetchRepoFile` throws a classified RepoConnectError carrying `error_class` and a sentence
      // written for the reader. Both are preserved; neither is paraphrased.
      out.push({
        key,
        path,
        status: UNREADABLE,
        reason: err && err.message ? String(err.message) : 'The platform could not read this file.',
        error_class: (err && (err.error_class || err.name)) || 'Error',
      });
    }
  }
  return out;
}

/** Counts by status, for a one-line summary that does not require re-walking the list. */
function summarize(docs) {
  return (docs || []).reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, { present: 0, absent: 0, unreadable: 0 });
}

module.exports = {
  readDeliverables,
  summarize,
  MAX_DOC_BYTES,
  PRESENT,
  ABSENT,
  UNREADABLE,
};
