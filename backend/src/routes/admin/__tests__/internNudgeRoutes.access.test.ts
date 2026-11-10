/**
 * The per-intern nudge router: auth per ROUTE, the section split, and send-requires-asking.
 *
 * `scripts/lint-route-auth.js` is PER FILE - it asks only whether a source file contains
 * `requireSection` anywhere, so an unguarded route in an otherwise-guarded file passes it. These
 * tests enumerate the router's real Express stack and cross-check the source guard-for-guard.
 *
 * The section assertion matters more here than on the agent router, because these responses carry
 * strictly more: the intern's name, their address, their project, and the verbatim text of their
 * own emails to us. If one of these were ever guarded with `program`, every programme viewer would
 * read the roster that the `program`/`internship` split exists to withhold, and no type error and
 * no lint would notice.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The SERVICES are mocked, not the database. These tests are about who may call these routes and
 * what they do with a request body; the composer has its own tests, and a mistake in it must not
 * make an auth test pass or fail for the wrong reason.
 */
const mockBuild = jest.fn();
const mockBuildAll = jest.fn();
const mockArtifacts = jest.fn();
const mockSend = jest.fn();
class FakeUnknownIntern extends Error {}
jest.mock('../../../services/internship/nudgeBrief/build', () => ({
  buildBriefFor: (...a: unknown[]) => mockBuild(...a),
  buildAllBriefs: (...a: unknown[]) => mockBuildAll(...a),
  buildReportArtifacts: (...a: unknown[]) => mockArtifacts(...a),
  UnknownInternError: FakeUnknownIntern,
}));
jest.mock('../../../services/internship/nudgeBrief/send', () => ({
  sendBrief: (...a: unknown[]) => mockSend(...a),
}));

import internNudgeRoutes from '../internNudgeRoutes';
import { env } from '../../../config/env';

const ROUTER_SRC = path.join(__dirname, '..', 'internNudgeRoutes.ts');
const ID = '11111111-2222-3333-4444-555555555555';

const BRIEF = {
  enrollmentId: ID, name: 'Omolola Makinde', firstName: 'Omolola', email: 'o@example.test',
  tier: 'overdue_backlog', tierReason: 'six overdue', trackLabel: 'Saratoga', projectName: 'Saratoga',
  deadline: null, promises: [], subject: 'Two days', body: 'Omolola,\n\nTwo days.',
  attachment: null, warnings: [], generatedAt: new Date().toISOString(),
};

function tokenFor(mgmtRole: string | null, role = 'staff'): string {
  const payload: Record<string, unknown> = { id: 'test-admin', email: 'test@example.test', role };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(internNudgeRoutes);
  return a;
}

function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (internNudgeRoutes as any).stack as Array<any>;
  return stack.filter((l) => l.route).map((l) => ({
    path: l.route.path as string,
    methods: Object.keys(l.route.methods),
    handlerCount: l.route.stack.length as number,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBuild.mockResolvedValue(BRIEF);
  mockBuildAll.mockResolvedValue({
    generatedAt: new Date().toISOString(),
    attempts: [
      { ok: true, brief: BRIEF, hold: null },
      { ok: true, brief: { ...BRIEF, enrollmentId: 'e2', name: 'Quincy Nkwain Ninying' }, hold: { reason: 'messaged_today', detail: 'We already wrote to them today.' } },
      { ok: false, enrollmentId: 'e3', name: 'Ali Muwwakkil', errorClass: 'UnknownInternError', error: 'not an intern' },
    ],
  });
  mockSend.mockResolvedValue({ enrollmentId: ID, email: 'o@example.test', outcome: 'dry_run', subject: 'Two days', businessEventId: 'x' });
});

describe('every route carries its own guard', () => {
  it('POSITIVE CONTROL: the router registers all four routes, so the enumeration is not empty', () => {
    const routes = registeredRoutes();
    expect(routes).toHaveLength(4);
    expect(routes.filter((r) => r.methods.includes('get'))).toHaveLength(3);
    expect(routes.filter((r) => r.methods.includes('post'))).toHaveLength(1);
  });

  /**
   * Express matches in registration order. The collection path must come first or it is reachable
   * only by whatever the sibling param pattern happens not to swallow.
   */
  it('registers the collection route BEFORE the per-intern one', () => {
    const paths = registeredRoutes().map((r) => r.path);
    expect(paths.indexOf('/api/admin/intern-nudges'))
      .toBeLessThan(paths.indexOf('/api/admin/intern-nudges/:enrollmentId'));
  });

  it('every route has at least one middleware BEFORE its handler', () => {
    expect(registeredRoutes().filter((r) => r.handlerCount < 2).map((r) => r.path)).toEqual([]);
  });

  it('every guard is `internship`, never `program`', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const sections = [...src.matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]);
    expect(sections).toHaveLength(registeredRoutes().length);
    expect(sections).toEqual(['internship', 'internship', 'internship', 'internship']);
  });
});

/**
 * Preparing the day is a READ. It must be as guarded as the single brief, and it must never be a
 * way to send anything: the two-click send on each row is the only delivery path.
 */
describe('preparing every message at once', () => {
  const auth = () => `Bearer ${tokenFor('internship_review')}`;

  it('refuses an unauthenticated caller', async () => {
    const res = await request(app()).get('/api/admin/intern-nudges');
    expect([401, 403]).toContain(res.status);
    expect(mockBuildAll).not.toHaveBeenCalled();
  });

  it('refuses `curriculum`, which holds `program` but not `internship`', async () => {
    const res = await request(app()).get('/api/admin/intern-nudges').set('Authorization', `Bearer ${tokenFor('curriculum')}`);
    expect(res.status).toBe(403);
    expect(mockBuildAll).not.toHaveBeenCalled();
  });

  it('returns every attempt, including the held and the failed', async () => {
    const res = await request(app()).get('/api/admin/intern-nudges').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.attempts).toHaveLength(3);
    expect(res.body.attempts.filter((a: any) => a.ok && !a.hold)).toHaveLength(1);
    expect(res.body.attempts.find((a: any) => a.hold)?.hold.reason).toBe('messaged_today');
    expect(res.body.attempts.find((a: any) => !a.ok)?.name).toBe('Ali Muwwakkil');
  });

  /**
   * The two artifacts the nightly email attaches, served from the same pipeline the messages were
   * written from. "report" must be matched by its own route and never swallowed by `:enrollmentId`.
   */
  it('serves the report page, and as JSON on request', async () => {
    mockArtifacts.mockResolvedValue({ reportDate: '2026-11-10', html: '<!doctype html><title>r</title>', json: '{"ok":true}' });

    const page = await request(app()).get('/api/admin/intern-nudges/report').set('Authorization', auth());
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(mockBuild).not.toHaveBeenCalled(); // not treated as an enrollment id

    const json = await request(app()).get('/api/admin/intern-nudges/report?format=json').set('Authorization', auth());
    expect(json.status).toBe(200);
    expect(json.headers['content-type']).toContain('application/json');
  });

  it('refuses the report to a `program` caller', async () => {
    const res = await request(app()).get('/api/admin/intern-nudges/report').set('Authorization', `Bearer ${tokenFor('curriculum')}`);
    expect(res.status).toBe(403);
    expect(mockArtifacts).not.toHaveBeenCalled();
  });

  /** Preparing must never deliver. This is the assertion that keeps it a preview button. */
  it('sends nothing', async () => {
    await request(app()).get('/api/admin/intern-nudges').set('Authorization', auth());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a fault is a 500 that does not leak the message', async () => {
    mockBuildAll.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app()).get('/api/admin/intern-nudges').set('Authorization', auth());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});

describe('the section split is enforced at the door', () => {
  it('refuses an unauthenticated caller', async () => {
    const res = await request(app()).get(`/api/admin/intern-nudges/${ID}`);
    expect([401, 403]).toContain(res.status);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('refuses `curriculum`, which holds `program` but not `internship`', async () => {
    const res = await request(app()).get(`/api/admin/intern-nudges/${ID}`).set('Authorization', `Bearer ${tokenFor('curriculum')}`);
    expect(res.status).toBe(403);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it('admits `internship_review`', async () => {
    const res = await request(app()).get(`/api/admin/intern-nudges/${ID}`).set('Authorization', `Bearer ${tokenFor('internship_review')}`);
    expect(res.status).toBe(200);
    expect(res.body.brief.name).toBe('Omolola Makinde');
  });

  it('refuses a `program` caller on the SEND route, not just the read', async () => {
    const res = await request(app()).post(`/api/admin/intern-nudges/${ID}`)
      .set('Authorization', `Bearer ${tokenFor('curriculum')}`).send({ send: true });
    expect(res.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('a POST previews unless it is told to send', () => {
  const auth = () => `Bearer ${tokenFor('internship_review')}`;

  it('an empty body is a DRY RUN', async () => {
    await request(app()).post(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth()).send({});
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it('NO body at all is still a dry run, not a crash', async () => {
    const res = await request(app()).post(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it('`send: true` is the only thing that sends', async () => {
    await request(app()).post(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth()).send({ send: true });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });

  /**
   * The reason the body is posted back rather than regenerated: a manager approves TEXT, and the
   * text they approved is the text that must be delivered.
   */
  it('sends the body that was on screen, not a freshly generated one', async () => {
    await request(app()).post(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth())
      .send({ send: true, body: 'Omolola,\n\nAn edited message.', subject: 'Edited' });
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      body: 'Omolola,\n\nAn edited message.', subject: 'Edited',
    }));
  });

  /** `.strict()`: `{ sends: true }` is a plausible typo that must not silently preview. */
  it('rejects an unknown field rather than silently previewing', async () => {
    const res = await request(app()).post(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth()).send({ sends: true });
    expect(res.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses an edited body the sender would reject, before anything is sent', async () => {
    const res = await request(app()).post(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth())
      .send({ send: true, body: 'Omolola,\n\nTwo days — and counting.' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('em or en dash');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  const auth = () => `Bearer ${tokenFor('internship_review')}`;

  it('an unknown enrollment is a 404, not a 500', async () => {
    mockBuild.mockRejectedValue(new FakeUnknownIntern('nope'));
    const res = await request(app()).get(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth());
    expect(res.status).toBe(404);
  });

  it('a real fault is a 500 that does not leak the message', async () => {
    mockBuild.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app()).get(`/api/admin/intern-nudges/${ID}`).set('Authorization', auth());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});
