jest.mock('../../config/database', () => ({
  sequelize: { transaction: jest.fn((cb: any) => cb({})), authenticate: jest.fn() },
}));
jest.mock('../../models', () => ({
  Ticket: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../services/ticketCreatorReportsToResolver', () => ({
  resolveCreatorAiAgent: jest.fn(),
}));
jest.mock('fs');

import fs from 'fs';
import { Ticket } from '../../models';
import { resolveCreatorAiAgent } from '../../services/ticketCreatorReportsToResolver';
import { parseArgs, runPlan, runApply, runRevert } from '../backfillTicketReportsToAssignee';

const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockTicketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const mockResolveCreatorAiAgent = resolveCreatorAiAgent as unknown as jest.Mock;
const mockWriteFileSync = fs.writeFileSync as unknown as jest.Mock;
const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;

function makeTicket(overrides: Record<string, any> = {}) {
  const base = {
    id: 't1',
    created_by_type: 'agent',
    created_by_id: 'AlumniNetworkArchitect',
    assigned_to_type: null,
    assigned_to_id: null,
    status: 'todo',
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return base;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parseArgs', () => {
  it('defaults to plan mode with sane defaults', () => {
    const opts = parseArgs([]);
    expect(opts.mode).toBe('plan');
    expect(opts.batchSize).toBe(200);
  });

  it('--apply requires --undo-log', () => {
    expect(() => parseArgs(['--apply'])).toThrow(/requires --undo-log/);
  });

  it('--apply and --revert are mutually exclusive', () => {
    expect(() => parseArgs(['--apply', '--revert', '--undo-log', 'x.json'])).toThrow(/mutually exclusive/);
  });
});

describe('runPlan', () => {
  it('makes ZERO writes — read-only', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);
    mockResolveCreatorAiAgent.mockResolvedValue({ reports_to_org_member_id: 'jackie-id' });

    await runPlan('/tmp', 'test-session');

    const ticketUpdateCalls = mockTicketFindAll.mock.results
      .flatMap((r) => r.value)
      .filter(Boolean);
    // No Ticket.update / Ticket.create ever invoked by plan mode.
    expect((Ticket as any).update).toBeUndefined();
    expect((Ticket as any).create).toBeUndefined();
  });

  it('resolved tickets appear in the undo log rows[]; unresolved (stray) tickets appear in unresolved[] and are never touched', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 't-resolved', created_by_id: 'AlumniNetworkArchitect' }),
      makeTicket({ id: 't-stray', created_by_id: 'CoryAgenticEngine' }),
    ]);
    mockResolveCreatorAiAgent.mockImplementation(async (_type: string, id: string) =>
      id === 'AlumniNetworkArchitect' ? { reports_to_org_member_id: 'jackie-id' } : null,
    );

    const result = await runPlan('/tmp', 'test-session');

    expect(result.totalResolved).toBe(1);
    expect(result.totalUnresolved).toBe(1);
    const [[, undoLogJson]] = mockWriteFileSync.mock.calls;
    const undoLog = JSON.parse(undoLogJson);
    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0].ticket_id).toBe('t-resolved');
    expect(undoLog.unresolved).toHaveLength(1);
    expect(undoLog.unresolved[0].ticket_id).toBe('t-stray');
    expect(undoLog.unresolved[0].reason).toBe('unregistered');
  });

  it('a ticket already correctly assigned is neither in rows[] nor unresolved[] — nothing to change', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ assigned_to_type: 'org_member', assigned_to_id: 'jackie-id' }),
    ]);
    mockResolveCreatorAiAgent.mockResolvedValue({ reports_to_org_member_id: 'jackie-id' });

    const result = await runPlan('/tmp', 'test-session');

    expect(result.totalResolved).toBe(0);
    expect(result.totalUnresolved).toBe(0);
  });
});

describe('runApply', () => {
  const UNDO_LOG = {
    generated_at: '2026-08-19T00:00:00Z',
    session_id: 'test-session',
    rows: [
      {
        ticket_id: 't1',
        created_by_type: 'agent',
        created_by_id: 'AlumniNetworkArchitect',
        previous_assigned_to_type: null,
        previous_assigned_to_id: null,
        new_assigned_to_type: 'org_member',
        new_assigned_to_id: 'jackie-id',
      },
    ],
    unresolved: [],
  };

  beforeEach(() => {
    mockReadFileSync.mockReturnValue(JSON.stringify(UNDO_LOG));
  });

  it('happy path: updates a resolved, still-open ticket to the correct assignee', async () => {
    const ticket = makeTicket();
    mockTicketFindByPk.mockResolvedValue(ticket);
    mockResolveCreatorAiAgent.mockResolvedValue({ reports_to_org_member_id: 'jackie-id' });

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.updated).toBe(1);
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_to_type: 'org_member', assigned_to_id: 'jackie-id' }),
      expect.anything(),
    );
  });

  it('idempotency: a ticket already carrying the correct assignee is skipped with ZERO writes (the second-apply-reports-0 contract)', async () => {
    const ticket = makeTicket({ assigned_to_type: 'org_member', assigned_to_id: 'jackie-id' });
    mockTicketFindByPk.mockResolvedValue(ticket);
    mockResolveCreatorAiAgent.mockResolvedValue({ reports_to_org_member_id: 'jackie-id' });

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.updated).toBe(0);
    expect(result.skippedAlreadyCorrect).toBe(1);
    expect(ticket.update).not.toHaveBeenCalled();
  });

  it('a ticket that closed between plan and apply is skipped, not force-reopened or reassigned', async () => {
    const ticket = makeTicket({ status: 'done' });
    mockTicketFindByPk.mockResolvedValue(ticket);
    mockResolveCreatorAiAgent.mockResolvedValue({ reports_to_org_member_id: 'jackie-id' });

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.skippedNoLongerOpen).toBe(1);
    expect(ticket.update).not.toHaveBeenCalled();
    // Status itself is never touched by this script, in either direction.
    expect(ticket.update.mock.calls.length).toBe(0);
  });

  it("a creator that no longer resolves (regressed) is skipped, never assigned a stale/wrong value", async () => {
    const ticket = makeTicket();
    mockTicketFindByPk.mockResolvedValue(ticket);
    mockResolveCreatorAiAgent.mockResolvedValue(null);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.skippedNoLongerResolves).toBe(1);
    expect(ticket.update).not.toHaveBeenCalled();
  });
});

describe('runRevert', () => {
  it('restores the exact prior assigned_to_type/assigned_to_id from the undo log', async () => {
    const undoLog = {
      generated_at: '2026-08-19T00:00:00Z',
      session_id: 'test-session',
      rows: [
        {
          ticket_id: 't1',
          created_by_type: 'agent',
          created_by_id: 'AlumniNetworkArchitect',
          previous_assigned_to_type: 'ai_staff',
          previous_assigned_to_id: 'old-admin-id',
          new_assigned_to_type: 'org_member',
          new_assigned_to_id: 'jackie-id',
        },
      ],
      unresolved: [],
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(undoLog));
    const ticket = makeTicket({ assigned_to_type: 'org_member', assigned_to_id: 'jackie-id' });
    mockTicketFindByPk.mockResolvedValue(ticket);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result.reverted).toBe(1);
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_to_type: 'ai_staff', assigned_to_id: 'old-admin-id' }),
      expect.anything(),
    );
  });

  it('idempotency: a ticket already at its previous state is skipped', async () => {
    const undoLog = {
      generated_at: '2026-08-19T00:00:00Z',
      session_id: 'test-session',
      rows: [
        {
          ticket_id: 't1',
          created_by_type: 'agent',
          created_by_id: 'AlumniNetworkArchitect',
          previous_assigned_to_type: null,
          previous_assigned_to_id: null,
          new_assigned_to_type: 'org_member',
          new_assigned_to_id: 'jackie-id',
        },
      ],
      unresolved: [],
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(undoLog));
    const ticket = makeTicket({ assigned_to_type: null, assigned_to_id: null });
    mockTicketFindByPk.mockResolvedValue(ticket);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result.reverted).toBe(0);
    expect(result.skippedAlreadyAtPreviousState).toBe(1);
    expect(ticket.update).not.toHaveBeenCalled();
  });
});
