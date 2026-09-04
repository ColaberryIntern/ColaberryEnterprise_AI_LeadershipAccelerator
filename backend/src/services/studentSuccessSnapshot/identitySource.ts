// Direct import, not the '../../models' barrel — the barrel triggers the
// full association graph at load time, which has broken 3 separate test
// files elsewhere in this session (agentRecentActivitySummary.ts,
// managerReliabilityIntentService.ts x2).
import Enrollment from '../../models/Enrollment';
import Cohort from '../../models/Cohort';
import { IdentityValue, SnapshotField } from './types';

/** Real Enrollment + Cohort read. No reliability gate on identity itself —
 * this is the platform's own canonical record, not a derived metric that
 * could be independently "unreliable" the way attendance/assessments can. */
export async function getIdentityField(enrollmentId: string): Promise<SnapshotField<IdentityValue>> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    return {
      value: null, status: 'unknown', sourceSystem: 'enrollment', sourceRecordIds: [], observedAt: null,
      freshnessPolicy: 'real-time-on-write', reliabilityState: 'healthy', reliabilityReason: 'No enrollment row found for this id.',
    };
  }

  const e: any = enrollment;
  let cohortName: string | null = null;
  if (e.cohort_id) {
    try {
      const cohort: any = await Cohort.findByPk(e.cohort_id, { attributes: ['name'] });
      cohortName = cohort?.name ?? null;
    } catch { /* cohort optional, matches learnerContextService.ts's own convention */ }
  }

  return {
    value: { fullName: e.full_name ?? null, status: e.status ?? null, cohortId: e.cohort_id ?? null, cohortName },
    status: 'known',
    sourceSystem: 'enrollment',
    sourceRecordIds: [enrollmentId],
    observedAt: new Date(),
    freshnessPolicy: 'real-time-on-write',
    reliabilityState: 'healthy',
  };
}
