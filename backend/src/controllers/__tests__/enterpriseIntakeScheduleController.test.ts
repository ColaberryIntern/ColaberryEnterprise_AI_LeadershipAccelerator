const mockFindIntake = jest.fn();
const mockBook = jest.fn();
const mockPlan = jest.fn();
const mockSlots = jest.fn();

jest.mock('../../services/enterpriseIntake/enterpriseIntakeService', () => ({ findIntake: (t: string) => mockFindIntake(t) }));
jest.mock('../../services/enterpriseIntake/enterpriseIntakeSchedule', () => {
  const { z } = jest.requireActual('zod');
  class ScheduleRefused extends Error { constructor(public code: string, m: string, public http = 409) { super(m); } }
  class CalendarUnavailable extends Error {}
  return {
    ScheduleRefused,
    CalendarUnavailable,
    interviewPlanSchema: z.object({ mode: z.enum(['now', 'later']), at: z.string().optional() }),
    meetingSchema: z.object({ start: z.string().datetime({ offset: true }) }),
    bookMeeting: (...a: any[]) => mockBook(...a),
    setInterviewPlan: (...a: any[]) => mockPlan(...a),
    listMeetingSlots: (...a: any[]) => mockSlots(...a),
  };
});

import { handleBookMeeting, handleInterviewPlan, handleMeetingSlots } from '../enterpriseIntakeScheduleController';
import { CalendarUnavailable, ScheduleRefused } from '../../services/enterpriseIntake/enterpriseIntakeSchedule';

function res() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}
const req = (body: any = {}) => ({ params: { token: 'tok' }, body }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindIntake.mockResolvedValue({ id: 'tok' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('enterprise intake planning doors', () => {
  it('unknown token is 404 and nothing runs', async () => {
    mockFindIntake.mockResolvedValue(null);
    const r = res();
    await handleBookMeeting(req({ start: '2026-11-23T15:00:00Z' }), r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockBook).not.toHaveBeenCalled();
  });

  it('malformed body is 400', async () => {
    const r = res();
    await handleBookMeeting(req({ start: 'monday' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    const r2 = res();
    await handleInterviewPlan(req({ mode: 'sometime' }), r2);
    expect(r2.status).toHaveBeenCalledWith(400);
  });

  it('a refusal keeps its status and readable message', async () => {
    mockBook.mockRejectedValue(new (ScheduleRefused as any)('slot_taken', 'That time was just taken. Pick another.'));
    const r = res();
    await handleBookMeeting(req({ start: '2026-11-23T15:00:00Z' }), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith({ error: 'That time was just taken. Pick another.', code: 'slot_taken' });
  });

  it('calendar down is 503 with a readable message', async () => {
    mockSlots.mockRejectedValue(new (CalendarUnavailable as any)('timeout'));
    const r = res();
    await handleMeetingSlots(req(), r);
    expect(r.status).toHaveBeenCalledWith(503);
    expect(r.json.mock.calls[0][0].code).toBe('calendar_unavailable');
  });

  it('anything else is 500 without the internal message', async () => {
    mockPlan.mockRejectedValue(new Error('db password wrong'));
    const r = res();
    await handleInterviewPlan(req({ mode: 'now' }), r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(r.json.mock.calls[0][0])).not.toMatch(/password/);
  });

  it('happy path returns the result', async () => {
    mockBook.mockResolvedValue({ status: 'booked', meeting: { start: 'x', end: 'y', link: null } });
    const r = res();
    await handleBookMeeting(req({ start: '2026-11-23T15:00:00Z' }), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({ status: 'booked', meeting: { start: 'x', end: 'y', link: null } });
  });
});
