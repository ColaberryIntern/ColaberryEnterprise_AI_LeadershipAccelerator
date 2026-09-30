/**
 * Agent Alias & Identity Fix — forward-fix for CoryBrain's ticket-creator
 * identity. createStrategicInitiative() creates its parent ticket via the
 * generic createTicket() (default status:'backlog', never enters
 * ticketManagementAgent.ts's status:'todo' auto-dispatch sweep), so it's safe
 * to fully forward-stamp the real AdminUser id as assignee, unlike cory-engine's
 * Review-branch exception.
 *
 * CoryBrain Initiative Terminal-State Fix (2026-08-15) — createStrategicInitiative()
 * now creates the initiative row BEFORE its ticket (so the ticket can carry a real
 * entity_id back to it), starts the ticket at 'in_review' with a reply token, and
 * sends a real approval email — the same human-in-the-loop shape already proven in
 * production for the AI Workforce Marketing director. See execution-contract.md /
 * plan.md in .loop-architect/runs/20260815-195400-corybrain-initiative-terminal-state/
 * for the full rationale. approveInitiative()/rejectInitiative() previously had zero
 * test coverage; both get real coverage here for the first time, including the
 * approveInitiative ticket-target fix (todo -> in_progress, since in_review -> todo
 * is not a valid ticket-status transition).
 *
 * Dedup normalization fix (2026-08-15) — the dedup check moved from a single
 * `findOne({where:{title:...}})` exact-string match to `findAll()` over active-status
 * rows plus an in-process `normalizeInitiativeDedupTitle()` comparison (see
 * coryInitiatives.ts). `mockFindOne` is gone; `mockFindAll` takes its place
 * throughout. See .loop-architect/runs/20260815-214613-strategic-initiative-dedup-consolidation/
 * for the full rationale (282 of 350 stuck production rows were exact-title-dedup
 * failures against titles carrying a volatile embedded number).
 */
jest.mock('../../../models/StrategicInitiative', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../ticketService', () => ({
  createTicket: jest.fn(),
  createSubTasks: jest.fn(),
  updateTicketStatus: jest.fn(),
  addTicketComment: jest.fn(),
}));
jest.mock('../../agentBlueprint/ticketCreatorIdentitySeed', () => ({ getTicketCreatorAdminUserId: jest.fn() }));
jest.mock('../../aiEventService', () => ({ logAiEvent: jest.fn(() => Promise.resolve()) }));
jest.mock('../../emailService', () => ({ sendTicketApprovalEmail: jest.fn().mockResolvedValue(undefined) }));

import StrategicInitiative from '../../../models/StrategicInitiative';
import { createTicket, createSubTasks, updateTicketStatus, addTicketComment } from '../../ticketService';
import { getTicketCreatorAdminUserId } from '../../agentBlueprint/ticketCreatorIdentitySeed';
import { sendTicketApprovalEmail } from '../../emailService';
import {
  createStrategicInitiative,
  approveInitiative,
  rejectInitiative,
  normalizeInitiativeDedupTitle,
  type CreateInitiativeInput,
} from '../coryInitiatives';

const mockFindAll = StrategicInitiative.findAll as unknown as jest.Mock;
const mockFindByPk = StrategicInitiative.findByPk as unknown as jest.Mock;
const mockCreate = StrategicInitiative.create as unknown as jest.Mock;
const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockCreateSubTasks = createSubTasks as unknown as jest.Mock;
const mockUpdateTicketStatus = updateTicketStatus as unknown as jest.Mock;
const mockAddTicketComment = addTicketComment as unknown as jest.Mock;
const mockGetAdminUserId = getTicketCreatorAdminUserId as unknown as jest.Mock;
const mockSendApprovalEmail = sendTicketApprovalEmail as unknown as jest.Mock;

const INPUT: CreateInitiativeInput = {
  title: 'Improve onboarding flow',
  description: 'desc',
  initiative_type: 'process_improvement' as any,
};

/** Builds a fake persisted-initiative instance with a real, spy-able .update(). */
function makeInitiativeInstance(overrides: Record<string, any> = {}) {
  const instance: Record<string, any> = {
    id: 'initiative-1',
    ticket_id: null,
    status: 'proposed',
    ...overrides,
  };
  instance.update = jest.fn((fields: Record<string, any>) => {
    Object.assign(instance, fields);
    return Promise.resolve(instance);
  });
  return instance;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindAll.mockResolvedValue([]);
  mockCreate.mockImplementation((_fields: Record<string, any>) => Promise.resolve(makeInitiativeInstance()));
  mockCreateTicket.mockResolvedValue({ id: 'ticket-1' });
  mockSendApprovalEmail.mockResolvedValue(undefined);
});

describe('createStrategicInitiative — initiative created before its ticket, real entity link', () => {
  it('happy path: initiative is created before the ticket, and the ticket carries entity_type/entity_id back to it', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');

    const result = await createStrategicInitiative(INPUT);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
    const ticketArgs = mockCreateTicket.mock.calls[0][0];
    expect(ticketArgs.entity_type).toBe('strategic_initiative');
    expect(ticketArgs.entity_id).toBe('initiative-1');
    expect(ticketArgs.status).toBe('in_review');
    expect(typeof ticketArgs.metadata.reply_token).toBe('string');
    expect(ticketArgs.metadata.reply_token.length).toBeGreaterThan(0);
    expect(result.ticket_id).toBe('ticket-1'); // stamped via initiative.update() after ticket creation
  });

  it('happy path: sends a real approval email with the ticket id, reply token, and initiative title/description', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');

    await createStrategicInitiative(INPUT);

    expect(mockSendApprovalEmail).toHaveBeenCalledTimes(1);
    const emailArgs = mockSendApprovalEmail.mock.calls[0][0];
    expect(emailArgs.ticketId).toBe('ticket-1');
    expect(emailArgs.title).toBe(INPUT.title);
    expect(emailArgs.description).toBe(INPUT.description);
    expect(emailArgs.directorName).toBe('CoryBrain');
    const ticketArgs = mockCreateTicket.mock.calls[0][0];
    expect(emailArgs.replyToken).toBe(ticketArgs.metadata.reply_token);
  });

  it('failure path: a rejected approval email never throws out of createStrategicInitiative and never blocks the initiative/ticket/subtasks', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');
    mockSendApprovalEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(createStrategicInitiative(INPUT)).resolves.toBeDefined();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
  });

  it('failure path: identity not yet resolvable (null) never writes a literal null/undefined assignee id', async () => {
    mockGetAdminUserId.mockResolvedValue(null);

    await createStrategicInitiative(INPUT);

    const ticketArgs = mockCreateTicket.mock.calls[0][0];
    expect(ticketArgs).not.toHaveProperty('assigned_to_type');
    expect(ticketArgs).not.toHaveProperty('assigned_to_id');
  });

  it('failure path (hardening): a createTicket() failure cancels the just-created initiative instead of leaving it permanently stuck, and rethrows', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');
    mockCreateTicket.mockRejectedValue(new Error('DB connection dropped'));
    let capturedInitiative: any;
    mockCreate.mockImplementation(() => {
      capturedInitiative = makeInitiativeInstance({ id: 'initiative-orphan-risk' });
      return Promise.resolve(capturedInitiative);
    });

    await expect(createStrategicInitiative(INPUT)).rejects.toThrow('DB connection dropped');

    // The compensating action: without this, the initiative would sit forever at
    // status:'proposed'/ticket_id:null, silently blocking the dedup check above on
    // every future run for this same title -- reproducing the exact bug this run
    // exists to fix, just via a different code path (a DB write failure instead of
    // "nothing ever completes it").
    expect(capturedInitiative.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(mockSendApprovalEmail).not.toHaveBeenCalled();
    expect(mockCreateSubTasks).not.toHaveBeenCalled();
  });

  it('idempotency: an existing active initiative with the same title short-circuits before any ticket, initiative row, or email is created', async () => {
    mockFindAll.mockResolvedValue([{ id: 'existing-1', title: INPUT.title }]);

    const result = await createStrategicInitiative(INPUT);

    expect(result).toEqual({ id: 'existing-1', title: INPUT.title });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(mockGetAdminUserId).not.toHaveBeenCalled();
    expect(mockSendApprovalEmail).not.toHaveBeenCalled();
  });

  it('end-to-end: once a finding reaches a terminal state, the SAME title is creatable again (the actual bug this run fixes)', async () => {
    // First call: title is active (findAll returns [] -> not deduped).
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');
    await createStrategicInitiative(INPUT);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Simulate the initiative having reached a terminal state (what syncInitiative()
    // in ticketReplyService.ts now does on a reply) — the dedup query itself excludes
    // completed/cancelled, so re-querying now returns [] again.
    mockFindAll.mockResolvedValue([]);
    mockCreate.mockClear();
    mockCreateTicket.mockClear();

    await createStrategicInitiative(INPUT);

    // Before this fix, nothing could ever flip status to completed/cancelled, so in
    // production this second call would have kept finding the still-'proposed' row
    // via the dedup query and short-circuited forever. Here, the active-row set
    // genuinely reflects "no active row" (as it would in production once
    // syncInitiative has run), and a fresh initiative + ticket are created — proving
    // the finding is re-raisable.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
  });

  it('dedup normalization: same condition, different embedded number — collides, no new initiative created', async () => {
    mockFindAll.mockResolvedValue([
      { id: 'existing-slow', title: 'CampaignQAAgent is slow (136.6s avg)' },
    ]);

    const result = await createStrategicInitiative({
      ...INPUT,
      title: 'CampaignQAAgent is slow (139.9s avg)',
    });

    expect(result).toEqual({ id: 'existing-slow', title: 'CampaignQAAgent is slow (136.6s avg)' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('dedup normalization: same shape, different agent — does NOT collide, both are created', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');
    mockFindAll.mockResolvedValue([
      { id: 'existing-slow', title: 'CampaignQAAgent is slow (136.6s avg)' },
    ]);

    await createStrategicInitiative({ ...INPUT, title: 'OtherAgent is slow (50.0s avg)' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateTicket).toHaveBeenCalledTimes(1);
  });
});

describe('normalizeInitiativeDedupTitle — the exact regex table the dedup fix depends on', () => {
  it('duration titles with different values normalize to the same key', () => {
    expect(normalizeInitiativeDedupTitle('CampaignQAAgent is slow (136.6s avg)')).toBe(
      normalizeInitiativeDedupTitle('CampaignQAAgent is slow (139.9s avg)'),
    );
  });

  it('error-rate titles with different percentages normalize to the same key', () => {
    expect(
      normalizeInitiativeDedupTitle('OpenclawLearningOptimizationAgent has 41% error rate'),
    ).toBe(normalizeInitiativeDedupTitle('OpenclawLearningOptimizationAgent has 31% error rate'));
  });

  it('department-alert titles with different counts normalize to the same key', () => {
    expect(
      normalizeInitiativeDedupTitle('Admissions department triggered 6 alerts in 24h'),
    ).toBe(normalizeInitiativeDedupTitle('Admissions department triggered 7 alerts in 24h'));
  });

  it('stale-task-count titles with different counts normalize to the same key', () => {
    expect(normalizeInitiativeDedupTitle('12 agent tasks stale for 48+ hours')).toBe(
      normalizeInitiativeDedupTitle('5 agent tasks stale for 48+ hours'),
    );
  });

  it('different departments in the same alert-count shape do NOT normalize to the same key', () => {
    expect(
      normalizeInitiativeDedupTitle('Admissions department triggered 6 alerts in 24h'),
    ).not.toBe(normalizeInitiativeDedupTitle('Finance department triggered 6 alerts in 24h'));
  });

  it('a title with no digits is returned unchanged', () => {
    expect(normalizeInitiativeDedupTitle('AgentBehaviorMonitorAgent is in error state')).toBe(
      'AgentBehaviorMonitorAgent is in error state',
    );
  });
});

describe('createStrategicInitiative — Agent Quality Cleanup, Item 4: real subtask descriptions', () => {
  const INPUT_WITH_SUBTASKS: CreateInitiativeInput = {
    title: 'Redundant agent detected: EmailFollowUpAgent',
    description: 'Two agents (EmailFollowUpAgent, ReminderAgent) perform overlapping work with no coordination.',
    initiative_type: 'agent_restructure' as any,
    subtasks: [
      { title: 'Investigate: Redundant agent detected: EmailFollowUpAgent', effort: 'medium' },
      { title: 'Implement fix or optimization', effort: 'large' },
      { title: 'Validate resolution', effort: 'small' },
    ],
  };

  it('every subtask ticket gets a real, non-empty description referencing the parent finding — not a bare title with zero body', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');

    await createStrategicInitiative(INPUT_WITH_SUBTASKS);

    expect(mockCreateSubTasks).toHaveBeenCalledTimes(1);
    const subtaskArgs = mockCreateSubTasks.mock.calls[0][1] as Array<Record<string, any>>;
    expect(subtaskArgs).toHaveLength(3);
    for (const subtask of subtaskArgs) {
      expect(subtask.description).toBeTruthy();
      // Grounded in the real finding already on hand — not fabricated detail.
      expect(subtask.description).toContain(INPUT_WITH_SUBTASKS.title);
      expect(subtask.description).toContain(INPUT_WITH_SUBTASKS.description);
    }
    // Titles themselves are untouched — this is additive, not a rewrite.
    expect(subtaskArgs[0].title).toBe('Investigate: Redundant agent detected: EmailFollowUpAgent');
    expect(subtaskArgs[1].title).toBe('Implement fix or optimization');
    expect(subtaskArgs[2].title).toBe('Validate resolution');
  });

  it('two different initiatives produce different subtask descriptions — no boilerplate collision across initiatives', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');

    await createStrategicInitiative(INPUT_WITH_SUBTASKS);
    const firstDescriptions = (mockCreateSubTasks.mock.calls[0][1] as Array<Record<string, any>>).map((s) => s.description);

    mockCreateSubTasks.mockClear();
    const otherInitiative: CreateInitiativeInput = {
      title: 'Schedule conflict: two agents fire at the same cron minute',
      description: 'ContentGenerationAgent and CampaignHealthAgent both fire at :00, contending for the same DB pool.',
      initiative_type: 'ai_optimization' as any,
      subtasks: [{ title: 'Validate resolution', effort: 'small' }],
    };
    await createStrategicInitiative(otherInitiative);
    const secondDescriptions = (mockCreateSubTasks.mock.calls[0][1] as Array<Record<string, any>>).map((s) => s.description);

    expect(firstDescriptions[2]).not.toBe(secondDescriptions[0]); // both are "Validate resolution" subtasks
    expect(secondDescriptions[0]).toContain('Schedule conflict');
  });

  it('an initiative with no subtasks never calls createSubTasks (unchanged behavior)', async () => {
    mockGetAdminUserId.mockResolvedValue('admin-corybrain-1');

    await createStrategicInitiative(INPUT);

    expect(mockCreateSubTasks).not.toHaveBeenCalled();
  });
});

describe('approveInitiative — real coverage for the first time; ticket target corrected to in_progress', () => {
  it('happy path: proposed -> approved, ticket moved to in_progress (not todo), comment added', async () => {
    const initiative = makeInitiativeInstance({ id: 'initiative-2', ticket_id: 'ticket-2', status: 'proposed' });
    mockFindByPk.mockResolvedValue(initiative);

    const result = await approveInitiative('initiative-2', 'ali@colaberry.com');

    expect(initiative.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(mockUpdateTicketStatus).toHaveBeenCalledWith('ticket-2', 'in_progress', 'human', 'ali@colaberry.com');
    expect(mockUpdateTicketStatus).not.toHaveBeenCalledWith('ticket-2', 'todo', expect.anything(), expect.anything());
    expect(mockAddTicketComment).toHaveBeenCalledWith('ticket-2', expect.stringContaining('approved'), 'human', 'ali@colaberry.com');
    expect(result.status).toBe('approved');
  });

  it('failure path: initiative not found throws, never touches the ticket', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(approveInitiative('missing-id', 'ali@colaberry.com')).rejects.toThrow('missing-id');
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });

  it('boundary: an already-non-proposed initiative throws and never re-touches the ticket', async () => {
    const initiative = makeInitiativeInstance({ id: 'initiative-3', ticket_id: 'ticket-3', status: 'approved' });
    mockFindByPk.mockResolvedValue(initiative);

    await expect(approveInitiative('initiative-3', 'ali@colaberry.com')).rejects.toThrow('already approved');
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });
});

describe('rejectInitiative — real coverage for the first time', () => {
  it('happy path: proposed -> cancelled, ticket cancelled, reason commented', async () => {
    const initiative = makeInitiativeInstance({ id: 'initiative-4', ticket_id: 'ticket-4', status: 'proposed' });
    mockFindByPk.mockResolvedValue(initiative);

    const result = await rejectInitiative('initiative-4', 'ali@colaberry.com', 'no longer relevant');

    expect(initiative.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(mockUpdateTicketStatus).toHaveBeenCalledWith('ticket-4', 'cancelled', 'human', 'ali@colaberry.com');
    expect(mockAddTicketComment).toHaveBeenCalledWith('ticket-4', expect.stringContaining('no longer relevant'), 'human', 'ali@colaberry.com');
    expect(result.status).toBe('cancelled');
  });

  it('failure path: initiative not found throws, never touches the ticket', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(rejectInitiative('missing-id', 'ali@colaberry.com')).rejects.toThrow('missing-id');
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });

  it('boundary: an already-terminal initiative throws and never re-touches the ticket', async () => {
    const initiative = makeInitiativeInstance({ id: 'initiative-5', ticket_id: 'ticket-5', status: 'cancelled' });
    mockFindByPk.mockResolvedValue(initiative);

    await expect(rejectInitiative('initiative-5', 'ali@colaberry.com')).rejects.toThrow('already cancelled');
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });
});
