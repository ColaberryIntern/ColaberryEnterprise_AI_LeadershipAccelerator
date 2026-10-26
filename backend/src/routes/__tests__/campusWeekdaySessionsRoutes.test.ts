import type { Request, Response } from 'express';

const mockGet = jest.fn();
const mockMayPreview = jest.fn();
let mockCampusOn = true;
jest.mock('../../services/campus/campusWeekdaySessions', () => ({ getWeekdaySessions: (...a: unknown[]) => mockGet(...a) }));
jest.mock('../../services/campus/campusAudienceSwitch', () => ({ mayPreviewAudiences: (...a: unknown[]) => mockMayPreview(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => mockCampusOn }));
jest.mock('../../middlewares/participantAuth', () => ({ requireParticipant: jest.fn() }));
// eslint-disable-next-line import/first
import { getWeekdaySessionsRoute } from '../campusWeekdaySessionsRoutes';

/**
 * C63: GET /api/portal/campus/weekday-sessions. The learner comes only from the token; ?as=intern is honored only for an account
 * allowed to preview; anything else in the query is 400; campus off is 403; a failure is a classified 500.
 */
type Out = { status: number; json: unknown };
async function call(query: Record<string, unknown> = {}): Promise<Out> {
  const out: Out = { status: 200, json: undefined };
  const res = { status(s: number) { out.status = s; return this; }, json(j: unknown) { out.json = j; return this; } } as unknown as Response;
  await getWeekdaySessionsRoute({ participant: { sub: 'enr-1' }, query } as unknown as Request, res);
  return out;
}
beforeEach(() => { mockGet.mockReset(); mockMayPreview.mockReset(); mockCampusOn = true; });

const SESSION = { day: 'monday', time: '9:00 AM', title: 'Intern standup', audience: 'interns_only', room_id: 'r', room_name: 'AI Internship', join_url: null, registration_url: null };

it('reads the sessions for the token\'s learner (no preview)', async () => {
  mockGet.mockResolvedValue({ intern: true, sessions: [SESSION] });
  const o = await call();
  expect(o.status).toBe(200);
  expect(mockGet).toHaveBeenCalledWith('enr-1', { previewIntern: false });
  expect(mockMayPreview).not.toHaveBeenCalled();
  expect(o.json).toEqual({ intern: true, sessions: [SESSION] });
});
it('?as=intern from an account allowed to preview: the intern view', async () => {
  mockMayPreview.mockResolvedValue(true);
  mockGet.mockResolvedValue({ intern: true, sessions: [SESSION] });
  await call({ as: 'intern' });
  expect(mockMayPreview).toHaveBeenCalledWith('enr-1');
  expect(mockGet).toHaveBeenCalledWith('enr-1', { previewIntern: true });
});
it('?as=intern from anyone else is ignored (no Monday call by asking)', async () => {
  mockMayPreview.mockResolvedValue(false);
  mockGet.mockResolvedValue({ intern: false, sessions: [] });
  await call({ as: 'intern' });
  expect(mockGet).toHaveBeenCalledWith('enr-1', { previewIntern: false });
});
it.each([['another learner\'s id', { enrollment_id: 'someone-else' }], ['another preview', { as: 'staff' }]])('%s in the query is 400 and reads nothing', async (_n, q) => {
  expect((await call(q)).status).toBe(400);
  expect(mockGet).not.toHaveBeenCalled();
});
it('campus off is 403 and reads nothing', async () => {
  mockCampusOn = false;
  expect((await call()).status).toBe(403);
  expect(mockGet).not.toHaveBeenCalled();
});
it('a failure is a classified 500', async () => {
  mockGet.mockRejectedValue(new Error('connect ETIMEDOUT'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const o = await call();
  expect(o.status).toBe(500);
  expect((o.json as { error_class: string }).error_class).toBe('WeekdaySessionsUnavailable');
});
