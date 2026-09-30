/**
 * releaseChecks — what a release must satisfy before it may ship. PURE, no I/O.
 *
 * Master plan §Gate 14 lists ten checks and says **the delivery profile decides which are
 * mandatory**. So the check list is universal and the *obligation* is per-profile: an
 * internal tool does not need an accessibility audit, and a government delivery cannot
 * skip one.
 *
 * ## `migration_rehearsal` is on this list, and this repository currently fails it
 *
 * That is not a hypothetical. This codebase has no migration framework: 53+ `ensure*Schema`
 * modules run idempotent raw DDL at boot, and `sync({alter:true})` once produced ~50k
 * duplicate constraints and OOM-ed Postgres. The Refactored Delivery OS build has added
 * **19 tables** of such DDL across Gates 1–12, wired into `server.ts`, and none of it has
 * ever executed against a real schema — it arms on the next production deploy.
 *
 * Encoding the check here does not fix that. It does mean the gate will *say so* rather
 * than letting a release describe itself as ready while carrying un-rehearsed DDL, which
 * is the difference between a known risk and a surprise.
 */

/** The ten release checks from master plan §Gate 14. */
export type ReleaseCheck =
  | 'stories_complete'
  | 'requirements_covered'
  | 'tests'
  | 'browser'
  | 'security'
  | 'accessibility'
  | 'ai_evals'
  | 'migration_rehearsal'
  | 'rollback'
  | 'client_acceptance';

export const RELEASE_CHECKS: readonly ReleaseCheck[] = [
  'stories_complete',
  'requirements_covered',
  'tests',
  'browser',
  'security',
  'accessibility',
  'ai_evals',
  'migration_rehearsal',
  'rollback',
  'client_acceptance',
];

export function isReleaseCheck(value: string): value is ReleaseCheck {
  return (RELEASE_CHECKS as readonly string[]).includes(value);
}

export const RELEASE_CHECK_MEANING: Record<ReleaseCheck, string> = {
  stories_complete: 'Every story in scope reached a terminal, successful state.',
  requirements_covered: 'Every requirement in scope is implemented by something that shipped.',
  tests: 'Unit and integration suites pass against the release candidate.',
  browser: 'The workflow works in a real browser, not only in assertions.',
  security: 'No known vulnerability, exposed secret or unguarded route ships.',
  accessibility: 'The interface is usable by people who do not use it the way we do.',
  ai_evals: 'Agent behaviour was measured against its evaluations.',
  migration_rehearsal:
    'Schema changes were rehearsed against a production-structure copy before they run at boot.',
  rollback: 'A tested way back exists if this release is wrong.',
  client_acceptance: 'The client agreed this is what they asked for.',
};

/**
 * Which checks each profile makes mandatory.
 *
 * Expressed here rather than as free strings on the profile so the two cannot drift: a
 * profile naming a check this module does not define would be a silent no-op, and a
 * silent no-op in a release gate is worse than an absent gate because it looks like
 * coverage.
 */
export const PROFILE_MANDATORY_CHECKS: Record<string, readonly ReleaseCheck[]> = {
  internal_tool: ['stories_complete', 'requirements_covered', 'tests', 'migration_rehearsal', 'rollback'],
  commercial_standard: [
    'stories_complete',
    'requirements_covered',
    'tests',
    'security',
    'migration_rehearsal',
    'rollback',
    'client_acceptance',
  ],
  // Government takes the full list. Nothing on it is optional for a public body, and the
  // profile's waiver mechanism (Gate 13) is the only way to drop one — on the record.
  government_public_sector: [...RELEASE_CHECKS],
};

export function mandatoryChecksFor(profileKey: string): readonly ReleaseCheck[] {
  return PROFILE_MANDATORY_CHECKS[profileKey] ?? RELEASE_CHECKS;
}

/**
 * Outcome of a single check.
 *
 * `not_run` is distinct from `fail` and both block. Same discipline as Gate 9's evidence
 * outcomes: a recorded `not_run` says "we looked and chose not to measure", which is
 * auditable, whereas an absent result says nothing at all — and neither is a pass.
 */
export type ReleaseCheckOutcome = 'pass' | 'fail' | 'not_run';

export interface ReleaseCheckResult {
  check: ReleaseCheck;
  outcome: ReleaseCheckOutcome;
  detail?: string | null;
}
