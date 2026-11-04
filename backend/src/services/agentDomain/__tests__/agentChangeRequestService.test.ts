import type { Sequelize } from 'sequelize';

const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
const mockResolveIds = jest.fn();
const mockLoadMine = jest.fn();
const mockDetailCreate = jest.fn();
const mockDetailFindAll = jest.fn();
const mockDetailFindByPk = jest.fn();
const mockCheckCreate = jest.fn();
const mockCheckFindAll = jest.fn();
const mockCheckFindByPk = jest.fn();
const mockLoadCatalog = jest.fn();

jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => mockCreate(...a),
    findByPk: (...a: unknown[]) => mockFindByPk(...a),
    findAll: (...a: unknown[]) => mockFindAll(...a),
  },
}));

jest.mock('../agentDomainProvisionedReader', () => ({
  resolveOwnerIdentityIds: (...a: unknown[]) => mockResolveIds(...a),
  loadMyDomains: (...a: unknown[]) => mockLoadMine(...a),
}));

// AF11.1. The detail model and the capability registry are both mocked so this stays a unit test:
// the real registry reads eleven JSON files, and `toolRequestContract.test.ts` is where the real
// one is exercised against real ids.
jest.mock('../../../models/AgentDomainToolRequestDetail', () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => mockDetailCreate(...a),
    findAll: (...a: unknown[]) => mockDetailFindAll(...a),
    findByPk: (...a: unknown[]) => mockDetailFindByPk(...a),
  },
}));

jest.mock('../capabilityRecord', () => ({
  allCapabilities: () => [{ capability_id: 'platform.read_cron_registry' }],
}));
// AF11.2. The duplicate-check store and the catalog READ are mocked; the MATCHER is not.
//
// That split is deliberate. `checkForDuplicateTool` is pure, so letting the real one run means
// these tests exercise the real ranking rather than a stub that agrees with whatever the service
// does with it. What gets mocked is the I/O on either side of it: the catalog query and the row
// write. `toolDuplicateCheck.test.ts` is where the matcher is proved against the real catalog.
jest.mock('../../../models/AgentDomainToolDuplicateCheck', () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => mockCheckCreate(...a),
    findAll: (...a: unknown[]) => mockCheckFindAll(...a),
    findByPk: (...a: unknown[]) => mockCheckFindByPk(...a),
  },
}));

jest.mock('../toolCatalogForMatching', () => ({
  loadToolCatalogForMatching: (...a: unknown[]) => mockLoadCatalog(...a),
}));

import {
  ActorNotResolvedError,
  ChangeRequestNotFoundError,
  ChangeRequestRefusedError,
  DomainNotYoursError,
  ToolRequestRefusedError,
  decideChangeRequest,
  fileChangeRequest,
  listMyChangeRequests,
  resolveRecordedHumans,
} from '../agentChangeRequestService';

/**
 * AF4.2 service.
 *
 * The test that carries the most weight is the READ-BACK: the ticket's third acceptance criterion
 * is that an approved CR "names the approving human and the timestamp, read back from the row",
 * which is a claim about what is PERSISTED, not about what the function returned. So the row here
 * is a mutable fake whose `update` writes into it, and the assertions are made against the object
 * afterwards.
 */

const INTERN = 'ruth@colaberry.com';
const ALI = 'ali@colaberry.com';
const TIMER = 'system:auto_approve_timeout';

/** A fake row that behaves like the Sequelize instance: `update` mutates it. */
function fakeRow(over: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    id: 'cr-1',
    domain_key: 'platform-automation',
    title: 'Let an intern rename their own agent',
    description: null,
    status: 'submitted',
    requested_by_identity: INTERN,
    requested_at: new Date('2026-10-29T08:00:00Z'),
    approved_by_identity: null,
    approved_at: null,
    declined_reason: null,
    ...over,
  };
  row.update = jest.fn(async (patch: Record<string, unknown>) => {
    Object.assign(row, patch);
    return row;
  });
  return row;
}

let tx: Record<string, unknown>;

function fakeSequelize(): Sequelize {
  tx = { id: 'tx-1' };
  return {
    query: (...a: unknown[]) => mockQuery(...a),
    transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx),
  } as unknown as Sequelize;
}

/**
 * AF11.1. Whether the duplicate-request lookup finds an open request. Default: it does not.
 *
 * It has to be answered separately from the roster query, and by the SQL rather than by call
 * order: a blanket `mockResolvedValue([{ email }])` makes the duplicate check find a row every
 * time, so every tool filing would be refused as a duplicate and the suite would be testing the
 * mock.
 */
let openRequests: unknown[] = [];

/** A recorded person: the roster query returns a row. */
const recorded = () => mockQuery.mockImplementation((sql: string) => (
  /agent_domain_tool_request_details/.test(sql)
    ? Promise.resolve(openRequests)
    : Promise.resolve([{ email: 'whatever-the-stored-casing-is' }])
));
/** Nobody on record: the roster query returns nothing. */
const unrecorded = () => mockQuery.mockResolvedValue([]);

/** AF11.1. The agent a tool request names, and the one `loadMyDomains` says this person owns. */
const AGENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * A complete tool-request detail.
 *
 * Every field filled, because the contract refuses an incomplete one and this suite is testing the
 * SPINE, not the field rules. Those live in `toolRequestContract.test.ts`, field by field.
 */
const toolDetail = (over: Record<string, unknown> = {}) => ({
  agent_id: AGENT,
  tool_name: 'read_cron_registry',
  purpose: 'Read the cron registry so the agent can tell which jobs are scheduled.',
  reads: ['The cron registry table'],
  produces: ['A list of scheduled jobs'],
  capability_id: 'platform.read_cron_registry',
  task_unblocked: 'STORY-002, the scheduled-job audit.',
  manual_today: 'I ssh in and read the crontab.',
  needed_by: '2026-11-30',
  run_frequency: 'daily' as const,
  touches: ['The production cron registry (read only)'],
  inputs: [],
  writes: false,
  ...over,
});

beforeEach(() => {
  [mockQuery, mockCreate, mockFindByPk, mockFindAll, mockResolveIds, mockLoadMine,
    mockDetailCreate, mockDetailFindAll, mockDetailFindByPk,
    mockCheckCreate, mockCheckFindAll, mockCheckFindByPk, mockLoadCatalog]
    .forEach((m) => m.mockReset());
  mockResolveIds.mockResolvedValue(['identity-1']);
  mockLoadMine.mockResolvedValue([{ domain_key: 'platform-automation', agent_id: AGENT }]);
  mockCreate.mockImplementation(async (vals: Record<string, unknown>) => fakeRow(vals));
  mockDetailFindAll.mockResolvedValue([]);
  mockDetailFindByPk.mockResolvedValue(null);
  mockCheckFindAll.mockResolvedValue([]);
  mockCheckFindByPk.mockResolvedValue(null);
  // A small real-shaped catalog: `read_cron_registry` is what `toolDetail()` asks for, so the
  // default case in these tests is a request that duplicates an existing tool by name.
  mockLoadCatalog.mockResolvedValue({
    tools: [
      { tool_name: 'read_cron_registry', reads: ['The cron registry table'], produces: ['A list of scheduled jobs'] },
      { tool_name: 'send_sms_summary', reads: ['A phone number'], produces: ['An SMS'] },
      { tool_name: 'rankQueue', reads: [], produces: [] },
    ],
    degraded: false,
  });
  openRequests = [];
});

describe('the actor must be nameable, never a placeholder', () => {
  it('REFUSES to file when it cannot resolve who is signed in', async () => {
    unrecorded();
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: '', domainKey: 'platform-automation', title: 'x',
    })).rejects.toBeInstanceOf(ActorNotResolvedError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('REFUSES to decide when it cannot resolve who is signed in', async () => {
    unrecorded();
    await expect(decideChangeRequest({
      sequelize: fakeSequelize(), email: 'ghost@example.com', id: 'cr-1', decision: 'approved',
    })).rejects.toBeInstanceOf(ActorNotResolvedError);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });

  it("NEVER writes the string 'unknown' as an identity", async () => {
    // approvalRequestController.ts writes `req.admin?.email || 'unknown'` into decided_by, and
    // isNonHumanIdentity('unknown') is FALSE - so that placeholder reads as a person forever.
    unrecorded();
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: '', domainKey: 'platform-automation', title: 'x',
    })).rejects.toThrow();
    const written = JSON.stringify(mockCreate.mock.calls);
    expect(written).not.toContain('unknown');
  });
});

describe('filing', () => {
  it('records the proposer on the row', async () => {
    recorded();
    const out = await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, domainKey: 'platform-automation', title: 'Rename my agent',
    });
    expect(out.requested_by_identity).toBe(INTERN);
    expect(out.status).toBe('submitted');
    // The second argument is the transaction AF11.1 added: the request row and any tool detail are
    // written together, because a tool request with no detail is the thin request that ticket
    // exists to stop.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ requested_by_identity: INTERN, status: 'submitted' }),
      expect.objectContaining({ transaction: expect.anything() }),
    );
  });

  it('refuses a domain that is not yours, BEFORE writing anything', async () => {
    recorded();
    mockLoadMine.mockResolvedValue([{ domain_key: 'some-other-domain' }]);
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, domainKey: 'platform-automation', title: 'x',
    })).rejects.toBeInstanceOf(DomainNotYoursError);
    // A 403 that happens after a row exists is not a 403.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses when the intern owns no domains at all', async () => {
    recorded();
    mockLoadMine.mockResolvedValue([]);
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, domainKey: 'platform-automation', title: 'x',
    })).rejects.toBeInstanceOf(DomainNotYoursError);
  });
});

describe('THE READ-BACK: an approved request names the human and the time', () => {
  it('persists the approver and the timestamp TOGETHER, and the row holds them afterwards', async () => {
    recorded();
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);

    const before = Date.now();
    const out = await decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'approved',
    });
    const after = Date.now();

    // The returned projection.
    expect(out.status).toBe('approved');
    expect(out.approved_by_identity).toBe(ALI);
    expect(out.approved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // And the PERSISTED row, which is what the criterion is actually about.
    expect(row.status).toBe('approved');
    expect(row.approved_by_identity).toBe(ALI);
    expect(row.approved_at).toBeInstanceOf(Date);
    const at = (row.approved_at as Date).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);

    // One update carrying both fields - never two writes that could half-apply.
    const patch = (row.update as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty('approved_by_identity', ALI);
    expect(patch).toHaveProperty('approved_at');
  });

  it('records the decider and the reason on a decline', async () => {
    recorded();
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);
    const out = await decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'declined',
      declinedReason: '  Out of scope this quarter.  ',
    });
    expect(out.status).toBe('declined');
    expect(row.approved_by_identity).toBe(ALI);
    expect(row.declined_reason).toBe('Out of scope this quarter.');
  });

  it('refuses a decline with no reason, and writes nothing', async () => {
    recorded();
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);
    await expect(decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'declined',
    })).rejects.toBeInstanceOf(ChangeRequestRefusedError);
    expect(row.update).not.toHaveBeenCalled();
  });
});

describe('the refusals reach the persistence layer, not just the pure gate', () => {
  it('THE TICKET CONSTRAINT: the four-hour timer cannot approve through this service', async () => {
    recorded();
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);
    try {
      await decideChangeRequest({
        sequelize: fakeSequelize(), email: TIMER, id: 'cr-1', decision: 'approved',
      });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(ChangeRequestRefusedError);
      expect((e as ChangeRequestRefusedError).issues.map((i) => i.rule))
        .toContain('approver_is_not_human');
    }
    expect(row.update).not.toHaveBeenCalled();
  });

  it('refuses an intern approving their own request', async () => {
    recorded();
    const row = fakeRow({ requested_by_identity: INTERN });
    mockFindByPk.mockResolvedValue(row);
    await expect(decideChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, id: 'cr-1', decision: 'approved',
    })).rejects.toBeInstanceOf(ChangeRequestRefusedError);
    expect(row.update).not.toHaveBeenCalled();
  });

  it('refuses re-deciding an already decided request', async () => {
    recorded();
    const row = fakeRow({ status: 'approved', approved_by_identity: ALI, approved_at: new Date() });
    mockFindByPk.mockResolvedValue(row);
    await expect(decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'declined',
      declinedReason: 'changed my mind',
    })).rejects.toBeInstanceOf(ChangeRequestRefusedError);
  });

  it('404s a request that does not exist', async () => {
    recorded();
    mockFindByPk.mockResolvedValue(null);
    await expect(decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'nope', decision: 'approved',
    })).rejects.toBeInstanceOf(ChangeRequestNotFoundError);
  });

  it('carries the gate’s own sentences so the portal can render them verbatim', async () => {
    recorded();
    mockFindByPk.mockResolvedValue(fakeRow());
    try {
      await decideChangeRequest({
        sequelize: fakeSequelize(), email: TIMER, id: 'cr-1', decision: 'approved',
      });
    } catch (e) {
      expect((e as ChangeRequestRefusedError).message).toContain('only be decided by a person');
    }
  });
});

describe('the decision is read and gated INSIDE the transaction', () => {
  it('re-reads the row under a row lock rather than trusting an earlier read', async () => {
    // Two simultaneous decisions would otherwise both see 'submitted', both write, and the row
    // would end up naming whichever human lost the race.
    recorded();
    mockFindByPk.mockResolvedValue(fakeRow());
    await decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'approved',
    });
    const opts = mockFindByPk.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.transaction).toBe(tx);
    expect(opts.lock).toBeDefined();
  });

  it('writes through the same transaction it read in', async () => {
    recorded();
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);
    await decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'approved',
    });
    const updateOpts = (row.update as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(updateOpts.transaction).toBe(tx);
  });

  it('a second decision on a row already approved is refused, not applied', async () => {
    recorded();
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);
    await decideChangeRequest({ sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'approved' });
    // The lock has been released; the row is now 'approved' and the gate sees that on re-read.
    await expect(decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'approved',
    })).rejects.toBeInstanceOf(ChangeRequestRefusedError);
    expect((row.update as jest.Mock).mock.calls.length).toBe(1);
  });
});

describe('the roster is a positive lookup across BOTH records', () => {
  it('consults admin_users AND org_members, because interns and Ali live in different tables', async () => {
    // Checking only org_members would have made approval impossible for the one person the
    // ticket names as the approver.
    recorded();
    await resolveRecordedHumans(fakeSequelize(), ALI);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/admin_users/);
    expect(sql).toMatch(/org_members/);
    expect(sql).toMatch(/enrollments/);
  });

  it('returns nothing for an empty email without querying at all', async () => {
    recorded();
    await expect(resolveRecordedHumans(fakeSequelize(), '  ')).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns the ACTING email, not the stored casing, because that is what the gate compares', async () => {
    recorded();
    await expect(resolveRecordedHumans(fakeSequelize(), ' Ali@Colaberry.com ')).resolves
      .toEqual(['Ali@Colaberry.com']);
  });

  it('binds the email rather than interpolating it', async () => {
    recorded();
    await resolveRecordedHumans(fakeSequelize(), "bobby'); drop table --");
    const opts = mockQuery.mock.calls[0][1] as { bind?: unknown[] };
    expect(opts.bind?.[0]).toBe("bobby'); drop table --");
    expect(String(mockQuery.mock.calls[0][0])).not.toContain('bobby');
  });
});

describe('listing', () => {
  it("returns only the caller's own requests", async () => {
    recorded();
    mockFindAll.mockResolvedValue([fakeRow()]);
    const out = await listMyChangeRequests(fakeSequelize(), INTERN);
    expect(out).toHaveLength(1);
    const where = (mockFindAll.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual({ requested_by_identity: INTERN });
  });

  it('refuses to list for an actor it cannot name', async () => {
    unrecorded();
    await expect(listMyChangeRequests(fakeSequelize(), 'ghost@example.com'))
      .rejects.toBeInstanceOf(ActorNotResolvedError);
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});

describe('AF7.1: tool requests ride the same governance spine', () => {
  it('stores `change` when no kind is given, so every AF4.2 caller keeps its meaning', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, domainKey: 'platform-automation', title: 'Something',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'change' }),
      expect.anything(),
    );
  });

  it('stores `tool` when asked for one, with its details', async () => {
    recorded();
    const out = await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tool' }),
      expect.anything(),
    );
    expect(out.kind).toBe('tool');
    expect(out.tool_request?.tool_name).toBe('read_cron_registry');
  });

  it('AF11.1: REFUSES a tool request with no details, which AF7.1 used to accept', async () => {
    // Not a regression. Between AF7.1 and AF11.1 a tool request was a title and a description, and
    // approving one did nothing — "the row is the whole effect". What is being removed is the
    // ability to file a tool request the approver cannot act on.
    recorded();
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
    })).rejects.toBeInstanceOf(ToolRequestRefusedError);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockDetailCreate).not.toHaveBeenCalled();
  });

  it('AF11.1: refuses tool details on a CHANGE request rather than silently dropping them', async () => {
    recorded();
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, domainKey: 'platform-automation',
      title: 'Rename my agent', toolRequest: toolDetail(),
    })).rejects.toBeInstanceOf(ToolRequestRefusedError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('AF11.1: writes the detail in the SAME transaction as the request row', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    const [, opts] = mockDetailCreate.mock.calls[0] as [unknown, { transaction: unknown }];
    const [, reqOpts] = mockCreate.mock.calls[0] as [unknown, { transaction: unknown }];
    expect(opts.transaction).toBe(reqOpts.transaction);
  });

  it('AF11.1: refuses an agent the requester does not own, before writing anything', async () => {
    recorded();
    mockLoadMine.mockResolvedValue([{ domain_key: 'platform-automation', agent_id: 'someone-else' }]);
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    })).rejects.toBeInstanceOf(ToolRequestRefusedError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('AF11.1: refuses a SECOND open request for the same tool on the same agent', async () => {
    // The double-click, and the retry after a response that never arrived. Two identical rows in
    // the queue Ali triages is the defect; CLAUDE.md calls "works once, breaks on the second run"
    // a production defect rather than a rough edge.
    recorded();
    openRequests = [{ id: 'cr-earlier' }];
    await expect(fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    })).rejects.toBeInstanceOf(ToolRequestRefusedError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('AF11.1: the duplicate lookup is scoped to the requester, the agent and the tool', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    const call = (mockQuery.mock.calls as Array<[string, { bind: unknown[] }]>)
      .find(([sql]) => /agent_domain_tool_request_details/.test(sql));
    expect(call).toBeDefined();
    const [sql, opts] = call as [string, { bind: unknown[] }];
    // Only an UNDECIDED request blocks a new one. A declined request must not lock an intern out
    // of ever asking again, which is the failure mode of a naive "already exists" check.
    expect(sql).toContain("r.status = 'submitted'");
    expect(sql).toContain('lower(d.tool_name) = lower($3)');
    expect(opts.bind).toEqual([INTERN, AGENT, 'read_cron_registry']);
  });

  it('AF11.1: a request for a DIFFERENT tool on the same agent is not a duplicate', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Write to the cron registry',
      toolRequest: toolDetail({ tool_name: 'write_cron_entry', writes: true,
        side_effects: 'Adds one cron entry.', reversible: true }),
    });
    expect(mockCreate).toHaveBeenCalled();
  });

  it('A TOOL REQUEST IS NOT A GRANT. Filing one changes no agent and grants nothing', async () => {
    // The whole safety property of routing tools through this spine: the row is a request. The
    // grant is a separate, later, human act. Nothing here touches an agent.
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    const written = JSON.stringify([...mockCreate.mock.calls, ...mockDetailCreate.mock.calls]);
    expect(written).not.toContain('tools_granted');
    expect(written).not.toContain('autonomy');
    expect(written).toContain('"status":"submitted"');
  });

  it('a tool request still refuses the four-hour timer as its decider', async () => {
    recorded();
    const row = fakeRow({ kind: 'tool' });
    mockFindByPk.mockResolvedValue(row);
    await expect(decideChangeRequest({
      sequelize: fakeSequelize(), email: TIMER, id: 'cr-1', decision: 'approved',
    })).rejects.toBeInstanceOf(ChangeRequestRefusedError);
    expect(row.update).not.toHaveBeenCalled();
  });

  it("filters the intern's own list by kind when asked, and does not when not", async () => {
    recorded();
    mockFindAll.mockResolvedValue([]);
    await listMyChangeRequests(fakeSequelize(), INTERN, 'tool');
    expect((mockFindAll.mock.calls[0][0] as { where: Record<string, unknown> }).where)
      .toEqual({ requested_by_identity: INTERN, kind: 'tool' });

    mockFindAll.mockClear();
    await listMyChangeRequests(fakeSequelize(), INTERN);
    expect((mockFindAll.mock.calls[0][0] as { where: Record<string, unknown> }).where)
      .toEqual({ requested_by_identity: INTERN });
  });

  it('projects kind back, defaulting a pre-AF7.1 row with no kind to change', async () => {
    // Rows written before the column existed come back with it undefined, not with a wrong value.
    recorded();
    const row = fakeRow();
    delete (row as Record<string, unknown>).kind;
    mockFindByPk.mockResolvedValue(row);
    const out = await decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'approved',
    });
    expect(out.kind).toBe('change');
  });
});

describe('AF11.2: the duplicate check is computed at submit time and READ back, never recomputed', () => {
  it('stores the check beside the request, with the candidates the real matcher produced', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    expect(mockCheckCreate).toHaveBeenCalledTimes(1);
    const [stored] = mockCheckCreate.mock.calls[0] as [Record<string, unknown>];
    expect(stored.change_request_id).toBe('cr-1');
    expect(stored.catalog_size).toBe(3);
    expect(stored.catalog_absent).toBe(false);
    // `toolDetail()` asks for `read_cron_registry`, which the staged catalog already has, so the
    // real matcher finds it by name. Nothing here stubs the ranking.
    const candidates = stored.candidates as Array<{ tool_name: string }>;
    expect(candidates[0].tool_name).toBe('read_cron_registry');
  });

  it('records a count that agrees with the list, which is what the table CHECK enforces', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    const [stored] = mockCheckCreate.mock.calls[0] as [Record<string, unknown>];
    expect(stored.candidate_count).toBe((stored.candidates as unknown[]).length);
  });

  it('discloses the tools with no behavior text, so a zero is never read as novelty', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    const [stored] = mockCheckCreate.mock.calls[0] as [Record<string, unknown>];
    expect(stored.behaviorless_tools).toEqual(['rankQueue']);
  });

  it('THE ACCEPTANCE CRITERION: reading returns the STORED answer, not a fresh one', async () => {
    // Proved by CONTENT rather than by counting calls. The stored row names a tool that is not in
    // the catalog at all and gives it a score the matcher could never produce, so if the read
    // recomputed anything, this candidate would be gone and the assertion would fail.
    recorded();
    mockFindAll.mockResolvedValue([fakeRow({ id: 'cr-9', kind: 'tool' })]);
    mockCheckFindAll.mockResolvedValue([{
      change_request_id: 'cr-9',
      checked_at: new Date('2026-11-04T12:00:00.000Z'),
      catalog_size: 41,
      catalog_absent: false,
      threshold: '0.2000',
      candidate_count: 1,
      candidates: [{
        tool_name: 'a_tool_that_was_retired_last_week',
        score: 0.99,
        matched_fields: [{ field: 'tool_name', detail: 'as computed on the day', tokens: ['x'], coverage: 1 }],
      }],
      behaviorless_tools: ['rankQueue'],
    }]);
    const [row] = await listMyChangeRequests(fakeSequelize(), INTERN);
    expect(row.duplicate_check?.candidates[0].tool_name).toBe('a_tool_that_was_retired_last_week');
    expect(row.duplicate_check?.candidates[0].score).toBe(0.99);
    // And the catalog the answer was computed against comes back with it, so a later reader can
    // see the answer predates four tools being added.
    expect(row.duplicate_check?.catalog_size).toBe(41);
    expect(mockLoadCatalog).not.toHaveBeenCalled();
  });

  it('parses the NUMERIC threshold back to a number rather than passing on a string', async () => {
    // This driver returns NUMERIC as a string, and `'0.2000' < 0.2` is a comparison nobody wants
    // a console to make.
    recorded();
    mockFindAll.mockResolvedValue([fakeRow({ id: 'cr-9', kind: 'tool' })]);
    mockCheckFindAll.mockResolvedValue([{
      change_request_id: 'cr-9',
      checked_at: new Date('2026-11-04T12:00:00.000Z'),
      catalog_size: 57,
      catalog_absent: false,
      threshold: '0.2000',
      candidate_count: 0,
      candidates: [],
      behaviorless_tools: [],
    }]);
    const [row] = await listMyChangeRequests(fakeSequelize(), INTERN);
    expect(typeof row.duplicate_check?.threshold).toBe('number');
    expect(row.duplicate_check?.threshold).toBe(0.2);
  });

  it('reads NO CHECK as null, which is a different fact from "checked, found nothing"', async () => {
    recorded();
    mockFindAll.mockResolvedValue([fakeRow({ id: 'cr-9', kind: 'tool' })]);
    mockCheckFindAll.mockResolvedValue([]);
    const [row] = await listMyChangeRequests(fakeSequelize(), INTERN);
    expect(row.duplicate_check).toBeNull();
  });

  it('distinguishes "checked, found nothing" from "never checked" on the way out', async () => {
    recorded();
    mockFindAll.mockResolvedValue([fakeRow({ id: 'cr-9', kind: 'tool' })]);
    mockCheckFindAll.mockResolvedValue([{
      change_request_id: 'cr-9',
      checked_at: new Date('2026-11-04T12:00:00.000Z'),
      catalog_size: 57,
      catalog_absent: false,
      threshold: '0.2000',
      candidate_count: 0,
      candidates: [],
      behaviorless_tools: [],
    }]);
    const [row] = await listMyChangeRequests(fakeSequelize(), INTERN);
    expect(row.duplicate_check).not.toBeNull();
    expect(row.duplicate_check?.candidates).toEqual([]);
    expect(row.duplicate_check?.catalog_absent).toBe(false);
  });

  it('runs NO check for a change request, because there is no tool to compare', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN,
      domainKey: 'platform-automation', title: 'Rename my agent',
    });
    expect(mockCheckCreate).not.toHaveBeenCalled();
    expect(mockLoadCatalog).not.toHaveBeenCalled();
  });

  it('A MATCH IS NOT A REFUSAL: a request that duplicates a tool exactly is still filed', async () => {
    // The ticket's own words: "the match is advice to the approver, never a refusal". The default
    // staged catalog makes `toolDetail()` an exact name duplicate, so this is that case.
    recorded();
    const out = await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    expect(out.status).toBe('submitted');
    expect(out.duplicate_check?.candidates[0].tool_name).toBe('read_cron_registry');
  });

  it('A MATCH IS NOT A GRANT: filing one still touches no agent and grants nothing', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    const sql = mockQuery.mock.calls.map((c) => String(c[0])).join(' ; ');
    expect(sql).not.toMatch(/tools_granted/i);
    expect(sql).not.toMatch(/UPDATE\s+ai_agents/i);
  });

  it('files the request anyway when the CATALOG READ throws, and says so in the log', async () => {
    // Advice that fails must not cost the intern their request. No row is written, so a reader
    // sees "no check stored" rather than "checked, found nothing".
    recorded();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockLoadCatalog.mockRejectedValue(new TypeError('catalog is down'));
    const out = await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    expect(out.id).toBe('cr-1');
    expect(out.duplicate_check).toBeNull();
    expect(mockCheckCreate).not.toHaveBeenCalled();
    const line = JSON.parse(
      warn.mock.calls.map((c) => String(c[0])).find((s) => s.includes('tool_duplicate_check_failed')) ?? '{}',
    );
    expect(line.error_class).toBe('TypeError');
    expect(line.outcome).toBe('failure');
    warn.mockRestore();
  });

  it('files the request anyway when STORING the check throws, and says so in the log', async () => {
    recorded();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockCheckCreate.mockRejectedValue(new Error('relation does not exist'));
    const out = await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    // The request survives. That is the trade: the request is what cannot be recreated, and the
    // check can be recomputed and backfilled at any time.
    expect(out.id).toBe('cr-1');
    expect(out.tool_request?.tool_name).toBe('read_cron_registry');
    // And the caller is told what was STORED, so the response and the next page load agree.
    expect(out.duplicate_check).toBeNull();
    const line = JSON.parse(
      warn.mock.calls.map((c) => String(c[0])).find((s) => s.includes('tool_duplicate_check_not_stored')) ?? '{}',
    );
    expect(line.event).toBe('tool_duplicate_check_not_stored');
    expect(line.context.change_request_id).toBe('cr-1');
    warn.mockRestore();
  });

  it('writes the check AFTER the transaction, so a failed write cannot roll back the request', async () => {
    recorded();
    await fileChangeRequest({
      sequelize: fakeSequelize(), email: INTERN, kind: 'tool',
      domainKey: 'platform-automation', title: 'Read the cron registry',
      toolRequest: toolDetail(),
    });
    // The detail row rides the request's transaction; the check deliberately does not.
    const [, detailOpts] = mockDetailCreate.mock.calls[0] as [unknown, { transaction: unknown }];
    expect(detailOpts.transaction).toBeDefined();
    const checkCall = mockCheckCreate.mock.calls[0] as unknown[];
    expect(checkCall.length).toBe(1);
  });

  it('returns the stored check with a DECISION too, read rather than recomputed', async () => {
    // The worst possible moment to change the answer: the approver sees one ranking while deciding
    // and the record keeps a different one.
    mockQuery.mockResolvedValue([{ email: ALI }]);
    mockFindByPk.mockResolvedValue(fakeRow({ kind: 'tool' }));
    mockDetailFindByPk.mockResolvedValue(null);
    mockCheckFindByPk.mockResolvedValue({
      change_request_id: 'cr-1',
      checked_at: new Date('2026-11-04T12:00:00.000Z'),
      catalog_size: 57,
      catalog_absent: false,
      threshold: '0.2000',
      candidate_count: 1,
      candidates: [{
        tool_name: 'the_one_shown_at_submit_time',
        score: 0.5,
        matched_fields: [{ field: 'reads', detail: 'as computed on the day', tokens: ['x'], coverage: 1 }],
      }],
      behaviorless_tools: [],
    });
    const out = await decideChangeRequest({
      sequelize: fakeSequelize(), email: ALI, id: 'cr-1', decision: 'approved',
    });
    expect(out.duplicate_check?.candidates[0].tool_name).toBe('the_one_shown_at_submit_time');
    expect(mockLoadCatalog).not.toHaveBeenCalled();
  });
});
