import express from 'express';
import request from 'supertest';

// Ticket Board Performance fix (2026-08-18) — real-module mount test (same
// established convention as ticketRoutes.evidenceExpectation.test.ts) proving the
// `/api/admin/tickets` and `/api/admin/tickets/board` handlers actually parse the
// new `created_after` query param and pass a real Date through to
// getTicketsForBoard()'s `createdAfter` filter, and that a malformed value
// degrades to "no filter" (200, not 500) rather than breaking the whole board.

const getTicketsForBoard = jest.fn();
const getTicketStats = jest.fn();

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

describe('GET /api/admin/tickets/board — created_after param', () => {
  it('happy path: a valid ISO created_after string is parsed into a real Date and passed through as createdAfter', async () => {
    const res = await request(app).get('/api/admin/tickets/board').query({ created_after: '2026-08-11T00:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(getTicketsForBoard).toHaveBeenCalledTimes(1);
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.createdAfter).toBeInstanceOf(Date);
    expect(passedFilters.createdAfter.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('boundary: no created_after param at all -> createdAfter is undefined, unchanged legacy behavior', async () => {
    const res = await request(app).get('/api/admin/tickets/board');

    expect(res.status).toBe(200);
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.createdAfter).toBeUndefined();
  });

  it('failure path: an unparseable created_after string is silently dropped (200, not 500) rather than breaking the whole board', async () => {
    const res = await request(app).get('/api/admin/tickets/board').query({ created_after: 'not-a-real-date' });

    expect(res.status).toBe(200);
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.createdAfter).toBeUndefined();
  });

  it('composes with an existing filter (priority) in the same request', async () => {
    const res = await request(app)
      .get('/api/admin/tickets/board')
      .query({ created_after: '2026-08-11T00:00:00.000Z', priority: 'critical' });

    expect(res.status).toBe(200);
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.createdAfter).toBeInstanceOf(Date);
    expect(passedFilters.priority).toBe('critical');
  });
});

describe('GET /api/admin/tickets — created_after param (flat list endpoint)', () => {
  it('parses created_after the same way as the board endpoint', async () => {
    const res = await request(app).get('/api/admin/tickets').query({ created_after: '2026-08-11T00:00:00.000Z' });

    expect(res.status).toBe(200);
    const passedFilters = getTicketsForBoard.mock.calls[0][0];
    expect(passedFilters.createdAfter).toBeInstanceOf(Date);
    expect(passedFilters.createdAfter.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });
});
