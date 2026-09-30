import { Op } from 'sequelize';
import AttendanceRecord from '../../models/AttendanceRecord';
import LiveSession from '../../models/LiveSession';
import { getReliabilityStatus } from '../metricReliabilityService';
import { AttendanceValue, SnapshotField } from './types';

/**
 * Same fail-closed pattern Checkpoint B already proved end-to-end in
 * learnerContextService.ts's getAttendanceForContext() — reused here
 * rather than re-derived, now wrapped in the Student Success 360 envelope
 * instead of prose. When quarantined/degraded, AttendanceRecord/LiveSession
 * are never queried at all; `value` stays null, `status: 'quarantined'`,
 * and the registry's own real reason is carried through.
 */
export async function getAttendanceField(enrollmentId: string, cohortId: string | null): Promise<SnapshotField<AttendanceValue>> {
  if (!cohortId) {
    return {
      value: null, status: 'unknown', sourceSystem: 'attendance', sourceRecordIds: [], observedAt: null,
      freshnessPolicy: 'real-time-join-plus-5min-cron-finalize', reliabilityState: 'healthy',
      reliabilityReason: 'No cohort on this enrollment — nothing to scope the attendance reliability check to.',
    };
  }

  const reliability = await getReliabilityStatus('attendance', 'attendance.*', { scopeType: 'cohort', scopeValue: cohortId });
  if (reliability.status !== 'healthy') {
    return {
      value: null,
      status: 'quarantined',
      sourceSystem: 'attendance',
      sourceRecordIds: [],
      observedAt: reliability.declaredAt,
      freshnessPolicy: 'real-time-join-plus-5min-cron-finalize',
      reliabilityState: reliability.status,
      reliabilityReason: reliability.reason,
    };
  }

  const cohortSessions = await LiveSession.findAll({ where: { cohort_id: cohortId, status: { [Op.ne]: 'cancelled' } } });
  const sessionsHeldSoFar = cohortSessions.filter((s: any) => s.status === 'completed' || s.status === 'live').length;
  const attendanceRecords = await AttendanceRecord.findAll({ where: { enrollment_id: enrollmentId } });
  const present = attendanceRecords.filter((r: any) => r.status === 'present' || r.status === 'late').length;

  return {
    value: {
      sessionsPresent: present,
      sessionsHeldSoFar,
      attendancePct: sessionsHeldSoFar > 0 ? (present / sessionsHeldSoFar) * 100 : null,
    },
    status: 'known',
    sourceSystem: 'attendance',
    sourceRecordIds: attendanceRecords.map((r: any) => r.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time-join-plus-5min-cron-finalize',
    reliabilityState: 'healthy',
  };
}
