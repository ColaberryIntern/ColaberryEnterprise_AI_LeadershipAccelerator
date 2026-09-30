import express from 'express';
import request from 'supertest';

// Org Chart v4 (2026-08-20) — real-module mount test (same established
// convention as ticketRoutes.createdAfter.test.ts) proving the
// `/api/admin/tickets/board` handler actually resolves the new `?creator=`
// query param via resolveCreatorMatchIds() and passes the result through as
// `creatorMatchIds`, that it composes with an existing filter, that it's
// absent by default (zero behavior change for every existing caller), and
// that a malformed value 400s instead of reaching the service layer.

const getTicketsForBoard = jest.fn();
const getTicketStats = jest.fn();
const resolveCreatorMatchIds = jest.fn();

jest.mock('../../../services/ticketService', () => ({
  createTicket: jest.fn(),
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
  addTicketComment: jest.fn(),
  getTicketById: jest.fn(),
  getTicketsForBoard: (...a: unknown[]) => getTicketsForBoard(...a),
  getTicketStats: (...a: unknown[]) => getTicketStats(...a),
  updateTicket: jest.fn(),
}));
jest.mock('../../../services/ticketCreatorFilterResolver', () => ({
  resolveCreatorMatchIds: (...a: unknown[]) => resolveCreatorMatchIds(...a),
}));
jest.mock('../../../services/ticketAgentDispatcher', () => ({ dispatchTicketToAgent: jest.fn() }));
jest.mock('../../../services/evidence/evidenceService', () => ({ getEvidenceForTicket: jest.fn() }));
jest.mock('../../../services/evidence/decisionRecordService', () => ({
  getDecisionsForTicket: jest.fn(),
  recordDecision: jest.fn(),
  DecisionRecordValidationError: class DecisionRecordValidationError extends Error {},
}));
jest.mock('../../../services/workLedger/summaryGeneratorService', () => ({ generateTicketSummary: jest.fn() }));
jest.mock('../../../services/workLedger/evidenceExpectationService', () => ({ getTicketEvidenceExpectations: jest.fn() }));
jest.mock('../../../services/workGraph/workGraphService', () => ({
  createWorkUnit: jest.fn(),
  listWorkUnitsForTicket: jest.fn(),
  addWorkUnitDependency: jest.fn(),
  getWorkGraphForTicket: jest.fn(),
  WorkGraphValidationError: class WorkGraphValidationError extends Error {},
}));
jest.mock('../../../services/workGraph/workCoordinatorService', () => ({ retryFailedRun: jest.fn() }));
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../ticketRoutes');
  app.use(mod.default);
});

beforeEach(() => {
  jest.clearAllMocks();
  getTicketsForBoard.mockResolvedValue({ backlog: [], todo: [], in_progress: [], in_review: [], done: [], cancelled: [] });
});

describe('GET /api/admin/tickets/board — creator param', () => {
  it('happy path: a real agent_name is resolved via resolveCreatorMatchIds and passed through as creatorMatchIds', async () => {
    resolveCreatorMatchIds.mockResolvedValue(['cory-engine', 'agent-process-1', 'admin-process-1']);

    const res = await request(app).get('/api/admin/tickets/board').query({ creator: 'cory-engine' });

    expect(res.status).toBe(200);
    expect(resolveCreatorMatchIds).toHaveBeenCalledWith('cory-engine');
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.creatorMatchIds).toEqual(['cory-engine', 'agent-process-1', 'admin-process-1']);
  });

  it('composes with an existing filter (priority) in the same request', async () => {
    resolveCreatorMatchIds.mockResolvedValue(['cory-engine']);

    const res = await request(app)
      .get('/api/admin/tickets/board')
      .query({ creator: 'cory-engine', priority: 'critical' });

    expect(res.status).toBe(200);
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.creatorMatchIds).toEqual(['cory-engine']);
    expect(passedFilters.priority).toBe('critical');
  });

  it('boundary: no creator param at all -> creatorMatchIds is undefined, zero behavior change for every existing caller', async () => {
    const res = await request(app).get('/api/admin/tickets/board');

    expect(res.status).toBe(200);
    expect(resolveCreatorMatchIds).not.toHaveBeenCalled();
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.creatorMatchIds).toBeUndefined();
  });

  it('failure path: a malformed creator (repeated query param -> array) is rejected with 400 before ever reaching the service layer', async () => {
    const res = await request(app).get('/api/admin/tickets/board?creator=a&creator=b');

    expect(res.status).toBe(400);
    expect(resolveCreatorMatchIds).not.toHaveBeenCalled();
    expect(getTicketsForBoard).not.toHaveBeenCalled();
  });

  it('boundary: an empty creator value is rejected with 400 (min length 1), never treated as "no filter"', async () => {
    const res = await request(app).get('/api/admin/tickets/board?creator=');

    expect(res.status).toBe(400);
    expect(getTicketsForBoard).not.toHaveBeenCalled();
  });
});
