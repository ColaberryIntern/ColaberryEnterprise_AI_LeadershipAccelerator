/**
 * agentWorkStatusIntentService — Reese Agentic AI Employee mission,
 * Checkpoint F, first slice. Pins the deterministic trigger-phrase
 * detection and that the real answer is built from real Ticket rows via
 * the SAME identity match (assigned_to_type:'ai_staff' OR legacy
 * created_by_id alias) agentDetailService.ts already uses — never a
 * second, drifting definition of "which tickets belong to this agent."
 */
import { Op } from 'sequelize';

const mockAdminUserFindOne = jest.fn();
jest.mock('../../models/AdminUser', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockAdminUserFindOne(...a) },
}));

const mockTicketFindAll = jest.fn();
jest.mock('../../models/Ticket', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockTicketFindAll(...a) },
}));

import { detectWorkStatusQuery, buildWorkStatusReply } from '../agentWorkStatusIntentService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('detectWorkStatusQuery', () => {
  it.each([
    'What are you working on?',
    'What are you currently working on',
    "What've you been working on this week?",
    'What have you been working on',
    'What is on your plate',
    "what's on your plate today",
    'What are your open tasks',
  ])('in_progress: %p', (message) => {
    expect(detectWorkStatusQuery(message)).toBe('in_progress');
  });

  it.each([
    'What is overdue?',
    "What's overdue",
    'Is anything overdue',
    'What are you behind on',
    "what's late",
    'Is anything late',
  ])('overdue: %p', (message) => {
    expect(detectWorkStatusQuery(message)).toBe('overdue');
  });

  it('a message mentioning both resolves to the more specific overdue answer', () => {
    expect(detectWorkStatusQuery("What's overdue on your plate?")).toBe('overdue');
  });

  it('honesty boundary: an unrelated message is neither — no detection, no guessing', () => {
    expect(detectWorkStatusQuery('How is Victor doing this week?')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectWorkStatusQuery('')).toBeNull();
  });
});

describe('buildWorkStatusReply', () => {
  const agent = { id: 'agent-1', agent_name: 'Reese', config: null } as any;

  it('honesty path: an agent with no linked staff identity gets an honest disclosure, never a fabricated queue', async () => {
    mockAdminUserFindOne.mockResolvedValue(null);

    const reply = await buildWorkStatusReply(agent, 'in_progress');

    expect(reply).toContain("doesn't have a linked staff identity");
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });

  describe('in_progress', () => {
    beforeEach(() => {
      mockAdminUserFindOne.mockResolvedValue({ id: 'admin-1' });
    });

    it('boundary: zero in-progress tickets is an honest "nothing" answer', async () => {
      mockTicketFindAll.mockResolvedValue([]);

      const reply = await buildWorkStatusReply(agent, 'in_progress');

      expect(reply).toBe("I'm not actively working on anything right now.");
    });

    it('happy path: queries by this agent\'s real identity match list and status exactly "in_progress"', async () => {
      mockTicketFindAll.mockResolvedValue([{ ticket_number: 42, title: 'Follow up with a struggling student' }]);

      const reply = await buildWorkStatusReply(agent, 'in_progress');

      expect(reply).toContain("I'm currently working on 1:");
      expect(reply).toContain('#42 Follow up with a struggling student');
      const call = mockTicketFindAll.mock.calls[0][0];
      expect(call.where.status).toBe('in_progress');
      expect(call.where[Op.or]).toEqual([
        { assigned_to_type: 'ai_staff', assigned_to_id: { [Op.in]: ['admin-1'] } },
        { created_by_id: { [Op.in]: ['admin-1'] } },
      ]);
    });

    it('an agent with real legacy creator aliases matches on all of them, not just its own id', async () => {
      const agentWithAliases = { id: 'agent-2', agent_name: 'CoryBrain', config: { legacy_creator_ids: ['cory-engine'] } } as any;
      mockTicketFindAll.mockResolvedValue([]);

      await buildWorkStatusReply(agentWithAliases, 'in_progress');

      const call = mockTicketFindAll.mock.calls[0][0];
      expect(call.where[Op.or][0].assigned_to_id[Op.in]).toEqual(expect.arrayContaining(['admin-1', 'cory-engine']));
    });

    it('caps the listed tickets at 5 and discloses the remainder rather than silently truncating', async () => {
      mockTicketFindAll.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({ ticket_number: i + 1, title: `Task ${i + 1}` })),
      );

      const reply = await buildWorkStatusReply(agent, 'in_progress');

      expect(reply).toContain("I'm currently working on 7:");
      expect(reply).toContain('Task 1');
      expect(reply).toContain('Task 5');
      expect(reply).not.toContain('Task 6');
      expect(reply).toContain('...and 2 more.');
    });
  });

  describe('overdue', () => {
    beforeEach(() => {
      mockAdminUserFindOne.mockResolvedValue({ id: 'admin-1' });
    });

    it('boundary: zero overdue tickets is an honest "nothing" answer', async () => {
      mockTicketFindAll.mockResolvedValue([]);

      const reply = await buildWorkStatusReply(agent, 'overdue');

      expect(reply).toBe('Nothing of mine is overdue right now.');
    });

    it('happy path: excludes done/cancelled, filters on due_date in the past, and pluralizes correctly for 2+', async () => {
      mockTicketFindAll.mockResolvedValue([
        { ticket_number: 1, title: 'Overdue assessment follow-up', due_date: new Date('2026-08-01') },
        { ticket_number: 2, title: 'Overdue check-in', due_date: new Date('2026-08-05') },
      ]);

      const reply = await buildWorkStatusReply(agent, 'overdue');

      expect(reply).toContain('2 of mine are overdue:');
      expect(reply).toContain('#1 Overdue assessment follow-up (due 2026-08-01)');
      const call = mockTicketFindAll.mock.calls[0][0];
      expect(call.where.status).toEqual({ [Op.notIn]: ['done', 'cancelled'] });
      expect(call.where.due_date).toEqual({ [Op.lte]: expect.any(Date) });
    });

    it('singular phrasing for exactly one overdue ticket', async () => {
      mockTicketFindAll.mockResolvedValue([{ ticket_number: 1, title: 'One overdue thing', due_date: new Date('2026-08-01') }]);

      const reply = await buildWorkStatusReply(agent, 'overdue');

      expect(reply).toContain('1 of mine is overdue:');
    });
  });
});
