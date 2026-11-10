/**
 * Admin Gov-Contracts — POST .../due-date (management sets the solicitation close date + urgency when the pursuit
 * carried none into the Studio). Proves: the section gate fronts it (403), bad input is rejected (400), a valid write
 * persists requirements_json.manualDeadline and echoes it, the write is idempotent (same input -> same override on the
 * one latest row), and a pursuit with no qualification is a clean 409.
 */
let sectionAllows = true;
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: any, res: any, next: any) => {
    if (sectionAllows) { req.admin = { email: 'ali@colaberry.com' }; next(); } else { res.status(403).json({ error: 'Forbidden' }); }
  },
  adminAllowedSections: () => ['program', 'gov_contracts'],
}));
jest.mock('../../../middlewares/govProjectAccess', () => ({ resolveGovProjectActor: async () => ({ platformIdentityId: 'admin-1', email: 'ali@colaberry.com' }) }));
const getStudentGovProjectView = jest.fn();
jest.mock('../../../services/factory/govProjectProjection', () => ({ getStudentGovProjectView: (...a: any[]) => getStudentGovProjectView(...a) }));
jest.mock('../../../services/factory/govContractsList', () => ({ listGovContractsFor: jest.fn() }));

const gqFindOne = jest.fn();
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: (...a: any[]) => gqFindOne(...a) } }));

import express from 'express';
import request from 'supertest';
import router from '../govContractsRoutes';

const app = express();
app.use(express.json());
app.use(router);

let qualRow: any;
beforeEach(() => {
  jest.clearAllMocks();
  sectionAllows = true;
  getStudentGovProjectView.mockResolvedValue({ projectId: 'dp-A', name: 'Crash Records', viewerCanVerify: true });
  qualRow = { requirements_json: {}, changed: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
  gqFindOne.mockResolvedValue(qualRow);
});

describe('POST /api/admin/gov-contracts/:projectId/due-date', () => {
  it('403 without the gov_contracts section — no qualification is read', async () => {
    sectionAllows = false;
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: '2026-12-15' });
    expect(res.status).toBe(403);
    expect(gqFindOne).not.toHaveBeenCalled();
  });

  it('400 on a missing or unparseable closeDate', async () => {
    const r1 = await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({});
    expect(r1.status).toBe(400);
    const r2 = await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: 'not-a-date' });
    expect(r2.status).toBe(400);
    expect(qualRow.save).not.toHaveBeenCalled();
  });

  it('400 when priorityScore is outside 0..100', async () => {
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: '2026-12-15', priorityScore: 150 });
    expect(res.status).toBe(400);
    expect(qualRow.save).not.toHaveBeenCalled();
  });

  it('persists requirements_json.manualDeadline on the latest qual and echoes the saved values', async () => {
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: '2026-12-15', priorityScore: 55 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, closeDate: '2026-12-15', priorityScore: 55 });
    expect(qualRow.requirements_json.manualDeadline).toMatchObject({ closeDate: '2026-12-15', priorityScore: 55, setBy: 'admin-1' });
    expect(qualRow.save).toHaveBeenCalledTimes(1);
  });

  it('defaults priorityScore to null when omitted', async () => {
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: '2026-12-15' });
    expect(res.status).toBe(200);
    expect(res.body.priorityScore).toBeNull();
    expect(qualRow.requirements_json.manualDeadline.priorityScore).toBeNull();
  });

  it('is idempotent — the same input re-writes the same override, always on the one latest row', async () => {
    await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: '2026-12-15', priorityScore: 55 });
    const first = { ...qualRow.requirements_json.manualDeadline };
    await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: '2026-12-15', priorityScore: 55 });
    const second = qualRow.requirements_json.manualDeadline;
    expect(second.closeDate).toBe(first.closeDate);
    expect(second.priorityScore).toBe(first.priorityScore);
    expect(gqFindOne).toHaveBeenCalledTimes(2); // each call targets the latest row; no new row created
  });

  it('409 when the pursuit has no qualification yet', async () => {
    gqFindOne.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/gov-contracts/dp-A/due-date').send({ closeDate: '2026-12-15' });
    expect(res.status).toBe(409);
  });
});
