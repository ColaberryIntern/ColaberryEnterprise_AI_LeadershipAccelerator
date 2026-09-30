import AiAgent from '../../models/AiAgent';
import Enrollment from '../../models/Enrollment';
import { DARA_AGENT_NAME } from './daraIdentitySeed';

/**
 * Dara v2 Phase 5 (targeted student research) — pilot-cohort gate, mirroring
 * reeseEligibilityService.ts's real, proven pattern exactly (fail-closed by
 * design: any ambiguity — no pilot cohort configured, student not found,
 * student not active — resolves to NOT eligible; a proactive-research
 * feature must never default to "yes" on missing data).
 *
 * Deliberately NOT wired through the generic `pilotCohortGate` self-heal in
 * agentIdentitySeed.ts (unlike Reese's `pilotCohortGate: true`) — that
 * mechanism auto-fills `pilot_cohort_ids` from whichever Cohort currently
 * has status:'open' the first time it runs. For Dara, that would mean her
 * real research targets get silently chosen the moment this code first
 * boots (the very next deploy after Phase 7 approval), before Ali has
 * explicitly picked a cohort. This module reads the exact same
 * `AiAgent.config.pilot_cohort_ids` JSONB storage shape (for consistency
 * with any future admin UI) but requires a human to set it directly —
 * starts, and stays, empty (fail-closed) until someone does.
 *
 * Kept as its own gate/JSONB key rather than sharing Reese's — a different
 * AI employee's pilot cohort is a genuinely separate real-world decision,
 * even if it happens to name the same Cohort row today.
 */

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

export async function getDaraPilotCohortIds(): Promise<string[]> {
  const agent = await AiAgent.findOne({ where: { agent_name: DARA_AGENT_NAME } });
  const ids = (agent?.config as any)?.pilot_cohort_ids;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
}

export async function isEligibleForTargetedResearch(enrollmentId: string): Promise<EligibilityResult> {
  const pilotCohortIds = await getDaraPilotCohortIds();
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
