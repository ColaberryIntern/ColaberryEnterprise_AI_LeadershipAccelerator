/**
 * protectedProjects — the deny-list of project ids no student-facing action may
 * ever touch, however the request is shaped.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `projects` looks like a table of student capstones. One row is not.
 *
 *   fcce50ef-fe01-471d-a3ff-cd6948d092c2
 *
 * is the PLATFORM'S OWN project record. It sits on Ali's enrollment
 * (`aced5b39-0b47-496a-b172-e1f5c042bf8a`) and carries roughly 144,238 rows
 * across 15+ tables — 139,802 `queue_history_entries`, 2,339
 * `verification_logs`, 1,303 `system_state_snapshots`, 270 `requirements_maps`,
 * 177 `build_manifests`, 156 `capabilities`, 156 `features`. It is the
 * BuildManifest telemetry target named in CLAUDE.md, and it is hardcoded as
 * `PROJECT_ID` in six backfill scripts:
 *
 *   scripts/backfillSmartVerification.js          scripts/backfillBuildManifests.js
 *   scripts/closeRequirement.js                   backend/src/scripts/backfillFrontendRoutes.js
 *   backend/src/scripts/backfillFrontendCallGraph.js
 *   backend/src/scripts/backfillAgentRolesCache.js  (+ backfillAgentAttribution,
 *   backfillReclassifyLinkedFiles, backfillPhantomPages)
 *
 * Because it lives on a real enrollment, ANY feature phrased as "let a student
 * manage their own projects" points at it by default. A cleanup of exactly that
 * shape was proposed on 2026-08-13 and correctly refused; the repo wrote a
 * standing rule from the incident, recorded in
 * `.claude/skills/build-student-project/SKILL.md`:
 *
 *     "A project id can be infrastructure. If a deduplication ever looks
 *      warranted, count the dependent rows first and assume the outlier is
 *      load-bearing until proven otherwise."
 *
 * THE CONTRACT
 * ------------
 * This is enforced BY ID, server-side, in two independent places:
 *
 *   1. the QUERY that lists archivable projects (so it never appears as an
 *      option, on any client), and
 *   2. the HANDLER that performs the archive (so a hand-rolled `curl` at the
 *      endpoint is refused even though no UI ever offered it).
 *
 * Both, deliberately. A UI-only filter is not a guard — it is a decoration on
 * an open door. Hiding the row and refusing the row are different promises, and
 * only the second one survives a client the platform did not write.
 *
 * The row also has `name IS NULL`, which is how it reads as "Your build" in any
 * client that falls back on a missing name — one more reason it must never be
 * offered: it does not even look like infrastructure from the outside.
 */

/**
 * Project ids that are platform infrastructure rather than student work.
 *
 * Frozen and exported so tests can assert the exact membership, rather than
 * asserting against a literal they re-type (a typo in a test literal would make
 * the test pass against nothing).
 */
export const PROTECTED_PROJECT_IDS: ReadonlySet<string> = new Set([
  'fcce50ef-fe01-471d-a3ff-cd6948d092c2',
]);

/**
 * True when this project id is platform infrastructure.
 *
 * Case-insensitive and whitespace-tolerant on purpose: a UUID is the same UUID
 * in upper case, and `req.params` arrives as an unsanitised string. A guard that
 * can be defeated by `FCCE50EF-...` is not a guard.
 */
export function isProtectedProject(projectId: unknown): boolean {
  if (projectId === null || projectId === undefined) return false;
  return PROTECTED_PROJECT_IDS.has(String(projectId).trim().toLowerCase());
}

/**
 * The message a caller gets when they aim at a protected project.
 *
 * Deliberately explanatory rather than a bare 403: the one human who can
 * actually reach this in production is Ali, on his own enrollment, and "not
 * found" would send him looking for a bug that is not there.
 */
export const PROTECTED_PROJECT_MESSAGE =
  'This project is part of the platform itself and cannot be archived.';
