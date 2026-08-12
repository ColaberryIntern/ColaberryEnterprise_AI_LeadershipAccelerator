import { Ticket, TicketActivity } from '../../../models';
import { updateTicketStatus, addTicketComment } from '../../../services/ticketService';
import { dispatchTicketToAgent } from '../../../services/ticketAgentDispatcher';
import { getEvidenceForTicket } from '../../../services/evidence/evidenceService';
import { runTicketManagementAgent } from '../../../services/agents/ticketManagementAgent';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models', () => ({
  Ticket: { findAll: jest.fn() },
  TicketActivity: { findOne: jest.fn() },
}));
jest.mock('../../../services/ticketService', () => ({
  assignTicket: jest.fn(),
  updateTicketStatus: jest.fn(),
  addTicketComment: jest.fn(),
}));
jest.mock('../../../services/ticketAgentDispatcher', () => ({ dispatchTicketToAgent: jest.fn() }));
jest.mock('../../../services/evidence/evidenceService', () => ({ getEvidenceForTicket: jest.fn() }));

const ticketFindAll = Ticket.findAll as unknown as jest.Mock;
const activityFindOne = TicketActivity.findOne as unknown as jest.Mock;
const mockUpdateStatus = updateTicketStatus as unknown as jest.Mock;
const mockAddComment = addTicketComment as unknown as jest.Mock;
const mockDispatch = dispatchTicketToAgent as unknown as jest.Mock;
const mockGetEvidence = getEvidenceForTicket as unknown as jest.Mock;

function makeReviewTicket(id: string, ticketNumber: number) {
  return { id, ticket_number: ticketNumber, status: 'in_review', priority: 'medium', updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch.mockResolvedValue(null);
  mockUpdateStatus.mockResolvedValue(undefined);
  mockAddComment.mockResolvedValue(undefined);
  activityFindOne.mockResolvedValue(null);
  // Calls 1 and 2 inside runTicketManagementAgent are the unassigned/stale-escalation
  // lookups (out of scope for this task) — keep them empty so only the evidence-gated
  // close block (call 3) is under test.
  ticketFindAll.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
});

describe('runTicketManagementAgent — evidence-gated in_review auto-close (ProofDesk Milestone 2)', () => {
  it('happy path: an in_review ticket 7+ days old WITH linked evidence closes', async () => {
    const ticket = makeReviewTicket('tk-1', 101);
    ticketFindAll.mockResolvedValueOnce([ticket]);
    mockGetEvidence.mockResolvedValue([{ id: 'art-1', artifact_type: 'screenshot' }]);

    const result = await runTicketManagementAgent();

    expect(mockUpdateStatus).toHaveBeenCalledWith('tk-1', 'done', 'agent', 'TicketManagementAgent');
    expect(mockAddComment).toHaveBeenCalledWith('tk-1', expect.stringContaining('Auto-closed'), 'agent', 'TicketManagementAgent');
    expect(result.actions_taken.some((a) => a.action === 'auto_closed' && a.entity_id === 'tk-1')).toBe(true);
  });

  it('boundary/regression: an in_review ticket 7+ days old with NO evidence and NO override comment does NOT auto-close — the explicit, intentional behavior change from Milestone 1\'s time-only rule', async () => {
    const ticket = makeReviewTicket('tk-2', 102);
    ticketFindAll.mockResolvedValueOnce([ticket]);
    mockGetEvidence.mockResolvedValue([]);
    activityFindOne.mockResolvedValue(null);

    const result = await runTicketManagementAgent();

    expect(mockUpdateStatus).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(result.actions_taken.some((a) => a.entity_id === 'tk-2')).toBe(false);
  });

  it('override path: no evidence but an [APPROVE-CLOSE] comment present closes the ticket', async () => {
    const ticket = makeReviewTicket('tk-3', 103);
    ticketFindAll.mockResolvedValueOnce([ticket]);
    mockGetEvidence.mockResolvedValue([]);
    activityFindOne.mockResolvedValue({ id: 'act-1', comment: 'Manually confirmed offline. [APPROVE-CLOSE]' });

    const result = await runTicketManagementAgent();

    expect(mockUpdateStatus).toHaveBeenCalledWith('tk-3', 'done', 'agent', 'TicketManagementAgent');
    expect(result.actions_taken.some((a) => a.action === 'auto_closed' && a.entity_id === 'tk-3')).toBe(true);
  });

  it('mixed batch: only the ticket with evidence closes, the one without stays untouched', async () => {
    const withEvidence = makeReviewTicket('tk-4', 104);
    const withoutEvidence = makeReviewTicket('tk-5', 105);
    ticketFindAll.mockResolvedValueOnce([withEvidence, withoutEvidence]);
    mockGetEvidence.mockImplementation(async (ticketId: string) =>
      ticketId === 'tk-4' ? [{ id: 'art-1', artifact_type: 'log' }] : [],
    );
    activityFindOne.mockResolvedValue(null);

    await runTicketManagementAgent();

    expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith('tk-4', 'done', 'agent', 'TicketManagementAgent');
  });
});
