import express from 'express';
import request from 'supertest';

// Ticket KPI filter-scoping fix (2026-08-25) — Ali, live, filtering the board
// by Creator: "When we filter down on a list the KPIs should reflect what the
// data is showing." Real-module mount test (same convention as
// ticketRoutes.creator.test.ts) proving /api/admin/tickets/stats now resolves
// the SAME query params /board does — via the same resolveTicketFilters()
// helper — and passes them through to getTicketStats(), rather than always
// calling it bare.

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
  getTicketStats.mockResolvedValue({ total: 0, open: 0, byStatus: {}, byPriority: {}, byType: {} });
});

describe('GET /api/admin/tickets/stats — now filter-aware', () => {
  it('happy path: a creator param resolves via resolveCreatorMatchIds, exactly like /board, and is passed through to getTicketStats', async () => {
    resolveCreatorMatchIds.mockResolvedValue(['agent-reese', 'admin-reese']);

    const res = await request(app).get('/api/admin/tickets/stats').query({ creator: 'reese' });

    expect(res.status).toBe(200);
    expect(resolveCreatorMatchIds).toHaveBeenCalledWith('reese');
    const passedFilters = getTicketStats.mock.calls[0][0];
    expect(passedFilters.creatorMatchIds).toEqual(['agent-reese', 'admin-reese']);
  });

  it('composes multiple filters in one request (priority + creator), same as /board already does', async () => {
    resolveCreatorMatchIds.mockResolvedValue(['agent-reese']);

    const res = await request(app)
      .get('/api/admin/tickets/stats')
      .query({ creator: 'reese', priority: 'critical' });

    expect(res.status).toBe(200);
    const passedFilters = getTicketStats.mock.calls[0][0];
    expect(passedFilters.creatorMatchIds).toEqual(['agent-reese']);
    expect(passedFilters.priority).toBe('critical');
  });

  it('backward compat: no params at all -> getTicketStats is still called, with creatorMatchIds undefined (true global totals, zero behavior change for the pre-existing caller)', async () => {
    const res = await request(app).get('/api/admin/tickets/stats');

    expect(res.status).toBe(200);
    expect(resolveCreatorMatchIds).not.toHaveBeenCalled();
    const passedFilters = getTicketStats.mock.calls[0][0];
    expect(passedFilters.creatorMatchIds).toBeUndefined();
  });

  it('failure path: a malformed creator (repeated query param -> array) is rejected with 400 before ever reaching getTicketStats — same posture as /board', async () => {
    const res = await request(app).get('/api/admin/tickets/stats?creator=a&creator=b');

    expect(res.status).toBe(400);
    expect(resolveCreatorMatchIds).not.toHaveBeenCalled();
    expect(getTicketStats).not.toHaveBeenCalled();
  });

  it('a date-range filter (created_after) reaches getTicketStats as createdAfter, same param /board sends for its "last 7 days" default', async () => {
    const res = await request(app)
      .get('/api/admin/tickets/stats')
      .query({ created_after: '2026-08-18T00:00:00.000Z' });

    expect(res.status).toBe(200);
    const passedFilters = getTicketStats.mock.calls[0][0];
    expect(passedFilters.createdAfter).toEqual(new Date('2026-08-18T00:00:00.000Z'));
  });

  it('returns the real stats payload from getTicketStats verbatim', async () => {
    getTicketStats.mockResolvedValue({
      total: 15, open: 15, byStatus: { backlog: 12, in_progress: 3 }, byPriority: { medium: 15 }, byType: { student_support: 15 },
    });

    const res = await request(app).get('/api/admin/tickets/stats').query({ creator: 'reese' });

    expect(res.body).toEqual({
      total: 15, open: 15, byStatus: { backlog: 12, in_progress: 3 }, byPriority: { medium: 15 }, byType: { student_support: 15 },
    });
  });
});
