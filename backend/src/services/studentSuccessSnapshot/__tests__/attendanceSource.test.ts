const mockAttendanceFindAll = jest.fn();
jest.mock('../../../models/AttendanceRecord', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockAttendanceFindAll(...a) } }));

const mockLiveSessionFindAll = jest.fn();
jest.mock('../../../models/LiveSession', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockLiveSessionFindAll(...a) } }));

const mockGetReliabilityStatus = jest.fn();
jest.mock('../../metricReliabilityService', () => ({ getReliabilityStatus: (...a: any[]) => mockGetReliabilityStatus(...a) }));

import { getAttendanceField } from '../attendanceSource';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReliabilityStatus.mockResolvedValue({ status: 'healthy', severity: null, reason: null, declaredAt: null, recordId: null, incidentTicketId: null });
  mockLiveSessionFindAll.mockResolvedValue([]);
  mockAttendanceFindAll.mockResolvedValue([]);
});

describe('getAttendanceField', () => {
  it('happy path: real counts against sessions actually held, matching Checkpoint B\'s own proven pattern', async () => {
    mockLiveSessionFindAll.mockResolvedValue([{ status: 'completed' }, { status: 'live' }, { status: 'scheduled' }]);
    mockAttendanceFindAll.mockResolvedValue([{ id: 'a1', status: 'present' }, { id: 'a2', status: 'late' }]);

    const field = await getAttendanceField('enrollment-1', 'cohort-9');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ sessionsPresent: 2, sessionsHeldSoFar: 2, attendancePct: 100 });
    expect(field.sourceRecordIds).toEqual(['a1', 'a2']);
  });

  it('fail-closed: quarantined reliability means the real queries are never issued', async () => {
    mockGetReliabilityStatus.mockResolvedValue({ status: 'quarantined', severity: 'high', reason: 'Attendance is broken.', declaredAt: new Date(), recordId: 'rec-1', incidentTicketId: 'ticket-1' });

    const field = await getAttendanceField('enrollment-1', 'cohort-9');

    expect(mockLiveSessionFindAll).not.toHaveBeenCalled();
    expect(mockAttendanceFindAll).not.toHaveBeenCalled();
    expect(field.status).toBe('quarantined');
    expect(field.value).toBeNull();
    expect(field.reliabilityReason).toBe('Attendance is broken.');
  });

  it('no cohort means unknown, never queried, since there\'s nothing to scope the reliability check to', async () => {
    const field = await getAttendanceField('enrollment-1', null);

    expect(field.status).toBe('unknown');
    expect(mockGetReliabilityStatus).not.toHaveBeenCalled();
  });

  it('honesty boundary: zero sessions held yet returns a real null pct, never a fabricated 0%', async () => {
    const field = await getAttendanceField('enrollment-1', 'cohort-9');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ sessionsPresent: 0, sessionsHeldSoFar: 0, attendancePct: null });
  });
});
