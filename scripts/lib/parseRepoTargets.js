/**
 * Turn a list of lines into a validated list of `owner/name` repositories.
 *
 * Pure: no I/O, no `process.exit`, no logging. The CLI decides what to do with a
 * rejection; this decides what a rejection IS. That split exists so the rules below can
 * be tested without a network, a clone, or a scanner.
 *
 * ## Why rejections are returned rather than dropped
 *
 * A silently-dropped line is a repository nobody scanned, in a report that says how many
 * repositories were clean. The count has to add up, so every input line ends up either
 * in `repos` or in `rejected` with a reason.
 */
'use strict';

/** GitHub allows letters, digits, hyphen, underscore and dot in both halves. */
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * @param {string[]|string} input lines, or one string to split on newlines/commas
 * @returns {{repos: string[], rejected: Array<{value: string, reason: string}>}}
 */
function parseRepoTargets(input) {
  /**
   * ORDER IS LOAD-BEARING: comments are stripped PER LINE, and only what survives is
   * split on commas.
   *
   * The first version split on newlines and commas in one pass. A comment line that
   * happened to contain a comma -- "repositories, from github_connections" -- was then
   * cut into fragments, and every fragment after the comma had lost its leading `#`.
   * The audit refused to start, naming "from" as an unscannable repository. That was the
   * refusal doing its job; a parser that silently dropped unrecognised lines would have
   * scanned the list and said nothing.
   */
  const rawLines = Array.isArray(input)
    ? input.map(String)
    : String(input == null ? '' : input).split('\n');

  const lines = [];
  for (const line of rawLines) {
    /* No repository name can contain '#', so everything after one is a comment. */
    const withoutComment = line.split('#')[0];
    for (const piece of withoutComment.split(',')) lines.push(piece);
  }

  const repos = [];
  const rejected = [];
  /* GitHub owner/name are case-insensitive, so two spellings are one repository.
     Deduping case-sensitively would clone and scan the same history twice and report
     it as two clean repositories. */
  const seen = new Map();

  for (const raw of lines) {
    const value = raw.trim();
    if (!value) continue;

    if (!REPO.test(value)) {
      rejected.push({ value, reason: 'not owner/name' });
      continue;
    }
    /* `.` and `..` as a path segment would escape a clone directory. */
    if (value.split('/').some((p) => p === '.' || p === '..')) {
      rejected.push({ value, reason: 'path traversal in owner or name' });
      continue;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      if (seen.get(key) !== value) {
        rejected.push({ value, reason: `duplicate of ${seen.get(key)} (case-insensitive)` });
      }
      continue;
    }
    seen.set(key, value);
    repos.push(value);
  }

  return { repos, rejected };
}

module.exports = { parseRepoTargets, REPO };
