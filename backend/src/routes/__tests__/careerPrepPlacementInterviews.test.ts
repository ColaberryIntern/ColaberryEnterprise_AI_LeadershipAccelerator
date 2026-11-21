jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));

/**
 * CP8.3 (kit F4): GET /api/portal/career-prep/interviews/placement through the REAL route and the REAL view service. The
 * database is a stand-in that applies only what each statement says: rows are filtered by learner only when the SQL
 * says `WHERE i.enrollment_id = :e`, a column comes back only when the SQL selects it (so the stored provider link,
 * the sentinel, would leak if the statement ever selected it), the prep-row join applies only the conditions written,
 * and the history rows are filtered, ordered and capped as written.
 */
import { SENTINEL_PROVIDER_URL, expectNoRoomUrl } from '../../services/placement/__tests__/helpers/noRoomUrl';

type Iv = Record<string, unknown> & { id: string; enrollment_id: string; state: string; created_at: Date; starts_at: Date | null };
type Ev = { subject_type: string; subject_id: string; event: string; from_state: string | null; to_state: string | null; created_at: Date; id: number };
const db = { iv: [] as Iv[], prep: [] as Array<{ id: string; placement_interview_id: string; enrollment_id: string; starts_at: Date }>, events: [] as Ev[], sql: [] as string[], fail: false };
const COLS = ['id', 'company', 'position', 'type', 'sub_type', 'confidence', 'state', 'starts_at', 'minutes', 'room_url', 'room_provider_id', 'enrollment_id'];
function answer(sql: string, r: Record<string, unknown>): [unknown[], number] {
  db.sql.push(sql);
  if (db.fail) throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' });
  if (sql.includes('FROM placement_interviews i')) {
    const mine = /WHERE i\.enrollment_id = :e/.test(sql) ? db.iv.filter((i) => i.enrollment_id === r.e) : db.iv;
    const join = (i: Iv) => db.prep.find((c) => c.placement_interview_id === i.id
      && (!/c\.enrollment_id = i\.enrollment_id/.test(sql) || c.enrollment_id === i.enrollment_id)
      && (!/c\.starts_at = i\.starts_at/.test(sql) || (!!i.starts_at && c.starts_at.getTime() === i.starts_at.getTime())));
    const rows = [...mine].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .map((i) => ({ ...Object.fromEntries(COLS.filter((k) => new RegExp(`\\bi\\.${k}\\b`).test(sql)).map((k) => [k, i[k] ?? null])), ...(/c\.id AS prep_id/.test(sql) ? { prep_id: join(i)?.id ?? null } : {}) }));
    return [rows.slice(0, Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? Infinity)), 0];
  }
  if (sql.includes('FROM placement_events')) {
    const ids = r.ids as string[];
    let ev = db.events.filter((e) => e.subject_type === 'placement_interview' && ids.includes(e.subject_id));
    if (sql.includes("event IN ('detected','booking_link_sent') OR (to_state IS NOT NULL AND from_state IS DISTINCT FROM to_state)")) {
      ev = ev.filter((e) => ['detected', 'booking_link_sent'].includes(e.event) || (e.to_state !== null && e.from_state !== e.to_state));
    }
    ev.sort((a, b) => (/ORDER BY created_at DESC, id DESC/.test(sql) ? -1 : 1) * (a.created_at.getTime() - b.created_at.getTime() || a.id - b.id));
    return [ev.slice(0, Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? Infinity)), 0];
  }
  throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
}
// The route module loads the app's models (the real, unconnected Sequelize); only query() is the stand-in.
jest.mock('../../config/database', () => {
  const real = jest.requireActual('../../config/database');
  real.sequelize.query = async (s: string, o: { replacements?: Record<string, unknown> } = {}) => answer(s, o.replacements ?? {});
  return real;
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { historyLabel, MAX_EVENTS } from '../../services/placement/placementInterviewsView';
import { env } from '../../config/env';

// The app's config is loaded with the imports above, so sign with the secret it actually verifies with.
const SECRET = env.jwtSecret;
const token = (sub = 'enr-ann') => `Bearer ${jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant' }, SECRET)}`;
// The route module pulls in the app's models; loading it is slow under a loaded machine, so it is loaded ONCE, before
// any test, with its own generous timeout (never inside a test's 5-second budget), and every test reuses one app.
let shared: express.Express | null = null;
beforeAll(async () => {
  const router = (await import('../careerPrepPlacementInterviewsRoutes')).default;
  shared = express();
  shared.use(express.json());
  shared.use(router);
}, 60_000);
function app(): express.Express {
  if (!shared) throw new Error('the router did not load');
  return shared;
}
const URL = '/api/portal/career-prep/interviews/placement';
const H = 3_600_000;
const NOW = Date.now();
const START = new Date(NOW + 48 * H);
const iv = (id: string, over: Partial<Iv> = {}): Iv => ({ id, enrollment_id: 'enr-ann', company: 'Acme', position: 'Data Analyst', type: 'technical', sub_type: 'Technical Interview',
  confidence: '0.970', state: 'booked', starts_at: START, minutes: 45, room_url: SENTINEL_PROVIDER_URL, room_provider_id: 'zm-1', created_at: new Date(NOW - 5 * H), ...over });
let evId = 0;
const ev = (subject: string, event: string, from: string | null, to: string | null, hoursAgo: number): Ev =>
  ({ subject_type: 'placement_interview', subject_id: subject, event, from_state: from, to_state: to, created_at: new Date(NOW - hoursAgo * H), id: ++evId });

beforeEach(() => {
  mockEnabled.mockReset().mockResolvedValue(true);
  db.fail = false; db.sql = [];
  db.iv = [
    iv('iv-1'),
    iv('iv-2', { state: 'awaiting', starts_at: null, company: 'Beta', type: null, sub_type: 'Phone Screen', confidence: '0.96', room_url: null, room_provider_id: null, created_at: new Date(NOW - 1 * H) }),
    iv('iv-3', { state: 'review', starts_at: null, company: null, position: null, type: null, sub_type: null, confidence: '0.81', room_url: null, room_provider_id: null, created_at: new Date(NOW - 2 * H) }),
    iv('iv-4', { state: 'done', starts_at: new Date(NOW - 72 * H), created_at: new Date(NOW - 100 * H) }),
    iv('iv-5', { state: 'cancelled', created_at: new Date(NOW - 3 * H) }),
    iv('iv-bob', { enrollment_id: 'enr-bob', company: 'Bob Corp' }),
  ];
  db.prep = [{ id: 'prep-1', placement_interview_id: 'iv-1', enrollment_id: 'enr-ann', starts_at: START },
    { id: 'prep-5', placement_interview_id: 'iv-5', enrollment_id: 'enr-ann', starts_at: START }];
  db.events = [ev('iv-1', 'detected', null, 'new', 50), ev('iv-1', 'booking_link_sent', 'new', 'new', 49), ev('iv-1', 'booking_link_held', 'new', 'new', 49),
    ev('iv-1', 'link_opened', 'new', 'awaiting', 30), ev('iv-1', 'booked', 'awaiting', 'booked', 29), ev('iv-1', 'reminder_try', null, null, 1),
    ev('iv-1', 'booking_confirm_done', 'booked', 'booked', 28), ev('iv-bob', 'detected', null, 'new', 10)];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /interviews/placement: gates and input', () => {
  it('401 without a session, 404 with Career Prep off; nothing is read', async () => {
    expect((await request(app()).get(URL)).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get(URL).set('Authorization', token())).status).toBe(404);
    expect(db.sql).toHaveLength(0);
  });
  it('400 for any parameter (another learner\'s id included): the list is always the caller\'s own', async () => {
    const res = await request(app()).get(`${URL}?enrollmentId=enr-bob`).set('Authorization', token());
    expect([res.status, res.body.error]).toEqual([400, 'This list takes no parameters.']);
    expect(db.sql).toHaveLength(0);
  });
});

describe('GET /interviews/placement: what the sheet gets', () => {
  it('only the caller\'s interviews, upcoming first; KPIs; Join is the consent-room page; the provider link never leaves', async () => {
    const res = await request(app()).get(URL).set('Authorization', token('enr-ann'));
    expect(res.status).toBe(200);
    expectNoRoomUrl(res.body);
    expect(db.sql.join('\n')).not.toMatch(/room_url|room_provider_id/);
    expect(res.body.kpis).toEqual({ upcoming: 1, waiting: 1, recruiter: 1, held: 1 });
    expect(res.body.interviews.map((i: { id: string }) => i.id)).toEqual(['iv-1', 'iv-2', 'iv-3', 'iv-5', 'iv-4']);
    const [booked, waiting, recruiter, cancelled, held] = res.body.interviews;
    expect(booked).toMatchObject({ company: 'Acme', role: 'Data Analyst', state: 'booked', stateLabel: 'Booked', startsAt: START.toISOString(), minutes: 45,
      readAs: 'Technical', confidence: 0.97, roomPage: '/portal/career/interview/iv-1', prepId: 'prep-1',
      joinOpensAt: new Date(START.getTime() - 10 * 60_000).toISOString(), joinClosesAt: new Date(START.getTime() + 45 * 60_000).toISOString() });
    expect(waiting).toMatchObject({ stateLabel: 'Waiting on employer', readAs: 'Phone Screen', roomPage: null, joinOpensAt: null, prepId: null });
    expect(recruiter).toMatchObject({ company: null, role: null, stateLabel: 'With your recruiter', readAs: null, confidence: 0.81 });
    expect(cancelled).toMatchObject({ stateLabel: 'Cancelled', roomPage: null, prepId: null }); // its old prep row is not offered as an anchor
    expect(held).toMatchObject({ stateLabel: 'Held', roomPage: null });
    expect(JSON.stringify(res.body)).not.toContain('Bob Corp');
  });
  it('history: state changes in plain words, oldest first, in Central-ready ISO; bookkeeping rows are left out', async () => {
    const res = await request(app()).get(URL).set('Authorization', token());
    expect(res.body.interviews[0].history.map((h: { label: string }) => h.label)).toEqual([
      'Found in your job-search inbox', 'Booking link sent to the employer', 'The employer opened the booking link', 'Booked']);
    expect(res.body.interviews[0].history[0].at).toBe(new Date(NOW - 50 * H).toISOString());
    expect(db.sql.find((s) => s.includes('FROM placement_events'))).toContain('subject_id IN (:ids)');
  });
  it('a prep row at another time (rescheduled, not booked again) is not offered for "Continue prep"', async () => {
    db.prep[0].starts_at = new Date(START.getTime() + H);
    expect((await request(app()).get(URL).set('Authorization', token())).body.interviews[0].prepId).toBeNull();
  });
  it('nothing found yet: zero KPIs and an empty list (no history read); a database error is an honest 500', async () => {
    const empty = await request(app()).get(URL).set('Authorization', token('enr-new'));
    expect(empty.body).toEqual({ kpis: { upcoming: 0, waiting: 0, recruiter: 0, held: 0 }, interviews: [] });
    expect(db.sql.some((s) => s.includes('FROM placement_events'))).toBe(false);
    db.fail = true;
    const res = await request(app()).get(URL).set('Authorization', token());
    expect([res.status, res.body.error]).toEqual([500, 'Could not load your interviews. Try again in a moment.']);
    expect(String((console.error as jest.Mock).mock.calls.at(-1)?.[0])).toContain('"error_class":"SequelizeConnectionError"');
  });
  it('a booked interview that is already over is not "upcoming"; the newest history survives the cap', async () => {
    db.iv[0].starts_at = new Date(NOW - 2 * H); db.prep[0].starts_at = db.iv[0].starts_at as Date;
    db.events.push(...Array.from({ length: MAX_EVENTS + 5 }, (_, k) => ev('iv-2', 'link_opened', 'new', 'awaiting', 40 - k / 1000)));
    db.events.push(ev('iv-2', 'booking_arranging', 'awaiting', 'review', 0.5));
    const res = await request(app()).get(URL).set('Authorization', token());
    expect(res.body.kpis.upcoming).toBe(0);
    const beta = res.body.interviews.find((i: { id: string }) => i.id === 'iv-2');
    expect(beta.history.at(-1)).toEqual({ at: new Date(NOW - 0.5 * H).toISOString(), label: 'Passed to your recruiter' });
  });
});

describe('historyLabel', () => {
  it('names the learner-facing moves and drops the rest', () => {
    expect(historyLabel('rescheduled', 'booked', 'new')).toBe('Rescheduled: a new time is being arranged');
    expect(historyLabel('cancelled', 'awaiting', 'cancelled')).toBe('Cancelled');
    expect(historyLabel('booking_confirm_done', 'booked', 'booked')).toBeNull();
    expect(historyLabel('reminder_done', null, null)).toBeNull();
    expect(historyLabel('odd', 'new', 'nonsense')).toBeNull();
  });
});
