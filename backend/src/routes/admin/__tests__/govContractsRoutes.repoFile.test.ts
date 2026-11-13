/**
 * Admin Gov-Contracts — the connected-repo file endpoint (parity with the portal route).
 *
 * Proves the admin route wires the SAME serving half the portal uses, behind the `gov_contracts` section
 * gate (403 without it). The allowlist/header behavior itself is proven once in the portal suite; here we
 * prove the admin route reaches the shared code and gates correctly.
 */
let sectionAllows = true;
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireSection: () => (req: any, res: any, next: any) => {
    if (sectionAllows) { req.admin = { email: 'ali@colaberry.com' }; next(); } else { res.status(403).json({ error: 'Forbidden' }); }
  },
  adminAllowedSections: () => ['program', 'gov_contracts'],
}));
jest.mock('../../../middlewares/govProjectAccess', () => ({ resolveGovProjectActor: async () => ({ platformIdentityId: 'admin-1', email: 'ali@colaberry.com' }) }));
jest.mock('../../../services/factory/govProjectProjection', () => ({ getStudentGovProjectView: jest.fn() }));
jest.mock('../../../services/factory/govContractsList', () => ({ listGovContractsFor: jest.fn() }));

const resolveConnectedRepo = jest.fn();
jest.mock('../../../services/factory/govConnectedRepo', () => ({ resolveConnectedRepo: (...a: any[]) => resolveConnectedRepo(...a) }));
const fetchRepoFileRaw = jest.fn();
jest.mock('../../../services/sbp/repoConnect/githubRepoClient', () => ({ fetchRepoFileRaw: (...a: any[]) => fetchRepoFileRaw(...a) }));

import express from 'express';
import request from 'supertest';
import router from '../govContractsRoutes';

const app = express();
app.use(express.json());
app.use(router);

const REPO = {
  owner: 'ColaberryIntern', name: 'crash', url: 'u',
  files: ['docs/plan.pdf', 'server/auth.js'],
  fileCount: 2, syncedAt: null,
  deliverables: [{ path: 'docs/plan.pdf', name: 'plan.pdf', kind: 'pdf' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  sectionAllows = true;
  resolveConnectedRepo.mockResolvedValue(REPO);
  fetchRepoFileRaw.mockResolvedValue(Buffer.from('%PDF-1.4'));
});

describe('GET /api/admin/gov-contracts/:projectId/repo-file', () => {
  it('serves a deliverable through the shared code: 200, pdf inline, nosniff', async () => {
    const res = await request(app).get('/api/admin/gov-contracts/dp-A/repo-file').query({ path: 'docs/plan.pdf' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(fetchRepoFileRaw).toHaveBeenCalledWith('ColaberryIntern', 'crash', 'docs/plan.pdf');
  });

  it('a non-deliverable path -> 403, never fetched (same allowlist as the portal)', async () => {
    const res = await request(app).get('/api/admin/gov-contracts/dp-A/repo-file').query({ path: 'server/auth.js' });
    expect(res.status).toBe(403);
    expect(fetchRepoFileRaw).not.toHaveBeenCalled();
  });

  it('without the gov_contracts section -> 403, repo never resolved', async () => {
    sectionAllows = false;
    const res = await request(app).get('/api/admin/gov-contracts/dp-A/repo-file').query({ path: 'docs/plan.pdf' });
    expect(res.status).toBe(403);
    expect(resolveConnectedRepo).not.toHaveBeenCalled();
  });
});
