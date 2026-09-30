import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
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
import {
  GENERIC_LINK_INVALID,
  GENERIC_LINK_REQUEST_RESPONSE,
  checkRateLimit,
  decideRedemption,
  hashToken,
  mintToken,
  normalizeEmail,
} from '../modules/delivery/clientMagicLink';

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
      // The column is `delivery_role`, NOT `role`. This read said `m.role` when it
      // shipped, which is always undefined, so isClientSideRole() below rejected every
      // membership and NOBODY could sign in - a valid Google account with a real
      // membership still got the generic refusal, indistinguishable from having none.
      //
      // Nothing caught it: the model row is `any` here, so tsc had nothing to check, and
      // the unit tests build membership objects by hand and therefore tested the assumed
      // shape rather than the model's. `deliveryProjectMemberContract.test.ts` now pins
      // the real attribute name so this cannot regress silently.
      role: m.delivery_role,
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

/**
 * Mint a client session from an accepted identity.
 *
 * Shared by BOTH sign-in paths so they cannot drift. Google and the magic link prove
 * identity differently and must produce an identical session: same audience, same TTL, no
 * role claim, same shape check before signing. If they diverged, one door would quietly
 * become weaker than the other.
 */
async function mintSessionFor(
  email: string,
  displayName: string | null,
  req: Request,
  res: Response,
): Promise<void> {
  const memberships = await findExistingClientMemberships(email);
  const decision = decideClientSignIn({
    identity: { email, emailVerified: true, name: displayName, picture: null, googleSub: null },
    memberships,
    clientSideRoles: memberships.map((m) => m.role).filter(isClientSideRole),
  });

  if (!decision.signedIn) {
    // Redeeming a live link proves control of the mailbox and NOTHING about access. A
    // valid link for an address with no membership still gets nothing.
    logAuthFailure(
      `delivery_client_link_no_access:${decision.refusals.map((r) => r.rule).join(',')}`,
      null,
      'delivery_client',
      req.ip,
      req,
    );
    res.status(401).json({ error: GENERIC_SIGN_IN_REFUSAL });
    return;
  }

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
}

/**
 * POST /api/refactored/client/auth/request-link
 *
 * Body: `{ email }`. ALWAYS returns 202 with the same message, whatever happens.
 *
 * The uniformity is the security property, not politeness. A different response for a
 * known address would turn this endpoint into a way to discover who reviews which
 * engagement - the same oracle the sign-in refusal already closes, and it would be
 * pointless to shut one and open the other.
 *
 * That includes internal failures: a 500 here would mark real addresses just as clearly
 * as a 404 would.
 */
router.post('/api/refactored/client/auth/request-link', async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  // Even a malformed address gets the standard answer. A 400 would separate
  // 'not an address' from 'address with no access', which is already a start.
  if (!email) {
    res.status(202).json({ message: GENERIC_LINK_REQUEST_RESPONSE });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeliveryClientSigninToken } = require('../models');

    const recent = await DeliveryClientSigninToken.findAll({
      where: { email, created_at: { [Op.gt]: new Date(Date.now() - 60 * 60 * 1000) } },
      attributes: ['created_at'],
    });
    const verdict = checkRateLimit(
      recent.map((r: any) => ({ createdAt: r.created_at })),
      new Date(),
    );
    if (!verdict.allowed) {
      // Refused silently, with the standard response. Saying 'too many requests' would
      // confirm the address is worth requesting for, and would let someone measure the
      // limit against a list to find the real ones.
      logAuthFailure(
        `delivery_client_link_rate_limited:${verdict.reason}`,
        null,
        'delivery_client',
        req.ip,
        req,
      );
      res.status(202).json({ message: GENERIC_LINK_REQUEST_RESPONSE });
      return;
    }

    const memberships = await findExistingClientMemberships(email);
    if (memberships.length === 0) {
      // No membership, no email. Recorded so a pattern of probing is visible, and
      // answered exactly like a success.
      logAuthFailure('delivery_client_link_no_membership', null, 'delivery_client', req.ip, req);
      res.status(202).json({ message: GENERIC_LINK_REQUEST_RESPONSE });
      return;
    }

    const { token, tokenHash, expiresAt } = mintToken();
    // Stored BEFORE the send, so a link minted but never delivered is still on the record
    // and still consumes the rate limit.
    await DeliveryClientSigninToken.create({
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      consumed_at: null,
      requested_ip: req.ip ?? null,
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendDeliveryClientMagicLink } = require('../services/emailService');
    await sendDeliveryClientMagicLink({ to: email, displayName: null, brandName: null, token });

    res.status(202).json({ message: GENERIC_LINK_REQUEST_RESPONSE });
  } catch (err) {
    logAuthFailure('delivery_client_link_request_error', err, 'delivery_client', req.ip, req);
    // Same answer on an internal failure. A 500 would mark real addresses as clearly as a
    // 404 would.
    res.status(202).json({ message: GENERIC_LINK_REQUEST_RESPONSE });
  }
});

/**
 * POST /api/refactored/client/auth/redeem
 *
 * Body: `{ token }`. Returns the same session shape the Google route returns.
 *
 * Redeeming proves control of the mailbox. It does not grant access: `mintSessionFor`
 * still requires a membership that already exists.
 */
router.post('/api/refactored/client/auth/redeem', async (req: Request, res: Response) => {
  const presented = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!presented) {
    res.status(401).json({ error: GENERIC_LINK_INVALID });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeliveryClientSigninToken } = require('../models');

    // Looked up by HASH. The raw token is never stored, so this is the only way to find
    // the row - and a database reader cannot reverse it into a working link.
    const row = await DeliveryClientSigninToken.findOne({
      where: { token_hash: hashToken(presented) },
    });

    const verdict = decideRedemption(
      row
        ? { tokenHash: row.token_hash, expiresAt: row.expires_at, consumedAt: row.consumed_at }
        : null,
      new Date(),
    );
    if (!verdict.valid) {
      // The three reasons are logged separately and reported as one: expired, already
      // used and never existed each tell someone guessing tokens something different
      // about what they guessed.
      logAuthFailure(
        `delivery_client_link_invalid:${verdict.reason}`,
        null,
        'delivery_client',
        req.ip,
        req,
      );
      res.status(401).json({ error: GENERIC_LINK_INVALID });
      return;
    }

    // Consumed BEFORE the session is minted. If minting then fails the link is spent,
    // which is the right way round: a link surviving a failed redemption can be retried
    // by anyone holding it, and the reviewer can always request another.
    await row.update({ consumed_at: new Date() });

    await mintSessionFor(row.email, null, req, res);
  } catch (err) {
    logAuthFailure('delivery_client_redeem_error', err, 'delivery_client', req.ip, req);
    res.status(401).json({ error: GENERIC_LINK_INVALID });
  }
});
export default router;
