/**
 * AF11.3 controller: the status mapping, and the two things the body is not allowed to carry.
 *
 * Collapsing any two of these leaves the person unable to tell what to do next: "the body is
 * wrong" (400), "that request is gone" (404) and "your decision is not allowed to stand" (409)
 * call for three different actions.
 *
 * **409 rather than 403** is the subtle one and it is pinned below. The route is `requireAdmin`,
 * so a caller who reaches this code is authorized to use the endpoint. 403 would tell them they
 * lack access, which is false and sends them looking for a permissions problem that does not
 * exist.
 */

const mockDecide = jest.fn();
const mockLoad = jest.fn();

class ToolRequestNotFoundError extends Error {}
/**
 * A refused decision, with every reason.
 *
 * THIS IS WHY THE FACTORY BELOW LISTS EVERY ERROR CLASS. A `jest.mock` factory replaces the WHOLE
 * module, so an error class the controller imports and this object omits arrives as `undefined` —
 * and `err instanceof undefined` throws `TypeError: Right-hand side of 'instanceof' is not an
 * object` from inside the error handler, failing tests that have nothing to do with it. That is
 * exactly how the AF4.2 suite broke on AF11.1's first CI run.
 */
class ToolRequestDecisionRefusedError extends Error {
  issues: Array<{ rule: string; detail: string }>;
  constructor(issues: Array<{ rule: string; detail: string }>) {
    super(issues.map((i) => i.detail).join(' '));
    this.issues = issues;
  }
}

jest.mock('../../services/agentDomain/toolRequestDecisionService', () => ({
  decideToolRequest: (...a: unknown[]) => mockDecide(...a),
  loadDecisions: (...a: unknown[]) => mockLoad(...a),
  ToolRequestNotFoundError,
  ToolRequestDecisionRefusedError,
}));
jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));

import type { Request, Response } from 'express';
import {
  handleDecideToolRequest,
  handleListToolRequestDecisions,
} from '../toolRequestDecisionController';

const ID = '11111111-2222-4333-8444-555555555555';

function res() {
  const r: Record<string, unknown> = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

const req = (over: Record<string, unknown> = {}): Request => ({
  params: { id: ID }, body: {}, query: {},
  admin: { email: 'ali@colaberry.com' },
  ...over,
} as unknown as Request);

let logSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

const statusOf = (r: { status: jest.Mock; json: jest.Mock }): number =>
  (r.status.mock.calls[0]?.[0] as number) ?? 200;

const RECORDED = {
  change_request_id: ID,
  verb: 'approve_to_build',
  decided_by_identity: 'ali@colaberry.com',
  decided_at: '2026-11-05T15:00:00.000Z',
  reason: null,
  missing_field: null,
  assigned_tool_name: null,
  request_status: 'approved',
};

describe('deciding', () => {
  it('200 on success, returning what was recorded', async () => {
    mockDecide.mockResolvedValue(RECORDED);
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'approve_to_build' } }), r);
    expect(statusOf(r)).toBe(200);
    expect(r.json.mock.calls[0][0]).toEqual(RECORDED);
  });

  it('passes the verb and its words through to the service', async () => {
    mockDecide.mockResolvedValue({ ...RECORDED, verb: 'send_back', request_status: 'submitted' });
    await handleDecideToolRequest(
      req({ body: { verb: 'send_back', missing_field: 'touches' } }),
      res(),
    );
    expect(mockDecide.mock.calls[0][0]).toMatchObject({
      id: ID,
      email: 'ali@colaberry.com',
      proposed: { verb: 'send_back', missing_field: 'touches' },
    });
  });

  it('400 on an unknown verb, before the service is reached', async () => {
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'grant' } }), r);
    expect(statusOf(r)).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('400 on a denial with no reason', async () => {
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'deny' } }), r);
    expect(statusOf(r)).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('400 on a send-back naming nothing', async () => {
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'send_back' } }), r);
    expect(statusOf(r)).toBe(400);
  });

  it('400 on a send-back naming something that is not a field of the request', async () => {
    const r = res();
    await handleDecideToolRequest(
      req({ body: { verb: 'send_back', missing_field: 'vibes' } }),
      r,
    );
    expect(statusOf(r)).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('400 on an assignment naming no tool', async () => {
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'assign_existing_tool' } }), r);
    expect(statusOf(r)).toBe(400);
  });

  it('REFUSES a body carrying an autonomy level, rather than dropping it', async () => {
    // The governance criterion at the door. A lenient schema would ignore this field and answer
    // 200, which somebody could reasonably read as the autonomy level having been set.
    const r = res();
    await handleDecideToolRequest(
      req({ body: { verb: 'approve_to_build', autonomy_level: 3 } }),
      r,
    );
    expect(statusOf(r)).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('REFUSES a body carrying a tool grant', async () => {
    const r = res();
    await handleDecideToolRequest(
      req({ body: { verb: 'approve_to_build', tools_granted: ['read_feed'] } }),
      r,
    );
    expect(statusOf(r)).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('400 on an id that is not a request id', async () => {
    const r = res();
    await handleDecideToolRequest(
      req({ params: { id: 'not-an-id' }, body: { verb: 'approve_to_build' } }),
      r,
    );
    expect(statusOf(r)).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('404 when there is no such request', async () => {
    mockDecide.mockRejectedValue(new ToolRequestNotFoundError('No change request with that id.'));
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'approve_to_build' } }), r);
    expect(statusOf(r)).toBe(404);
  });

  it('409 — NOT 403 — when the decision itself is refused, with EVERY reason', async () => {
    mockDecide.mockRejectedValue(new ToolRequestDecisionRefusedError([
      { rule: 'decider_not_an_approver', detail: 'Not a configured approver.' },
      { rule: 'proposer_cannot_decide', detail: 'You filed this request.' },
    ]));
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'approve_to_build' } }), r);
    expect(statusOf(r)).toBe(409);
    const body = r.json.mock.calls[0][0] as { issues: Array<{ rule: string }> };
    // One reason per round trip teaches the reader to click again instead of to read.
    expect(body.issues.map((i) => i.rule))
      .toEqual(['decider_not_an_approver', 'proposer_cannot_decide']);
  });

  it('logs the refusal RULES, and classifies by the constructor', async () => {
    mockDecide.mockRejectedValue(new ToolRequestDecisionRefusedError([
      { rule: 'decider_is_non_human', detail: 'A machine identity.' },
    ]));
    await handleDecideToolRequest(req({ body: { verb: 'approve_to_build' } }), res());
    const line = JSON.parse((logSpy.mock.calls.at(-1) as string[])[0]);
    // `name` is inherited from Error.prototype, so a subclass that forgets to set it would log the
    // generic `Error` that CLAUDE.md rules out in a production path.
    expect(line.error_class).toBe('ToolRequestDecisionRefusedError');
    expect(line.context.rules).toEqual(['decider_is_non_human']);
  });

  it('500 on anything unexpected, without leaking the message to the caller', async () => {
    mockDecide.mockRejectedValue(new Error('column "foo" does not exist'));
    const r = res();
    await handleDecideToolRequest(req({ body: { verb: 'approve_to_build' } }), r);
    expect(statusOf(r)).toBe(500);
    expect(JSON.stringify(r.json.mock.calls[0][0])).not.toContain('column');
  });

  it('passes an EMPTY actor through rather than inventing one', async () => {
    // `approvalRequestController` writes `req.admin?.email || 'unknown'`, and because
    // `isNonHumanIdentity('unknown')` is false that row claims a human decided something nobody
    // did. This controller hands the service what the token carried and lets it refuse.
    mockDecide.mockRejectedValue(new ToolRequestDecisionRefusedError([
      { rule: 'decider_not_recorded', detail: 'Nobody we hold a record for.' },
    ]));
    const r = res();
    await handleDecideToolRequest(
      req({ admin: undefined, body: { verb: 'approve_to_build' } }),
      r,
    );
    expect(mockDecide.mock.calls[0][0].email).toBe('');
    expect(statusOf(r)).toBe(409);
  });
});

describe('the decision history', () => {
  it('200 with the decisions, oldest first as the service returns them', async () => {
    mockLoad.mockResolvedValue([RECORDED]);
    const r = res();
    await handleListToolRequestDecisions(req(), r);
    expect(statusOf(r)).toBe(200);
    expect(r.json.mock.calls[0][0]).toEqual({ decisions: [RECORDED] });
  });

  it('200 with an empty list when nothing has been decided', async () => {
    mockLoad.mockResolvedValue([]);
    const r = res();
    await handleListToolRequestDecisions(req(), r);
    expect(statusOf(r)).toBe(200);
    expect(r.json.mock.calls[0][0]).toEqual({ decisions: [] });
  });

  it('400 on an id that is not a request id', async () => {
    const r = res();
    await handleListToolRequestDecisions(req({ params: { id: 'nope' } }), r);
    expect(statusOf(r)).toBe(400);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('500 rather than an empty list when the read itself fails', async () => {
    // An empty history and a failed read are different facts, and rendering one as the other
    // would hide a decision somebody made.
    mockLoad.mockRejectedValue(new Error('connection terminated'));
    const r = res();
    await handleListToolRequestDecisions(req(), r);
    expect(statusOf(r)).toBe(500);
  });
});
