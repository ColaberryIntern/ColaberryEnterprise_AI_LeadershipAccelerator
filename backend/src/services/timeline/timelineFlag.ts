/**
 * Feature-flag gate for the Timeline Engine cutover.
 *
 * `TIMELINE_ENGINE_ENABLED=true` turns the engine on. An optional per-cohort
 * allowlist (`TIMELINE_ENGINE_COHORTS=<id>,<id>`) narrows the blast radius so
 * cohorts flip one at a time (MIGRATION_PLAN.md §4). Flag off ⇒ the legacy
 * curriculum path is authoritative and untouched.
 *
 * Kept env-based + dependency-free for Phase 1; can move behind
 * settingsService later without changing callers.
 */

export function isTimelineEngineEnabled(cohortId?: string | null): boolean {
  if (process.env.TIMELINE_ENGINE_ENABLED !== 'true') return false;
  const allowlist = (process.env.TIMELINE_ENGINE_COHORTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return true; // enabled for all cohorts
  if (!cohortId) return false;
  return allowlist.includes(cohortId);
}
