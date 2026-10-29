/**
 * AF4.2 controller: the status mapping, which is the part an intern actually experiences.
 *
 * Collapsing any two of these leaves them unable to tell what to do next: "I typed something
 * wrong" (400), "we do not know who you are" / "that is not your domain" (403), "that request is
 * gone" (404) and "your decision is not allowed to stand" (409) call for four different actions.
 *
 * 409 rather than 403 for a refused decision is the subtle one and it is pinned below: the caller
 * is a legitimately authorized admin whose particular decision is refused. 403 would tell them
 * they lack access, which is false and unactionable.
 */

const mockFile = jest.fn();
const mockDecide = jest.fn();
const mockListMine = jest.fn();
const mockListAll = jest.fn();

class ActorNotResolvedError extends Error {}
class DomainNotYoursError extends Error {}
class ChangeRequestNotFoundError extends Error {}
class ChangeRequestRefusedError extends Error {
  issues: Array<{ rule: string; detail: string }>;
  constructor(issues: Array<{ rule: string; detail: string }>) {
    super(issues.map((i) => i.detail).join(' '));
    this.issues = issues;
  }
}

jest.mock('../../services/agentDomain/agentChangeRequestService', () => ({
  fileChangeRequest: (...a: unknown[]) => mockFile(...a),
  decideChangeRequest: (...a: unknown[]) => mockDecide(...a),
  listMyChangeRequests: (...a: unknown[]) => mockListMine(...a),
  listAllChangeRequests: (...a: unknown[]) => mockListAll(...a),
  ActorNotResolvedError,
  DomainNotYoursError,
  ChangeRequestNotFoundError,
  ChangeRequestRefusedError,
}));
jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));

import type { Request, Response } from 'express';
import {
  handleDecideChangeRequest,
  handleFileChangeRequest,
  handleListAllChangeRequests,
} from '../agentChangeRequestController';

const ID = '11111111-2222-4333-8444-555555555555';

function res() {
  const r: Record<string, unknown> = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

const req = (over: Record<string, unknown> = {}): Request => ({
  params: {}, body: {}, query: {},
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

describe('filing', () => {
  it('201 on success', async () => {
    mockFile.mockResolvedValue({ id: 'cr-1', status: 'submitted' });
    const r = res();
    await handleFileChangeRequest(req({ body: { domain_key: 'd', title: 'Rename my agent' } }), r);
    expect(statusOf(r)).toBe(201);
  });

  it('400 on an unusable body, with the issues', async () => {
    const r = res();
    await handleFileChangeRequest(req({ body: { title: '' } }), r);
    expect(statusOf(r)).toBe(400);
    expect(r.json.mock.calls[0][0]).toHaveProperty('issues');
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('400 on an unknown field rather than dropping it', async () => {
    const r = res();
    await handleFileChangeRequest(req({ body: { domain_key: 'd', title: 'x y', descripton: 'typo' } }), r);
    expect(statusOf(r)).toBe(400);
  });

  it('403 when the domain is not theirs', async () => {
    mockFile.mockRejectedValue(new DomainNotYoursError('That domain is not one of yours.'));
    const r = res();
    await handleFileChangeRequest(req({ body: { domain_key: 'd', title: 'Rename my agent' } }), r);
    expect(statusOf(r)).toBe(403);
  });

  it('403 when the actor cannot be named — and never invents one', async () => {
    mockFile.mockRejectedValue(new ActorNotResolvedError('nope'));
    const r = res();
    await handleFileChangeRequest(req({ admin: undefined, body: { domain_key: 'd', title: 'Rename my agent' } }), r);
    expect(statusOf(r)).toBe(403);
    // The actor reaches the service as empty, which refuses. It is never defaulted to 'unknown'.
    expect(String(mockFile.mock.calls[0][0].email)).toBe('');
  });
});

describe('deciding', () => {
  it('200 on success', async () => {
    mockDecide.mockResolvedValue({ id: 'cr-1', status: 'approved' });
    const r = res();
    await handleDecideChangeRequest(req({ params: { id: ID }, body: { decision: 'approved' } }), r);
    expect(statusOf(r)).toBe(200);
  });

  it('400 on a malformed id, before the service is called', async () => {
    const r = res();
    await handleDecideChangeRequest(req({ params: { id: 'not-a-uuid' }, body: { decision: 'approved' } }), r);
    expect(statusOf(r)).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('400 on a decline with no reason', async () => {
    const r = res();
    await handleDecideChangeRequest(req({ params: { id: ID }, body: { decision: 'declined' } }), r);
    expect(statusOf(r)).toBe(400);
  });

  it('404 when the request does not exist', async () => {
    mockDecide.mockRejectedValue(new ChangeRequestNotFoundError('gone'));
    const r = res();
    await handleDecideChangeRequest(req({ params: { id: ID }, body: { decision: 'approved' } }), r);
    expect(statusOf(r)).toBe(404);
  });

  it('409 — NOT 403 — when the decision itself is refused, and names the rules', async () => {
    mockDecide.mockRejectedValue(new ChangeRequestRefusedError([
      { rule: 'approver_is_not_human', detail: 'A change request can only be decided by a person.' },
    ]));
    const r = res();
    await handleDecideChangeRequest(req({ params: { id: ID }, body: { decision: 'approved' } }), r);
    expect(statusOf(r)).toBe(409);
    const payload = r.json.mock.calls[0][0] as { error: string; issues: Array<{ rule: string }> };
    // The server's own sentence, rendered verbatim by the portal.
    expect(payload.error).toContain('only be decided by a person');
    expect(payload.issues[0].rule).toBe('approver_is_not_human');
  });

  it('500 on an unexpected failure, without leaking the message', async () => {
    mockDecide.mockRejectedValue(new Error('connection terminated unexpectedly: host=10.0.0.4'));
    const r = res();
    await handleDecideChangeRequest(req({ params: { id: ID }, body: { decision: 'approved' } }), r);
    expect(statusOf(r)).toBe(500);
    expect(JSON.stringify(r.json.mock.calls[0][0])).not.toContain('10.0.0.4');
  });
});

describe('logging', () => {
  it('writes one structured line per attempt, naming the actor and never the body', async () => {
    mockDecide.mockResolvedValue({ id: 'cr-1', status: 'approved' });
    await handleDecideChangeRequest(req({ params: { id: ID }, body: { decision: 'approved' } }), res());
    const line = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(line.event).toBe('agent_change_request');
    expect(line.actor_email).toBe('ali@colaberry.com');
    expect(line.outcome).toBe('success');
    expect(typeof line.duration_ms).toBe('number');
  });

  it('classifies a refusal rather than logging a generic Error', async () => {
    mockDecide.mockRejectedValue(new ChangeRequestRefusedError([{ rule: 'self_approved', detail: 'no' }]));
    await handleDecideChangeRequest(req({ params: { id: ID }, body: { decision: 'approved' } }), res());
    const line = JSON.parse(String(logSpy.mock.calls[0][0]));
    // CLAUDE.md forbids a bare 'Error' classification in a production path.
    expect(line.error_class).not.toBe('Error');
    expect(line.context.rules).toEqual(['self_approved']);
  });
});

describe('the queue read', () => {
  it('400s an unknown status filter instead of silently ignoring it', async () => {
    const r = res();
    await handleListAllChangeRequests(req({ query: { status: 'approvedish' } }), r);
    expect(statusOf(r)).toBe(400);
    expect(mockListAll).not.toHaveBeenCalled();
  });

  it('passes a valid filter through', async () => {
    mockListAll.mockResolvedValue([]);
    const r = res();
    await handleListAllChangeRequests(req({ query: { status: 'submitted' } }), r);
    expect(statusOf(r)).toBe(200);
    expect(mockListAll.mock.calls[0][1]).toBe('submitted');
  });
});
