/**
 * handleGetAssessmentHistory — the admin drill-down read endpoint for the
 * Reese Agentic AI Employee mission's Checkpoint D assessment history
 * (getAssessmentHistory). Mocks the service wholesale — the assembly logic
 * itself is covered by studentHealthAssessment/__tests__/*, this file only
 * proves the HTTP mapping.
 */
jest.mock('../../services/studentHealthAssessment', () => ({
  getAssessmentHistory: jest.fn(),
}));

import { getAssessmentHistory } from '../../services/studentHealthAssessment';
import { handleGetAssessmentHistory } from '../acceleratorController';

const getHistoryMock = getAssessmentHistory as jest.Mock;

function mockRes() {
  const res: any = { statusCode: 200, jsonBody: undefined };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((body: any) => { res.jsonBody = body; return res; });
  return res;
}

describe('handleGetAssessmentHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: real assessment history is returned as JSON, most recent first', async () => {
    const assessments = [
      { id: 'a2', status: 'critical', createdAt: '2026-09-05T00:00:00.000Z' },
      { id: 'a1', status: 'on_track', createdAt: '2026-08-01T00:00:00.000Z' },
    ];
    getHistoryMock.mockResolvedValue(assessments);
    const next = jest.fn();
    const res = mockRes();

    await handleGetAssessmentHistory({ params: { id: 'enrollment-1' } } as any, res, next);

    expect(getHistoryMock).toHaveBeenCalledWith('enrollment-1');
    expect(res.json).toHaveBeenCalledWith({ assessments });
    expect(res.statusCode).toBe(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('honesty boundary: a student with no assessments yet gets an honest empty array, not a 404 (empty history is not a bad id)', async () => {
    getHistoryMock.mockResolvedValue([]);
    const next = jest.fn();
    const res = mockRes();

    await handleGetAssessmentHistory({ params: { id: 'enrollment-1' } } as any, res, next);

    expect(res.jsonBody).toEqual({ assessments: [] });
    expect(res.statusCode).toBe(200);
  });

  it('failure path: a service rejection is forwarded to next(), not swallowed or turned into a 200', async () => {
    const err = new Error('DB connection lost');
    getHistoryMock.mockRejectedValue(err);
    const next = jest.fn();
    const res = mockRes();

    await handleGetAssessmentHistory({ params: { id: 'enrollment-1' } } as any, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});
