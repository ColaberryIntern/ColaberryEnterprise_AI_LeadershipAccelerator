/**
 * GET /api/admin/internship/console — the roster endpoint.
 *
 * Gated on `requireSection('internship')`, not `requireAdmin`: narrowing it would remove access
 * that internship-scoped staff have on every neighbouring route today, which is a permissions
 * regression dressed as a new feature. That is asserted **twice** — behaviourally through a mocked
 * guard, and at the source, because the route-auth lint is a required CI check and a route added
 * without a guard is the failure that lint exists for.
 *
 * The other thing pinned here is an absence: no attendance anywhere in the response body.
 */
import fs from 'fs';
import path from 'path';

/**
 * The guard is created ONCE, when the router registers its routes at import time. So the
 * middleware has to delegate to a mutable `guard` — re-mocking `requireSection` after import
 * cannot reach a closure that already exists, and the registration-time call record is wiped by
 * `clearAllMocks`. Both of those cost a cycle here before this shape was right.
 */
let guard: (req: any, res: any, next: any) => void;
const requireSection = jest.fn((_section: string) =>
  (req: any, res: any, next: any) => guard(req, res, next));
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: (...a: any[]) => requireSection(...a),
}));
const PASS = (req: any, _res: any, next: any) => { req.admin = { email: 'admin@test' }; next(); };
guard = PASS;

const getConsoleRoster = jest.fn();
jest.mock('../../../services/internship/internConsoleRoster', () => {
  const actual = jest.requireActual('../../../services/internship/internConsoleRoster');
  // consoleCounts stays REAL: the counts in the response must be the ones the service computes,
  // not ones this test invents.
  return { ...actual, getConsoleRoster: (...a: any[]) => getConsoleRoster(...a) };
});
const getInternConsoleDetail = jest.fn();
jest.mock('../../../services/internship/internConsoleDetail', () => ({
  getInternConsoleDetail: (...a: any[]) => getInternConsoleDetail(...a),
}));

import express from 'express';
import request from 'supertest';
import router from '../internshipRoutes';

const app = express();
app.use(express.json());
app.use(router);

/** Captured at import, before any `clearAllMocks` can erase the registration-time calls. */
const registeredSections = requireSection.mock.calls.map((c) => String(c[0]));

const row = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 'enr-1',
  name: 'Sarbjit Kaur',
  email: 'sarbjit@example.com',
  application_state: 'active',
  joined_at: '2026-09-22T00:00:00.000Z',
  day: 10,
  cohort: { id: 'c-1', name: 'Explorer — Prospects', type: 'explorer' },
  activity: {
    last_activity_at: '2026-09-30T10:00:00.000Z', last_activity_source: 'xp_events',
    days_since: 1, level: 'yellow', days: [], graced: false,
  },
  training: {
    weeks: [], weeks_completed: 2, weeks_1_3_clear: false,
    pace: null, pace_unavailable: 'cohort_has_no_sessions',
  },
  cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
  project: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  guard = PASS;
});
afterEach(() => (console.error as jest.Mock).mockRestore?.());

describe('the gate', () => {
  it('asked for the internship section when it registered', async () => {
    expect(registeredSections).toContain('internship');
    // And nothing on this router asked for a different section, which would be the smell of a
    // route gated on something looser.
    expect([...new Set(registeredSections)]).toEqual(['internship']);
  });

  it('refuses an unauthenticated caller with 401 rather than answering', async () => {
    guard = (_req: any, res: any) => res.status(401).json({ error: 'Unauthorized' });

    await request(app).get('/api/admin/internship/console').expect(401);

    expect(getConsoleRoster).not.toHaveBeenCalled();
  });

  it('is gated AT THE SOURCE, not only in this test\'s mock', () => {
    // A guard that exists only because the test mocked one is no guard. The route-auth lint is a
    // required CI check; this is the same assertion, local and fast.
    const src = fs.readFileSync(path.join(__dirname, '..', 'internshipRoutes.ts'), 'utf8');
    const line = src.split('\n').find((l) => l.includes("router.get('/api/admin/internship/console'"));

    expect(line).toBeDefined();
    expect(line).toContain("requireSection('internship')");
    // Not requireAdmin: that would be narrower than every route around it.
    expect(line).not.toContain('requireAdmin');
  });
});

describe('the response', () => {
  it('returns the roster and the counts the service computed', async () => {
    getConsoleRoster.mockResolvedValue([
      row(),
      row({ enrollment_id: 'enr-2', name: 'Quiet Person', application_state: 'paused',
        activity: { last_activity_at: null, last_activity_source: null, days_since: null, level: 'unknown', days: [], graced: false } }),
    ]);

    const res = await request(app).get('/api/admin/internship/console').expect(200);

    expect(res.body.interns).toHaveLength(2);
    expect(res.body.counts).toMatchObject({
      interns: 2,
      no_project: 2,
      never_active: 1,     // the one with no activity at all
      quiet_4_plus: 0,     // and they are NOT counted as quiet
      dark_10_plus: 0,
      paused: 1,
      pace_unavailable: 2,
    });
  });

  it('serves the project stages from the backend constant, in order', async () => {
    // The client draws its pipeline columns from this. If the route stopped sending it, every
    // column would vanish and so would the projects in them — with no error anywhere.
    getConsoleRoster.mockResolvedValue([row()]);

    const res = await request(app).get('/api/admin/internship/console').expect(200);

    expect(res.body.stages).toEqual(['discovery', 'architecture', 'implementation', 'portfolio', 'complete']);
  });

  it('carries no attendance anywhere in the body', async () => {
    getConsoleRoster.mockResolvedValue([row()]);

    const res = await request(app).get('/api/admin/internship/console').expect(200);

    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).not.toContain('attend');
    expect(body).not.toContain('meeting');
  });

  it('answers an empty roster as an empty list, not a 404', async () => {
    // No interns is a valid state of the business, not a missing resource.
    getConsoleRoster.mockResolvedValue([]);

    const res = await request(app).get('/api/admin/internship/console').expect(200);

    expect(res.body.interns).toEqual([]);
    expect(res.body.counts.interns).toBe(0);
  });

  it('fails with 500 and a plain message when the roster throws, leaking nothing', async () => {
    getConsoleRoster.mockRejectedValue(new Error('relation "cohort_memberships" does not exist'));

    const res = await request(app).get('/api/admin/internship/console').expect(500);

    expect(res.body.error).toBe('Could not load the intern console.');
    expect(JSON.stringify(res.body)).not.toContain('cohort_memberships');
  });
});

describe('the per-intern detail route', () => {
  const detail = () => ({
    intern: row(),
    training_sections: [{ week: 1, sections: [], publishedCardCount: 4, completed: 2, completedPct: 50, weekDone: true }],
    scheduled_week: 6,
    cert: {
      series: { attempts: [{ completed_at: '2026-09-01T00:00:00.000Z', mode: 'practice', scaled_score: 700, items: 10, correct: 7 }], passing_scaled_score: 720 },
      standing: { readiness: { state: 'building' }, official: { status: 'none' } },
    },
    feed: [{ occurredAt: '2026-09-30T10:00:00.000Z', domain: 'learning', source: 'timeline_card_progress', type: 'card_completed', summary: 'Week 6 Build', occurrences: 1 }],
  });

  it('is section-gated at the source, like its neighbour', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'internshipRoutes.ts'), 'utf8');
    // Sliced rather than line-split: a newline escape cannot survive this repo's heredoc
    // tooling, and a test that fails to parse proves nothing about the route.
    const at = src.indexOf("router.get('/api/admin/internship/console/:enrollmentId'");
    const line = at === -1 ? undefined : src.slice(at, at + 160);

    expect(line).toBeDefined();
    expect(line).toContain("requireSection('internship')");
  });

  it('refuses an unauthenticated caller with 401 and never looks the intern up', async () => {
    guard = (_req: any, res: any) => res.status(401).json({ error: 'Unauthorized' });

    await request(app).get('/api/admin/internship/console/enr-1').expect(401);

    expect(getInternConsoleDetail).not.toHaveBeenCalled();
  });

  it('404s an enrollment that is not an active intern', async () => {
    // Decided by the roster's own predicate, so a non-intern cannot be opened by guessing an id.
    getInternConsoleDetail.mockResolvedValue(null);

    const res = await request(app).get('/api/admin/internship/console/not-an-intern').expect(404);

    expect(res.body.error).toBe('Not an active intern.');
  });

  it('returns the intern row, section breakdown, cert series and feed', async () => {
    getInternConsoleDetail.mockResolvedValue(detail());

    const res = await request(app).get('/api/admin/internship/console/enr-1').expect(200);

    expect(getInternConsoleDetail).toHaveBeenCalledWith('enr-1');
    expect(res.body.intern.name).toBe('Sarbjit Kaur');
    expect(res.body.training_sections).toHaveLength(1);
    expect(res.body.scheduled_week).toBe(6);
    expect(res.body.cert.series.attempts[0]).toMatchObject({ scaled_score: 700, items: 10 });
    expect(res.body.feed[0]).toMatchObject({ type: 'card_completed', source: 'timeline_card_progress' });
  });

  it('does not collide with the roster route', async () => {
    // Two routes under the same prefix. The bare one must still answer the roster, not be captured
    // by the id parameter.
    getConsoleRoster.mockResolvedValue([row()]);

    const res = await request(app).get('/api/admin/internship/console').expect(200);

    expect(res.body.interns).toHaveLength(1);
    expect(getInternConsoleDetail).not.toHaveBeenCalled();
  });

  it('carries no attendance in the detail body', async () => {
    getInternConsoleDetail.mockResolvedValue(detail());

    const res = await request(app).get('/api/admin/internship/console/enr-1').expect(200);

    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).not.toContain('attend');
    expect(body).not.toContain('meeting');
  });

  it('fails with 500 and a plain message, leaking no internals', async () => {
    getInternConsoleDetail.mockRejectedValue(new Error('column "state" does not exist'));

    const res = await request(app).get('/api/admin/internship/console/enr-1').expect(500);

    expect(res.body.error).toBe('Could not load this intern.');
    expect(JSON.stringify(res.body)).not.toContain('does not exist');
  });
});
