import type { Request, Response } from 'express';

const mockRecord = jest.fn();
let mockCampusOn = true;
jest.mock('../../services/campus/campusActivityService', () => ({ recordTourStep: (...a: unknown[]) => mockRecord(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => mockCampusOn }));
jest.mock('../campusRoutes', () => ({ logFailure: jest.fn() }));
jest.mock('../../middlewares/participantAuth', () => ({ requireParticipant: jest.fn() }));
// eslint-disable-next-line import/first
import { postTourProgressRoute, TourProgressBody } from '../campusTourProgressRoutes';

/**
 * POST /api/portal/campus/tour/progress (Explorer Growth, 2026-10-26): the learner comes only from the token; a malformed or
 * impossible step is 400; the campus being off is 403; a database failure is 500; a good step is 204 and recorded once.
 */
function call(body: unknown): { status: number; json: unknown } {
  const out = { status: 0, json: undefined as unknown };
  const res = {
    status(s: number) { out.status = s; return this; },
    json(j: unknown) { out.json = j; return this; },
    end() { return this; },
  } as unknown as Response;
  const req = { body, participant: { sub: 'enr-1' } } as unknown as Request;
  return Object.assign(out, { promise: postTourProgressRoute(req, res) }) as never;
}
const run = async (body: unknown) => { const o = call(body) as unknown as { promise: Promise<void>; status: number; json: unknown }; await o.promise; return o; };

beforeEach(() => { mockRecord.mockReset(); mockRecord.mockResolvedValue(undefined); mockCampusOn = true; });

it('records a step for the token\'s learner and answers 204', async () => {
  const o = await run({ tour: 'explorer', stop: 3, total: 8 });
  expect(o.status).toBe(204);
  expect(mockRecord).toHaveBeenCalledWith('enr-1', { tour: 'explorer', stop: 3, total: 8, finished: false });
});

it('a finish is recorded as finished', async () => {
  await run({ tour: 'member', stop: 9, total: 9, finished: true });
  expect(mockRecord).toHaveBeenCalledWith('enr-1', { tour: 'member', stop: 9, total: 9, finished: true });
});

it.each([
  ['a stop past the end', { tour: 'explorer', stop: 9, total: 8 }],
  ['stop zero', { tour: 'explorer', stop: 0, total: 8 }],
  ['an unknown tour', { tour: 'staff', stop: 1, total: 8 }],
  ['an extra field (strict)', { tour: 'explorer', stop: 1, total: 8, enrollment_id: 'someone-else' }],
  ['no body', undefined],
])('%s is 400 and records nothing', async (_n, body) => {
  const o = await run(body);
  expect(o.status).toBe(400);
  expect(mockRecord).not.toHaveBeenCalled();
});

it('campus off is 403', async () => {
  mockCampusOn = false;
  expect((await run({ tour: 'explorer', stop: 1, total: 8 })).status).toBe(403);
  expect(mockRecord).not.toHaveBeenCalled();
});

it('a database failure is 500 with a stable class', async () => {
  mockRecord.mockRejectedValue(new Error('db down'));
  const o = await run({ tour: 'explorer', stop: 1, total: 8 });
  expect(o.status).toBe(500);
  expect(o.json).toEqual({ error: 'Could not record the tour step', error_class: 'TourProgressUnavailable' });
});

it('the schema refuses a stop past the total', () => {
  expect(TourProgressBody.safeParse({ tour: 'explorer', stop: 8, total: 8 }).success).toBe(true);
  expect(TourProgressBody.safeParse({ tour: 'explorer', stop: 8.5, total: 8 }).success).toBe(false);
});
