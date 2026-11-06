/**
 * AF11.4 — the assignment route's outcome ladder, and the body it refuses.
 *
 * 400 the id or the body is unusable · 404 no such request · 409 twice, told apart by `code` ·
 * 500 the grant was rolled back · 200 granted. Collapsing any two leaves the caller unable to
 * tell what to do next, which is the reason AF3.5's and AF11.3's controllers keep them apart.
 *
 * ## The two 409s are the interesting part
 *
 * `assignment_refused` means there is nothing here to carry out — nobody decided, or the caller
 * is not the person who did. `grant_refused` means the decision stands and the grant it asks for
 * does not: an unconfirmed capability, a tool nothing implements. They are answered on different
 * screens, so a console that showed one sentence for both would send Ali to the wrong one.
 *
 * Every mock factory restates its whole module, error classes included, because both this
 * controller and the service branch on `instanceof` — and an export a factory forgets becomes
 * `undefined`, which makes `instanceof` throw and fails the file for an unrelated reason.
 */

const mockAssign = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));

/**
 * ONE mock, because the controller has one dependency.
 *
 * All four error classes arrive from the AF11.4 service, including the two it re-exports from
 * the decision and grant services — see that file's note on why. So this factory has to carry
 * all four as REAL classes: the controller branches on `instanceof`, and a class the factory
 * forgot would be `undefined`, which makes `instanceof` throw and fails every test here for a
 * reason that has nothing to do with the controller.
 */
jest.mock('../../services/agentDomain/assignExistingToolService', () => {
  class AssignmentRefusedError extends Error {
    issues: Array<{ rule: string; detail: string }>;

    constructor(issues: Array<{ rule: string; detail: string }>) {
      super('refused');
      this.name = 'AssignmentRefusedError';
      this.issues = issues;
    }
  }
  class ToolRequestNotFoundError extends Error {
    constructor(id: string) {
      super(`No change request with id ${id}.`);
      this.name = 'ToolRequestNotFoundError';
    }
  }
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
    AssignmentRefusedError,
    ToolRequestNotFoundError,
    ToolGrantRefusedError,
    ToolGrantTouchedMoreThanToolsError,
    assignExistingTool: (...a: unknown[]) => mockAssign(...a),
  };
});

import { handleAssignExistingTool } from '../assignExistingToolController';
import {
  AssignmentRefusedError,
  ToolGrantRefusedError,
  ToolGrantTouchedMoreThanToolsError,
  ToolRequestNotFoundError,
} from '../../services/agentDomain/assignExistingToolService';

const REQUEST = '22222222-2222-4222-8222-222222222222';
const ALI = 'ali@colaberry.com';

function res() {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

/** `null` means "no verified admin on the request", and is not `undefined` so no default fires. */
function req(body: unknown = {}, email: string | null = ALI, params: unknown = { id: REQUEST }) {
  return { body, params, admin: email === null ? undefined : { email } } as any;
}

const granted = {
  changeRequestId: REQUEST,
  grant: {
    grantId: 'g1', agentId: 'a1', agentName: 'Maya', toolName: 'send_email',
    capabilityId: 'c1', approvedBy: ALI, toolsGranted: ['send_email'],
    changeRequestId: REQUEST, unchanged: false,
  },
  access: {
    toolName: 'send_email', registered: false, grantedVia: ['tools_granted'], mismatches: [],
    usable: false, agentEnabled: false, autonomyLevel: 'observe', abacMode: 'shadow',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAssign.mockResolvedValue(granted);
});

describe('200 — granted', () => {
  it('passes the id from the route and the actor from the token, and nothing else', async () => {
    const r = res();
    await handleAssignExistingTool(req(), r);

    expect(mockAssign).toHaveBeenCalledTimes(1);
    expect(mockAssign.mock.calls[0][0]).toEqual({
      sequelize: { fake: true },
      changeRequestId: REQUEST,
      calledBy: ALI,
    });
    expect(r.status).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0]).toEqual(granted);
  });

  it('returns the resolver verdict with the grant, so the console can say it is not usable yet', async () => {
    const r = res();
    await handleAssignExistingTool(req(), r);
    expect(r.json.mock.calls[0][0].access.usable).toBe(false);
  });

  it('a missing body is treated as an empty one, not as a refusal', async () => {
    // A POST with no body at all is the natural shape of this call, and `req.body` is undefined
    // when no JSON parser has run. Refusing that would make the ordinary case the error case.
    const r = res();
    await handleAssignExistingTool(req(undefined), r);
    expect(r.status).not.toHaveBeenCalled();
  });

  it('passes an UNRESOLVED identity through empty rather than inventing one', async () => {
    // No `|| 'unknown'`. `approvalRequestController` has one, and because
    // `isNonHumanIdentity('unknown')` is false, every row it writes claims a human decided
    // something nobody did. The service refuses an empty identity by name.
    const r = res();
    await handleAssignExistingTool(req({}, null), r);
    expect(mockAssign.mock.calls[0][0].calledBy).toBe('');
  });
});

describe('400 — the request cannot be read', () => {
  it('refuses an id that is not an id, before any service call', async () => {
    const r = res();
    await handleAssignExistingTool(req({}, ALI, { id: 'Maya' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].code).toBe('invalid_request_id');
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it.each([
    ['a different tool', { tool_name: 'send_email' }],
    ['an autonomy level', { autonomy_level: 'communicate' }],
    ['an enabled flag', { enabled: true }],
    ['an agent id', { agent_id: 'a1' }],
  ])('refuses a body carrying %s, by name, rather than ignoring it', async (_label, body) => {
    // THE ONE THAT MATTERS. A permissive object would DROP these and answer 200, and a caller
    // reading that 200 would reasonably conclude the field had been accepted. The tool, the
    // agent and the capability all come from records that already exist.
    const r = res();
    await handleAssignExistingTool(req(body), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].code).toBe('unexpected_fields');
    expect(r.json.mock.calls[0][0].issues.length).toBeGreaterThan(0);
    expect(mockAssign).not.toHaveBeenCalled();
  });
});

describe('404 — no such request', () => {
  it('answers 404, not 409', async () => {
    mockAssign.mockRejectedValue(new ToolRequestNotFoundError(REQUEST));
    const r = res();
    await handleAssignExistingTool(req(), r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json.mock.calls[0][0].code).toBe('request_not_found');
  });
});

describe('409 — twice, and told apart', () => {
  it('assignment_refused carries every rule', async () => {
    mockAssign.mockRejectedValue(new AssignmentRefusedError([
      { rule: 'no_assignment_decision', detail: 'Nobody has decided.' },
      { rule: 'caller_is_not_the_decider', detail: 'You did not decide this.' },
    ]));
    const r = res();
    await handleAssignExistingTool(req(), r);

    expect(r.status).toHaveBeenCalledWith(409);
    const body = r.json.mock.calls[0][0];
    expect(body.code).toBe('assignment_refused');
    expect(body.issues.map((i: { rule: string }) => i.rule))
      .toEqual(['no_assignment_decision', 'caller_is_not_the_decider']);
  });

  it('grant_refused says the decision stands and the grant does not', async () => {
    mockAssign.mockRejectedValue(new ToolGrantRefusedError([
      { rule: 'capability_not_confirmed', detail: 'Capability x is draft, not confirmed.' },
    ]));
    const r = res();
    await handleAssignExistingTool(req(), r);

    expect(r.status).toHaveBeenCalledWith(409);
    const body = r.json.mock.calls[0][0];
    expect(body.code).toBe('grant_refused');
    expect(body.error).toContain('decision stands');
    expect(body.issues[0].rule).toBe('capability_not_confirmed');
  });

  it('the two codes are different strings, which is the whole point of having two', async () => {
    // REAL rule codes, not placeholders. Both classes type `rule` as a union of their own
    // refusal literals, so `'x'` does not compile — the frozen-baseline typecheck gate caught
    // exactly that here, which is the gate earning its keep: a test that cannot compile is a
    // test that was never going to run, and jest would not have told me, because ts-jest
    // transpiles with `isolatedModules` and never typechecks.
    mockAssign.mockRejectedValue(
      new AssignmentRefusedError([{ rule: 'no_assignment_decision', detail: 'Nobody decided.' }]),
    );
    const a = res();
    await handleAssignExistingTool(req(), a);

    mockAssign.mockRejectedValue(
      new ToolGrantRefusedError([{ rule: 'capability_not_confirmed', detail: 'Still draft.' }]),
    );
    const b = res();
    await handleAssignExistingTool(req(), b);

    expect(a.json.mock.calls[0][0].code).not.toBe(b.json.mock.calls[0][0].code);
  });

  it('neither is a 403 — the caller IS authorized to use the endpoint', async () => {
    // A 403 would send Ali looking for a permissions problem that does not exist.
    mockAssign.mockRejectedValue(new AssignmentRefusedError([
      { rule: 'caller_is_not_the_decider', detail: 'You did not make this decision.' },
    ]));
    const r = res();
    await handleAssignExistingTool(req(), r);
    expect(r.status).not.toHaveBeenCalledWith(403);
  });
});

describe('500 — the grant was rolled back', () => {
  it('names the columns that moved, loudly, because it means an edit widened a grant', async () => {
    mockAssign.mockRejectedValue(new ToolGrantTouchedMoreThanToolsError(['autonomy_level']));
    const r = res();
    await handleAssignExistingTool(req(), r);

    expect(r.status).toHaveBeenCalledWith(500);
    const body = r.json.mock.calls[0][0];
    expect(body.code).toBe('grant_touched_more_than_tools');
    expect(body.changed).toEqual(['autonomy_level']);
  });

  it('an unrecognised failure is a plain 500 with no internals in it', async () => {
    mockAssign.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const r = res();
    await handleAssignExistingTool(req(), r);

    expect(r.status).toHaveBeenCalledWith(500);
    const body = r.json.mock.calls[0][0];
    expect(body.code).toBe('assign_failed');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});
