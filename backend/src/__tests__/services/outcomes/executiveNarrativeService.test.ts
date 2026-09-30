jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

jest.mock('../../../models', () => ({
  Ticket: { findAll: jest.fn() },
  AgentRun: { findAll: jest.fn() },
  WorkLedgerEvent: { findAll: jest.fn() },
  ApprovalRequest: { findAll: jest.fn() },
  OutcomeMeasurement: { findAll: jest.fn() },
}));

jest.mock('../../../services/workLedger/workLedgerHealthService', () => ({
  getGovernanceShadowSummary: jest.fn(),
}));

import { Ticket, AgentRun, WorkLedgerEvent, ApprovalRequest, OutcomeMeasurement } from '../../../models';
import { getGovernanceShadowSummary } from '../../../services/workLedger/workLedgerHealthService';
import { generateExecutiveNarrative } from '../../../services/outcomes/executiveNarrativeService';

const ticketFindAll = Ticket.findAll as unknown as jest.Mock;
const agentRunFindAll = AgentRun.findAll as unknown as jest.Mock;
const eventFindAll = WorkLedgerEvent.findAll as unknown as jest.Mock;
const approvalFindAll = ApprovalRequest.findAll as unknown as jest.Mock;
const outcomeFindAll = OutcomeMeasurement.findAll as unknown as jest.Mock;
const mockGovernance = getGovernanceShadowSummary as unknown as jest.Mock;

function emptyGovernance(windowHours: number) {
  return { window_hours: windowHours, total_decisions: 0, would_allow: 0, would_require_approval: 0, would_block: 0, breakdown: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateExecutiveNarrative', () => {
  test('happy path: fixture data across all 5 dimensions produces correct counts per section', async () => {
    ticketFindAll.mockResolvedValue([{ id: 't1', title: 'Fix QR check-in retry' }]);
    mockGovernance.mockResolvedValue({
      window_hours: 24,
      total_decisions: 5,
      would_allow: 3,
      would_require_approval: 1,
      would_block: 1,
      breakdown: [],
    });
    agentRunFindAll.mockResolvedValue([{ id: 'run-1' }]);
    eventFindAll.mockResolvedValue([{ run_id: 'run-1' }]); // R0/R1-linked failed run
    approvalFindAll.mockResolvedValue([{ ticket_id: 't2', reason_code: 'needs_human_review' }]);
    outcomeFindAll.mockResolvedValue([
      { outcome_status: 'stable' },
      { outcome_status: 'stable' },
      { outcome_status: 'recurrence_detected' },
      { outcome_status: 'insufficient_data' },
    ]);

    const result = await generateExecutiveNarrative('day');

    expect(result.window).toBe('day');
    expect(result.shipped).toEqual({ count: 1, tickets: [{ id: 't1', title: 'Fix QR check-in retry' }] });
    expect(result.prevented).toEqual({ would_block: 1, would_require_approval: 1 });
    expect(result.failed_safely.count).toBe(1);
    expect(result.needs_decision).toEqual({ count: 1, items: [{ ticket_id: 't2', reason: 'needs_human_review' }] });
    expect(result.measurable_results).toEqual({ stable: 2, recurrence_detected: 1, insufficient_data: 1 });
    expect(result.honest_empty).toBe(false);
  });

  test('boundary (explicitly required): zero real activity across every dimension returns honest_empty: true and every count 0, never fabricated content', async () => {
    ticketFindAll.mockResolvedValue([]);
    mockGovernance.mockImplementation(async (h: number) => emptyGovernance(h));
    agentRunFindAll.mockResolvedValue([]);
    approvalFindAll.mockResolvedValue([]);
    outcomeFindAll.mockResolvedValue([]);

    const result = await generateExecutiveNarrative('week');

    expect(result.honest_empty).toBe(true);
    expect(result.shipped).toEqual({ count: 0, tickets: [] });
    expect(result.prevented).toEqual({ would_block: 0, would_require_approval: 0 });
    expect(result.failed_safely.count).toBe(0);
    expect(result.needs_decision).toEqual({ count: 0, items: [] });
    expect(result.measurable_results).toEqual({ stable: 0, recurrence_detected: 0, insufficient_data: 0 });
    // no WorkLedgerEvent lookup performed when there are zero failed runs to link
    expect(eventFindAll).not.toHaveBeenCalled();
  });

  test("window='day' vs 'week' produce different date-range queries (assert the query bounds differ, not just that both work)", async () => {
    ticketFindAll.mockResolvedValue([]);
    mockGovernance.mockImplementation(async (h: number) => emptyGovernance(h));
    agentRunFindAll.mockResolvedValue([]);
    approvalFindAll.mockResolvedValue([]);
    outcomeFindAll.mockResolvedValue([]);

    await generateExecutiveNarrative('day');
    const dayGovernanceWindowHours = mockGovernance.mock.calls[0][0];
    const dayTicketSince = ticketFindAll.mock.calls[0][0].where.completed_at[Object.getOwnPropertySymbols(ticketFindAll.mock.calls[0][0].where.completed_at)[0]];

    jest.clearAllMocks();
    ticketFindAll.mockResolvedValue([]);
    mockGovernance.mockImplementation(async (h: number) => emptyGovernance(h));
    agentRunFindAll.mockResolvedValue([]);
    approvalFindAll.mockResolvedValue([]);
    outcomeFindAll.mockResolvedValue([]);

    await generateExecutiveNarrative('week');
    const weekGovernanceWindowHours = mockGovernance.mock.calls[0][0];
    const weekTicketSince = ticketFindAll.mock.calls[0][0].where.completed_at[Object.getOwnPropertySymbols(ticketFindAll.mock.calls[0][0].where.completed_at)[0]];

    expect(dayGovernanceWindowHours).toBe(24);
    expect(weekGovernanceWindowHours).toBe(24 * 7);
    expect(weekTicketSince.getTime()).toBeLessThan(dayTicketSince.getTime());
  });
});
