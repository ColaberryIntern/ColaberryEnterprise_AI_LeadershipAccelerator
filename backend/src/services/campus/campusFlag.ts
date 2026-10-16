/**
 * campusFlag - who sees Colaberry Campus (the walkable-map navigation) in the
 * learner portal.
 *
 * THREE MODES, ONE ENV VAR. `CAMPUS_ENABLED` is `off` (default), `allowlist`
 * or `all`. `allowlist` admits a participant whose enrollment id is in
 * `CAMPUS_ENROLLMENT_IDS` or whose cohort id is in `CAMPUS_COHORT_IDS` (both
 * comma-separated). `all` is how the campus becomes the default navigation for
 * everyone (Basecamp ticket C12) - one env change, no deploy of code.
 *
 * WHY A PURE PREDICATE IN A LEAF MODULE. Same reasoning as
 * caseStudySurfaceLabAccess.ts: the rule is this function, and every boundary
 * case (blank, whitespace, an unknown mode, a list with blank entries, a caller
 * with no ids) is a one-line assertion against it instead of a router test.
 *
 * DEFAULT CLOSED. `undefined`, `''`, `off` and any unrecognised mode all mean
 * no. The campus is an opt-in navigation change; a configuration mistake must
 * leave the portal exactly as it is today, never switch everyone over.
 *
 * NO HARDCODED IDENTIFIER. Who is in the pilot is data from the environment,
 * grantable and revocable without a code change.
 *
 * FAILURE-FIRST. (1) Nothing here can throw: no I/O, no parsing that fails.
 * (2) No retry is meaningful. (3) Recovery from a wrong setting is editing the
 * env var and restarting the backend. (4) Not handled: nothing.
 */

export type CampusMode = 'off' | 'allowlist' | 'all';

export interface CampusFlagSettings {
  mode: string | null | undefined;
  enrollmentIds: string | null | undefined;
  cohortIds: string | null | undefined;
}

export interface CampusViewer {
  enrollmentId: string | null | undefined;
  cohortId: string | null | undefined;
}

/** Normalise the raw mode string. Anything that is not exactly a known mode is `off`. */
export function parseCampusMode(raw: string | null | undefined): CampusMode {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'all' || v === 'allowlist' ? v : 'off';
}

/** Split a comma-separated id list, trimming and dropping blanks. */
export function parseIdList(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Is the campus on for this participant? */
export function campusEnabledFor(viewer: CampusViewer, settings: CampusFlagSettings): boolean {
  const mode = parseCampusMode(settings.mode);
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  const enrollmentId = (viewer.enrollmentId ?? '').trim();
  const cohortId = (viewer.cohortId ?? '').trim();
  if (enrollmentId && parseIdList(settings.enrollmentIds).includes(enrollmentId)) return true;
  if (cohortId && parseIdList(settings.cohortIds).includes(cohortId)) return true;
  return false;
}
