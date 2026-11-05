/**
 * Per-client service auth.
 *
 * The property under test is not "a good token works" — the shared-token version did that. It
 * is that a token belonging to one client CANNOT open a route scoped to another, because that
 * is the entire reason this file stopped being a single shared secret. Every assertion below
 * exists for a way the scoping could be silently undone.
 *
 * `env` is mocked rather than read, so these run with no environment and no secrets anywhere
 * near them. The two fixture values are deliberately the same LENGTH as each other and as a
 * real `openssl rand -hex 32` token, so nothing passes by accident on a length difference.
 */
const ENTERPRISE = 'e'.repeat(64);
const CORA = 'c'.repeat(64);

const mockEnv: { enterpriseCrmToken: string; coraServiceToken: string } = {
  enterpriseCrmToken: ENTERPRISE,
  coraServiceToken: CORA,
};

jest.mock('../../config/env', () => ({ env: mockEnv }));

import { Request, Response, NextFunction } from 'express';
import { duplicateClientTokens, requireServiceClient, type ServiceClient } from '../serviceAuthMiddleware';

/** Captures what the guard did without pulling in Express. */
function call(clients: ServiceClient[], authorization?: string) {
  const req = { headers: authorization ? { authorization } : {}, ip: '127.0.0.1' } as unknown as Request;
  const res = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  (res.json as jest.Mock).mockReturnValue(res);
  const next = jest.fn() as unknown as NextFunction;
  requireServiceClient(...clients)(req, res, next);
  return {
    passed: (next as jest.Mock).mock.calls.length === 1,
    status: (res.status as jest.Mock).mock.calls[0]?.[0],
    body: (res.json as jest.Mock).mock.calls[0]?.[0],
  };
}

beforeEach(() => {
  mockEnv.enterpriseCrmToken = ENTERPRISE;
  mockEnv.coraServiceToken = CORA;
});

describe('a client token opens only the routes its client is listed on', () => {
  it('lets the right client through', () => {
    expect(call(['cora'], `Bearer ${CORA}`).passed).toBe(true);
    expect(call(['enterprise_crm'], `Bearer ${ENTERPRISE}`).passed).toBe(true);
  });

  it('REFUSES the enterprise credential on a cora-only route', () => {
    // The reason this change exists. That credential opens three writes, one of which asks
    // Synthflow to dial a person; it must not also read the call queue just because it is valid
    // somewhere else in the same router.
    const r = call(['cora'], `Bearer ${ENTERPRISE}`);
    expect(r.passed).toBe(false);
    expect(r.status).toBe(401);
  });

  it("REFUSES cora's token on an enterprise-only route, so scoping cuts both ways", () => {
    const r = call(['enterprise_crm'], `Bearer ${CORA}`);
    expect(r.passed).toBe(false);
    expect(r.status).toBe(401);
  });

  it('accepts either when a route genuinely lists both', () => {
    expect(call(['enterprise_crm', 'cora'], `Bearer ${CORA}`).passed).toBe(true);
    expect(call(['enterprise_crm', 'cora'], `Bearer ${ENTERPRISE}`).passed).toBe(true);
  });

  it('tells a refused caller nothing about WHY it was refused', () => {
    // An unknown token and a token that is valid for a different route must be indistinguishable,
    // or the 401 body becomes an oracle for "this secret is live somewhere on this host".
    const unknown = call(['cora'], 'Bearer ' + 'x'.repeat(64));
    const wrongRoute = call(['cora'], `Bearer ${ENTERPRISE}`);
    expect(wrongRoute.body).toEqual(unknown.body);
    expect(wrongRoute.status).toBe(unknown.status);
  });

  it('never names the accepted clients in a 401 body', () => {
    // COMPARING THE TWO BODIES ABOVE IS NOT ENOUGH, and a mutation proved it: adding
    // `allowed: clients` to the refusal leaks the route's auth policy to an unauthenticated
    // caller, and both bodies leak it IDENTICALLY, so the equality assertion stays green. The
    // policy belongs in the server log, which this middleware does write, and nowhere else.
    // Both clients are listed so a leak would name TWO, and every header below is invalid for
    // both of them — presenting a token the route accepts would authenticate and there would be
    // no refusal body to inspect at all.
    for (const header of [undefined, 'Basic x', 'Bearer nope', 'Bearer ' + 'x'.repeat(64)]) {
      const { body } = call(['cora', 'enterprise_crm'], header);
      expect(Object.keys(body)).toEqual(['error']);
      expect(JSON.stringify(body)).not.toContain('cora');
      expect(JSON.stringify(body)).not.toContain('enterprise_crm');
    }
    // Control: the client names really are in scope here, so the assertions above are not
    // passing because those strings exist nowhere in this test.
    expect(call(['cora'], `Bearer ${CORA}`).passed).toBe(true);
  });
});

describe('it fails closed', () => {
  it('401s with no Authorization header', () => {
    const r = call(['cora']);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Service token required' });
  });

  it('401s on a non-Bearer scheme', () => {
    expect(call(['cora'], 'Basic dXNlcjpwYXNz').status).toBe(401);
  });

  it('401s when the route-scoped client has NO token provisioned', () => {
    // The state this route ships in. An unset token must never authenticate, and above all an
    // empty presented token must not match an empty configured one.
    mockEnv.coraServiceToken = '';
    expect(call(['cora'], `Bearer ${CORA}`).passed).toBe(false);
    expect(call(['cora'], 'Bearer ').passed).toBe(false);
    expect(call(['cora'], 'Bearer ').status).toBe(401);
  });

  it('401s on an empty bearer even when the token IS configured', () => {
    expect(call(['cora'], 'Bearer ').passed).toBe(false);
  });

  it('does not let one unset client open a route that lists two', () => {
    // A route listing [enterprise_crm, cora] with cora unprovisioned must still refuse an empty
    // token rather than matching the unset entry.
    mockEnv.coraServiceToken = '';
    expect(call(['enterprise_crm', 'cora'], 'Bearer ').passed).toBe(false);
    expect(call(['enterprise_crm', 'cora'], `Bearer ${ENTERPRISE}`).passed).toBe(true);
  });

  it('refuses to build a guard that accepts nobody', () => {
    // This throws at import time, where it is one line to find, rather than presenting as every
    // correct token getting a 401 in production.
    expect(() => requireServiceClient()).toThrow(/at least one/i);
  });
});

describe('duplicateClientTokens', () => {
  it('finds two clients pasted with the same value', () => {
    // The one paste that silently undoes this whole change: Cora configured with the enterprise
    // value is Cora holding the three write routes again.
    mockEnv.coraServiceToken = ENTERPRISE;
    expect(duplicateClientTokens()).toEqual([['enterprise_crm', 'cora']]);
  });

  it('reports nothing when the values differ', () => {
    expect(duplicateClientTokens()).toEqual([]);
  });

  it('does not treat two UNSET clients as sharing a token', () => {
    // Empty is absence, not a shared secret. Without this, a fresh environment with neither
    // token set would log a security warning that is simply false.
    mockEnv.enterpriseCrmToken = '';
    mockEnv.coraServiceToken = '';
    expect(duplicateClientTokens()).toEqual([]);
  });

  it('still catches a duplicate when the scoping would otherwise look fine', () => {
    // Guards against a detector that only compares adjacent entries or only the first pair.
    mockEnv.enterpriseCrmToken = CORA;
    expect(duplicateClientTokens()).toEqual([['enterprise_crm', 'cora']]);
  });
});
