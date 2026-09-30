/**
 * capeGovernancePersonaService — CAPE Phase 6 (design doc §12 "Simulator
 * personas", §16 Phase 6). Read-only. Finds real accounts matching each of
 * the 5 documented persona profiles for the Explanation Simulator, and
 * supports a plain email/ID lookup for a specific student.
 *
 * Per this run's execution contract (Assumption 5): personas are a
 * documented, honest BEST-EFFORT search over real data, reusing Phase 5's
 * already-shipped `getLifecycleMode()` classifier (design doc §10) — NOT a
 * new classification model, and NEVER fabricated/synthetic data. A persona
 * with no real match in this environment returns an explicit
 * `enrollment_id: null` + `note`, never a made-up row.
 *
 * Mapping (best real signal available for each design-doc persona):
 *   - "New learner, no resume"          -> LifecycleMode 'foundation'
 *   - "New learner, experienced resume" -> LifecycleMode 'experienced_cold_start'
 *   - "Active Week 5 learner"           -> LifecycleMode 'active_builder'
 *     (the classifier has no week-number granularity yet — 'active_builder'
 *     is the closest real signal; see execution-contract.md/handoff.md for
 *     the honest limitation this approximation carries)
 *   - "Returning learner"               -> LifecycleMode 'returning_after_absence'
 *   - "Near-Architect learner"          -> LifecycleMode 'architect_track'
 *
 * Bounded scan: classifying every enrollment in the DB is not practical for
 * an admin-only, occasional-use panel. A single pass over the
 * `CANDIDATE_SCAN_LIMIT` most recently created enrollments is classified
 * once (not once per persona) and bucketed — a real, honest trade-off (a
 * persona might exist further back in the table and not be found), logged
 * explicitly rather than silently presented as exhaustive.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { getLifecycleMode, type LifecycleMode } from './capeLifecycleModeService';

const CANDIDATE_SCAN_LIMIT = 50;

export type SimulatorPersonaSlug =
  | 'new_no_resume' | 'new_experienced_resume' | 'active_week5_learner'
  | 'returning_learner' | 'near_architect_learner';

const PERSONA_TO_MODE: Record<SimulatorPersonaSlug, LifecycleMode> = {
  new_no_resume: 'foundation',
  new_experienced_resume: 'experienced_cold_start',
  active_week5_learner: 'active_builder',
  returning_learner: 'returning_after_absence',
  near_architect_learner: 'architect_track',
};

export const ALL_PERSONA_SLUGS: SimulatorPersonaSlug[] = [
  'new_no_resume', 'new_experienced_resume', 'active_week5_learner', 'returning_learner', 'near_architect_learner',
];

export interface PersonaMatch {
  persona: SimulatorPersonaSlug;
  mode: LifecycleMode;
  enrollment_id: string | null;
  email: string | null;
  note: string | null;
}

interface CandidateRow {
  id: string;
  email: string;
}

function logWarn(event: string, err: any) {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event,
    error_class: err?.name || 'Error', outcome: 'failure', context: { message: err?.message },
  }));
}

/** Classifies up to `CANDIDATE_SCAN_LIMIT` recent enrollments ONCE, bucketing
 * the first match found for each of the 5 personas. Never throws — a
 * classification failure for one candidate is skipped (fail-soft), not fatal
 * to the whole scan. */
export async function listPersonas(): Promise<PersonaMatch[]> {
  const found = new Map<SimulatorPersonaSlug, PersonaMatch>();

  let candidates: CandidateRow[] = [];
  try {
    candidates = await sequelize.query<CandidateRow>(
      `SELECT id, email FROM enrollments ORDER BY created_at DESC LIMIT :limit`,
      { replacements: { limit: CANDIDATE_SCAN_LIMIT }, type: QueryTypes.SELECT },
    );
  } catch (err: any) {
    logWarn('cape_governance_persona_candidate_scan_failed', err);
    candidates = [];
  }

  for (const candidate of candidates) {
    if (found.size === ALL_PERSONA_SLUGS.length) break;
    let mode: LifecycleMode;
    try {
      mode = (await getLifecycleMode(candidate.id)).mode;
    } catch (err: any) {
      logWarn('cape_governance_persona_classify_failed', err);
      continue;
    }
    const persona = (Object.entries(PERSONA_TO_MODE) as Array<[SimulatorPersonaSlug, LifecycleMode]>)
      .find(([, m]) => m === mode)?.[0];
    if (persona && !found.has(persona)) {
      found.set(persona, { persona, mode, enrollment_id: candidate.id, email: candidate.email, note: null });
    }
  }

  return ALL_PERSONA_SLUGS.map((persona) => found.get(persona) ?? {
    persona,
    mode: PERSONA_TO_MODE[persona],
    enrollment_id: null,
    email: null,
    note: `no matching account found in this environment (scanned the ${CANDIDATE_SCAN_LIMIT} most recently created enrollments)`,
  });
}

export interface EnrollmentLookupResult {
  enrollment_id: string;
  email: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plain email/ID search for the simulator's manual lookup field. Fully
 * parameterized (no string interpolation into SQL — CLAUDE.md's SQL-injection
 * rule) regardless of what the caller types in. Returns null (not a throw)
 * for no match — a 404 the caller renders, not a 500. */
export async function lookupEnrollment(query: string): Promise<EnrollmentLookupResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const rows = await sequelize.query<EnrollmentLookupResult>(
      UUID_RE.test(trimmed)
        ? `SELECT id AS enrollment_id, email FROM enrollments WHERE id = :q LIMIT 1`
        : `SELECT id AS enrollment_id, email FROM enrollments WHERE email ILIKE :q ORDER BY created_at DESC LIMIT 1`,
      { replacements: { q: UUID_RE.test(trimmed) ? trimmed : trimmed }, type: QueryTypes.SELECT },
    );
    return rows[0] ?? null;
  } catch (err: any) {
    logWarn('cape_governance_enrollment_lookup_failed', err);
    return null;
  }
}
