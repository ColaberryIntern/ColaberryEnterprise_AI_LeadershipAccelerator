import { createExperimentTicket } from '../../../services/reporting/experimentService';
import { createTicket } from '../../../services/ticketService';
import { ExperimentProposal } from '../../../models';
import { logEvent } from '../../../services/ledgerService';

// ProofDesk Milestone 6 audit fix regression test. Covers the bug found during the
// M6 acceptance-criteria audit: createExperimentTicket() used to call Ticket.create()
// directly, bypassing the work ledger entirely and writing an invalid `status: 'open'`
// value. This test asserts the fixed behavior routes through the one real, ledger-
// instrumented ticket-creation path (ticketService.createTicket()) with a valid status.

jest.mock('../../../services/ticketService', () => ({
  createTicket: jest.fn(),
}));

jest.mock('../../../models', () => ({
  ExperimentProposal: { findByPk: jest.fn() },
  ReportingInsight: {},
}));

jest.mock('../../../services/ledgerService', () => ({
  logEvent: jest.fn(),
}));

const mockCreateTicket = createTicket as jest.Mock;
const mockFindByPk = ExperimentProposal.findByPk as jest.Mock;
const mockLogEvent = logEvent as jest.Mock;

describe('createExperimentTicket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: routes ticket creation through ticketService.createTicket() with a valid status (not the old invalid "open")', async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    mockFindByPk.mockResolvedValue({
      id: 'proposal-1',
      title: 'Test Experiment',
      hypothesis: 'Raising X will improve Y',
      priority: 'high',
      update: mockUpdate,
    });
    mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });

    const ticket = await createExperimentTicket('proposal-1');

    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
    const call = mockCreateTicket.mock.calls[0][0];
    expect(call.status).toBe('todo'); // valid TicketStatus, not the old invalid 'open'
    expect(call.title).toBe('Test Experiment');
    expect(call.description).toBe('Raising X will improve Y');
    expect(call.type).toBe('strategic');
    expect(call.priority).toBe('high');
    expect(call.source).toBe('reporting_agent');
    expect(call.created_by_type).toBe('agent');
    expect(call.created_by_id).toBe('ExperimentRecommendationAgent');
    expect(call.metadata).toEqual({ experiment_proposal_id: 'proposal-1' });

    // Ticket-to-proposal linkage and audit log still happen exactly as before.
    expect(mockUpdate).toHaveBeenCalledWith({ ticket_id: 'ticket-1' });
    expect(mockLogEvent).toHaveBeenCalledWith(
      'experiment_ticket_created',
      'ExperimentRecommendationAgent',
      'ticket',
      'ticket-1',
      { experiment_proposal_id: 'proposal-1' },
    );
    expect(ticket).toEqual({ id: 'ticket-1' });
  });

  it('boundary: falls back to an empty description when the proposal has no hypothesis', async () => {
    mockFindByPk.mockResolvedValue({
      id: 'proposal-2',
      title: 'No Hypothesis Yet',
      hypothesis: null,
      priority: 'low',
      update: jest.fn().mockResolvedValue(undefined),
    });
    mockCreateTicket.mockResolvedValue({ id: 'ticket-2' });

    await createExperimentTicket('proposal-2');

    expect(mockCreateTicket.mock.calls[0][0].description).toBe('');
  });

  it('failure path: throws when the experiment proposal does not exist, without ever calling createTicket', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(createExperimentTicket('missing-proposal')).rejects.toThrow(
      'Experiment proposal not found',
    );
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });
});
