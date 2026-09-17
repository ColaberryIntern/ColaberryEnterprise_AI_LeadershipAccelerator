import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import WorkforceTask from '../../models/WorkforceTask';
import { getDaraPilotCohortIds, isEligibleForTargetedResearch } from './daraEligibilityService';
import { evaluateCertificationRiskSignal } from './daraSignalService';
import { resolveStudentDisplayName } from '../reese/resolveStudentDisplayName';

/**
 * Dara v2 Phase 5 — "targeted student research." Deliberately does NOT
 * message a student directly (unlike Reese's autonomous outreach): no
 * student-consent mechanism exists anywhere in this codebase today (checked
 * directly — no opt-in/opt-out field on Enrollment or anywhere else), and
 * inventing one wasn't part of what was authorized. Instead, this reuses the
 * exact "flag to a human, never a guess" pattern already approved in Phase 2
 * and built in Phase 4: a real, specific, per-student finding becomes a real
 * WorkforceTask for Swati to act on — the same mechanism Dara's own existing
 * certification-readiness Director already uses, just per-student instead of
 * school-wide aggregate.
 *
 * Same "re-verify independently, never trust the candidate list alone" shape
 * as Reese's own sweep: the candidate query and the eligibility check are
 * two separate steps, even though today they'd always agree.
 *
 * Idempotency / "cadence": no new tracking model needed — WorkforceTask's own
 * `source_rec_key` dedup (openTaskId below, same shape as
 * directorActions.ts's own `openTaskIdForRecKey`) means a student with an
 * already-OPEN flag is never re-flagged. A human resolving it is what makes
 * room for a genuinely new concern to be raised later — never elapsed time.
 *
 * MAX_FLAGGED_PER_SWEEP is a conservative, disclosed default (keeps a single
 * sweep from flooding Swati's queue) — an explicit number to revisit with
 * Ali before Phase 7 activation, same posture as Reese's own CADENCE_DAYS/
 * DAILY_SEND_CAP constants.
 */
const OPEN_TASK_STATUSES = ['assigned', 'planning', 'working', 'needs_approval'];
export const MAX_FLAGGED_PER_SWEEP = 5;

export interface DaraResearchSweepResult {
  ran: boolean;
  flagged: number;
  skipped: Record<string, number>;
  reason?: string;
}

async function openTaskIdForRecKey(recKey: string): Promise<string | null> {
  const existing = await WorkforceTask.findOne({ where: { source_rec_key: recKey, status: { [Op.in]: OPEN_TASK_STATUSES } } });
  return existing ? existing.id : null;
}

function bump(skipped: Record<string, number>, reason: string): void {
  skipped[reason] = (skipped[reason] || 0) + 1;
}

export async function runDaraTargetedResearchSweep(): Promise<DaraResearchSweepResult> {
  const pilotCohortIds = await getDaraPilotCohortIds();
  if (pilotCohortIds.length === 0) {
    return { ran: false, flagged: 0, skipped: {}, reason: 'no_pilot_cohort_configured' };
  }

  const candidates = await Enrollment.findAll({ where: { cohort_id: { [Op.in]: pilotCohortIds }, status: 'active' } });

  const skipped: Record<string, number> = {};
  let flagged = 0;

  for (const enrollment of candidates) {
    if (flagged >= MAX_FLAGGED_PER_SWEEP) {
      bump(skipped, 'sweep_cap_reached');
      continue;
    }

    const eligibility = await isEligibleForTargetedResearch(enrollment.id);
    if (!eligibility.eligible) {
      bump(skipped, eligibility.reason);
      continue;
    }

    const signal = await evaluateCertificationRiskSignal(enrollment.id);
    if (!signal) {
      bump(skipped, 'no_signal');
      continue;
    }

    const recKey = `dara.certification_risk.${enrollment.id}`;
    const existingTaskId = await openTaskIdForRecKey(recKey);
    if (existingTaskId) {
      bump(skipped, 'already_flagged_open');
      continue;
    }

    const studentName = await resolveStudentDisplayName(enrollment.id);
    const priority = signal.passProbability < 0.3 ? 'high' : 'medium';

    await WorkforceTask.create({
      employee_slug: 'certification',
      title: `Certification readiness risk — ${studentName}`,
      description:
        `Dara's targeted research flagged ${studentName}: estimated certification pass probability ` +
        `${Math.round(signal.passProbability * 100)}%, weak in ${signal.weakDomains.join(', ')}.`,
      status: 'assigned',
      priority,
      approver: 'chief_of_staff',
      source_rec_key: recKey,
    } as any);

    flagged += 1;
  }

  return { ran: true, flagged, skipped };
}
