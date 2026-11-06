/**
 * AF11.4 — carrying out a recorded assignment: what it passes to the grant, and in what order.
 *
 * ## Every mock factory restates the WHOLE module it stands for
 *
 * An explicit `jest.mock` factory replaces the entire module, so an export the factory forgets
 * becomes `undefined` — and `instanceof` against an undefined class throws, which fails every
 * test in the file for a reason that has nothing to do with the code under test. The ticket names
 * this trap by name. Each factory below therefore carries its module's error classes as REAL
 * classes, not stubs, because the service and its controller both branch on `instanceof`.
 *
 * ## What is asserted here, and what is asserted elsewhere
 *
 * Here: the facts handed to the grant, the order of the two reads, and the honest reporting of a
 * grant that succeeded while leaving the tool unusable. NOT here: whether the write touches one
 * column — AF3.5's own service owns that and proves it in the production path with a read-back
 * diff, and re-proving it against a mock of that service would prove only that the mock behaves.
 */

const mockRequestFindByPk = jest.fn();
const mockDetailFindByPk = jest.fn();
const mockLoadDecisions = jest.fn();
const mockGrant = jest.fn();
const mockResolve = jest.fn();

/** Call order across the two modules, so "the resolver runs after the grant" is checkable. */
const order: string[] = [];

jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockRequestFindByPk(...a) },
}));

jest.mock('../../../models/AgentDomainToolRequestDetail', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockDetailFindByPk(...a) },
}));

jest.mock('../toolRequestDecisionService', () => {
  class ToolRequestNotFoundError extends Error {
    constructor(id: string) {
      super(`No change request with id ${id}.`);
      this.name = 'ToolRequestNotFoundError';
    }
  }
  return {
    ToolRequestNotFoundError,
    loadDecisions: (...a: unknown[]) => mockLoadDecisions(...a),
  };
});

jest.mock('../agentToolGrantService', () => {
  class ToolGrantRefusedError extends Error {
    readonly issues: Array<{ rule: string; detail: string }>;

    constructor(issues: Array<{ rule: string; detail: string }>) {
      super(issues.map((i) => i.detail).join(' '));
      this.name = 'ToolGrantRefusedError';
      this.issues = issues;
    }
  }
  class ToolGrantTouchedMoreThanToolsError extends Error {
    readonly changed: string[];

    constructor(changed: string[]) {
      super(`changed ${changed.join(', ')}`);
      this.name = 'ToolGrantTouchedMoreThanToolsError';
      this.changed = changed;
    }
  }
  return {
    ToolGrantRefusedError,
    ToolGrantTouchedMoreThanToolsError,
    grantToolToAgent: (...a: unknown[]) => {
      order.push('grant');
      return mockGrant(...a);
    },
    listGrantsForAgent: jest.fn(),
  };
});

jest.mock('../../workforce/agentEffectiveAccessService', () => ({
  resolveEffectiveAccess: (...a: unknown[]) => {
    order.push('resolve');
    return mockResolve(...a);
  },
}));

import { AssignmentRefusedError, assignExistingTool } from '../assignExistingToolService';
import { ToolRequestNotFoundError } from '../toolRequestDecisionService';
import { ToolGrantRefusedError } from '../agentToolGrantService';

const ALI = 'ali@colaberry.com';
const INTERN = 'mihretnetsereab@gmail.com';
const AGENT = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const sequelize = { transaction: jest.fn() } as never;

function grantResult(over: Record<string, unknown> = {}) {
  return {
    grantId: 'g1',
    agentId: AGENT,
    agentName: 'Maya',
    toolName: 'send_email',
    capabilityId: 'marketing.CAP.outreach',
    approvedBy: ALI,
    toolsGranted: ['send_email'],
    changeRequestId: REQUEST,
    unchanged: false,
    ...over,
  };
}

/** A report in which the tool is granted and still not usable — the realistic case. */
function report(over: Record<string, unknown> = {}) {
  return {
    agentId: AGENT,
    agentName: 'Maya',
    autonomyLevel: 'observe',
    abacMode: 'shadow',
    enabledRows: [{ agentName: 'Maya', enabled: false, role: 'main' }],
    tools: [{
      toolName: 'send_email',
      registered: false,
      grantedVia: ['tools_granted'],
      mismatches: ['granted via tools_granted but absent from tools_granted'],
      reads: [],
      produces: [],
      documented: false,
      usable: false,
    }],
    charterNote: '',
    mismatches: [],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  mockRequestFindByPk.mockResolvedValue({
    id: REQUEST, kind: 'tool', requested_by_identity: INTERN, status: 'approved',
  });
  mockDetailFindByPk.mockResolvedValue({
    change_request_id: REQUEST, agent_id: AGENT, capability_id: 'marketing.CAP.outreach',
  });
  mockLoadDecisions.mockResolvedValue([{
    change_request_id: REQUEST,
    verb: 'assign_existing_tool',
    decided_by_identity: ALI,
    decided_at: '2026-11-06T12:00:00.000Z',
    reason: null,
    missing_field: null,
    assigned_tool_name: 'send_email',
    request_status: '',
  }]);
  mockGrant.mockResolvedValue(grantResult());
  mockResolve.mockResolvedValue(report());
});

describe('what it hands to the grant', () => {
  it('passes exactly six facts, every one of them from a record somebody already wrote', async () => {
    await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI });

    expect(mockGrant).toHaveBeenCalledTimes(1);
    const [, args] = mockGrant.mock.calls[0];
    expect(args).toEqual({
      agentId: AGENT,
      toolName: 'send_email',
      capabilityId: 'marketing.CAP.outreach',
      approvedBy: ALI,
      proposedBy: INTERN,
      changeRequestId: REQUEST,
    });
  });

  it('CANNOT pass an autonomy level, an enabled flag or a tool list', async () => {
    // `toEqual` above already pins this, but only as a side effect of listing six keys. Saying
    // it separately means adding a seventh key named `autonomy_level` fails with a sentence
    // about autonomy rather than with a diff somebody has to read twice.
    await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI });
    const [, args] = mockGrant.mock.calls[0];
    for (const forbidden of ['autonomy_level', 'autonomyLevel', 'enabled', 'tools_granted',
      'toolsGranted', 'abac_mode_override', 'riskTier']) {
      expect(Object.keys(args as object)).not.toContain(forbidden);
    }
  });

  it('takes the tool from the DECISION, never from the request the intern filed', async () => {
    // The whole point of the empty request body. The intern asked for `draft_marketing_email`;
    // Ali decided `send_email`. If this ever read the request's own `tool_name`, the console
    // would record one decision and the grant would perform another, with both halves logged
    // and nothing contradicting itself.
    mockDetailFindByPk.mockResolvedValue({
      change_request_id: REQUEST,
      agent_id: AGENT,
      capability_id: 'marketing.CAP.outreach',
      tool_name: 'draft_marketing_email',
    });

    await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI });

    const [, args] = mockGrant.mock.calls[0];
    expect((args as { toolName: string }).toolName).toBe('send_email');
  });

  it('names the approver from the decision, so the ledger names the human who decided', async () => {
    mockLoadDecisions.mockResolvedValue([{
      verb: 'assign_existing_tool',
      decided_by_identity: 'Ali@Colaberry.COM',
      decided_at: '2026-11-06T12:00:00.000Z',
      assigned_tool_name: 'send_email',
      reason: null, missing_field: null, change_request_id: REQUEST, request_status: '',
    }]);

    await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI });

    // The identity as it was RECORDED, not as the caller typed it: the record is the record.
    const [, args] = mockGrant.mock.calls[0];
    expect((args as { approvedBy: string }).approvedBy).toBe('Ali@Colaberry.COM');
  });
});

describe('the order of the two steps', () => {
  it('reads the resolver AFTER the grant, never before', async () => {
    // `resolveEffectiveAccess` opens its own read with no transaction. Called before the grant,
    // or from inside it, it would report the state the grant had just changed — and would do so
    // convincingly, since every field would be real.
    await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI });
    expect(order).toEqual(['grant', 'resolve']);
  });

  it('does not reach the grant at all when the assignment is refused', async () => {
    mockLoadDecisions.mockResolvedValue([]);
    await expect(assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI }))
      .rejects.toBeInstanceOf(AssignmentRefusedError);
    expect(order).toEqual([]);
    expect(mockGrant).not.toHaveBeenCalled();
  });
});

describe('the resolver is reported, never required', () => {
  it('copies the resolver fields verbatim, including usable: false after a real grant', async () => {
    const result = await assignExistingTool({
      sequelize, changeRequestId: REQUEST, calledBy: ALI,
    });

    // THE HONEST OUTCOME, and the one this ticket's scope produces: the grant succeeded and the
    // tool is still not usable, because `usable` also needs the agent enabled and its autonomy
    // level to allow the action — and lifting either is explicitly out of scope. Reporting it is
    // the point. Nothing here re-derives the verdict; a second copy of that rule could disagree
    // with the real one, and confirming a verdict against a duplicate of its own logic is
    // agreement rather than corroboration.
    expect(result.access).toEqual({
      toolName: 'send_email',
      registered: false,
      grantedVia: ['tools_granted'],
      mismatches: ['granted via tools_granted but absent from tools_granted'],
      usable: false,
      agentEnabled: false,
      autonomyLevel: 'observe',
      abacMode: 'shadow',
    });
    expect(result.grant.unchanged).toBe(false);
  });

  it('reports usable: true when the resolver says so, rather than hard-coding either answer', async () => {
    // POSITIVE CONTROL for the assertion above. Without it, "usable: false" would be satisfied
    // just as well by a field that is always false.
    mockResolve.mockResolvedValue(report({
      enabledRows: [{ agentName: 'Reese', enabled: true, role: 'main' }],
      autonomyLevel: 'communicate',
      tools: [{
        toolName: 'send_email', registered: true, grantedVia: ['GRANTS', 'tools_granted'],
        mismatches: [], reads: [], produces: [], documented: true, usable: true,
      }],
    }));

    const result = await assignExistingTool({
      sequelize, changeRequestId: REQUEST, calledBy: ALI,
    });

    expect(result.access?.usable).toBe(true);
    expect(result.access?.agentEnabled).toBe(true);
  });

  it('a failed resolver leaves the grant standing and reports access as absent', async () => {
    // The grant has COMMITTED by this point. Throwing here would answer 500 after a successful
    // write and invite a retry of something that already happened.
    mockResolve.mockRejectedValue(new Error('database is on fire'));

    const result = await assignExistingTool({
      sequelize, changeRequestId: REQUEST, calledBy: ALI,
    });

    expect(result.grant.toolName).toBe('send_email');
    expect(result.access).toBeNull();
  });

  it('an agent the resolver cannot find, or a tool missing from the report, is null not false', async () => {
    // `null` means "not measured". `false` would mean "measured, and not usable". Collapsing
    // them would let an unreadable report read as a negative finding.
    mockResolve.mockResolvedValue(null);
    expect((await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI }))
      .access).toBeNull();

    mockResolve.mockResolvedValue(report({ tools: [] }));
    expect((await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI }))
      .access).toBeNull();
  });
});

describe('running it twice', () => {
  it('passes the grant service own idempotency through, rather than guarding it again', async () => {
    // The unique index on (agent_id, tool_name) is what makes a retry safe, and AF3.5 reports it
    // as `unchanged: true`. A second check here would be a second answer to the same question.
    mockGrant.mockResolvedValue(grantResult({ unchanged: true }));

    const result = await assignExistingTool({
      sequelize, changeRequestId: REQUEST, calledBy: ALI,
    });

    expect(result.grant.unchanged).toBe(true);
    expect(result.changeRequestId).toBe(REQUEST);
  });

  it('reports the request id the LEDGER holds, not the one that was asked for', async () => {
    // A tool granted earlier for a capability promotion keeps the provenance it was written
    // with — null — and this call reports that rather than claiming it answered the request.
    mockGrant.mockResolvedValue(grantResult({ unchanged: true, changeRequestId: null }));

    const result = await assignExistingTool({
      sequelize, changeRequestId: REQUEST, calledBy: ALI,
    });

    expect(result.grant.changeRequestId).toBeNull();
  });
});

describe('refusals', () => {
  it('throws ToolRequestNotFoundError for a request that does not exist', async () => {
    mockRequestFindByPk.mockResolvedValue(null);
    await expect(assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI }))
      .rejects.toBeInstanceOf(ToolRequestNotFoundError);
  });

  it('throws AssignmentRefusedError carrying every rule', async () => {
    mockRequestFindByPk.mockResolvedValue({
      id: REQUEST, kind: 'change', requested_by_identity: INTERN, status: 'submitted',
    });
    mockDetailFindByPk.mockResolvedValue(null);
    mockLoadDecisions.mockResolvedValue([]);

    const err = await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI })
      .catch((e) => e);

    expect(err).toBeInstanceOf(AssignmentRefusedError);
    expect((err as AssignmentRefusedError).issues.map((i) => i.rule).sort()).toEqual([
      'no_assignment_decision', 'not_a_tool_request', 'request_details_missing',
    ]);
  });

  it('refuses a caller who did not make the decision, before anything is written', async () => {
    const err = await assignExistingTool({
      sequelize, changeRequestId: REQUEST, calledBy: 'ram@colaberry.com',
    }).catch((e) => e);

    expect((err as AssignmentRefusedError).issues.map((i) => i.rule))
      .toEqual(['caller_is_not_the_decider']);
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it("lets the GRANT's own refusal through in the grant's own vocabulary", async () => {
    // "That capability is not confirmed" is the sentence the person needs, and it belongs to
    // AF3.5. Catching it here and restating it would be a second idea of what a grant requires.
    mockGrant.mockRejectedValue(new ToolGrantRefusedError([
      { rule: 'capability_not_confirmed', detail: 'Capability x is draft, not confirmed.' },
    ]));

    const err = await assignExistingTool({
      sequelize, changeRequestId: REQUEST, calledBy: ALI,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ToolGrantRefusedError);
    expect((err as ToolGrantRefusedError).issues[0].rule).toBe('capability_not_confirmed');
    // And the resolver was never consulted: there is nothing to measure.
    expect(order).toEqual(['grant']);
  });

  it('a detail row with a blank agent id is refused rather than passed to the grant', async () => {
    mockDetailFindByPk.mockResolvedValue({
      change_request_id: REQUEST, agent_id: '', capability_id: 'c1',
    });

    const err = await assignExistingTool({ sequelize, changeRequestId: REQUEST, calledBy: ALI })
      .catch((e) => e);

    expect((err as AssignmentRefusedError).issues.map((i) => i.rule))
      .toEqual(['request_names_no_agent']);
  });
});
