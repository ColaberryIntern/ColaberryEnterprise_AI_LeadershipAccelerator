import AiAgent from '../../models/AiAgent';
import Enrollment from '../../models/Enrollment';
import { REESE_AGENT_NAME } from './reeseIdentitySeed';

// Reese Phase 2 (Autonomous Outreach) — pilot-cohort gate. This is the ONLY
// place that decides whether a student is in scope for AUTONOMOUS (Reese-
// initiated) contact. Reactive DMs (Phase 1) are unaffected by this file —
// dmService.ts's assertSameCohort() already has its own, separate,
// narrower Reese-identity bypass for inbound conversations. This gate exists
// specifically because that bypass does NOT limit who Reese can be asked to
// contact, so outbound-initiated contact needs its own explicit check.
//
// Fail-closed by design: any ambiguity (no pilot cohort configured, student
// not found, student not active) resolves to NOT eligible. An autonomous
// messaging feature must never default to "yes" on missing data.

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

let _cachedPilotCohortIds: string[] | null = null;

/**
 * Real pilot-cohort ids from AiAgent('Reese').config.pilot_cohort_ids — NOT
 * cached across the process lifetime (unlike reeseIdentitySeed.ts's identity
 * lookups) because an admin could change this config at runtime and a stale
 * cache here would be a real safety issue for an autonomous-messaging gate.
 * `__resetReeseEligibilityCacheForTests` exists only so tests can force a
 * fresh read if a future caching optimization is ever added — today this
 * always reads live.
 */
export async function getPilotCohortIds(): Promise<string[]> {
  const agent = await AiAgent.findOne({ where: { agent_name: REESE_AGENT_NAME } });
  const ids = (agent?.config as any)?.pilot_cohort_ids;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
}

/** Test-only: no-op today (kept for interface symmetry with reeseIdentitySeed.ts's
 * reset hooks, in case a caching layer is added later). */
export function __resetReeseEligibilityCacheForTests(): void {
  _cachedPilotCohortIds = null;
}

/**
 * Is this student eligible for AUTONOMOUS Reese outreach right now? Checks,
 * in order: a pilot cohort is actually configured (fail-closed if not), the
 * student exists, the student's cohort is in the pilot list, the student's
 * enrollment is active. Every branch returns an explicit reason string so
 * callers can log exactly why a student was skipped.
 */
export async function isEligibleForAutonomousOutreach(enrollmentId: string): Promise<EligibilityResult> {
  const pilotCohortIds = await getPilotCohortIds();
  if (pilotCohortIds.length === 0) {
    return { eligible: false, reason: 'no_pilot_cohort_configured' };
  }

  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    return { eligible: false, reason: 'enrollment_not_found' };
  }

  if (!enrollment.cohort_id || !pilotCohortIds.includes(enrollment.cohort_id)) {
    return { eligible: false, reason: 'not_in_pilot_cohort' };
  }

  if (enrollment.status !== 'active') {
    return { eligible: false, reason: `enrollment_status_${enrollment.status || 'unknown'}` };
  }

  return { eligible: true, reason: 'in_pilot_cohort_and_active' };
}
