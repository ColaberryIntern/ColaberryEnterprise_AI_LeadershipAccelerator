import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logAuthFailure } from '../middlewares/authFailureLog';
import {
  CLIENT_TOKEN_AUDIENCE,
  CLIENT_TOKEN_TTL_SECONDS,
  GENERIC_SIGN_IN_REFUSAL,
  assertNotAdminShaped,
  decideClientSignIn,
  type ExistingClientMembership,
  type VerifiedGoogleIdentity,
} from '../modules/delivery/clientAuth';
import { isClientSideRole } from '../modules/delivery/deliveryRoles';

/**
 * deliveryClientAuthRoutes — the one endpoint an external client reviewer uses to sign in.
 *
 * Google SSO, chosen by Ali over magic-link. Master plan §12 forbids a separate Refactored
 * credential store, so identity remains `PlatformIdentity` and Google only proves *who* the
 * person is.
 *
 * ## The endpoint grants nothing
 *
 * It verifies a Google ID token, looks up delivery memberships that **already exist** for
 * the verified email, and mints a session only if one is found. It never creates a
 * membership, never creates a `PlatformIdentity`, and never widens access. Access is
 * granted by someone adding a reviewer to a project — signing in is how they use access
 * they already have.
 *
 * That is why lookup is read-only here: an endpoint that provisioned on first sign-in would
 * turn "has a Google account" into "has access", which is the whole failure being avoided.
 */

const router = Router();

/**
 * Verify a Google ID token.
 *
 * Uses `google-auth-library` via `googleapis`, loaded lazily so a missing optional
 * dependency or an unset client id degrades this one route rather than stopping boot.
 * Returns `null` on any failure — the caller collapses every refusal into one message.
 */
async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId || !idToken) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email) return null;

    return {
      email: payload.email,
      // Google's own verification of the address. An unverified email is a claim, not a
      // fact, and `decideClientSignIn` refuses it.
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
      googleSub: payload.sub ?? null,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Look up memberships for a verified email. READ ONLY, by design.
 *
 * Kept as its own function so the "never provisions" property is visible in one place
 * rather than being an emergent result of what the handler happens not to call.
 */
async function findExistingClientMemberships(email: string): Promise<ExistingClientMembership[]> {
  const { PlatformIdentity, DeliveryProjectMember } = require('../models');

  const identity = await PlatformIdentity.findOne({
    where: { primary_email: email.trim().toLowerCase() },
  });
  if (!identity) return [];

  const members = await DeliveryProjectMember.findAll({
    where: { platform_identity_id: identity.id },
  });

  return members
    .map((m: any) => ({
      platformIdentityId: identity.id,
      deliveryProjectId: m.delivery_project_id,
      role: m.role,
    }))
    .filter((m: ExistingClientMembership) => isClientSideRole(m.role));
}

/**
 * POST /api/refactored/client/auth/google
 *
 * Body: `{ idToken }`. Returns `{ token, expiresIn, projects }` or a uniform 401.
 */
router.post('/api/refactored/client/auth/google', async (req: Request, res: Response) => {
  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';

  try {
    const identity = await verifyGoogleIdToken(idToken);
    const memberships = identity?.email ? await findExistingClientMemberships(identity.email) : [];

    const decision = decideClientSignIn({
      identity,
      memberships,
      clientSideRoles: memberships.map((m) => m.role).filter(isClientSideRole),
    });

    if (!decision.signedIn) {
      // One message for every refusal. "No such account", "unverified" and "no membership"
      // must be indistinguishable, or this endpoint becomes a way to discover who has
      // access to which client project. The specific reason is logged, not returned.
      logAuthFailure(
        `delivery_client_signin_refused:${decision.refusals.map((r) => r.rule).join(',')}`,
        null,
        'delivery_client',
        req.ip,
        req,
      );
      res.status(401).json({ error: GENERIC_SIGN_IN_REFUSAL });
      return;
    }

    // Belt and braces before signing: refuse to mint anything admin-shaped. If a future
    // edit adds a role for convenience, this fails here rather than in an access review.
    const shapeIssues = assertNotAdminShaped(decision.claims as unknown as Record<string, unknown>);
    if (shapeIssues.length > 0) {
      logAuthFailure(
        `delivery_client_token_shape:${shapeIssues.map((i) => i.rule).join(',')}`,
        null,
        'delivery_client',
        req.ip,
        req,
      );
      res.status(500).json({ error: 'Sign-in is temporarily unavailable.' });
      return;
    }

    const { aud, ...claims } = decision.claims;
    const token = jwt.sign(claims, env.jwtSecret, {
      audience: CLIENT_TOKEN_AUDIENCE,
      expiresIn: CLIENT_TOKEN_TTL_SECONDS,
    });

    res.json({
      token,
      expiresIn: CLIENT_TOKEN_TTL_SECONDS,
      projects: decision.claims.delivery_project_ids,
      displayName: decision.claims.display_name,
    });
  } catch (err) {
    logAuthFailure('delivery_client_signin_error', err, 'delivery_client', req.ip, req);
    // Still uniform. An internal failure must not read differently from a refusal.
    res.status(401).json({ error: GENERIC_SIGN_IN_REFUSAL });
  }
});

export default router;
