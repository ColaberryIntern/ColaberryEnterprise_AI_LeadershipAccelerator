/**
 * The student gov-project route: a member reaches their assigned project (200, student-safe body); a non-member
 * is 404 (the guard's enumeration defense), and the projection is never even consulted for them. The guard and
 * the projection are unit-tested elsewhere; here we prove the ROUTE wires them in the right order.
 */
jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, _res: any, next: any) => { req.participant = { email: 'student@test', sub: 's1', role: 'participant' }; next(); },
}));
let guardAllows = true;
jest.mock('../../middlewares/govProjectAccess', () => ({
  // Mirrors the real guard's contract: on allow, attach ctx + next(); on deny, 404 (non-member) — never 200.
  requireGovProjectAccess: () => (req: any, res: any, next: any) => {
    if (guardAllows) { req.deliveryContext = { roles: ['associate_builder'] }; next(); }
    else { res.status(404).json({ error: 'Not found' }); }
  },
}));
const getStudentGovProjectView = jest.fn();
jest.mock('../../services/factory/govProjectProjection', () => ({ getStudentGovProjectView: (...a: any[]) => getStudentGovProjectView(...a) }));

import express from 'express';
import request from 'supertest';
import router from '../govProjectPortalRoutes';

const app = express();
app.use(express.json());
app.use(router);

const SAFE_VIEW = { projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery', tracks: [], requirements: [], requirementCounts: { total: 0, proposal: 0, build: 0 } };

beforeEach(() => { jest.clearAllMocks(); guardAllows = true; getStudentGovProjectView.mockResolvedValue(SAFE_VIEW); });

describe('GET /api/portal/gov-projects/:projectId', () => {
  it('a MEMBER reaches their assigned project: 200 with the student-safe projection', async () => {
    const res = await request(app).get('/api/portal/gov-projects/dp-A');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ project: SAFE_VIEW });
    expect(getStudentGovProjectView).toHaveBeenCalledWith('dp-A');
  });

  it('a NON-MEMBER is 404 — and the projection is NEVER consulted (guard denies first)', async () => {
    guardAllows = false;
    const res = await request(app).get('/api/portal/gov-projects/dp-OTHER');
    expect(res.status).toBe(404);
    expect(getStudentGovProjectView).not.toHaveBeenCalled();
  });

  it('a member on a non-gov / archived project (projection null) is 404', async () => {
    getStudentGovProjectView.mockResolvedValue(null);
    const res = await request(app).get('/api/portal/gov-projects/dp-A');
    expect(res.status).toBe(404);
  });

  it('a projection failure is a 500, not a leak', async () => {
    getStudentGovProjectView.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/portal/gov-projects/dp-A');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load the project.' });
  });
});
