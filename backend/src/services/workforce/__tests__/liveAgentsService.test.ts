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
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findAll: jest.fn() }));
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
import { listLiveAgents, listLiveAgentActivity, countOpenTicketsForAgent } from '../liveAgentsService';

const mockAdminUserFindAll = AdminUser.findAll as unknown as jest.Mock;
const mockAiAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockEnrollmentFindAll = Enrollment.findAll as unknown as jest.Mock;
const mockCommunityMemberFindAll = CommunityMember.findAll as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockTicketCount = Ticket.count as unknown as jest.Mock;
const mockDerivePresence = derivePresence as unknown as jest.Mock;

const reeseAdmin = { id: 'admin-reese', email: 'reese@colaberry.com', agent_id: 'agent-reese', is_ai_operated: true, display_name: 'Reese' };
const reeseAgent = {
  id: 'agent-reese', agent_name: 'Reese', agent_type: 'ai_staff_mentor', category: 'student_success',
  description: 'Reese', enabled: true, config: {},
};

// A Stage-1-style process — real display_name sharply different from the raw
// agent_name (mirrors production: agent_name 'cory-engine', display_name 'Cory
// Engine — Autonomous Operations'), WITH a legacy alias equal to its own
// agent_name (mirrors production: 100% of its historical tickets are keyed on
// created_by_id='cory-engine', 0% on assigned_to_id).
const processAdmin = { id: 'admin-process-1', email: 'process@colaberry.com', agent_id: 'agent-process-1', is_ai_operated: true, display_name: 'Cory Engine — Autonomous Operations' };
const processAgent = {
  id: 'agent-process-1', agent_name: 'cory-engine', agent_type: 'autonomous_engine', category: 'autonomous',
  description: null, enabled: true, config: { legacy_creator_ids: ['cory-engine'] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnrollmentFindAll.mockResolvedValue([{ id: 'enrollment-1', email: 'reese@colaberry.com' }]);
  mockCommunityMemberFindAll.mockResolvedValue([{ enrollment_id: 'enrollment-1', last_active_at: new Date() }]);
  mockDerivePresence.mockReturnValue('online');
  mockTicketCount.mockResolvedValue(0);
  mockTicketFindAll.mockResolvedValue([]);
});

describe('listLiveAgents', () => {
  it('Reese-only real shape: returns exactly 1 agent with real identity + live status + open ticket count', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);
    mockTicketCount.mockResolvedValue(4);

    const agents = await listLiveAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'agent-reese',
      agent_name: 'Reese',
      display_name: 'Reese',
      agent_type: 'ai_staff_mentor',
      live_status: 'online',
      open_ticket_count: 4,
    });
  });

  it('Open, not Total: filters the per-agent ticket count to status NOT IN (done, cancelled) — the exact fix for the founder-facing total-vs-open confusion (12,574 lifetime vs. 4,154 open board-wide)', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);
    mockTicketCount.mockResolvedValue(4);

    await listLiveAgents();

    const countArgs = mockTicketCount.mock.calls[0][0];
    const andClauses = countArgs.where[Op.and];
    const statusClause = andClauses.find((c: any) => 'status' in c);
    expect(statusClause.status[Op.notIn]).toEqual(['done', 'cancelled']);
    // The OR match-list clause must still be present, nested inside the AND —
    // this is a status filter ADDED to the existing match, not a replacement of it.
    const orWrapper = andClauses.find((c: any) => Op.or in c);
    expect(orWrapper[Op.or]).toBeDefined();
  });

  it('N+1 regression guard: batches Enrollment/CommunityMember lookups into exactly one query each, regardless of agent count', async () => {
    const secondAdmin = { id: 'admin-2', email: 'second@colaberry.com', agent_id: 'agent-2', is_ai_operated: true, display_name: 'Second' };
    const secondAgent = { id: 'agent-2', agent_name: 'SecondAgent', agent_type: 'ai_staff_mentor', category: null, description: null, enabled: true };
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin, processAdmin, secondAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent, processAgent, secondAgent]);

    await listLiveAgents();

    // Exactly one batched call each, no matter how many agents were processed —
    // this is the regression guard for the N+1 (was: 1 call per agent).
    expect(mockEnrollmentFindAll).toHaveBeenCalledTimes(1);
    expect(mockCommunityMemberFindAll).toHaveBeenCalledTimes(1);
    const enrollmentCallArgs = mockEnrollmentFindAll.mock.calls[0][0];
    expect(enrollmentCallArgs.where.email[Op.in]).toEqual(
      expect.arrayContaining(['reese@colaberry.com', 'process@colaberry.com', 'second@colaberry.com']),
    );
  });

  it('display name fix: shows the real AdminUser.display_name, not the raw agent_name, when they differ (the exact bug Ali flagged)', async () => {
    mockAdminUserFindAll.mockResolvedValue([processAdmin]);
    mockAiAgentFindAll.mockResolvedValue([processAgent]);

    const agents = await listLiveAgents();

    expect(agents[0].agent_name).toBe('cory-engine'); // raw technical id, still available
    expect(agents[0].display_name).toBe('Cory Engine — Autonomous Operations'); // the fix
  });

  it('display name fallback: uses agent_name if display_name is somehow unset, never a blank card', async () => {
    mockAdminUserFindAll.mockResolvedValue([{ ...processAdmin, display_name: null }]);
    mockAiAgentFindAll.mockResolvedValue([processAgent]);

    const agents = await listLiveAgents();

    expect(agents[0].display_name).toBe('cory-engine');
  });

  it('alias-matching ticket count: an agent WITH legacy aliases correctly counts its historical tickets, keyed on the raw created_by_id string, not just assigned_to_id', async () => {
    mockAdminUserFindAll.mockResolvedValue([processAdmin]);
    mockAiAgentFindAll.mockResolvedValue([processAgent]);
    mockTicketCount.mockResolvedValue(9606); // real cory-engine historical volume

    const agents = await listLiveAgents();

    expect(agents[0].open_ticket_count).toBe(9606);
    const countArgs = mockTicketCount.mock.calls[0][0];
    // The real query must be able to match EITHER identifier — assert the actual
    // match lists include both the real AdminUser id and the legacy raw string,
    // not just one or the other. The OR clause is now nested inside the AND
    // wrapper alongside the status filter (see the "Open, not Total" test above).
    const orClauses = countArgs.where[Op.and].find((c: any) => Op.or in c)[Op.or];
    const assignedClause = orClauses.find((c: any) => 'assigned_to_id' in c);
    const createdClause = orClauses.find((c: any) => 'created_by_id' in c);
    expect(assignedClause.assigned_to_id[Op.in]).toEqual(expect.arrayContaining(['admin-process-1', 'cory-engine']));
    expect(createdClause.created_by_id[Op.in]).toEqual(expect.arrayContaining(['admin-process-1', 'cory-engine']));
  });

  it('alias-matching is a pure superset for an agent with ZERO legacy aliases (Reese): the match list is exactly her own id, never expanded to unrelated strings', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);
    mockTicketCount.mockResolvedValue(22); // Reese's real ticket count is unaffected by this change

    const agents = await listLiveAgents();

    expect(agents[0].open_ticket_count).toBe(22);
    const countArgs = mockTicketCount.mock.calls[0][0];
    const orClauses = countArgs.where[Op.and].find((c: any) => Op.or in c)[Op.or];
    const assignedClause = orClauses.find((c: any) => 'assigned_to_id' in c);
    expect(assignedClause.assigned_to_id[Op.in]).toEqual(['admin-reese']);
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
      { id: 't1', ticket_number: 1, title: 'Reached out to a struggling student', status: 'in_progress', priority: 'high', type: 'reese_autonomous_outreach', assigned_to_id: 'admin-reese', created_by_id: null, updated_at: new Date('2026-08-10') },
    ]);

    const events = await listLiveAgentActivity();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ agent_id: 'agent-reese', agent_name: 'Reese', agent_display_name: 'Reese', ticket_id: 't1', type: 'reese_autonomous_outreach' });
  });

  it('alias-matching: attributes a HISTORICAL ticket (assigned_to_id null, created_by_id = raw legacy string) to the right agent, with the real display name', async () => {
    mockAdminUserFindAll.mockResolvedValue([processAdmin]);
    mockAiAgentFindAll.mockResolvedValue([processAgent]);
    mockTicketFindAll.mockResolvedValue([
      { id: 't-legacy-1', ticket_number: 9001, title: '[Review] Fix a flagged incident', status: 'todo', priority: 'high', type: 'agent_action', assigned_to_id: null, created_by_id: 'cory-engine', updated_at: new Date('2026-08-10') },
    ]);

    const events = await listLiveAgentActivity();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      agent_id: 'agent-process-1',
      agent_name: 'cory-engine',
      agent_display_name: 'Cory Engine — Autonomous Operations',
      ticket_id: 't-legacy-1',
    });
  });

  it('a ticket matching neither a real id nor any known alias falls back to "Unknown Agent" honestly, never a crash', async () => {
    mockAdminUserFindAll.mockResolvedValue([reeseAdmin]);
    mockAiAgentFindAll.mockResolvedValue([reeseAgent]);
    mockTicketFindAll.mockResolvedValue([
      { id: 't-orphan', ticket_number: 42, title: 'Orphaned', status: 'todo', priority: 'low', type: 'task', assigned_to_id: null, created_by_id: 'some-unrelated-process', updated_at: new Date('2026-08-10') },
    ]);

    const events = await listLiveAgentActivity();

    expect(events[0]).toMatchObject({ agent_id: '', agent_name: 'Unknown Agent', agent_display_name: 'Unknown Agent' });
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

// Ticket Count Sync fix (2026-08-21, session CC-20260818-x4nk continued) —
// countOpenTicketsForAgent() was extracted OUT of listLiveAgents()'s own loop
// (still exercised indirectly by every test above) so orgChartService.ts and
// agentDetailService.ts can reuse the SAME query instead of each maintaining
// their own. These tests cover it directly, as its own load-bearing contract,
// not just as an implementation detail of listLiveAgents().
describe('countOpenTicketsForAgent — the shared per-agent count reused by 3 call sites', () => {
  it('returns the mocked count for a straightforward agent with no legacy aliases', async () => {
    mockTicketCount.mockResolvedValue(4);

    const count = await countOpenTicketsForAgent('admin-reese', reeseAgent as any);

    expect(count).toBe(4);
    const countArgs = mockTicketCount.mock.calls[0][0];
    const orClauses = countArgs.where[Op.and].find((c: any) => Op.or in c)[Op.or];
    const assignedClause = orClauses.find((c: any) => 'assigned_to_id' in c);
    expect(assignedClause.assigned_to_id[Op.in]).toEqual(['admin-reese']);
  });

  it('matches EITHER the real AdminUser id OR a legacy alias for an agent with historical raw-string tickets', async () => {
    mockTicketCount.mockResolvedValue(9606);

    const count = await countOpenTicketsForAgent('admin-process-1', processAgent as any);

    expect(count).toBe(9606);
    const countArgs = mockTicketCount.mock.calls[0][0];
    const orClauses = countArgs.where[Op.and].find((c: any) => Op.or in c)[Op.or];
    const createdClause = orClauses.find((c: any) => 'created_by_id' in c);
    expect(createdClause.created_by_id[Op.in]).toEqual(expect.arrayContaining(['admin-process-1', 'cory-engine']));
  });

  it('always filters to OPEN statuses only (not done/cancelled) — the exact bug class this function exists to prevent from regressing', async () => {
    mockTicketCount.mockResolvedValue(0);

    await countOpenTicketsForAgent('admin-reese', reeseAgent as any);

    const countArgs = mockTicketCount.mock.calls[0][0];
    const statusClause = countArgs.where[Op.and].find((c: any) => 'status' in c);
    expect(statusClause.status[Op.notIn]).toEqual(['done', 'cancelled']);
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
