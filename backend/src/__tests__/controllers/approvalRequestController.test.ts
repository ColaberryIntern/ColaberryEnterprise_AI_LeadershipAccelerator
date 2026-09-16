import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import {
  listPendingApprovalRequests,
  approveApprovalRequest,
  rejectApprovalRequest,
  bulkApproveApprovalRequests,
} from '../../services/workLedger/approvalRequestResolutionService';
import approvalRequestRoutes from '../../routes/admin/approvalRequestRoutes';

jest.mock('../../services/workLedger/approvalRequestResolutionService', () => ({
  listPendingApprovalRequests: jest.fn(),
  approveApprovalRequest: jest.fn(),
  rejectApprovalRequest: jest.fn(),
  bulkApproveApprovalRequests: jest.fn(),
}));

const mockList = listPendingApprovalRequests as unknown as jest.Mock;
const mockApprove = approveApprovalRequest as unknown as jest.Mock;
const mockReject = rejectApprovalRequest as unknown as jest.Mock;
const mockBulkApprove = bulkApproveApprovalRequests as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(approvalRequestRoutes);
  return app;
}

function superAdminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/approval-requests', () => {
  it('happy path: 200s with the real pending rows', async () => {
    mockList.mockResolvedValue([{ id: 'a1', status: 'pending' }]);

    const res = await request(buildApp()).get('/api/admin/approval-requests').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('auth: no token 401s and the service is never called', async () => {
    const res = await request(buildApp()).get('/api/admin/approval-requests');

    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('failure: an unexpected service error 500s without leaking the raw message', async () => {
    mockList.mockRejectedValue(new Error('db unavailable'));

    const res = await request(buildApp()).get('/api/admin/approval-requests').set('Authorization', `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/db unavailable/);
  });
});

describe('POST /api/admin/approval-requests/:id/approve', () => {
  it('happy path: 200s and passes the real caller email through to the service', async () => {
    mockApprove.mockResolvedValue({ outcome: 'approved', row: { id: 'a1', status: 'approved' } });

    const res = await request(buildApp()).post('/api/admin/approval-requests/a1/approve').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(200);
    expect(mockApprove).toHaveBeenCalledWith('a1', 'ali@colaberry.com');
  });

  it('boundary: a nonexistent id 404s', async () => {
    mockApprove.mockResolvedValue({ outcome: 'not_found' });

    const res = await request(buildApp()).post('/api/admin/approval-requests/does-not-exist/approve').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(404);
  });

  it('boundary: an already-decided row 400s with its real current status', async () => {
    mockApprove.mockResolvedValue({ outcome: 'not_pending', row: { status: 'rejected' } });

    const res = await request(buildApp()).post('/api/admin/approval-requests/a1/approve').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rejected/);
  });
});

describe('POST /api/admin/approval-requests/:id/reject', () => {
  it('happy path: 200s', async () => {
    mockReject.mockResolvedValue({ outcome: 'rejected', row: { id: 'a1', status: 'rejected' } });

    const res = await request(buildApp()).post('/api/admin/approval-requests/a1/reject').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(200);
    expect(mockReject).toHaveBeenCalledWith('a1', 'ali@colaberry.com');
  });

  it('boundary: a nonexistent id 404s', async () => {
    mockReject.mockResolvedValue({ outcome: 'not_found' });

    const res = await request(buildApp()).post('/api/admin/approval-requests/does-not-exist/reject').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/approval-requests/bulk-approve', () => {
  it('happy path: 200s with the real per-id outcome', async () => {
    mockBulkApprove.mockResolvedValue({ approved: ['a1', 'a2'], skipped: [] });

    const res = await request(buildApp()).post('/api/admin/approval-requests/bulk-approve').set('Authorization', `Bearer ${superAdminToken()}`).send({ ids: ['a1', 'a2'] });

    expect(res.status).toBe(200);
    expect(res.body.approved).toEqual(['a1', 'a2']);
    expect(mockBulkApprove).toHaveBeenCalledWith(['a1', 'a2'], 'ali@colaberry.com');
  });

  it('boundary: an empty ids array is rejected before the service is ever called', async () => {
    const res = await request(buildApp()).post('/api/admin/approval-requests/bulk-approve').set('Authorization', `Bearer ${superAdminToken()}`).send({ ids: [] });

    expect(res.status).toBe(400);
    expect(mockBulkApprove).not.toHaveBeenCalled();
  });

  it('boundary: a missing ids field is rejected, not treated as an empty batch', async () => {
    const res = await request(buildApp()).post('/api/admin/approval-requests/bulk-approve').set('Authorization', `Bearer ${superAdminToken()}`).send({});

    expect(res.status).toBe(400);
    expect(mockBulkApprove).not.toHaveBeenCalled();
  });
});
