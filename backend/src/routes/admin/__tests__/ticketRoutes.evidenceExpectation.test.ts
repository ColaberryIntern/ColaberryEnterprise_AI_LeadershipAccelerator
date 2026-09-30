import express from 'express';
import request from 'supertest';

// Ticket Board Honesty fix (2026-08-16, session CC-20260816-q4mz). Mounts the REAL
// router (matching this repo's established "real-module mount test" convention, cited
// in ticketRoutes.ts's own header comment about the earlier /api/admin prefix bug) so
// this proves the 3 GET handlers actually merge the classifier's `expectation` field
// into their real JSON response — not just that the classifier function itself works
// in isolation (already covered by evidenceExpectationService.test.ts).

const getEvidenceForTicket = jest.fn();
const getDecisionsForTicket = jest.fn();
const recordDecision = jest.fn();
const generateTicketSummary = jest.fn();
const getWorkGraphForTicket = jest.fn();
const getTicketEvidenceExpectations = jest.fn();
const createTicket = jest.fn();
const updateTicketStatus = jest.fn();
const assignTicket = jest.fn();
const addTicketComment = jest.fn();
const getTicketById = jest.fn();
const getTicketsForBoard = jest.fn();
const getTicketStats = jest.fn();
const updateTicket = jest.fn();
const dispatchTicketToAgent = jest.fn();
const createWorkUnit = jest.fn();
const addWorkUnitDependency = jest.fn();
const retryFailedRun = jest.fn();

jest.mock('../../../services/ticketService', () => ({
  createTicket: (...a: unknown[]) => createTicket(...a),
  updateTicketStatus: (...a: unknown[]) => updateTicketStatus(...a),
  assignTicket: (...a: unknown[]) => assignTicket(...a),
  addTicketComment: (...a: unknown[]) => addTicketComment(...a),
  getTicketById: (...a: unknown[]) => getTicketById(...a),
  getTicketsForBoard: (...a: unknown[]) => getTicketsForBoard(...a),
  getTicketStats: (...a: unknown[]) => getTicketStats(...a),
  updateTicket: (...a: unknown[]) => updateTicket(...a),
}));
jest.mock('../../../services/ticketAgentDispatcher', () => ({
  dispatchTicketToAgent: (...a: unknown[]) => dispatchTicketToAgent(...a),
}));
jest.mock('../../../services/evidence/evidenceService', () => ({
  getEvidenceForTicket: (...a: unknown[]) => getEvidenceForTicket(...a),
}));
jest.mock('../../../services/evidence/decisionRecordService', () => ({
  getDecisionsForTicket: (...a: unknown[]) => getDecisionsForTicket(...a),
  recordDecision: (...a: unknown[]) => recordDecision(...a),
  DecisionRecordValidationError: class DecisionRecordValidationError extends Error {},
}));
jest.mock('../../../services/workLedger/summaryGeneratorService', () => ({
  generateTicketSummary: (...a: unknown[]) => generateTicketSummary(...a),
}));
jest.mock('../../../services/workLedger/evidenceExpectationService', () => ({
  getTicketEvidenceExpectations: (...a: unknown[]) => getTicketEvidenceExpectations(...a),
}));
jest.mock('../../../services/workGraph/workGraphService', () => ({
  createWorkUnit: (...a: unknown[]) => createWorkUnit(...a),
  listWorkUnitsForTicket: jest.fn(),
  addWorkUnitDependency: (...a: unknown[]) => addWorkUnitDependency(...a),
  getWorkGraphForTicket: (...a: unknown[]) => getWorkGraphForTicket(...a),
  WorkGraphValidationError: class WorkGraphValidationError extends Error {},
}));
jest.mock('../../../services/workGraph/workCoordinatorService', () => ({
  retryFailedRun: (...a: unknown[]) => retryFailedRun(...a),
}));
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
});

describe('GET /api/admin/tickets/:id/evidence — expectation field', () => {
  it('merges the classifier\'s visualProof expectation into the existing evidence response, additive, not replacing the evidence array', async () => {
    getEvidenceForTicket.mockResolvedValue([{ id: 'ev-1', artifact_type: 'screenshot' }]);
    getTicketEvidenceExpectations.mockResolvedValue({ visualProof: 'expected', workGraph: 'not_applicable', decisions: 'not_applicable' });

    const res = await request(app).get('/api/admin/tickets/tk-1/evidence');

    expect(res.status).toBe(200);
    expect(res.body.evidence).toEqual([{ id: 'ev-1', artifact_type: 'screenshot' }]);
    expect(res.body.expectation).toBe('expected');
  });

  it('returns "not_applicable" for a ticket type the classifier says never gets visual proof', async () => {
    getEvidenceForTicket.mockResolvedValue([]);
    getTicketEvidenceExpectations.mockResolvedValue({ visualProof: 'not_applicable', workGraph: 'expected', decisions: 'not_applicable' });

    const res = await request(app).get('/api/admin/tickets/tk-2/evidence');

    expect(res.status).toBe(200);
    expect(res.body.evidence).toEqual([]);
    expect(res.body.expectation).toBe('not_applicable');
  });

  it('500s if the ticket does not exist (regression guard: existing error behavior unchanged)', async () => {
    getEvidenceForTicket.mockResolvedValue([]);
    getTicketEvidenceExpectations.mockRejectedValue(new Error('Ticket missing not found'));

    const res = await request(app).get('/api/admin/tickets/missing/evidence');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/admin/tickets/:id/work-graph — expectation field', () => {
  it('merges the classifier\'s workGraph expectation alongside the existing workUnits/dependencies shape', async () => {
    getWorkGraphForTicket.mockResolvedValue({ workUnits: [{ id: 'wu-1' }], dependencies: [] });
    getTicketEvidenceExpectations.mockResolvedValue({ visualProof: 'not_applicable', workGraph: 'expected', decisions: 'not_applicable' });

    const res = await request(app).get('/api/admin/tickets/tk-3/work-graph');

    expect(res.status).toBe(200);
    expect(res.body.workUnits).toEqual([{ id: 'wu-1' }]);
    expect(res.body.dependencies).toEqual([]);
    expect(res.body.expectation).toBe('expected');
  });

  it('returns "not_applicable" for a ticket type the classifier says never gets a work graph', async () => {
    getWorkGraphForTicket.mockResolvedValue({ workUnits: [], dependencies: [] });
    getTicketEvidenceExpectations.mockResolvedValue({ visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' });

    const res = await request(app).get('/api/admin/tickets/tk-4/work-graph');

    expect(res.status).toBe(200);
    expect(res.body.expectation).toBe('not_applicable');
  });
});

describe('GET /api/admin/tickets/:id/decisions — expectation field', () => {
  it('merges the classifier\'s decisions expectation alongside the existing decisions array', async () => {
    getDecisionsForTicket.mockResolvedValue([{ id: 'd-1', decision_type: 'approve' }]);
    getTicketEvidenceExpectations.mockResolvedValue({ visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'expected' });

    const res = await request(app).get('/api/admin/tickets/tk-5/decisions');

    expect(res.status).toBe(200);
    expect(res.body.decisions).toEqual([{ id: 'd-1', decision_type: 'approve' }]);
    expect(res.body.expectation).toBe('expected');
  });

  it('returns "not_applicable" for a ticket type the classifier says never needs a recorded decision', async () => {
    getDecisionsForTicket.mockResolvedValue([]);
    getTicketEvidenceExpectations.mockResolvedValue({ visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' });

    const res = await request(app).get('/api/admin/tickets/tk-6/decisions');

    expect(res.status).toBe(200);
    expect(res.body.expectation).toBe('not_applicable');
  });
});
