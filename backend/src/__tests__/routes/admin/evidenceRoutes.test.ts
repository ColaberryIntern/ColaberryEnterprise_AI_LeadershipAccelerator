import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import ticketRoutes from '../../../routes/admin/ticketRoutes';
import { getEvidenceForTicket } from '../../../services/evidence/evidenceService';
import { getDecisionsForTicket, recordDecision, DecisionRecordValidationError } from '../../../services/evidence/decisionRecordService';
import { generateTicketSummary } from '../../../services/workLedger/summaryGeneratorService';

// ProofDesk Milestone 2 (T006) — evidence/summary/decisions routes, added to the
// existing ticketRoutes.ts router. Follows the same express+supertest+jwt harness
// pattern already established by workLedgerHealthController.test.ts (Milestone 1).

jest.mock('../../../services/evidence/evidenceService', () => ({ getEvidenceForTicket: jest.fn() }));
jest.mock('../../../services/evidence/decisionRecordService', () => {
  const actual = jest.requireActual('../../../services/evidence/decisionRecordService');
  return {
    getDecisionsForTicket: jest.fn(),
    recordDecision: jest.fn(),
    DecisionRecordValidationError: actual.DecisionRecordValidationError,
  };
});
jest.mock('../../../services/workLedger/summaryGeneratorService', () => ({ generateTicketSummary: jest.fn() }));
// ticketRoutes.ts also imports the full ticketService/ticketAgentDispatcher surface —
// stub them so this suite exercises only the T006 evidence/summary/decisions routes.
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

const mockGetEvidence = getEvidenceForTicket as unknown as jest.Mock;
const mockGetDecisions = getDecisionsForTicket as unknown as jest.Mock;
const mockRecordDecision = recordDecision as unknown as jest.Mock;
const mockGenerateSummary = generateTicketSummary as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  // Mount at root, matching how adminRoutes.ts really mounts this router
  // (`router.use(ticketRoutes)`, no path arg) now that every route string in
  // ticketRoutes.ts bakes its own `/api/admin` prefix in (the T010 routing fix —
  // see the header comment in ticketRoutes.ts). Mounting with an extra `/api/admin`
  // prefix here would double it and silently mask the exact bug that fix corrected.
  app.use(ticketRoutes);
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret);
}

const TICKET_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/tickets/:id/evidence', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/admin/tickets/${TICKET_ID}/evidence`);
    expect(res.status).toBe(401);
    expect(mockGetEvidence).not.toHaveBeenCalled();
  });

  it('returns 200 with evidence for an authenticated admin', async () => {
    mockGetEvidence.mockResolvedValue([{ id: 'art-1', artifact_type: 'screenshot' }]);
    const app = buildApp();
    const res = await request(app)
      .get(`/api/admin/tickets/${TICKET_ID}/evidence`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.evidence).toHaveLength(1);
  });
});

describe('GET /api/admin/tickets/:id/summary', () => {
  it('returns 200 with the generated summary', async () => {
    mockGenerateSummary.mockResolvedValue({ outcome: 'x', proof: 'y', humanAction: 'z', hasEvidence: false });
    const app = buildApp();
    const res = await request(app)
      .get(`/api/admin/tickets/${TICKET_ID}/summary`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ outcome: 'x', hasEvidence: false });
  });
});

describe('POST /api/admin/tickets/:id/decisions — validation', () => {
  it('rejects an invalid decision_type with 400 before any success response, and never fabricates a 201', async () => {
    mockRecordDecision.mockRejectedValue(new DecisionRecordValidationError('Malformed decision record input: decisionType: Invalid enum value'));

    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/decisions`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ decision_type: 'maybe', actor_type: 'human', actor_id: 'ali@colaberry.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/decisionType/);
  });

  it('happy path: a valid decision returns 201 with the created record', async () => {
    mockRecordDecision.mockResolvedValue({ id: 'dec-1', decision_type: 'approve' });

    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/tickets/${TICKET_ID}/decisions`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ decision_type: 'approve', actor_type: 'human', actor_id: 'ali@colaberry.com', rationale: 'looks good' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'dec-1', decision_type: 'approve' });
  });
});

describe('GET /api/admin/tickets/:id/decisions', () => {
  it('returns 200 with the decisions list', async () => {
    mockGetDecisions.mockResolvedValue([{ id: 'dec-1' }]);
    const app = buildApp();
    const res = await request(app)
      .get(`/api/admin/tickets/${TICKET_ID}/decisions`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.decisions).toHaveLength(1);
  });
});
