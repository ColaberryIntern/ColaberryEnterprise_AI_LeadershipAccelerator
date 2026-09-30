/**
 * handleGetStudentSuccessSnapshot — the admin drill-down read endpoint for the
 * Reese Agentic AI Employee mission's Checkpoint C Student Success 360 evidence
 * service (getStudentSuccessSnapshot). Mocks the snapshot service wholesale —
 * its own 15-category assembly logic is covered by
 * studentSuccessSnapshot/__tests__/*, this file only proves the HTTP mapping.
 */
jest.mock('../../services/studentSuccessSnapshot', () => ({
  getStudentSuccessSnapshot: jest.fn(),
}));

import { getStudentSuccessSnapshot } from '../../services/studentSuccessSnapshot';
import { handleGetStudentSuccessSnapshot } from '../acceleratorController';

const getSnapshotMock = getStudentSuccessSnapshot as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 200, jsonBody: undefined };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.jsonBody = body; return res; });
  return res;
}

function knownField(value: any) {
  return {
    value, status: 'known', sourceSystem: 'enrollment', sourceRecordIds: ['enrollment-1'],
    observedAt: new Date(), freshnessPolicy: 'real-time-on-write', reliabilityState: 'healthy',
  };
}

function unknownIdentityField(reason: string) {
  return {
    value: null, status: 'unknown', sourceSystem: 'enrollment', sourceRecordIds: [], observedAt: null,
    freshnessPolicy: 'real-time-on-write', reliabilityState: 'healthy', reliabilityReason: reason,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleGetStudentSuccessSnapshot', () => {
  it('happy path: a known enrollment returns the full snapshot as JSON', async () => {
    const snapshot = {
      enrollmentId: 'enrollment-1', asOf: new Date(),
      identity: knownField({ fullName: 'Shefat Rahman', status: 'active', cohortId: 'cohort-1', cohortName: 'Cohort A' }),
    };
    getSnapshotMock.mockResolvedValue(snapshot);
    const next = jest.fn();
    const res = mockRes();

    await handleGetStudentSuccessSnapshot({ params: { id: 'enrollment-1' } } as any, res, next);

    expect(getSnapshotMock).toHaveBeenCalledWith('enrollment-1');
    expect(res.json).toHaveBeenCalledWith(snapshot);
    expect(res.statusCode).toBe(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('boundary: an unknown/missing enrollment maps to 404, matching handleGetPersonHistory\'s own not-found convention', async () => {
    getSnapshotMock.mockResolvedValue({
      enrollmentId: 'not-real', asOf: new Date(),
      identity: unknownIdentityField('No enrollment row found for this id.'),
    });
    const next = jest.fn();
    const res = mockRes();

    await handleGetStudentSuccessSnapshot({ params: { id: 'not-real' } } as any, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody).toEqual({ error: 'Enrollment not found' });
  });

  it('failure path: a snapshot-service rejection is forwarded to next(), not swallowed or turned into a 200', async () => {
    const err = new Error('DB connection lost');
    getSnapshotMock.mockRejectedValue(err);
    const next = jest.fn();
    const res = mockRes();

    await handleGetStudentSuccessSnapshot({ params: { id: 'enrollment-1' } } as any, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});
