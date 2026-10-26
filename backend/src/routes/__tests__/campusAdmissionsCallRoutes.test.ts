// C20: the campus "Book a call with admissions" routes - auth, the pilot gate, validation, idempotent booking, conflicts, cancel,
// fail-closed on a calendar outage, and that NONE of the strategy-call side effects (confirmation email, prep nudge, pipeline
// stage, GHL sync, strategy-call record, createBooking itself) is ever reached. The calendar is the in-memory one (never Google).
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockSideEffects = {
  sendStrategyCallConfirmation: jest.fn(), enrollInPrepNudge: jest.fn(), advancePipelineStage: jest.fn(), syncNewLeadToGhl: jest.fn(), createBooking: jest.fn(),
};
jest.mock('../../services/emailService', () => ({ sendStrategyCallConfirmation: (...a: unknown[]) => mockSideEffects.sendStrategyCallConfirmation(...a) }));
jest.mock('../../services/strategyPrepService', () => ({ enrollInPrepNudge: (...a: unknown[]) => mockSideEffects.enrollInPrepNudge(...a) }));
jest.mock('../../services/pipelineService', () => ({ advancePipelineStage: (...a: unknown[]) => mockSideEffects.advancePipelineStage(...a) }));
jest.mock('../../services/ghlService', () => ({ syncNewLeadToGhl: (...a: unknown[]) => mockSideEffects.syncNewLeadToGhl(...a) }));
jest.mock('../../services/calendarService', () => ({
  createBooking: (...a: unknown[]) => mockSideEffects.createBooking(...a),
  getAvailableSlots: jest.fn(), findEventsByPrivateProperty: jest.fn(), insertCampusEvent: jest.fn(), cancelCalendarEvent: jest.fn(),
}));
// The port is swapped per test: the memory calendar, or one whose calls fail.
let mockPort: ReturnType<typeof import('../../services/campus/campusAdmissionsMemoryCalendar').memoryAdmissionsCalendar>;
jest.mock('../../services/campus/campusAdmissionsCalendarPort', () => ({ admissionsCalendarPort: () => mockPort }));
let mockEnrollment: { id: string; full_name: string; email: string } | null = { id: 'enr-7', full_name: 'Ada Learner', email: 'ada@example.test' };
jest.mock('../../models', () => ({ Enrollment: { findByPk: async () => mockEnrollment } }));
jest.mock('../campusRoutes', () => ({
  sendValidated: (res: { json: (b: unknown) => void }, schema: { parse: (b: unknown) => unknown }, body: unknown) => { schema.parse(body); res.json(body); },
  logFailure: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { ParticipantPayload } from '../../middlewares/participantAuth';
import { memoryAdmissionsCalendar } from '../../services/campus/campusAdmissionsMemoryCalendar';

const SECRET = ['campus', 'call', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/admissions-call';
const token = (extra: Partial<ParticipantPayload> = {}) => jwt.sign({ sub: 'enr-7', email: 'ada@example.test', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);

function buildApp(campus: string | undefined = 'all'): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  if (campus === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = campus;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusAdmissionsCallRoutes').default as express.Router; });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

const auth = (r: request.Test, t = token()) => r.set('Authorization', `Bearer ${t}`);
let app: express.Express;
async function aSlot(n = 0): Promise<string> {
  const res = await auth(request(app).get(`${URL}/slots`));
  return res.body.dates.flatMap((d: { slots: { start: string }[] }) => d.slots)[n].start;
}

beforeAll(() => { buildApp(); }, 120_000);
beforeEach(() => {
  mockPort = memoryAdmissionsCalendar();
  mockEnrollment = { id: 'enr-7', full_name: 'Ada Learner', email: 'ada@example.test' };
  Object.values(mockSideEffects).forEach((f) => f.mockReset());
  app = buildApp();
});

describe('auth and the pilot gate', () => {
  it('401 without a token on every route', async () => {
    for (const r of [request(app).get(`${URL}/slots`), request(app).get(URL), request(app).post(URL).send({}), request(app).delete(`${URL}/abcdef`)]) {
      expect((await r).status).toBe(401);
    }
  });
  it('403 when the campus is off for this account', async () => {
    const off = buildApp('off');
    expect((await auth(request(off).get(`${URL}/slots`))).status).toBe(403);
    expect((await auth(request(off).post(URL)).send({ slotStart: '2026-10-27T15:00:00Z', topic: 'other' })).status).toBe(403);
  });
  it('a read-only "view as member" token may look but not book', async () => {
    const ro = token({ read_only: true });
    expect((await auth(request(app).get(`${URL}/slots`), ro)).status).toBe(200);
    expect((await auth(request(app).post(URL), ro).send({ slotStart: await aSlot(), topic: 'other' })).status).toBe(403);
    expect(mockPort.events).toHaveLength(0);
  });
});

describe('booking', () => {
  it('400 on a malformed body: no time, a non-time, an unknown topic, an extra field, an oversized note', async () => {
    const slot = await aSlot();
    for (const body of [{ topic: 'other' }, { slotStart: 'tomorrow', topic: 'other' }, { slotStart: slot, topic: 'refund' }, { slotStart: slot, topic: 'other', enrollment_id: 'x' }, { slotStart: slot, topic: 'other', note: 'n'.repeat(501) }]) {
      const res = await auth(request(app).post(URL)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error_class).toBe('ValidationFailed');
    }
    expect(mockPort.events).toHaveLength(0);
  });

  it('201 books, the same request again is 200 with the same event, and Coming up shows it', async () => {
    const slot = await aSlot();
    const a = await auth(request(app).post(URL)).send({ slotStart: slot, topic: 'cohort', note: 'What does week 1 look like?' });
    const b = await auth(request(app).post(URL)).send({ slotStart: slot, topic: 'cohort' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.booking.eventId).toBe(a.body.booking.eventId);
    expect(mockPort.events).toHaveLength(1);
    expect(mockPort.events[0].props.campus_enrollment_id).toBe('enr-7');
    const up = await auth(request(app).get(URL));
    expect(up.body).toEqual({ booking: a.body.booking });
  });

  it('409 AlreadyBooked for a second time (with the booking), 409 SlotTaken for a taken time', async () => {
    const first = await auth(request(app).post(URL)).send({ slotStart: await aSlot(), topic: 'other' });
    const again = await auth(request(app).post(URL)).send({ slotStart: await aSlot(2), topic: 'other' });
    expect(again.status).toBe(409);
    expect(again.body.error_class).toBe('AlreadyBooked');
    expect(again.body.booking.eventId).toBe(first.body.booking.eventId);
    const someoneElse = token({ sub: 'enr-8' });
    mockEnrollment = { id: 'enr-8', full_name: 'Bo', email: 'bo@example.test' };
    const taken = await auth(request(app).post(URL), someoneElse).send({ slotStart: first.body.booking.startTime, topic: 'other' });
    expect(taken.status).toBe(409);
    expect(taken.body.error_class).toBe('SlotTaken');
  });

  it('never reaches the strategy-call flow: no email, nudge, pipeline, GHL or createBooking', async () => {
    await auth(request(app).post(URL)).send({ slotStart: await aSlot(), topic: 'payment' });
    Object.values(mockSideEffects).forEach((f) => expect(f).not.toHaveBeenCalled());
  });

  it('503 UpstreamUnavailable when the calendar is down, and nothing is claimed', async () => {
    mockPort = { ...memoryAdmissionsCalendar(), getAvailableSlots: async () => { throw new Error('Google Calendar not configured'); },
      findEventsByPrivateProperty: async () => { throw new Error('ETIMEDOUT'); } };
    for (const r of [auth(request(app).get(`${URL}/slots`)), auth(request(app).get(URL)), auth(request(app).post(URL)).send({ slotStart: '2026-10-27T15:00:00Z', topic: 'other' })]) {
      const res = await r;
      expect(res.status).toBe(503);
      expect(res.body.error_class).toBe('UpstreamUnavailable');
      expect(JSON.stringify(res.body)).not.toMatch(/ETIMEDOUT|Google/);
    }
  });
});

describe('cancel', () => {
  it("204 cancels this learner's call; another learner's id is 404; a malformed id is 400", async () => {
    const mine = await auth(request(app).post(URL)).send({ slotStart: await aSlot(), topic: 'other' });
    const other = token({ sub: 'enr-8' });
    expect((await auth(request(app).delete(`${URL}/${mine.body.booking.eventId}`), other)).status).toBe(404);
    expect((await auth(request(app).delete(`${URL}/bad id!`))).status).toBe(400);
    expect((await auth(request(app).delete(`${URL}/${mine.body.booking.eventId}`))).status).toBe(204);
    expect(mockPort.events).toHaveLength(0);
  });
});
