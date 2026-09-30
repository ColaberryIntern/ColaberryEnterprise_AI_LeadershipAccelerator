/**
 * Client sign-in via Google SSO, and the session separation it depends on.
 *
 * The tests that matter most assert the two directions of separation — a client token must
 * not pass admin auth, an admin token must not pass the client guard — because both are
 * signed with the same secret and convention alone would not keep them apart.
 */

import jwt from 'jsonwebtoken';
import {
  CLIENT_TOKEN_AUDIENCE,
  CLIENT_TOKEN_TYPE,
  GENERIC_SIGN_IN_REFUSAL,
  assertNotAdminShaped,
  decideClientSignIn,
  type ExistingClientMembership,
  type VerifiedGoogleIdentity,
} from '../../../modules/delivery/clientAuth';
import { requireDeliveryClient, requireDeliveryProjectAccess } from '../../../middlewares/deliveryClientAuth';

const SECRET = 'test-secret-for-delivery-client-auth';
process.env.JWT_SECRET = process.env.JWT_SECRET || SECRET;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require('../../../config/env');

const GOOGLE: VerifiedGoogleIdentity = {
  email: 'reviewer@client.example',
  emailVerified: true,
  name: 'Dana Whitfield',
  googleSub: '1234567890',
};

const MEMBERSHIP: ExistingClientMembership = {
  platformIdentityId: 'identity-1',
  deliveryProjectId: 'project-1',
  role: 'client_owner',
};

const CLIENT_ROLES = ['client_owner', 'client_reviewer', 'client_acceptance_owner'];

const signIn = (over: Partial<Parameters<typeof decideClientSignIn>[0]> = {}) =>
  decideClientSignIn({
    identity: GOOGLE,
    memberships: [MEMBERSHIP],
    clientSideRoles: CLIENT_ROLES,
    ...over,
  });

// ---------------------------------------------------------------------------
// Sign-in decisions
// ---------------------------------------------------------------------------

describe('decideClientSignIn', () => {
  it('signs in a verified identity that already has a client membership', () => {
    const d = signIn();
    expect(d.signedIn).toBe(true);
    if (d.signedIn) {
      expect(d.claims.sub).toBe('identity-1');
      expect(d.claims.delivery_project_ids).toEqual(['project-1']);
      expect(d.claims.aud).toBe(CLIENT_TOKEN_AUDIENCE);
    }
  });

  it('AUTHENTICATION IS NOT AUTHORIZATION — no membership, no session', () => {
    // A valid Google account proves who you are. It must prove nothing about access, or
    // anyone with a Google account could reach a client surface.
    const d = signIn({ memberships: [] });
    expect(d.signedIn).toBe(false);
    if (!d.signedIn) expect(d.refusals.map((r) => r.rule)).toContain('no_client_membership');
  });

  it('never grants access from a non-client role', () => {
    const d = signIn({ memberships: [{ ...MEMBERSHIP, role: 'delivery_owner' }] });
    expect(d.signedIn).toBe(false);
  });

  it('refuses an unverified Google email', () => {
    // Google issues tokens for addresses the user has not proven they control.
    const d = signIn({ identity: { ...GOOGLE, emailVerified: false } });
    expect(d.signedIn).toBe(false);
    if (!d.signedIn) expect(d.refusals.map((r) => r.rule)).toContain('email_unverified');
  });

  it('refuses when the Google token did not verify at all', () => {
    const d = signIn({ identity: null });
    expect(d.signedIn).toBe(false);
    if (!d.signedIn) expect(d.refusals.map((r) => r.rule)).toContain('google_token_invalid');
  });

  it('refuses rather than guessing when an email maps to two identities', () => {
    // Picking one would silently decide which projects the person can see.
    const d = signIn({
      memberships: [MEMBERSHIP, { ...MEMBERSHIP, platformIdentityId: 'identity-2' }],
    });
    expect(d.signedIn).toBe(false);
    if (!d.signedIn) expect(d.refusals.map((r) => r.rule)).toContain('ambiguous_identity');
  });

  it('carries every project the identity is a member of', () => {
    const d = signIn({
      memberships: [MEMBERSHIP, { ...MEMBERSHIP, deliveryProjectId: 'project-2' }],
    });
    if (d.signedIn) expect(d.claims.delivery_project_ids.sort()).toEqual(['project-1', 'project-2']);
    else throw new Error('expected sign-in');
  });

  it('mints NO role claim at all', () => {
    const d = signIn();
    if (!d.signedIn) throw new Error('expected sign-in');
    expect('role' in d.claims).toBe(false);
    expect(assertNotAdminShaped(d.claims as any)).toEqual([]);
  });

  it('the browser-facing refusal is uniform', () => {
    // "No such account", "unverified" and "no membership" must look identical externally,
    // or the endpoint becomes a way to discover who has access to which project.
    expect(GENERIC_SIGN_IN_REFUSAL).not.toMatch(/membership|verified|unknown/i);
  });
});

describe('assertNotAdminShaped', () => {
  it('rejects a client token that carries a role', () => {
    const issues = assertNotAdminShaped({
      aud: CLIENT_TOKEN_AUDIENCE, token_type: CLIENT_TOKEN_TYPE, role: 'super_admin',
    });
    expect(issues.map((i) => i.rule)).toContain('client_token_carries_role');
  });

  it('rejects a mgmt_role and a wrong audience', () => {
    expect(assertNotAdminShaped({ aud: 'other', token_type: CLIENT_TOKEN_TYPE }).map((i) => i.rule))
      .toContain('wrong_audience');
    expect(assertNotAdminShaped({ aud: CLIENT_TOKEN_AUDIENCE, token_type: CLIENT_TOKEN_TYPE, mgmt_role: 'x' })
      .map((i) => i.rule)).toContain('client_token_carries_mgmt_role');
  });
});

// ---------------------------------------------------------------------------
// The guard — separation in both directions
// ---------------------------------------------------------------------------

function runGuard(token: string | null, params: Record<string, string> = {}) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {}, params, ip: '127.0.0.1' };
  const res: any = {
    statusCode: 0, body: null,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  let nexted = false;
  requireDeliveryClient(req, res, () => { nexted = true; });
  return { req, res, nexted };
}

const clientToken = (over: Record<string, unknown> = {}) =>
  jwt.sign(
    {
      sub: 'identity-1', email: GOOGLE.email, token_type: CLIENT_TOKEN_TYPE,
      delivery_project_ids: ['project-1'], ...over,
    },
    env.jwtSecret,
    { audience: CLIENT_TOKEN_AUDIENCE, expiresIn: '1h' },
  );

describe('requireDeliveryClient', () => {
  it('accepts a well-formed client token', () => {
    const { res, nexted, req } = runGuard(clientToken());
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(0);
    expect(req.deliveryClient.sub).toBe('identity-1');
  });

  it('REJECTS AN ADMIN TOKEN — it has no client audience', () => {
    // The other direction of the separation. Both tokens share a secret, so this must not
    // depend on convention.
    const adminToken = jwt.sign(
      { sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' },
      env.jwtSecret,
      { expiresIn: '1h' },
    );
    const { res, nexted } = runGuard(adminToken);
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token that smuggles a role alongside the client audience', () => {
    const { res, nexted } = runGuard(clientToken({ role: 'super_admin' }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong token_type even with the right audience', () => {
    const { res, nexted } = runGuard(clientToken({ token_type: 'participant' }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a session with no projects', () => {
    const { res, nexted } = runGuard(clientToken({ delivery_project_ids: [] }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a missing or malformed header', () => {
    expect(runGuard(null).res.statusCode).toBe(401);
    expect(runGuard('not-a-jwt').res.statusCode).toBe(401);
  });
});

describe('requireDeliveryProjectAccess', () => {
  function runScope(projectId: string, claims: any) {
    const req: any = { deliveryClient: claims, params: { projectId }, ip: '127.0.0.1', headers: {} };
    const res: any = {
      statusCode: 0, body: null,
      status(c: number) { this.statusCode = c; return this; },
      json(b: any) { this.body = b; return this; },
    };
    let nexted = false;
    requireDeliveryProjectAccess()(req, res, () => { nexted = true; });
    return { res, nexted };
  }

  const CLAIMS = { sub: 'identity-1', delivery_project_ids: ['project-1'] };

  it('allows a project the session covers', () => {
    expect(runScope('project-1', CLAIMS).nexted).toBe(true);
  });

  it('returns 404 — NOT 403 — for a foreign project', () => {
    // 403 would confirm the project exists, turning this into a way to enumerate other
    // clients' engagements. E2E scenario F asserts this exact status code.
    const { res, nexted } = runScope('someone-elses-project', CLAIMS);
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/forbidden|not allowed|permission/i);
  });

  it('401s when there is no client session at all', () => {
    expect(runScope('project-1', undefined).res.statusCode).toBe(401);
  });
});
