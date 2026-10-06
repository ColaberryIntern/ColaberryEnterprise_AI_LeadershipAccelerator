import type { Request, Response, NextFunction } from 'express';

const createFreeAccount = jest.fn();
jest.mock('../../services/freeSignupService', () => ({
  createFreeAccount: (...a: unknown[]) => createFreeAccount(...a),
}));

import { handleFreeSignup } from '../participantController';

/**
 * Phase 2 T204 — `POST /api/portal/free-signup` at the ROUTE level.
 *
 * WHY A SECOND SUITE. `freeSignupAcquisition.test.ts` proves the schema accepts and
 * rejects the right bodies. That is not the same claim as "the endpoint answers 400",
 * which needs the handler: a schema can be correct and still be wired up so that a
 * rejection becomes a 500, or a thrown error, or a silent success. The verifier for
 * this task named that gap specifically, and it is a real one — this route is
 * unauthenticated, so its status codes are part of its contract.
 *
 * It also pins the thing the schema alone cannot: that the handler passes
 * `programme: 'learner'` and NOT whatever the caller asked for.
 */
const run = async (body: unknown) => {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  const next = jest.fn();
  const res = { status, json } as unknown as Response;
  await handleFreeSignup({ body } as Request, res, next as unknown as NextFunction);
  return { status, json, next };
};

const ok = () => createFreeAccount.mockResolvedValue({
  jwt: 'jwt',
  enrollment: { id: 'e1', full_name: 'Maya', email: 'maya@example.com', tier: 'guest' },
  created: true,
  disposition: 'created',
});

describe('T204 — the route returns 400, not 500, for every rejected body', () => {
  beforeEach(() => { jest.clearAllMocks(); ok(); });

  it.each([
    ['an empty body', {}, 'full_name and email are required'],
    ['a missing email', { full_name: 'Maya' }, 'full_name and email are required'],
    ['a falsy numeric name', { full_name: 0, email: 'a@b.co' }, 'full_name and email are required'],
    ['a malformed email', { full_name: 'Maya', email: 'nope' }, 'A valid email is required'],
    ['a non-URL page_url', { full_name: 'Maya', email: 'a@b.co', page_url: 'not a url' }, 'page_url must be a URL'],
    ['a javascript: page_url', { full_name: 'Maya', email: 'a@b.co', page_url: 'javascript:alert(1)' }, 'page_url must be a URL'],
  ])('400s on %s with the right message', async (_label, body, message) => {
    const { status, json, next } = await run(body);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: message });
    expect(next).not.toHaveBeenCalled();
    expect(createFreeAccount).not.toHaveBeenCalled();
  });

  it.each([
    ['an over-long full_name', { full_name: 'x'.repeat(256), email: 'a@b.co' }],
    ['an over-long email', { full_name: 'Maya', email: `${'x'.repeat(320)}@b.co` }],
    ['an over-long source', { full_name: 'Maya', email: 'a@b.co', source: 'x'.repeat(51) }],
    ['an over-long page_url', { full_name: 'Maya', email: 'a@b.co', page_url: `https://x.io/${'a'.repeat(500)}` }],
    ['a non-UUID source_id', { full_name: 'Maya', email: 'a@b.co', source_id: 42 }],
    ['an unexpected key', { full_name: 'Maya', email: 'a@b.co', nope: 1 }],
    ['a referrer, which has no column', { full_name: 'Maya', email: 'a@b.co', referrer: 'https://x.io' }],
    ['a non-string, non-number name', { full_name: {}, email: 'a@b.co' }],
    ['a missing body entirely', undefined],
  ])('400s on %s without reaching the service', async (_label, body) => {
    const { status, next } = await run(body);
    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    expect(createFreeAccount).not.toHaveBeenCalled();
  });

  /**
   * The programme is a SERVER-side decision. `.strict()` rejecting the key is what
   * makes it one — without it a caller could post `programme: 'standard'` to the
   * learner endpoint and create a free account the growth engine never sees, which
   * is the exact defect this phase exists to close.
   */
  it('400s rather than letting a caller choose its own programme', async () => {
    const { status } = await run({ full_name: 'Maya', email: 'a@b.co', programme: 'standard' });
    expect(status).toHaveBeenCalledWith(400);
    expect(createFreeAccount).not.toHaveBeenCalled();
  });
});

describe('T204 — the route on the accepting path', () => {
  beforeEach(() => { jest.clearAllMocks(); ok(); });

  it('passes programme: learner and the acquisition fields through, and 201s on a new account', async () => {
    const { status } = await run({
      full_name: '  Maya  ',
      email: 'maya@example.com',
      source: 'cpn_landing',
      source_id: '11111111-1111-4111-8111-111111111111',
      page_url: 'https://cpn.example.com/ai',
    });

    expect(status).toHaveBeenCalledWith(201);
    const arg = createFreeAccount.mock.calls[0][0];
    expect(arg.programme).toBe('learner');
    expect(arg.full_name).toBe('Maya');
    expect(arg.acquisition).toEqual({
      source: 'cpn_landing',
      source_id: '11111111-1111-4111-8111-111111111111',
      page_url: 'https://cpn.example.com/ai',
    });
    // `full_name`/`email` belong to the identity, not the acquisition record.
    expect(arg.acquisition.email).toBeUndefined();
  });

  it('200s when the account already existed, so "created" is not implied by a 2xx', async () => {
    createFreeAccount.mockResolvedValue({
      jwt: 'jwt',
      enrollment: { id: 'e1', full_name: 'Maya', email: 'maya@example.com', tier: 'guest' },
      created: false,
      disposition: 'reused',
    });

    const { status } = await run({ full_name: 'Maya', email: 'maya@example.com' });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('hands a service failure to next(), rather than reporting a signup that did not happen', async () => {
    createFreeAccount.mockRejectedValue(new Error('db down'));
    const { next, status } = await run({ full_name: 'Maya', email: 'maya@example.com' });
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalledWith(201);
  });
});
