import express from 'express';
import request from 'supertest';

/**
 * ticketRoutes.creators.authRequired.test.ts — the missing-auth path for
 * GET /api/admin/tickets/creators (Org Chart v5, 2026-08-21). Deliberately a
 * SEPARATE file from ticketRoutes.creators.test.ts: `jest.mock()` calls
 * hoist to FILE scope no matter where they're textually written (confirmed
 * live while writing this test — a `jest.mock('.../authMiddleware', ...)`
 * placed inside one describe block of a shared file still intercepted a
 * second describe block's "real auth" test in the same file, because Jest's
 * babel transform hoists every `jest.mock()` call above all imports for the
 * whole module). A dedicated file with NO authMiddleware mock at all is the
 * correct fix, not `jest.resetModules()`/`jest.doMock()` gymnastics within
 * one file (which does not un-register an already-hoisted `jest.mock()`
 * factory). Every other dependency IS mocked (service layer, not auth) so
 * this test exercises exactly one thing: the REAL `requireAdmin` middleware
 * from backend/src/middlewares/authMiddleware.ts actually guards this route,
 * per CLAUDE.md's "test the auth path on every route."
 */
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
  listTicketCreatorOptions: jest.fn(),
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
// authMiddleware is DELIBERATELY NOT mocked — the real requireAdmin runs.

let app: express.Express;
let listTicketCreatorOptionsMock: jest.Mock;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../ticketRoutes');
  app.use(mod.default);
  const resolver = await import('../../../services/ticketCreatorFilterResolver');
  listTicketCreatorOptionsMock = resolver.listTicketCreatorOptions as unknown as jest.Mock;
});

describe('GET /api/admin/tickets/creators — missing-auth path (REAL requireAdmin)', () => {
  it('a request with no Authorization header is rejected with 401 before ever reaching listTicketCreatorOptions()', async () => {
    const res = await request(app).get('/api/admin/tickets/creators');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
    expect(listTicketCreatorOptionsMock).not.toHaveBeenCalled();
  });

  it('a request with a malformed Bearer token is rejected with 401 (invalid/expired token path)', async () => {
    const res = await request(app).get('/api/admin/tickets/creators').set('Authorization', 'Bearer not-a-real-jwt');

    expect(res.status).toBe(401);
    expect(listTicketCreatorOptionsMock).not.toHaveBeenCalled();
  });
});
