/**
 * liveAgentsTimelineService — real ticket-lifecycle events (created/status-
 * changed/closed), not just a ticket's current status. Core claims under
 * test: (1) kind derivation is correct for all 3 event kinds (created,
 * status_change, closed-via-done, closed-via-cancelled); (2) actor names are
 * resolved via the batched resolver, never a raw actor_id; (3) scoped to the
 * SAME blueprint-agent roster liveAgentsService.ts already uses (reused, not
 * re-derived); (4) empty roster -> [], never throws; (5) limit is bounded;
 * (6) same "never reads orgRegistry.ts" structural guard as its sibling.
 */
jest.mock('../liveAgentsService', () => ({ findBlueprintAdminUsers: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findAll: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: {}, TicketActivity: { findAll: jest.fn() } }));
jest.mock('../../actorIdentity/resolveActorDisplayName', () => ({
  resolveActorDisplayNamesBatch: jest.fn(),
  actorRefKey: (type: string, id: string) => `${type}:${id}`,
}));

import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import { findBlueprintAdminUsers } from '../liveAgentsService';
import AiAgent from '../../../models/AiAgent';
import { TicketActivity } from '../../../models';
import { resolveActorDisplayNamesBatch } from '../../actorIdentity/resolveActorDisplayName';
import { listLiveAgentTimeline } from '../liveAgentsTimelineService';

const mockFindBlueprintAdminUsers = findBlueprintAdminUsers as unknown as jest.Mock;
const mockAiAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockActivityFindAll = TicketActivity.findAll as unknown as jest.Mock;
const mockResolveBatch = resolveActorDisplayNamesBatch as unknown as jest.Mock;

const processAdmin = { id: 'admin-process-1', email: 'process@colaberry.com', agent_id: 'agent-process-1' };
const processAgent = { id: 'agent-process-1', agent_name: 'cory-engine', config: { legacy_creator_ids: ['cory-engine'] } };

beforeEach(() => {
  jest.clearAllMocks();
  mockFindBlueprintAdminUsers.mockResolvedValue([processAdmin]);
  mockAiAgentFindAll.mockResolvedValue([processAgent]);
  mockResolveBatch.mockResolvedValue(new Map([['cory:cory-engine', 'Cory Engine — Autonomous Operations']]));
});

function activityRow(overrides: Partial<{
  id: string; action: string; from_value: string | null; to_value: string | null;
  actor_type: string; actor_id: string; created_at: Date;
  ticket: { id: string; ticket_number: number | null; title: string };
}>) {
  return {
    id: 'activity-1',
    action: 'created',
    from_value: null,
    to_value: 'backlog',
    actor_type: 'cory',
    actor_id: 'cory-engine',
    created_at: new Date('2026-08-20T12:00:00.000Z'),
    ticket: { id: 'ticket-1', ticket_number: 42, title: 'Some ticket' },
    ...overrides,
  };
}

describe('listLiveAgentTimeline', () => {
  it('happy path: a "created" activity row maps to kind "created" with a real resolved actor name', async () => {
    mockActivityFindAll.mockResolvedValue([activityRow({})]);

    const events = await listLiveAgentTimeline();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'created',
      ticket_id: 'ticket-1',
      ticket_number: 42,
      ticket_title: 'Some ticket',
      actor_display_name: 'Cory Engine — Autonomous Operations',
    });
  });

  it('happy path: a status_changed row to a non-terminal status maps to kind "status_change"', async () => {
    mockActivityFindAll.mockResolvedValue([
      activityRow({ id: 'activity-2', action: 'status_changed', from_value: 'todo', to_value: 'in_progress' }),
    ]);

    const events = await listLiveAgentTimeline();

    expect(events[0].kind).toBe('status_change');
    expect(events[0].from_value).toBe('todo');
    expect(events[0].to_value).toBe('in_progress');
  });

  it('happy path: a status_changed row to "done" maps to kind "closed"', async () => {
    mockActivityFindAll.mockResolvedValue([
      activityRow({ id: 'activity-3', action: 'status_changed', from_value: 'in_review', to_value: 'done' }),
    ]);
    expect((await listLiveAgentTimeline())[0].kind).toBe('closed');
  });

  it('happy path: a status_changed row to "cancelled" also maps to kind "closed"', async () => {
    mockActivityFindAll.mockResolvedValue([
      activityRow({ id: 'activity-4', action: 'status_changed', from_value: 'todo', to_value: 'cancelled' }),
    ]);
    expect((await listLiveAgentTimeline())[0].kind).toBe('closed');
  });

  it('failure/boundary: zero blueprint agents -> empty array, never throws, and never queries TicketActivity at all', async () => {
    mockFindBlueprintAdminUsers.mockResolvedValue([]);

    const events = await listLiveAgentTimeline();

    expect(events).toEqual([]);
    expect(mockActivityFindAll).not.toHaveBeenCalled();
  });

  it('boundary: a resolved-to-nothing actor falls back to "Unknown Agent", never a raw id or a crash', async () => {
    mockResolveBatch.mockResolvedValue(new Map()); // no entry for this actor
    mockActivityFindAll.mockResolvedValue([activityRow({})]);

    expect((await listLiveAgentTimeline())[0].actor_display_name).toBe('Unknown Agent');
  });

  it('boundary: limit is passed through to the underlying query, default applied when omitted', async () => {
    mockActivityFindAll.mockResolvedValue([]);

    await listLiveAgentTimeline(10);
    expect(mockActivityFindAll.mock.calls[0][0].limit).toBe(10);

    await listLiveAgentTimeline();
    expect(mockActivityFindAll.mock.calls[1][0].limit).toBe(50);
  });

  it('boundary: an out-of-range limit is clamped, never passed through raw (defense in depth beyond the route\'s own Zod check)', async () => {
    mockActivityFindAll.mockResolvedValue([]);

    await listLiveAgentTimeline(99999);
    expect(mockActivityFindAll.mock.calls[0][0].limit).toBe(200);

    await listLiveAgentTimeline(-5);
    expect(mockActivityFindAll.mock.calls[1][0].limit).toBe(50);
  });

  it('only queries action IN (created, status_changed) — v1 scope, per execution-contract.md', async () => {
    mockActivityFindAll.mockResolvedValue([]);
    await listLiveAgentTimeline();

    const calledWhere = mockActivityFindAll.mock.calls[0][0].where;
    expect(calledWhere.action[Op.in]).toEqual(['created', 'status_changed']);
  });
});

describe('source never reads the static AI_ORG director roster', () => {
  it('liveAgentsTimelineService.ts has no import statement pulling in orgRegistry / AI_ORG', () => {
    const source = fs.readFileSync(path.join(__dirname, '../liveAgentsTimelineService.ts'), 'utf8');
    expect(source).not.toMatch(/orgRegistry/i);
    expect(source).not.toMatch(/AI_ORG/);
  });
});
