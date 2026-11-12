/**
 * Tests for the tool-request conversation and the per-agent pipeline read (Agent Tools Phase 2).
 *
 * WHAT THESE PIN, in order of how badly each would mislead somebody:
 *
 *   1. **A message cannot decide anything.** The whole risk of adding a conversation beside an
 *      approval spine is that it becomes a second one. Posting writes a message and nothing else.
 *   2. **The author is the caller, never the payload.** Enforced in the controller; the service
 *      refuses a blank identity so a caller that skips the controller still cannot post
 *      anonymously.
 *   3. **"Approved" must not read as "done".** Phase 3 adds the states past approval. Until it
 *      exists, the derived sentence must not imply a handover that nothing tracks.
 *
 * Models are mocked so this stays a unit test with no database.
 */
export {};

const detailsHolder: { current: Array<Record<string, unknown>> } = { current: [] };
const parentsHolder: { current: Record<string, Record<string, unknown> | null> } = { current: {} };
const decisionsHolder: { current: Array<Record<string, unknown>> } = { current: [] };
const messagesHolder: { current: Array<Record<string, unknown>> } = { current: [] };
const created: Array<Record<string, unknown>> = [];

jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async (id: string) => parentsHolder.current[id] ?? null) },
}));

jest.mock('../../../models/AgentDomainToolRequestDetail', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => detailsHolder.current) },
}));

jest.mock('../../../models/AgentDomainToolRequestDecision', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => decisionsHolder.current) },
}));

jest.mock('../../../models/AgentDomainToolRequestMessage', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => messagesHolder.current),
    create: jest.fn(async (row: Record<string, unknown>) => {
      const saved = { id: 'msg-' + (created.length + 1), ...row };
      created.push(saved);
      return saved;
    }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  listToolRequestsForAgent, listMessages, postMessage,
  describeWhereItStands, MessageRefusedError, MESSAGE_BODY_MAX,
} = require('../toolRequestConversationService');

function givenRequest(opts: {
  id?: string; agentId?: string; status?: string; toolName?: string; capabilityId?: string | null;
}) {
  const id = opts.id ?? 'req-1';
  detailsHolder.current.push({
    change_request_id: id,
    agent_id: opts.agentId ?? 'agent-1',
    tool_name: opts.toolName ?? 'send_document',
    purpose: 'Email the brochure a visitor asked for',
    capability_id: opts.capabilityId === undefined ? 'admissions.deliver_docs' : opts.capabilityId,
    needed_by: '2026-12-01',
    writes: true,
  });
  parentsHolder.current[id] = {
    title: 'Let Maya email a requested document',
    status: opts.status ?? 'submitted',
    requested_by_identity: 'builder@colaberry.com',
    requested_at: new Date('2026-11-10T09:00:00.000Z'),
  };
  return id;
}

beforeEach(() => {
  detailsHolder.current = [];
  parentsHolder.current = {};
  decisionsHolder.current = [];
  messagesHolder.current = [];
  created.length = 0;
  jest.clearAllMocks();
});

describe('a message cannot decide anything', () => {
  it('writes only the message, with no status, verb or grant on it', async () => {
    givenRequest({});

    await postMessage({ changeRequestId: 'req-1', authorIdentity: 'ali@colaberry.com', body: 'Production read only.' });

    expect(created).toHaveLength(1);
    const row = created[0];
    expect(Object.keys(row).sort()).toEqual(
      ['author_identity', 'body', 'change_request_id', 'id', 'posted_at'].sort(),
    );
    // The fields that would make this a second approval spine.
    for (const forbidden of ['verb', 'status', 'tools_granted', 'autonomy_level', 'enabled', 'assigned_tool_name']) {
      expect(row).not.toHaveProperty(forbidden);
    }
  });

  it('does not touch the parent request when a message is posted', async () => {
    givenRequest({ status: 'submitted' });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Parent = require('../../../models/AgentDomainChangeRequest').default;

    await postMessage({ changeRequestId: 'req-1', authorIdentity: 'ali@colaberry.com', body: 'ok' });

    expect(Parent.update).toBeUndefined();
    expect(parentsHolder.current['req-1']!.status).toBe('submitted');
  });
});

describe('what posting refuses, by name', () => {
  it('refuses a blank body', async () => {
    givenRequest({});
    await expect(
      postMessage({ changeRequestId: 'req-1', authorIdentity: 'ali@colaberry.com', body: '   ' }),
    ).rejects.toMatchObject({ rule: 'body_empty' });
    expect(created).toHaveLength(0);
  });

  it('refuses an unattributed message, so a caller skipping the controller cannot post anonymously', async () => {
    givenRequest({});
    await expect(
      postMessage({ changeRequestId: 'req-1', authorIdentity: '  ', body: 'anonymous' }),
    ).rejects.toMatchObject({ rule: 'author_missing' });
    expect(created).toHaveLength(0);
  });

  it('refuses a body over the limit, naming the limit and the actual length', async () => {
    givenRequest({});
    await expect(
      postMessage({ changeRequestId: 'req-1', authorIdentity: 'a@b.c', body: 'x'.repeat(MESSAGE_BODY_MAX + 1) }),
    ).rejects.toMatchObject({ rule: 'body_too_long' });
  });

  it('refuses a message on a request that does not exist', async () => {
    await expect(
      postMessage({ changeRequestId: 'nope', authorIdentity: 'a@b.c', body: 'hello' }),
    ).rejects.toMatchObject({ rule: 'request_not_found' });
    expect(created).toHaveLength(0);
  });

  it('trims the body rather than storing the whitespace someone typed', async () => {
    givenRequest({});
    await postMessage({ changeRequestId: 'req-1', authorIdentity: 'a@b.c', body: '  spaced  ' });
    expect(created[0].body).toBe('spaced');
  });
});

describe('"approved" must not read as "done"', () => {
  it('says approved to build, and names the phase that would track the rest', () => {
    const line = describeWhereItStands('approved', []);
    expect(line).toContain('Approved to build');
    expect(line).not.toMatch(/\b(done|complete|handed over|delivered)\b/i);
  });

  it('reports an assigned existing tool as resolved, not as something to build', () => {
    const line = describeWhereItStands('approved', [
      { verb: 'assign_existing_tool', decided_by_identity: 'ali', decided_at: 'x',
        reason: null, missing_field: null, assigned_tool_name: 'send_email' },
    ]);
    expect(line).toContain('send_email');
    expect(line).toContain('Nothing new to build');
  });

  it('says what a send-back is waiting on', () => {
    const line = describeWhereItStands('submitted', [
      { verb: 'send_back', decided_by_identity: 'ali', decided_at: 'x',
        reason: null, missing_field: 'purpose', assigned_tool_name: null },
    ]);
    expect(line).toContain('purpose');
    expect(line).toContain('Waiting on the requester');
  });

  it('distinguishes "nobody has responded" from "open with decisions"', () => {
    expect(describeWhereItStands('submitted', [])).toContain('Nobody has responded');
    const withOne = describeWhereItStands('submitted', [
      { verb: 'approve_to_build', decided_by_identity: 'ali', decided_at: 'x',
        reason: null, missing_field: null, assigned_tool_name: null },
    ]);
    expect(withOne).not.toContain('Nobody has responded');
  });

  it('carries the decline reason into the sentence', () => {
    const line = describeWhereItStands('declined', [
      { verb: 'deny', decided_by_identity: 'ali', decided_at: 'x',
        reason: 'Already covered by send_email', missing_field: null, assigned_tool_name: null },
    ]);
    expect(line).toContain('Already covered by send_email');
  });
});

describe('the per-agent pipeline read', () => {
  it('returns the requests filed for this agent, with their standing', async () => {
    givenRequest({ status: 'submitted' });

    const report = await listToolRequestsForAgent('agent-1');

    expect(report.requests).toHaveLength(1);
    expect(report.requests[0].tool_name).toBe('send_document');
    expect(report.requests[0].capability_id).toBe('admissions.deliver_docs');
    expect(report.requests[0].where_it_stands).toContain('Nobody has responded');
    expect(report.summary).toMatchObject({ total: 1, open: 1, approved: 0, declined: 0 });
  });

  it('skips a detail row whose parent request is gone rather than inventing a title', async () => {
    detailsHolder.current.push({ change_request_id: 'orphan', agent_id: 'agent-1', tool_name: 't' });

    const report = await listToolRequestsForAgent('agent-1');

    expect(report.requests).toHaveLength(0);
    expect(report.summary.total).toBe(0);
  });

  it('counts approved and declined separately from open', async () => {
    givenRequest({ id: 'a', status: 'approved' });
    givenRequest({ id: 'b', status: 'declined' });
    givenRequest({ id: 'c', status: 'submitted' });

    const report = await listToolRequestsForAgent('agent-1');

    expect(report.summary).toMatchObject({ total: 3, open: 1, approved: 1, declined: 1 });
  });

  it('reports a request that names no capability as null, not as an empty string', async () => {
    givenRequest({ capabilityId: null });
    const report = await listToolRequestsForAgent('agent-1');
    expect(report.requests[0].capability_id).toBeNull();
  });
});

describe('reading the conversation', () => {
  it('returns messages with author and time, oldest first as queried', async () => {
    messagesHolder.current = [
      { id: 'm1', author_identity: 'builder@colaberry.com', posted_at: new Date('2026-11-10T10:00:00Z'), body: 'Does this cover sandbox?' },
      { id: 'm2', author_identity: 'ali@colaberry.com', posted_at: new Date('2026-11-10T11:00:00Z'), body: 'Production read only.' },
    ];

    const out = await listMessages('req-1');

    expect(out.map((m: { body: string }) => m.body)).toEqual(['Does this cover sandbox?', 'Production read only.']);
    expect(out[0].author_identity).toBe('builder@colaberry.com');
    expect(out[0].posted_at).toBe('2026-11-10T10:00:00.000Z');
  });

  it('returns an empty list, not null, when nothing has been said', async () => {
    expect(await listMessages('req-1')).toEqual([]);
  });
});
