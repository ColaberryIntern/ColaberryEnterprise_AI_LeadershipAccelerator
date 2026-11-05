/**
 * AF3.5 — the grant route's outcome ladder, and the body it refuses.
 *
 * 400 the body is unusable · 409 the grant may not stand · 500 it was rolled back · 200 granted.
 * Collapsing any two leaves the caller unable to tell what to do next, which is the same reason
 * `agentChangeRequestController` keeps them apart.
 */

const mockGrant = jest.fn();
const mockList = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));
jest.mock('../../services/agentDomain/agentToolGrantService', () => {
  class ToolGrantRefusedError extends Error {
    issues: Array<{ rule: string; detail: string }>;

    constructor(issues: Array<{ rule: string; detail: string }>) {
      super('refused');
      this.name = 'ToolGrantRefusedError';
      this.issues = issues;
    }
  }
  class ToolGrantTouchedMoreThanToolsError extends Error {
    changed: string[];

    constructor(changed: string[]) {
      super('rolled back');
      this.name = 'ToolGrantTouchedMoreThanToolsError';
      this.changed = changed;
    }
  }
  return {
    ToolGrantRefusedError,
    ToolGrantTouchedMoreThanToolsError,
    grantToolToAgent: (...a: unknown[]) => mockGrant(...a),
    listGrantsForAgent: (...a: unknown[]) => mockList(...a),
  };
});

import { handleGrantTool, handleListAgentGrants } from '../agentToolGrantController';
import {
  ToolGrantRefusedError,
  ToolGrantTouchedMoreThanToolsError,
} from '../../services/agentDomain/agentToolGrantService';

const AGENT_ID = '11111111-2222-4333-8444-555555555555';
const ALI = 'ali@colaberry.com';

function res() {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

/**
 * `null` means "no verified admin on the request".
 *
 * Deliberately not `undefined`: a default parameter fires on `undefined`, so an earlier version
 * of this helper quietly substituted Ali back in and the "absent identity" test passed while
 * asserting nothing. The sentinel has to be a value the default does not swallow.
 */
function req(body: unknown, email: string | null = ALI, params: unknown = {}) {
  return { body, params, admin: email === null ? undefined : { email } } as any;
}

const goodBody = {
  agent_id: AGENT_ID,
  tool_name: 'send_email',
  capability_id: 'admissions.CAP.reply',
};

beforeEach(() => { jest.clearAllMocks(); });

describe('400 — the body cannot be read', () => {
  it('REFUSES a body carrying an autonomy level, rather than dropping it', async () => {
    // The whole reason the schema is .strict(). A permissive object would drop this key and
    // answer 200, and a caller reading that 200 would reasonably believe it was accepted.
    const r = res();
    await handleGrantTool(req({ ...goodBody, autonomy_level: 'communicate' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockGrant).not.toHaveBeenCalled();
    const [body] = r.json.mock.calls[0];
    expect(body.code).toBe('invalid_grant_body');
  });

  it.each([
    ['no tool name', { ...goodBody, tool_name: '' }],
    ['no capability', { ...goodBody, capability_id: '' }],
    ['an agent id that is not an id', { ...goodBody, agent_id: 'Maya' }],
    ['an enabled flag', { ...goodBody, enabled: true }],
  ])('refuses %s without reaching the service', async (_label, body) => {
    const r = res();
    await handleGrantTool(req(body), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockGrant).not.toHaveBeenCalled();
  });
});

describe('409 — the grant may not stand', () => {
  it('returns every refusal, not the first', async () => {
    mockGrant.mockRejectedValue(new ToolGrantRefusedError([
      { rule: 'approver_not_configured', detail: 'not an approver' },
      { rule: 'capability_not_confirmed', detail: 'still draft' },
    ]));
    const r = res();
    await handleGrantTool(req(goodBody), r);

    expect(r.status).toHaveBeenCalledWith(409);
    const [body] = r.json.mock.calls[0];
    expect(body.code).toBe('grant_refused');
    expect(body.issues.map((i: { rule: string }) => i.rule))
      .toEqual(['approver_not_configured', 'capability_not_confirmed']);
  });

  it('is 409 and NOT 403, because the caller is authorized to use the route', async () => {
    mockGrant.mockRejectedValue(new ToolGrantRefusedError([
      { rule: 'approver_is_the_proposer', detail: 'you asked for this' },
    ]));
    const r = res();
    await handleGrantTool(req(goodBody), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.status).not.toHaveBeenCalledWith(403);
  });
});

describe('500 — the grant touched more than the tool list', () => {
  it('reports which fields moved, and does not pretend it succeeded', async () => {
    mockGrant.mockRejectedValue(new ToolGrantTouchedMoreThanToolsError(['autonomy_level']));
    const r = res();
    await handleGrantTool(req(goodBody), r);

    expect(r.status).toHaveBeenCalledWith(500);
    const [body] = r.json.mock.calls[0];
    expect(body.code).toBe('grant_touched_more_than_tools');
    expect(body.changed).toEqual(['autonomy_level']);
  });
});

describe('the actor comes from the token and is never invented', () => {
  it('passes the token email through to the service', async () => {
    mockGrant.mockResolvedValue({ agentName: 'Maya', toolName: 'send_email', unchanged: false });
    await handleGrantTool(req(goodBody), res());
    expect(mockGrant.mock.calls[0][1]).toMatchObject({ approvedBy: ALI });
  });

  it('passes an ABSENT identity through as empty, never as "unknown"', async () => {
    // approvalRequestController writes `req.admin?.email || 'unknown'`, and because
    // isNonHumanIdentity('unknown') is false, every row it wrote claims a human decided
    // something nobody did. This controller hands the service nothing to misread.
    mockGrant.mockResolvedValue({ agentName: 'Maya', toolName: 'send_email', unchanged: false });
    await handleGrantTool(req(goodBody, null), res());
    expect(mockGrant.mock.calls[0][1].approvedBy).toBe('');
    expect(mockGrant.mock.calls[0][1].approvedBy).not.toBe('unknown');
  });
});

describe('200 — granted', () => {
  it('returns the grant', async () => {
    mockGrant.mockResolvedValue({
      grantId: 'g1', agentName: 'Maya', toolName: 'send_email', unchanged: false,
    });
    const r = res();
    await handleGrantTool(req(goodBody), r);
    expect(r.status).not.toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].grant).toMatchObject({ toolName: 'send_email' });
  });
});

describe('reading an agent grants', () => {
  it('refuses an agent id that is not an id', async () => {
    const r = res();
    await handleListAgentGrants(req({}, ALI, { agentId: 'Maya' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('projects the audit fields', async () => {
    mockList.mockResolvedValue([{
      id: 'g1', agent_id: AGENT_ID, agent_name: 'Maya', tool_name: 'send_email',
      capability_id: 'c1', approved_by_identity: ALI, approved_at: new Date(0),
    }]);
    const r = res();
    await handleListAgentGrants(req({}, ALI, { agentId: AGENT_ID }), r);
    expect(r.json.mock.calls[0][0].grants[0]).toMatchObject({
      tool_name: 'send_email', approved_by_identity: ALI,
    });
  });
});
