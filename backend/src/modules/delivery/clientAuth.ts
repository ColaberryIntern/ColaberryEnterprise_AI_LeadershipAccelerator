/**
 * clientAuth — how an external client reviewer signs in. PURE, no I/O.
 *
 * Closes the gap handoff item 2 identified: a client reviewer can be **represented** and
 * **authorized** today, but no authentication path resolves a `PlatformIdentity`, so they
 * cannot log in. Approach chosen by Ali: **Google SSO**.
 *
 * ## The distinction this module exists to keep
 *
 * **Authentication is not authorization.** A verified Google identity proves *who* someone
 * is. It proves nothing about whether they may see a delivery project. If sign-in alone
 * granted access, anyone with a Google account could reach a client surface — so
 * `decideClientSignIn` requires a delivery membership that already exists, and refuses to
 * create one. Access is granted by someone adding you to a project, never by you logging in.
 *
 * ## Why the token is structurally different from an admin token
 *
 * Both are signed with the same secret, so separation cannot rely on convention:
 *
 * - A client token carries **no `role` claim at all**. `requireAdmin` gates on
 *   `ADMIN_ROLES.has(payload.role)`, so a client token can never satisfy it — `undefined`
 *   is not in that set.
 * - A client token carries `aud: 'delivery-client'`, and the client guard verifies **with**
 *   that audience. An admin token has no audience, so it fails the client guard too.
 *
 * The separation therefore holds in both directions, and it holds because of the shape of
 * the claims rather than because a middleware remembered to check something. Master plan
 * §Gate 10's safety property is that a client session is not a builder session; the option
 * of extending the admin session was rejected for exactly this reason — it would have put
 * that property one boolean away from failing.
 *
 * §12: no separate Refactored username/password store. Identity is `PlatformIdentity`.
 */

/** The audience claim that marks a delivery-client session. */
export const CLIENT_TOKEN_AUDIENCE = 'delivery-client';

/** Marks the token kind explicitly, in addition to the audience. Defence in depth. */
export const CLIENT_TOKEN_TYPE = 'delivery_client';

/** Client sessions are short. A reviewer signs in to review, not to stay resident. */
export const CLIENT_TOKEN_TTL_SECONDS = 8 * 60 * 60;

/** What a verified Google ID token yields. Supplied by the caller's verifier. */
export interface VerifiedGoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
  /** Google's stable subject id. Recorded, never used as our primary key. */
  googleSub?: string | null;
}

/** A delivery membership that already exists for this email. */
export interface ExistingClientMembership {
  platformIdentityId: string;
  deliveryProjectId: string;
  role: string;
}

export interface ClientSignInInput {
  identity: VerifiedGoogleIdentity | null;
  /** Memberships already on record for the verified email. NEVER created by signing in. */
  memberships: readonly ExistingClientMembership[];
  /** Roles that may use the client surface, from `deliveryRoles`. */
  clientSideRoles: readonly string[];
}

export interface ClientSignInRefusal {
  rule: string;
  detail: string;
}

export interface ClientSessionClaims {
  sub: string;
  email: string;
  token_type: typeof CLIENT_TOKEN_TYPE;
  aud: typeof CLIENT_TOKEN_AUDIENCE;
  /** Delivery projects this identity may reach. Empty is impossible — sign-in refuses. */
  delivery_project_ids: string[];
  display_name?: string | null;
}

export type ClientSignInDecision =
  | { signedIn: true; claims: ClientSessionClaims; ttlSeconds: number }
  | { signedIn: false; refusals: ClientSignInRefusal[] };

/**
 * Decide whether a verified Google identity may open a client session.
 *
 * Returns refusals rather than throwing, and never distinguishes "no such identity" from
 * "identity with no membership" in a way a caller could relay to the browser — the route
 * collapses every refusal to one generic message, because telling an unknown visitor
 * *which* condition they failed is an enumeration oracle.
 */
export function decideClientSignIn(input: ClientSignInInput): ClientSignInDecision {
  const refusals: ClientSignInRefusal[] = [];

  if (!input.identity) {
    return {
      signedIn: false,
      refusals: [{ rule: 'google_token_invalid', detail: 'The Google ID token did not verify.' }],
    };
  }

  const email = input.identity.email?.trim().toLowerCase() ?? '';
  if (!email) {
    refusals.push({ rule: 'email_missing', detail: 'The verified token carried no email.' });
  }

  // An unverified Google email is a claim, not a fact. Google will happily issue a token
  // for an address the user has not proven they control.
  if (!input.identity.emailVerified) {
    refusals.push({
      rule: 'email_unverified',
      detail: 'Google reports this address as unverified.',
    });
  }

  const clientRoles = new Set(input.clientSideRoles);
  const usable = input.memberships.filter((m) => clientRoles.has(m.role));

  if (usable.length === 0) {
    // THE control. Signing in proves identity; it never grants access. A person with a
    // valid Google account and no delivery membership gets nothing.
    refusals.push({
      rule: 'no_client_membership',
      detail:
        'This identity has no client-side delivery membership. Access is granted by being ' +
        'added to a project, never by signing in.',
    });
  }

  const identityIds = new Set(usable.map((m) => m.platformIdentityId));
  if (identityIds.size > 1) {
    // Two identities for one verified email means the identity graph is inconsistent.
    // Picking one would silently choose which projects the person can see.
    refusals.push({
      rule: 'ambiguous_identity',
      detail: `Email resolves to ${identityIds.size} platform identities; refusing to guess.`,
    });
  }

  if (refusals.length > 0) return { signedIn: false, refusals };

  return {
    signedIn: true,
    ttlSeconds: CLIENT_TOKEN_TTL_SECONDS,
    claims: {
      sub: usable[0].platformIdentityId,
      email,
      token_type: CLIENT_TOKEN_TYPE,
      aud: CLIENT_TOKEN_AUDIENCE,
      delivery_project_ids: [...new Set(usable.map((m) => m.deliveryProjectId))],
      display_name: input.identity.name ?? null,
    },
  };
}

export interface ClientTokenShapeIssue {
  rule: string;
  detail: string;
}

/**
 * Assert that a set of claims cannot be mistaken for an admin session.
 *
 * A runtime check rather than a type, because the failure it guards against is a future
 * edit adding a `role` for convenience — which types would happily allow if the interface
 * were widened at the same time.
 */
export function assertNotAdminShaped(claims: Record<string, unknown>): ClientTokenShapeIssue[] {
  const issues: ClientTokenShapeIssue[] = [];

  if ('role' in claims) {
    issues.push({
      rule: 'client_token_carries_role',
      detail:
        'A client token must carry no `role` claim. requireAdmin gates on ' +
        'ADMIN_ROLES.has(payload.role), so adding one is how a client session becomes an ' +
        'admin session.',
    });
  }
  if ('mgmt_role' in claims) {
    issues.push({ rule: 'client_token_carries_mgmt_role', detail: 'Management roles are staff-only.' });
  }
  if (claims.aud !== CLIENT_TOKEN_AUDIENCE) {
    issues.push({
      rule: 'wrong_audience',
      detail: `A client token must carry aud='${CLIENT_TOKEN_AUDIENCE}'.`,
    });
  }
  if (claims.token_type !== CLIENT_TOKEN_TYPE) {
    issues.push({ rule: 'wrong_token_type', detail: `Expected token_type='${CLIENT_TOKEN_TYPE}'.` });
  }

  return issues;
}

/**
 * The single message a refused sign-in returns to the browser.
 *
 * Deliberately uniform. "No such account", "not verified" and "no membership" are different
 * facts internally and must look identical externally, or the endpoint becomes a way to
 * discover who has access to which client project.
 */
export const GENERIC_SIGN_IN_REFUSAL =
  'Sign-in was not successful. If you were invited to review a project, ask your Colaberry ' +
  'contact to confirm the address they invited.';
