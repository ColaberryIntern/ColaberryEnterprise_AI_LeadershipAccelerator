/**
 * Dara v2 Phase 6 — the Basecamp gateway. Proves: fail-closed with no real
 * config, never a duplicate real external write on retry, the mandatory
 * AI-disclosure line is always present, and a real failure is recorded
 * honestly rather than swallowed.
 */
jest.mock('../../ops/basecampClient', () => ({ bcPost: jest.fn() }));
jest.mock('../../../models/WorkLedgerEvent', () => ({ findOne: jest.fn() }));
jest.mock('../../workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));
jest.mock('../daraBasecampConfigService', () => ({ getDaraBasecampConfig: jest.fn() }));
jest.mock('../daraIdentitySeed', () => ({ getDaraAdminUserId: jest.fn() }));

import { bcPost } from '../../ops/basecampClient';
import WorkLedgerEvent from '../../../models/WorkLedgerEvent';
import { emitEvent } from '../../workLedger/workLedgerService';
import { getDaraBasecampConfig } from '../daraBasecampConfigService';
import { getDaraAdminUserId } from '../daraIdentitySeed';
import { createBasecampTodoForHandoff } from '../daraBasecampGatewayService';

const mockBcPost = bcPost as unknown as jest.Mock;
const mockWorkLedgerFindOne = WorkLedgerEvent.findOne as unknown as jest.Mock;
const mockEmitEvent = emitEvent as unknown as jest.Mock;
const mockGetConfig = getDaraBasecampConfig as unknown as jest.Mock;
const mockGetDaraAdminUserId = getDaraAdminUserId as unknown as jest.Mock;

const HANDOFF_TICKET_ID = 'handoff-ticket-1';
const CONFIG = { projectId: 'proj-1', todolistId: 'list-1', assigneeBasecampPersonId: 12345 };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConfig.mockResolvedValue(CONFIG);
  mockGetDaraAdminUserId.mockResolvedValue('dara-admin-1');
  mockWorkLedgerFindOne.mockResolvedValue(null);
  mockBcPost.mockResolvedValue({ id: 999, app_url: 'https://3.basecamp.com/123/buckets/proj-1/todos/999' });
  mockEmitEvent.mockResolvedValue({ event_id: 'evt-1' });
});

describe('createBasecampTodoForHandoff', () => {
  it('fail-closed: gateway not configured -> never attempts a real Basecamp call', async () => {
    mockGetConfig.mockResolvedValue(null);

    const result = await createBasecampTodoForHandoff(HANDOFF_TICKET_ID, 'title', 'Jordan Rivera', 'reason');

    expect(result).toEqual({ created: false, reason: 'basecamp_gateway_not_configured' });
    expect(mockBcPost).not.toHaveBeenCalled();
  });

  it('idempotency: an already-recorded ledger event for this handoff -> never a second real Basecamp call', async () => {
    mockWorkLedgerFindOne.mockResolvedValue({ event_id: 'evt-existing' });

    const result = await createBasecampTodoForHandoff(HANDOFF_TICKET_ID, 'title', 'Jordan Rivera', 'reason');

    expect(result).toEqual({ created: false, reason: 'already_created' });
    expect(mockBcPost).not.toHaveBeenCalled();
    expect(mockWorkLedgerFindOne).toHaveBeenCalledWith({ where: { idempotency_key: `dara-basecamp-todo:${HANDOFF_TICKET_ID}` } });
  });

  it('happy path: posts to the real Basecamp todos endpoint with a due_on, the configured assignee, and a mandatory AI-disclosure line', async () => {
    const result = await createBasecampTodoForHandoff(HANDOFF_TICKET_ID, 'Certification risk — Jordan Rivera', 'Jordan Rivera', 'low pass probability');

    expect(mockBcPost).toHaveBeenCalledWith(
      `/buckets/${CONFIG.projectId}/todolists/${CONFIG.todolistId}/todos.json`,
      expect.objectContaining({
        content: 'Certification risk — Jordan Rivera',
        assignee_ids: [CONFIG.assigneeBasecampPersonId],
        due_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    const body = mockBcPost.mock.calls[0][1];
    expect(body.description).toContain('Created by Dara');
    expect(body.description).toContain('AI Curriculum Employee');
    expect(result).toEqual({
      created: true, reason: 'created', basecampTodoId: 999,
      basecampAppUrl: 'https://3.basecamp.com/123/buckets/proj-1/todos/999',
    });
  });

  it('happy path: records a real, attributed, idempotency-keyed WorkLedgerEvent on success', async () => {
    await createBasecampTodoForHandoff(HANDOFF_TICKET_ID, 'title', 'Jordan Rivera', 'reason');

    expect(mockEmitEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'ai_staff',
      actorId: 'dara-admin-1',
      domain: 'basecamp_gateway',
      riskTier: 'R3',
      idempotencyKey: `dara-basecamp-todo:${HANDOFF_TICKET_ID}`,
      result: 'success',
      targetId: '999',
      sourceRecordType: 'ticket',
      sourceRecordId: HANDOFF_TICKET_ID,
    }));
  });

  it('failure path: a real Basecamp API failure is recorded honestly (result: failure), never silently swallowed or reported as success', async () => {
    mockBcPost.mockRejectedValue(new Error('BC POST /buckets/.../todos.json -> 422 Unprocessable'));

    const result = await createBasecampTodoForHandoff(HANDOFF_TICKET_ID, 'title', 'Jordan Rivera', 'reason');

    expect(result).toEqual({ created: false, reason: 'basecamp_request_failed' });
    expect(mockEmitEvent).toHaveBeenCalledWith(expect.objectContaining({
      result: 'failure',
      idempotencyKey: `dara-basecamp-todo:${HANDOFF_TICKET_ID}`,
      reasonCode: expect.stringContaining('422'),
    }));
  });

  it('boundary: a ledger-write failure on the FAILURE path never throws into the caller (the real failure result still returns)', async () => {
    mockBcPost.mockRejectedValue(new Error('Basecamp is down'));
    mockEmitEvent.mockRejectedValue(new Error('ledger write also failed'));

    await expect(createBasecampTodoForHandoff(HANDOFF_TICKET_ID, 'title', 'Jordan Rivera', 'reason')).resolves.toEqual({
      created: false, reason: 'basecamp_request_failed',
    });
  });
});
