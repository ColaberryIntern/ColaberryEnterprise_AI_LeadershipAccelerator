/**
 * AF4.5's facts: the intern dev environment, the secret audit of the eleven repositories, and the
 * gated path a change takes into this repository.
 *
 * Data only, no rendering. Every number here was read from a setting, a database or a scan on
 * 2026-10-31, or is a count of tests that ran. Nothing is estimated, and the two things that were
 * NOT verified say so in GAPS rather than being left to a reader to notice.
 *
 * Taken from merged PRs #3535 (phase 1: the contract and the audit) and #3538 (phase 2: the
 * refusal policy and the importer).
 */
const TICKET = 'AF4.5';
const PHASE1_PR = 3535;
const PHASE2_PR = 3538;
const MERGED_ON = '2026-10-31';
const AUDIT_ON = '2026-10-31';
const GITLEAKS_VERSION = '8.30.1';

/**
 * THE HEADLINE. Ali ruled EXTRACT rather than fork on 2026-10-31, and that ruling has a
 * mechanical consequence the ticket did not anticipate: a GitHub pull request requires shared
 * commit history, so an intern cannot open one here AT ALL.
 *
 * The path therefore has to be a patch that something else applies, which is the safer shape
 * rather than a concession.
 */
const HEADLINE = {
  ruling: 'EXTRACT, not fork. An intern receives the parts of the platform they need; they do not '
    + 'take a copy of the whole thing.',
  consequence: 'A GitHub pull request can only be opened between repositories that share commit '
    + 'history, the same fork network. Every intern repository is a standalone project with '
    + 'unrelated history, so an intern CANNOT open a pull request here at all, short of being '
    + 'given write access, which the ticket puts out of scope.',
  whyBetter: 'So the path has to be a patch that something else applies. That is the better '
    + 'design rather than a workaround: the thing holding write access is reviewable, '
    + 'version-controlled code instead of a person\'s credential, and it cannot be persuaded.',
  bonus: 'It also means the pusher is never the approver, which matters concretely: '
    + 'require_last_push_approval is TRUE on this repository, so a branch pushed by the importer '
    + 'stays approvable by Ali in a way a branch an intern pushed would not.',
};

/** Branch protection and access, read from the settings rather than inferred from intent. */
const ACCESS = [
  ['Collaborators on this repository', '5, none of them an intern'],
  ['main branch protection', '1 approving review + 6 required status checks'],
  ['Conversation resolution required', 'yes'],
  ['Force push / branch deletion', 'blocked'],
  ['enforce_admins', 'FALSE, see the gaps'],
  ['Repositories connected to the platform', '54, across roughly 30 people'],
  ['The seven interns\' repositories', '11, all under their own accounts, none a fork of this one'],
];

/** The seven agent-build repositories as the platform has them connected. */
const REPOS = [
  ['Ellis', 'platform', 'Quincy Nkwain Ninying', 'qninying/platform-reliability-agent'],
  ['Maru', 'product experience', 'Mihret Netsereab', 'MihretColaberry1/ColaberryInternship'],
  ['Vic', 'sales', 'Victoria Spencer-Auber', 'vessette/Simple'],
  ['Maya', 'admissions', 'Kalkidan Bezabeh', 'Kalkidan2129/admissions'],
  ['Pip', 'internship', 'Tashima Diah', 'tashdiah-Data/ai-project'],
  ['Dara', 'curriculum', 'Ruth Kumera', 'rtkumera/AI-Agent-Project'],
  ['Ava', 'marketing', 'Sarbjit Kaur', 'sainisarbjit83-ai/Colaberry_Marketing_Agent'],
];

/** The audit verdict. Every commit on every ref, because a deleted secret survives in the blob. */
const AUDIT = {
  repos: 11,
  clean: 8,
  withFindings: 3,
  unscanned: 0,
  disclosures: 0,
  findings: 6,
  method: `The pinned gitleaks ${GITLEAKS_VERSION} with this repository's own .gitleaks.toml, over `
    + 'every commit on every ref via --log-opts=--all, with --redact=100 so the detector never '
    + 'republishes what it finds. The clone is full and --no-single-branch, because a shallow or '
    + 'single-branch clone silently reduces --all to one branch tip.',
  verdictRule: 'An ERROR row is never a clean verdict. gitleaks exits 0 clean, 1 leaks found and '
    + '>1 error; collapsing >1 into 0 reports a repository clean that was never scanned.',
};

/** Each finding triaged by reading the surrounding code, never the value. */
const TRIAGE = [
  {
    repo: 'qninying/ai-operations-center',
    finding: '4, all in mcp-server/src/evidenceRedaction.test.ts',
    verdict: 'Deliberate fixtures',
    why: 'Each one sits inside an it("redacts ...") case asserting that a redaction function '
      + 'strips it. This is the correct way to test redaction.',
  },
  {
    repo: 'qninying/ambit',
    finding: '1, src/totpLoginWiring.test.ts',
    verdict: 'Deliberate fixture',
    why: 'A throwaway PASSWORD beside a TOTP secret that is generated at runtime.',
  },
  {
    repo: 'qninying/HosPulse',
    finding: '1, command-center/systems.html',
    verdict: 'A publishable key, documented',
    why: 'The surrounding comment correctly notes it already ships in the deployed frontend '
      + 'bundle, and that service_role and DATABASE_URL are never referenced. Safe only if '
      + 'row-level security is on, which this audit did not check. See the gaps.',
  },
];

/**
 * THE CONTROL, AND WHAT IT CAUGHT. A verdict that is an ABSENCE is indistinguishable from a broken
 * detector, so the scanner is pointed at planted secrets first and the audit REFUSES to run unless
 * it finds every one of them.
 *
 * It caught three real defects during the build. Without it, each one would have shipped as a
 * green report.
 */
const CONTROL = {
  fixtures: 5,
  classes: 'AWS key, OpenAI key, RSA private key, a hardcoded env fallback, plus a clean file as '
    + 'the precision control',
  refuses: 'The audit calls process.exit(1) on any miss, before it scans a single intern '
    + 'repository. A report of green rows is exactly what a broken detector produces.',
  caught: [
    {
      defect: 'The config built to be STRICTER was strictly WEAKER, and the first audit run '
        + 'reported "9 clean" where the truth was 8.',
      detail: 'A separate defaults-only gitleaks config was written on the assumption it would '
        + 'catch more. Measured: it found more in 0 of 11 repositories and MISSED a Colaberry '
        + 'rule hit in qninying/ambit. .gitleaks.toml is a strict superset, extending the '
        + 'defaults with four Colaberry rules, so the superset is now the verdict and the extra '
        + 'config was deleted.',
    },
    {
      defect: 'The OpenAI rule was never actually exercised, because the fixture was not an '
        + 'OpenAI key.',
      detail: 'The rule requires the literal marker T3BlbkFJ, base64 of "OpenAI", between two '
        + '20-character halves. A generic sk- followed by 48 characters does not match it. The '
        + 'fixture had only ever been flagged by the generic NAME=value rule, so a pass proved '
        + 'nothing about the rule it was there to test.',
    },
    {
      defect: 'A control fixture is itself load-bearing: editing one to "look more realistic" '
        + 'broke detection and read as a broken scanner for two debugging rounds.',
      detail: 'The private-key fixture body was hand-improved and the result matched no rule in '
        + 'any scan mode. Isolated by scanning with DEFAULTS ONLY, which separates a rule problem '
        + 'from an allowlist problem. The fixture is now built from an empirically verified '
        + 'construction and carries a docblock saying not to hand-edit it.',
    },
  ],
};

/**
 * A stated premise that turned out to be false, corrected in the repository rather than left in
 * the design rationale.
 */
const CORRECTION = {
  claimed: 'That the repository\'s process.env and TODO allowlists were the reason a separate '
    + 'scanner config was needed, because they would suppress a real key sitting on such a line.',
  truth: 'gitleaks allowlist regexes default to regexTarget = "secret": they are matched against '
    + 'the CAPTURED SECRET, not the line. So process.env.X or a TODO beside a key can never '
    + 'suppress it. regexTarget = "match" is the explicit override, and it is not in use.',
  consequence: 'The config header and the scanner docblock now record the measurement instead of '
    + 'the assumption, so the next reader inherits a fact rather than a plausible story.',
};

/** The parser defect, and the design property that surfaced it. */
const PARSER = {
  defect: 'The target-list parser split on [\\n,] in a single pass, so a comma inside a comment '
    + 'produced fragments that escaped the #-stripping. The audit then refused a line with '
    + '"from (not owner/name)".',
  fix: 'Strip the comment per line FIRST, then split on commas. Two regression tests pin it.',
  why: 'It surfaced because REJECTIONS ARE RETURNED, NEVER DROPPED. A silently dropped line is a '
    + 'repository nobody scanned, inside a report that says how many repositories were clean.',
};

/** The ten refusal classes. Named, in the style of promotionCriteria.ts, and unit tested. */
const REFUSALS = [
  ['workflow_or_actions_change', 'anything under .github/'],
  ['infrastructure_change', 'docker-compose*.yml, Dockerfile*, nginx/, preview-db-init/'],
  ['secret_gate_change', '.gitleaks.toml, .gitleaksignore, .husky/, the scan scripts'],
  ['ci_or_ownership_change', 'scripts/ci/, CODEOWNERS, the deploy script'],
  ['governance_change', 'CLAUDE.md, directives/'],
  ['env_or_credential_file', '.env (but not .env.example), *.pem, *.key, *.p12, id_rsa'],
  ['path_escapes_repository', 'an absolute path, or any .. segment'],
  ['too_many_files_to_review', 'more than 40 files: that is a merge, not a change request'],
  ['secret_detected_in_patch', 'checked BEFORE the push, because pushing is what publishes it'],
  ['no_files_changed', 'an unreadable commit, which must not import as a no-op PR'],
];

/**
 * Why the whole directory, rather than the dangerous keys inside the YAML. This is the single
 * most important rule in the policy.
 */
const GITHUB_RULE = 'A workflow runs with this repository\'s secrets, so a change under .github/ '
  + 'is arbitrary code execution with credentials rather than a code change. A human reviewing a '
  + 'diff is good at "is this code correct" and bad at "does this one line exfiltrate every '
  + 'secret we hold", because that diff looks small, plausible and boring. Refusing the directory '
  + 'is the only version of the rule that cannot be worked around, and a refusal cannot be '
  + 'approved past.';

/** Both outcomes proven against real intern commits, not fixtures. The allow case is the control. */
const PROOF = [
  ['REFUSED', 'qninying/platform-reliability-agent@3ffe3ceb',
    'workflow_or_actions_change, naming .github/workflows/ci.yml'],
  ['ALLOWED', 'tashdiah-Data/ai-project@832955b3',
    'no refusal fired, and the patch scans clean'],
];

/** The importer's safety properties, each one a deliberate choice with a reason. */
const SAFETY = [
  ['Dry run by default', '--apply is required before anything is pushed'],
  ['Idempotent', 'the branch name derives from the source commit, an existing branch is reused, '
    + 'and an existing pull request is reported rather than opened twice'],
  ['Never touches a working branch', 'the patch is applied in a throwaway git worktree built from '
    + 'origin/main, because this is a shared tree with other sessions\' work in it'],
  ['Scans before pushing', 'pushing is the act that publishes a secret'],
  ['Never approves or merges', 'it opens a pull request and stops'],
  ['Keeps the intern as author', 'git am preserves authorship and makes the importer the '
    + 'committer, so the reviewer sees whose work it is and the contribution stays theirs'],
];

const CRITERIA = [
  {
    n: 1,
    text: 'No intern holds write access to the enterprise repo main branch, verified by reading '
      + 'the settings rather than from intent.',
    met: true,
    evidence: 'Read from the collaborator list and branch protection on 2026-10-31: 5 '
      + 'collaborators, none an intern; main requires 1 approving review and 6 checks. '
      + 'Re-readable at any time.',
  },
  {
    n: 2,
    text: 'No intern repo contains a secret, a token or a production connection string, verified '
      + 'by a scan of the actual contents.',
    met: true,
    evidence: '11 of 11 scanned over every commit on every ref. 8 clean, 3 with findings, 0 '
      + 'unscanned, and 0 confirmed disclosures: all 6 findings triaged to deliberate security '
      + 'test fixtures or a documented publishable key. The detector was verified against '
      + 'planted secrets first and refuses to run if it misses one.',
  },
  {
    n: 3,
    text: 'One real change travels intern repo to enterprise repo through a review the intern did '
      + 'not perform, demonstrated end to end.',
    met: false,
    evidence: 'NOT MET, and the contract says so on its face. The mechanism is verified in both '
      + 'directions against real intern commits, but no change has been pushed, reviewed and '
      + 'merged through it. That final run opens a real pull request here attributed to an '
      + 'intern, which is outward-facing, so it waits for Ali rather than happening quietly.',
  },
  {
    n: 4,
    text: 'The contract names what an intern may never hold, not only what they may do.',
    met: true,
    evidence: 'Seven numbered classes, plus the two code shapes that actually cause a disclosure '
      + 'and the reporting path if it already happened. It is the longer half of the document, '
      + 'because the repositories are public.',
  },
  {
    n: 5,
    text: 'REVIEW STATE set to BLOCKED - ALI DECISION REQUIRED until Ali rules on '
      + 'fork-versus-extract.',
    met: true,
    evidence: 'Ali ruled EXTRACT on 2026-10-31. The ruling is what produced the patch-import '
      + 'design, since extract removes the shared history a pull request needs.',
  },
];

/** Stated rather than smoothed over. Three of these are somebody else's call to make. */
const GAPS = [
  'enforce_admins is FALSE on main, so the admin account can bypass branch protection and push '
  + 'directly. No intern holds that account, so it is not an intern risk, but "every change is '
  + 'reviewed" is not literally true today. Closing it is a repository-settings change and Ali\'s '
  + 'call.',
  'The secret gate is a pre-commit hook HERE and nothing in an intern repository yet. Until the '
  + 'hook is installed there, the scan is a periodic audit rather than a gate, and a secret can '
  + 'sit published between runs.',
  'Criterion 3 is unmet: the importer is built and verified, and no change has traveled it end '
  + 'to end.',
  'The contract governs the 7 interns; 54 repositories are connected. The other 43 belong to '
  + 'staff and students, are equally public, and are governed by nothing written here.',
  'The one publishable key found is harmless only if row-level security is enabled on every table '
  + 'it can reach. This audit read the repository, not the Supabase project, so that was NOT '
  + 'verified. It is one check on one dashboard and it is worth doing.',
];

/** What ran. A count of tests is evidence only when the gate it stands for is named. */
const VERIFICATION = {
  tests: 92,
  suites: '52 on the refusal policy, 18 on the target parser, 22 on the test-typecheck ratchet',
  pairing: 'Every refusal test is paired with an ALLOW case on a neighboring path, plus a CONTROL '
    + 'assertion, because a policy that refused everything would pass every refusal test on its '
    + 'own while making the path unusable.',
  secretScan: 'secret-scan.js clean over 7,622 tracked files',
  spelling: 'American spelling gate clean over 257 files',
  individual: 'All new files scan clean individually under .gitleaks.toml',
  notClaimed: 'Backend tsc --noEmit and the full jest suite were NOT run locally and are not '
    + 'claimed: this work adds no TypeScript and no backend source beyond a .js test, which the '
    + 'test-typecheck gate does not compile. CI ran all of them on both pull requests, 10 of 10 '
    + 'checks green.',
};

module.exports = {
  TICKET, PHASE1_PR, PHASE2_PR, MERGED_ON, AUDIT_ON, GITLEAKS_VERSION,
  HEADLINE, ACCESS, REPOS, AUDIT, TRIAGE, CONTROL, CORRECTION, PARSER,
  REFUSALS, GITHUB_RULE, PROOF, SAFETY, CRITERIA, GAPS, VERIFICATION,
};
