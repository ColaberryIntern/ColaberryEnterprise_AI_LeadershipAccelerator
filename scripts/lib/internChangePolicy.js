/**
 * What an imported intern change is allowed to touch.
 *
 * Pure decision model: paths in, named refusals out. No network, no git, no filesystem,
 * no logging. The importer does the I/O; this decides. That split is deliberate, so the
 * rules can be tested exhaustively without a clone, and so a reviewer can read the whole
 * policy in one screen.
 *
 * ## Why a refusal list and not a review checklist
 *
 * The enterprise repo's own gate is a human approval. A human approving a diff is good
 * at "is this code correct" and bad at "does this one line in a workflow file exfiltrate
 * every secret this repository holds" — because that diff looks small, plausible, and
 * boring. So the dangerous classes are refused by code BEFORE a human ever sees them,
 * and a refusal cannot be clicked away.
 *
 * ## The one that matters most
 *
 * `.github/` is refused in full. A GitHub Actions workflow runs with the repository's
 * secrets, so a change there is not a code change — it is arbitrary code execution with
 * credentials. It is the single highest-value target in any repository and it is where a
 * supply-chain change hides. Refusing the directory rather than enumerating dangerous
 * keys inside a YAML file is the only version of this rule that cannot be worked around.
 *
 * Refusals are NAMED, in the style of this repo's `promotionCriteria.ts`, so a report can
 * say which rule fired rather than "rejected".
 */
'use strict';

/**
 * Each rule: a name, a test, and the sentence a reader needs to understand the refusal.
 *
 * Order is report order, not precedence — every matching rule is reported, because
 * telling an intern about one problem at a time wastes a round trip each time.
 */
const PATH_RULES = [
  {
    name: 'workflow_or_actions_change',
    matches: (p) => /^\.github\//.test(p),
    why: 'A workflow runs with this repository\'s secrets, so a change here is arbitrary '
      + 'code execution with credentials rather than a code change.',
  },
  {
    name: 'infrastructure_change',
    matches: (p) => /^(docker-compose[\w.-]*\.ya?ml|Dockerfile[\w.-]*)$/.test(p)
      || /^nginx\//.test(p)
      || /^preview-db-init\//.test(p),
    why: 'Production infrastructure. Escalation-tier in CLAUDE.md, and not something an '
      + 'intern change path should be able to reach.',
  },
  {
    name: 'secret_gate_change',
    matches: (p) => /^\.gitleaks(\.toml|ignore)$/.test(p)
      || /^\.husky\//.test(p)
      || /^scripts\/(secret-scan|ensure-gitleaks|lint-route-auth)\.js$/.test(p),
    why: 'Weakening the secret gate is how the next secret gets through, so the gate is '
      + 'not reachable from the path it guards.',
  },
  {
    name: 'ci_or_ownership_change',
    matches: (p) => /^scripts\/ci\//.test(p)
      || /(^|\/)CODEOWNERS$/.test(p)
      || /^scripts\/deploy-prod\.sh$/.test(p),
    why: 'Deploy scripts, CI helpers and code ownership decide who may approve what. A '
      + 'change here edits the review itself.',
  },
  {
    name: 'governance_change',
    matches: (p) => /(^|\/)CLAUDE\.md$/.test(p) || /^directives\//.test(p),
    why: 'The operating contract and the directives are the rules the review is '
      + 'conducted under. Changing them is a governance decision, not a build task.',
  },
  {
    name: 'env_or_credential_file',
    /* `.env.example` is the file an intern SHOULD add, so it is explicitly allowed. */
    matches: (p) => (/(^|\/)\.env/.test(p) && !/\.example$/.test(p) && !/\.sample$/.test(p))
      || /\.(pem|key|p12|pfx|jks|keystore)$/.test(p)
      || /(^|\/)id_(rsa|ed25519|ecdsa)$/.test(p),
    why: 'A credential-bearing file must never travel in a patch. Commit a .env.example '
      + 'with empty keys instead.',
  },
  {
    name: 'path_escapes_repository',
    matches: (p) => p.split('/').some((s) => s === '..') || p.startsWith('/') || /^[A-Za-z]:/.test(p),
    why: 'An absolute path or a .. segment writes outside the repository when the patch '
      + 'is applied.',
  },
];

/** A patch that rewrites half the repository is not reviewable, whatever it contains. */
const MAX_FILES = 40;

/**
 * @param {object} change
 * @param {string[]} change.paths       repo-relative paths the patch touches
 * @param {boolean} [change.secretFound] true when the secret scan flagged the patch
 * @param {number}  [change.maxFiles]
 * @param {string[]|Set<string>} [change.repoPaths] this repository's tracked paths. When
 *   supplied, a patch with no footprint here at all is refused -- see the rule below.
 *   Omitted, the check does not run, so this stays a pure decision model the caller feeds.
 * @returns {{allowed: boolean, refusals: Array<{name: string, why: string, paths?: string[]}>}}
 */
function evaluateChange({
  paths, secretFound = false, maxFiles = MAX_FILES, repoPaths = null,
}) {
  const list = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p.trim()) : [];
  const refusals = [];

  /* An empty patch is refused rather than imported as a no-op PR: it means the commit
     could not be read, which is a different problem from "nothing changed". */
  if (!list.length) {
    refusals.push({
      name: 'no_files_changed',
      why: 'The patch touches no files, which usually means the commit could not be read '
        + 'rather than that it was empty.',
    });
  }

  for (const rule of PATH_RULES) {
    const hit = list.filter((p) => rule.matches(normalize(p)));
    if (hit.length) refusals.push({ name: rule.name, why: rule.why, paths: hit });
  }

  if (list.length > maxFiles) {
    refusals.push({
      name: 'too_many_files_to_review',
      why: `${list.length} files exceeds the reviewable limit of ${maxFiles}. Split it, `
        + 'or it is not a change request but a merge.',
    });
  }

  /*
   * A patch that touches nothing this repository has is the intern's own project state,
   * not a contribution to this codebase.
   *
   * This rule is here because of a real failure on 2026-11-01. The dry run passed a
   * commit that edited `.colaberry/progress.json` -- a file only the intern's repo has --
   * and `git am` then died with exit 128, because there is no file to place the hunk in
   * and no base blob for `-3` to merge against. Every refusal above asks "is this path
   * DANGEROUS"; none asked "is this path even OURS", so the answer was yes by default.
   *
   * Deliberately scoped to the unambiguous case of ZERO overlap. A partial overlap may
   * still conflict, and that is caught by actually attempting the apply rather than
   * guessed at here, because a filename match is not a content match: both repositories
   * have a `README.md`, and they are different documents that share a name.
   */
  const known = repoPaths instanceof Set ? repoPaths
    : (Array.isArray(repoPaths) ? new Set(repoPaths) : null);
  if (known && known.size && list.length
      && !list.some((p) => known.has(normalize(p)))) {
    refusals.push({
      name: 'no_path_in_this_repository',
      why: 'None of these paths exists in this repository, so the patch is the intern\'s '
        + 'own project state rather than a change to this codebase. There is nothing here '
        + 'for the hunks to apply to.',
      paths: list.map((p) => normalize(p)),
    });
  }

  /* The scan result is passed in rather than run here, so this stays pure -- but it is
     reported as a refusal like any other so one code path handles every rejection. */
  if (secretFound) {
    refusals.push({
      name: 'secret_detected_in_patch',
      why: 'The secret scan flagged this patch. It is refused before the branch is '
        + 'pushed, because pushing it is what publishes it.',
    });
  }

  return { allowed: refusals.length === 0, refusals };
}

/** Backslashes arrive from Windows-authored patches; the rules are written in POSIX. */
function normalize(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

module.exports = { evaluateChange, PATH_RULES, MAX_FILES, normalize };
