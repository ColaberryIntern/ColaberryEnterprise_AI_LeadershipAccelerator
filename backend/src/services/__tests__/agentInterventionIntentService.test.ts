/**
 * agentInterventionIntentService — Reese Agentic AI Employee mission,
 * Capability 7's remaining aggregate manager questions. Pins the
 * deterministic trigger detection and that each real answer is built from
 * real ReeseOutreach rows, scoped to the calling agent's own outreach
 * tickets via the same identity-match pattern agentWorkStatusIntentService.
 * ts already uses.
 */
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

const mockReeseOutreachFindAll = jest.fn();
jest.mock('../../models/ReeseOutreach', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockReeseOutreachFindAll(...a) },
}));

const mockEnrollmentFindAll = jest.fn();
jest.mock('../../models/Enrollment', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockEnrollmentFindAll(...a) },
}));

import { Op } from 'sequelize';
import {
  detectInterventionIntentQuery,
  buildInterventionIntentReply,
} from '../agentInterventionIntentService';

const agent = { id: 'agent-1', agent_name: 'Reese', config: null } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminUserFindOne.mockResolvedValue({ id: 'admin-1' });
  mockTicketFindAll.mockResolvedValue([{ id: 'ticket-1' }, { id: 'ticket-2' }]);
});

describe('detectInterventionIntentQuery', () => {
  it.each([
    'Which students need me?',
    'Who needs me',
    'Who needs my attention',
    'Which students need attention',
  ])('needs_attention: %p', (message) => {
    expect(detectInterventionIntentQuery(message)).toBe('needs_attention');
  });

  it.each([
    'What did you promise to follow up on?',
    'What have you promised to follow up on',
    'What are your follow-up commitments',
    'What follow-ups do you have',
  ])('follow_up_commitments: %p', (message) => {
    expect(detectInterventionIntentQuery(message)).toBe('follow_up_commitments');
  });

  it.each([
    'Which interventions are working?',
    'What interventions are working',
    'Are your interventions working',
    'How are your interventions doing',
  ])('intervention_outcomes: %p', (message) => {
    expect(detectInterventionIntentQuery(message)).toBe('intervention_outcomes');
  });

  it('honesty boundary: an unrelated message matches none', () => {
    expect(detectInterventionIntentQuery('How is Victor doing this week?')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectInterventionIntentQuery('')).toBeNull();
  });
});

describe('buildInterventionIntentReply', () => {
  describe('needs_attention', () => {
    it('honesty path: no linked staff identity means nothing needs the agent, without querying ReeseOutreach at all', async () => {
      mockAdminUserFindOne.mockResolvedValue(null);

      const reply = await buildInterventionIntentReply(agent, 'needs_attention');

      expect(reply).toBe('Nothing needs me right now.');
      expect(mockReeseOutreachFindAll).not.toHaveBeenCalled();
    });

    it('boundary: zero active outreach rows is an honest "nothing" answer', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([]);

      const reply = await buildInterventionIntentReply(agent, 'needs_attention');

      expect(reply).toBe('Nothing needs me right now — every open thread has been resolved.');
    });

    it('happy path: lists real students by name with their real signal type', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([
        { enrollment_id: 'e1', signal_type: 'inactivity', status: 'active' },
      ]);
      mockEnrollmentFindAll.mockResolvedValue([{ id: 'e1', full_name: 'Victor Chukwukere' }]);

      const reply = await buildInterventionIntentReply(agent, 'needs_attention');

      expect(reply).toContain('1 student needs me:');
      expect(reply).toContain('Victor Chukwukere (inactivity)');
    });

    it('scopes the ReeseOutreach query to this agent\'s own owned outreach ticket ids', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([]);

      await buildInterventionIntentReply(agent, 'needs_attention');

      const call = mockReeseOutreachFindAll.mock.calls[0][0];
      expect(call.where.ticket_id[Op.in]).toEqual(['ticket-1', 'ticket-2']);
      expect(call.where.status).toBe('active');
    });
  });

  describe('follow_up_commitments', () => {
    it('boundary: zero commitments is an honest "nothing" answer', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([]);

      const reply = await buildInterventionIntentReply(agent, 'follow_up_commitments');

      expect(reply).toBe("I don't have any open follow-up commitments right now.");
    });

    it('happy path: lists real students with real due dates, and discloses the real scope limitation', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([
        { enrollment_id: 'e1', next_follow_up_due_at: new Date('2026-09-14T00:00:00Z'), status: 'active' },
      ]);
      mockEnrollmentFindAll.mockResolvedValue([{ id: 'e1', full_name: 'Katy C' }]);

      const reply = await buildInterventionIntentReply(agent, 'follow_up_commitments');

      expect(reply).toContain('Katy C — due 2026-09-14');
      expect(reply).toContain("I don't yet track promises made in direct conversation");
    });
  });

  describe('intervention_outcomes', () => {
    it('boundary: zero resolved interventions is an honest "not enough data" answer', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([]);

      const reply = await buildInterventionIntentReply(agent, 'intervention_outcomes');

      expect(reply).toBe("I don't have enough resolved interventions yet to tell what's working.");
    });

    it('happy path: real counts by real outcome status, never fabricated', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([
        { status: 'goal_met' }, { status: 'goal_met' }, { status: 'signal_cleared' }, { status: 'escalated' },
      ]);

      const reply = await buildInterventionIntentReply(agent, 'intervention_outcomes');

      expect(reply).toContain('Of 4 resolved interventions: 2 the student replied and the goal was met');
      expect(reply).toContain('1 the risk signal cleared on its own');
      expect(reply).toContain('1 needed human review');
    });

    it('only counts resolved statuses (goal_met/signal_cleared/escalated), never active threads', async () => {
      mockReeseOutreachFindAll.mockResolvedValue([]);

      await buildInterventionIntentReply(agent, 'intervention_outcomes');

      const call = mockReeseOutreachFindAll.mock.calls[0][0];
      expect(call.where.status[Op.in]).toEqual(['goal_met', 'signal_cleared', 'escalated']);
    });
  });
});
