const mockGetIdentityField = jest.fn();
jest.mock('../identitySource', () => ({ getIdentityField: (...a: any[]) => mockGetIdentityField(...a) }));

const mockGetAttendanceField = jest.fn();
jest.mock('../attendanceSource', () => ({ getAttendanceField: (...a: any[]) => mockGetAttendanceField(...a) }));

const mockGetTimelineProgressField = jest.fn();
jest.mock('../timelineProgressSource', () => ({ getTimelineProgressField: (...a: any[]) => mockGetTimelineProgressField(...a) }));

const mockGetAssessmentTrendField = jest.fn();
jest.mock('../assessmentTrendSource', () => ({ getAssessmentTrendField: (...a: any[]) => mockGetAssessmentTrendField(...a) }));

const mockGetReflectionCompletionField = jest.fn();
jest.mock('../reflectionCompletionSource', () => ({ getReflectionCompletionField: (...a: any[]) => mockGetReflectionCompletionField(...a) }));

const mockGetCompetencyEvidenceField = jest.fn();
jest.mock('../competencyEvidenceSource', () => ({ getCompetencyEvidenceField: (...a: any[]) => mockGetCompetencyEvidenceField(...a) }));

const mockGetProjectProgressField = jest.fn();
jest.mock('../projectProgressSource', () => ({ getProjectProgressField: (...a: any[]) => mockGetProjectProgressField(...a) }));

const mockGetCertReadinessField = jest.fn();
jest.mock('../certReadinessSource', () => ({ getCertReadinessField: (...a: any[]) => mockGetCertReadinessField(...a) }));

import { getStudentSuccessSnapshot } from '../index';

const KNOWN_FIELD = { value: {}, status: 'known', sourceSystem: 'x', sourceRecordIds: [], observedAt: new Date(), freshnessPolicy: 'real-time', reliabilityState: 'healthy' as const };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIdentityField.mockResolvedValue({ ...KNOWN_FIELD, value: { fullName: 'Sofia Chen', status: 'active', cohortId: 'cohort-9', cohortName: 'July 2026' } });
  mockGetAttendanceField.mockResolvedValue(KNOWN_FIELD);
  mockGetTimelineProgressField.mockResolvedValue(KNOWN_FIELD);
  mockGetAssessmentTrendField.mockResolvedValue(KNOWN_FIELD);
  mockGetReflectionCompletionField.mockResolvedValue(KNOWN_FIELD);
  mockGetCompetencyEvidenceField.mockResolvedValue(KNOWN_FIELD);
  mockGetProjectProgressField.mockResolvedValue(KNOWN_FIELD);
  mockGetCertReadinessField.mockResolvedValue(KNOWN_FIELD);
});

describe('getStudentSuccessSnapshot', () => {
  it('happy path: assembles all 5 real fields, propagating the real cohortId from identity into the attendance lookup', async () => {
    const snapshot = await getStudentSuccessSnapshot('enrollment-1');

    expect(snapshot.enrollmentId).toBe('enrollment-1');
    expect(snapshot.identity.status).toBe('known');
    expect(mockGetAttendanceField).toHaveBeenCalledWith('enrollment-1', 'cohort-9');
    expect(snapshot.attendance.status).toBe('known');
    expect(snapshot.timelineProgress.status).toBe('known');
    expect(snapshot.assessmentTrend.status).toBe('known');
    expect(snapshot.reflectionCompletion.status).toBe('known');
    expect(snapshot.competencyEvidence.status).toBe('known');
    expect(snapshot.projectProgress.status).toBe('known');
    expect(snapshot.certReadiness.status).toBe('known');
  });

  it('resilience: identity lookup failure still yields the other real fields, and attendance is scoped to a null cohort rather than crashing', async () => {
    mockGetIdentityField.mockRejectedValue(new Error('DB connection lost'));

    const snapshot = await getStudentSuccessSnapshot('enrollment-1');

    expect(snapshot.identity.status).toBe('unknown');
    expect(mockGetAttendanceField).toHaveBeenCalledWith('enrollment-1', null);
    expect(snapshot.attendance.status).toBe('known');
    expect(snapshot.timelineProgress.status).toBe('known');
  });

  it('resilience: one downstream source failing (attendance) never breaks the rest of the snapshot', async () => {
    mockGetAttendanceField.mockRejectedValue(new Error('attendance service unavailable'));

    const snapshot = await getStudentSuccessSnapshot('enrollment-1');

    expect(snapshot.attendance.status).toBe('unknown');
    expect(snapshot.attendance.reliabilityReason).toContain('attendance service unavailable');
    expect(snapshot.identity.status).toBe('known');
    expect(snapshot.timelineProgress.status).toBe('known');
    expect(snapshot.assessmentTrend.status).toBe('known');
    expect(snapshot.reflectionCompletion.status).toBe('known');
  });

  it('a real asOf timestamp is stamped on every snapshot', async () => {
    const before = Date.now();
    const snapshot = await getStudentSuccessSnapshot('enrollment-1');
    expect(snapshot.asOf.getTime()).toBeGreaterThanOrEqual(before);
  });
});
