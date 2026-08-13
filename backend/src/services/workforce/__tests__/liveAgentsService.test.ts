/**
 * liveAgentsService — Workforce OS page's "Live Agents" + Activity Timeline data
 * source. The core claim under test: this service is GENERIC, not Reese-hardcoded
 * (a second real blueprint-built AiAgent appears automatically, zero code change),
 * and it NEVER reads the static AI_ORG director roster (orgRegistry.ts) — verified
 * both behaviorally (mocked data) and structurally (a source-grep on the real file,
 * so this can't silently regress via an import added without a matching test).
 */
jest.mock('../../../models/AdminUser', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: { findAll: jest.fn(), count: jest.fn() } }));
jest.mock('../../communityService', () => ({ derivePresence: jest.fn() }));

import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import AdminUser from '../../../models/AdminUser';
import AiAgent from '../../../models/AiAgent';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import { Ticket } from '../../../models';
import { derivePresence } from '../../communityService';
import { listLiveAgents, listLiveAgentActivity } from '../liveAgentsService';

const mockAdminUserFindAll = AdminUser.findAll as unknown as jest.Mock;
const mockAiAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockCommunityMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockTicketCount = Ticket.count as unknown as jest.Mock;
const mockDerivePresence = derivePresence as unknown as jest.Mock;

const reeseAdmin = { id: 'admin-reese', email: 'reese@colaberry.com', agent_id: 'agent-reese', is_ai_operated: true };
const reeseAgent = {
  id: 'agent-reese', agent_name: 'Reese', agent_type: 'ai_staff_mentor', category: 'student_success',
  description: 'Reese', enabled: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnrollmentFindOne.mockResolvedValue({ id: 'enrollment-1' });
  mockCommunityMemberFindOne.mockResolvedValue({ last_active_at: new Date() });
  mockDerivePresence.mockReturnValue('online');
  mockTicketCount.mockResolvedValue(0);
  mockTicketFindAll.mockResolvedValue([]);
});

describe('listLiveAgents', () => {
  it('Reese-only real shape: returns exactly 1 agent with real identity + live status + ticket count', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);
    mockTicketCount.mockResolvedValue(4);

    const agents = await listLiveAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'agent-reese',
      agent_name: 'Reese',
      agent_type: 'ai_staff_mentor',
      live_status: 'online',
      ticket_count: 4,
    });
  });

  it('is generic: a second real blueprint-built AiAgent appears automatically, with zero code change', async () => {
    const secondAdmin = { id: 'admin-2', email: 'second@colaberry.com', agent_id: 'agent-2', is_ai_operated: true };
    const secondAgent = { id: 'agent-2', agent_name: 'SecondAgent', agent_type: 'ai_staff_mentor', category: null, description: null, enabled: true };
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin, secondAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent, secondAgent]);

    const agents = await listLiveAgents();

    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.agent_name).sort()).toEqual(['Reese', 'SecondAgent']);
  });

  it('excludes an AdminUser with no agent_id (an ordinary human admin, not a blueprint agent)', async () => {
    // findBlueprintAdminUsers() is exercised through its where-clause contract:
    // the mock simulates what AdminUser.findAll({ where: { is_ai_operated: true,
    // agent_id: { [Op.ne]: null } } }) would actually return from Postgres — a human
    // admin row would never match that WHERE clause, so it never reaches this mock.
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);

    const agents = await listLiveAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0].agent_name).toBe('Reese');
    // Confirm the query itself asked for BOTH real marker columns — is_ai_operated
    // alone isn't the full contract; agent_id IS NOT NULL is what actually excludes
    // a human admin (who could in principle have is_ai_operated set without an
    // agent_id, or vice versa). Asserting only one of the two would let either half
    // of the real WHERE clause silently regress without this test catching it.
    expect(mockAdminUserFindAll).toHaveBeenCalledWith({
      where: { is_ai_operated: true, agent_id: { [Op.ne]: null } },
    });
  });

  it('returns an empty array (never throws) when zero blueprint agents exist', async () => {
    mockAdminUserFindAll.mockResolvedValue([]);

    const agents = await listLiveAgents();

    expect(agents).toEqual([]);
    // Zero-agent case must short-circuit before ever querying AiAgent — cheap no-op.
    expect(mockAiAgentFindAll).not.toHaveBeenCalled();
  });

  it('skips an AdminUser whose agent_id points at a since-deleted AiAgent row, rather than fabricating a card', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([]); // agent row gone

    const agents = await listLiveAgents();

    expect(agents).toEqual([]);
  });
});

describe('listLiveAgentActivity', () => {
  it('returns real, chronological ticket events for Reese and attributes them to the right agent name', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);
    mockTicketFindAll.mockResolvedValue([
      { id: 't1', ticket_number: 1, title: 'Reached out to a struggling student', status: 'in_progress', priority: 'high', type: 'reese_autonomous_outreach', assigned_to_id: 'admin-reese', updated_at: new Date('2026-08-10') },
    ]);

    const events = await listLiveAgentActivity();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ agent_id: 'agent-reese', agent_name: 'Reese', ticket_id: 't1', type: 'reese_autonomous_outreach' });
  });

  it('is empty when no blueprint agents exist — proves the timeline is Reese-only-today honestly, not fabricated for AI_ORG directors', async () => {
    mockAdminUserFindAll.mockResolvedValue([]);

    const events = await listLiveAgentActivity();

    expect(events).toEqual([]);
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });

  it('respects a custom limit', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);
    mockTicketFindAll.mockResolvedValue([]);

    await listLiveAgentActivity(5);

    expect(mockTicketFindAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });
});

describe('source never reads the static AI_ORG director roster', () => {
  it('liveAgentsService.ts has no import statement pulling in orgRegistry / AI_ORG', () => {
    const source = fs.readFileSync(path.join(__dirname, '../liveAgentsService.ts'), 'utf8');
    // Checks actual import/require statements only — this file's own header comment
    // legitimately mentions "orgRegistry" and "AI_ORG" in prose to explain WHY they
    // must never be imported, so a blunt whole-file substring match would false-
    // positive on that explanation. This checks the real dependency surface instead.
    const importLines = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) || /require\(/.test(line));
    for (const line of importLines) {
      expect(line).not.toMatch(/orgRegistry/);
      expect(line).not.toMatch(/AI_ORG/);
    }
    expect(importLines.length).toBeGreaterThan(0); // sanity: the file does have imports
  });
});
