import express from 'express';
import request from 'supertest';

// Org Chart v5 (2026-08-21, session CC-20260818-x4nk continued) — the
// Tickets page's new Creator <select> needs a real roster to populate from.
// This proves GET /api/admin/tickets/creators resolves, forwards
// listTicketCreatorOptions()'s result verbatim, and degrades to 500 (not a
// crash) on a service failure. The missing-auth path (CLAUDE.md: "every
// protected route tests both the happy path AND the missing-auth path")
// lives in the SIBLING file ticketRoutes.creators.authRequired.test.ts, not
// here — jest.mock() calls hoist to FILE scope regardless of which describe
// block they're textually written in, so a real (unmocked) requireAdmin
// test cannot coexist in the same file as this file's mocked-auth setup
// below; two files is the correct fix, not a workaround.

const listTicketCreatorOptions = jest.fn();

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));
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
jest.mock('../../../services/ticketCreatorFilterResolver', () => ({
  resolveCreatorMatchIds: jest.fn(),
  listTicketCreatorOptions: (...a: unknown[]) => listTicketCreatorOptions(...a),
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

describe('GET /api/admin/tickets/creators — happy/failure path (auth mocked, matching this file cluster\'s established convention)', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const mod = await import('../ticketRoutes');
    app.use(mod.default);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: returns the roster from listTicketCreatorOptions() verbatim as { creators: [...] }', async () => {
    const roster = [
      { agent_name: 'cory-engine', display_name: 'Cory Engine — Autonomous Operations' },
      { agent_name: 'MarketingGrowthStrategyArchitect', display_name: 'Marketing & Growth Strategy Architect' },
    ];
    listTicketCreatorOptions.mockResolvedValue(roster);

    const res = await request(app).get('/api/admin/tickets/creators');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ creators: roster });
    expect(listTicketCreatorOptions).toHaveBeenCalledTimes(1);
  });

  it('boundary: an empty roster returns { creators: [] }, never an error', async () => {
    listTicketCreatorOptions.mockResolvedValue([]);

    const res = await request(app).get('/api/admin/tickets/creators');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ creators: [] });
  });

  it('failure path: a service rejection is caught and surfaced as 500, never a crash', async () => {
    listTicketCreatorOptions.mockRejectedValue(new Error('db unavailable'));

    const res = await request(app).get('/api/admin/tickets/creators');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('db unavailable');
  });
});
