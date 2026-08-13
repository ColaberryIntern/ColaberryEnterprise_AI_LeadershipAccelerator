import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import ticketRoutes from '../../../routes/admin/ticketRoutes';
import {
  createWorkUnit,
  listWorkUnitsForTicket,
  addWorkUnitDependency,
  getWorkGraphForTicket,
  WorkGraphValidationError,
} from '../../../services/workGraph/workGraphService';
import { retryFailedRun } from '../../../services/workGraph/workCoordinatorService';

// ProofDesk Milestone 3 (T010) — work-unit/dependency/work-graph/retry routes,
// added to the existing ticketRoutes.ts router. Follows the same express+
// supertest+jwt harness pattern already established by evidenceRoutes.test.ts
// (Milestone 2) and workLedgerHealthController.test.ts (Milestone 1).

jest.mock('../../../services/workGraph/workGraphService', () => {
  const actual = jest.requireActual('../../../services/workGraph/workGraphService');
  return {
    createWorkUnit: jest.fn(),
    listWorkUnitsForTicket: jest.fn(),
    addWorkUnitDependency: jest.fn(),
    getWorkGraphForTicket: jest.fn(),
    WorkGraphValidationError: actual.WorkGraphValidationError,
  };
});
jest.mock('../../../services/workGraph/workCoordinatorService', () => ({ retryFailedRun: jest.fn() }));
// ticketRoutes.ts also imports the full ticketService/ticketAgentDispatcher/
// evidence/decisions/summary surface — stub them so this suite exercises only
// the T010 work-graph routes.
jest.mock('../../../services/ticketService', () => ({
  createTicket: jest.fn(),
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
  addTicketComment: jest.fn(),
  getTicketById: jest.fn(),
  getTicketsForBoard: jest.fn(),
  getTicketStats: jest.fn(),
  updateTicket: jest.fn(),
}));
jest.mock('../../../services/ticketAgentDispatcher', () => ({ dispatchTicketToAgent: jest.fn() }));
jest.mock('../../../services/evidence/evidenceService', () => ({ getEvidenceForTicket: jest.fn() }));
jest.mock('../../../services/evidence/decisionRecordService', () => ({
  getDecisionsForTicket: jest.fn(),
  recordDecision: jest.fn(),
  DecisionRecordValidationError: class DecisionRecordValidationError extends Error {},
}));
jest.mock('../../../services/workLedger/summaryGeneratorService', () => ({ generateTicketSummary: jest.fn() }));

const mockCreateWorkUnit = createWorkUnit as unknown as jest.Mock;
const mockListWorkUnits = listWorkUnitsForTicket as unknown as jest.Mock;
const mockAddDependency = addWorkUnitDependency as unknown as jest.Mock;
const mockGetWorkGraph = getWorkGraphForTicket as unknown as jest.Mock;
const mockRetryFailedRun = retryFailedRun as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  // Mount at root, matching how adminRoutes.ts really mounts this router
  // (`router.use(ticketRoutes)`, no path arg) — every route string in
  // ticketRoutes.ts bakes its own `/api/admin` prefix in (the M2 T010 routing fix).
  app.use(ticketRoutes);
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret);
}

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const WORK_UNIT_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/tickets/:id/work-units', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/admin/tickets/${TICKET_ID}/work-units`);
    expect(res.status).toBe(401);
    expect(mockListWorkUnits).not.toHaveBeenCalled();
  });

  it('returns 200 with the work units for an authenticated admin', async () => {
    mockListWorkUnits.mockResolvedValue([{ id: WORK_UNIT_ID, title: 'Design the schema' }]);
    const app = buildApp();
    const res = await request(app)
      .get(`/api/admin/tickets/${TICKET_ID}/work-units`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.workUnits).toHaveLength(1);
  });
});

describe('POST /api/admin/tickets/:id/work-units', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/work-units`)
      .send({ title: 'x', requiredCapability: 'bug.platform_fix' });
    expect(res.status).toBe(401);
    expect(mockCreateWorkUnit).not.toHaveBeenCalled();
  });

  it('happy path: a valid work unit returns 201 with the created record', async () => {
    mockCreateWorkUnit.mockResolvedValue({ id: WORK_UNIT_ID, title: 'Fix the bug' });
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/work-units`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ title: 'Fix the bug', requiredCapability: 'bug.platform_fix' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: WORK_UNIT_ID });
    expect(mockCreateWorkUnit).toHaveBeenCalledWith(TICKET_ID, expect.objectContaining({ title: 'Fix the bug' }));
  });

  it('rejects malformed input with 400 before any success response', async () => {
    mockCreateWorkUnit.mockRejectedValue(new WorkGraphValidationError('Malformed work unit input: title: Required'));
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/work-units`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ requiredCapability: 'bug.platform_fix' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });
});

describe('POST /api/admin/tickets/:id/work-units/:workUnitId/dependencies', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/work-units/${WORK_UNIT_ID}/dependencies`)
      .send({ dependsOnWorkUnitId: '33333333-3333-4333-8333-333333333333' });
    expect(res.status).toBe(401);
    expect(mockAddDependency).not.toHaveBeenCalled();
  });

  it('happy path: a valid dependency edge returns 201', async () => {
    mockAddDependency.mockResolvedValue({ id: 'dep-1', work_unit_id: WORK_UNIT_ID });
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/work-units/${WORK_UNIT_ID}/dependencies`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ dependsOnWorkUnitId: '33333333-3333-4333-8333-333333333333' });
    expect(res.status).toBe(201);
    expect(mockAddDependency).toHaveBeenCalledWith(
      WORK_UNIT_ID,
      expect.objectContaining({ dependsOnWorkUnitId: '33333333-3333-4333-8333-333333333333' })
    );
  });

  it('rejects a cycle-creating dependency with 400, never fabricating a 201', async () => {
    mockAddDependency.mockRejectedValue(
      new WorkGraphValidationError('Adding this dependency would create a cycle')
    );
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/work-units/${WORK_UNIT_ID}/dependencies`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ dependsOnWorkUnitId: '33333333-3333-4333-8333-333333333333' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cycle/i);
  });
});

describe('GET /api/admin/tickets/:id/work-graph', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/admin/tickets/${TICKET_ID}/work-graph`);
    expect(res.status).toBe(401);
    expect(mockGetWorkGraph).not.toHaveBeenCalled();
  });

  it('returns 200 with the unified work-graph shape', async () => {
    mockGetWorkGraph.mockResolvedValue({ workUnits: [{ id: WORK_UNIT_ID }], dependencies: [] });
    const app = buildApp();
    const res = await request(app)
      .get(`/api/admin/tickets/${TICKET_ID}/work-graph`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.workUnits).toHaveLength(1);
    expect(res.body.dependencies).toEqual([]);
  });

  it('returns 200 with an empty graph for a ticket with no work units (honest empty state, not fabricated)', async () => {
    mockGetWorkGraph.mockResolvedValue({ workUnits: [], dependencies: [] });
    const app = buildApp();
    const res = await request(app)
      .get(`/api/admin/tickets/${TICKET_ID}/work-graph`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workUnits: [], dependencies: [] });
  });
});

describe('POST /api/admin/tickets/:id/retry', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).post(`/api/admin/tickets/${TICKET_ID}/retry`);
    expect(res.status).toBe(401);
    expect(mockRetryFailedRun).not.toHaveBeenCalled();
  });

  it('returns 200 with the retried result when a failed run exists', async () => {
    mockRetryFailedRun.mockResolvedValue({ agent_name: 'PlatformFixAgent', errors: [] });
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/retry`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.retried).toBe(true);
  });

  it('returns 404 (not a fabricated success) when there is no failed run to retry', async () => {
    mockRetryFailedRun.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/retry`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});
