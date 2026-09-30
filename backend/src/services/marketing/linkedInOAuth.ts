import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * linkedInOAuth — the authorization-code flow that turns an operator pressing "Connect" into a
 * sealed credential.
 *
 * WHY THIS CAN BE BUILT BEFORE THE APP EXISTS. The flow's shape is fixed by OAuth 2.0 and
 * LinkedIn's published endpoints; the client id and secret are runtime values read from the
 * environment. So this ships complete and inert, and the day the app is registered the change
 * is two env vars, not a build.
 *
 * STATE IS SIGNED, NOT STORED. The `state` parameter defends against CSRF: without it, an
 * attacker can hand a victim's browser an authorization code and graft their own LinkedIn
 * account onto the victim's brand. The obvious implementation is a database row per attempt,
 * which needs a table, an expiry sweep, and a cleanup job nobody writes. Instead the state is an
 * HMAC over the facts the callback must trust - which admin started it, which brand, and when -
 * so the callback can verify it with no storage at all and a replayed or edited state fails the
 * signature rather than being merely absent.
 *
 * WHAT THE CALLBACK MUST NEVER DO is trust the brand id from the query string. That is the
 * whole point of signing: the brand is fixed at the moment the flow starts, by an admin whose
 * scope was already checked, and travels inside the signature where a redirect cannot rewrite it.
 *
 * SCOPES ARE MINIMAL AND EXPLICIT. `w_member_social` to post, `openid`/`profile` to learn the
 * author URN, and nothing else. The App Review notes are emphatic that asking for scopes you do
 * not use weakens an application, and every extra scope is a permission an operator grants us
 * that we cannot justify.
 */

export const LINKEDIN_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

/** Member posting only. Organization posting needs `w_organization_social` and an approved app. */
export const LINKEDIN_MEMBER_SCOPES = ['openid', 'profile', 'w_member_social'] as const;

/** How long an authorization attempt stays valid. Long enough to sign in, short enough to matter. */
export const STATE_TTL_MS = 10 * 60 * 1000;

export class LinkedInOAuthError extends Error {
  constructor(message: string, public readonly errorClass: string, public readonly status = 400) {
    super(message);
    this.name = 'LinkedInOAuthError';
  }
}

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Read at call time rather than at module load, so adding the variables to the environment and
 * restarting is the whole activation - and so a process that starts without them still boots and
 * serves every other surface.
 */
export function linkedInConfig(env: NodeJS.ProcessEnv = process.env): LinkedInOAuthConfig | null {
  const clientId = env.LINKEDIN_CLIENT_ID;
  const clientSecret = env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = env.LINKEDIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isLinkedInConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return linkedInConfig(env) !== null;
}

export interface StatePayload {
  /** The admin who started the flow. The callback attributes the connection to them. */
  adminId: string;
  /** The brand the account will belong to. Signed so a redirect cannot rewrite it. */
  brandId: string;
  /** Milliseconds since epoch, for the TTL. */
  issuedAt: number;
  /** Random, so two flows started in the same millisecond are still distinct values. */
  nonce: string;
}

function stateSecret(env: NodeJS.ProcessEnv = process.env): string {
  // Reuses the app's JWT secret deliberately: one secret to rotate, already required to exist,
  // and a state signed with it is exactly as trustworthy as a session cookie.
  const secret = env.JWT_SECRET;
  if (!secret) throw new LinkedInOAuthError('JWT_SECRET is not configured; the OAuth state cannot be signed.', 'ConfigMissing', 500);
  return secret;
}

function sign(body: string, env?: NodeJS.ProcessEnv): string {
  return createHmac('sha256', stateSecret(env)).update(body).digest('base64url');
}

export function encodeState(payload: Omit<StatePayload, 'issuedAt' | 'nonce'>, now = Date.now(), env?: NodeJS.ProcessEnv): string {
  const full: StatePayload = { ...payload, issuedAt: now, nonce: randomBytes(9).toString('base64url') };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${sign(body, env)}`;
}

export function decodeState(state: string, now = Date.now(), env?: NodeJS.ProcessEnv): StatePayload {
  const parts = state.split('.');
  if (parts.length !== 2) throw new LinkedInOAuthError('The sign-in state is malformed.', 'StateInvalid');
  const [body, signature] = parts;

  const expected = sign(body, env);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a mismatch rather than returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new LinkedInOAuthError('The sign-in state failed verification. Start the connection again.', 'StateInvalid');
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new LinkedInOAuthError('The sign-in state is malformed.', 'StateInvalid');
  }

  if (typeof payload.issuedAt !== 'number' || now - payload.issuedAt > STATE_TTL_MS) {
    throw new LinkedInOAuthError('The sign-in attempt expired. Start the connection again.', 'StateExpired');
  }
  if (!payload.adminId || !payload.brandId) {
    throw new LinkedInOAuthError('The sign-in state is incomplete.', 'StateInvalid');
  }
  return payload;
}

/** The URL an operator's browser is sent to. Contains no secret: the client id is public. */
export function buildAuthorizeUrl(input: { brandId: string; adminId: string }, env: NodeJS.ProcessEnv = process.env, now = Date.now()): { url: string; state: string } {
  const config = linkedInConfig(env);
  if (!config) {
    throw new LinkedInOAuthError(
      'LinkedIn is not configured on this server (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI).',
      'ProviderNotConfigured',
      503,
    );
  }
  const state = encodeState({ adminId: input.adminId, brandId: input.brandId }, now, env);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: LINKEDIN_MEMBER_SCOPES.join(' '),
  });
  return { url: `${LINKEDIN_AUTHORIZE_URL}?${params.toString()}`, state };
}

export interface OAuthHttpResponse { status: number; body: unknown }
export type OAuthHttp = (input: { method: string; url: string; headers: Record<string, string>; body?: string }) => Promise<OAuthHttpResponse>;

export interface ExchangedToken {
  accessToken: string;
  expiresAt: Date | null;
  scopes: string[];
}

/**
 * Trade the authorization code for a token.
 *
 * The client secret goes in the POST BODY, never in a query string: a URL reaches access logs,
 * proxy logs and browser history, and a secret in any of those is a secret to rotate.
 */
export async function exchangeCode(code: string, http: OAuthHttp, env: NodeJS.ProcessEnv = process.env, now = () => new Date()): Promise<ExchangedToken> {
  const config = linkedInConfig(env);
  if (!config) throw new LinkedInOAuthError('LinkedIn is not configured on this server.', 'ProviderNotConfigured', 503);

  const res = await http({
    method: 'POST',
    url: LINKEDIN_TOKEN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }).toString(),
  });

  if (res.status >= 400) {
    const detail = (res.body as { error_description?: string })?.error_description;
    throw new LinkedInOAuthError(
      detail ? `LinkedIn refused the sign-in: ${detail}` : `LinkedIn refused the sign-in (HTTP ${res.status}).`,
      'ExchangeFailed',
      res.status === 400 ? 400 : 502,
    );
  }

  const body = res.body as { access_token?: string; expires_in?: number; scope?: string };
  if (!body?.access_token) {
    throw new LinkedInOAuthError('LinkedIn returned no access token.', 'ExchangeFailed', 502);
  }

  return {
    accessToken: body.access_token,
    expiresAt: typeof body.expires_in === 'number' ? new Date(now().getTime() + body.expires_in * 1000) : null,
    // The scopes actually GRANTED, which can be fewer than those asked for. Recording the
    // granted set is what lets the account panel say "missing: x" instead of failing at publish.
    scopes: typeof body.scope === 'string' ? body.scope.split(/[\s,]+/).filter(Boolean) : [],
  };
}

export interface MemberIdentity {
  /** OIDC subject. `urn:li:person:{sub}` is the author URN. */
  sub: string;
  name: string;
  picture: string | null;
}

/** Who the token belongs to. Without `sub` there is no author URN and nothing can be posted. */
export async function fetchMemberIdentity(accessToken: string, http: OAuthHttp): Promise<MemberIdentity> {
  const res = await http({
    method: 'GET',
    url: LINKEDIN_USERINFO_URL,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status >= 400) {
    throw new LinkedInOAuthError(
      `LinkedIn would not identify the account (HTTP ${res.status}). The 'openid' and 'profile' scopes are required.`,
      'IdentityFailed',
      res.status === 403 ? 403 : 502,
    );
  }

  const body = res.body as { sub?: string; name?: string; picture?: string };
  if (!body?.sub) {
    throw new LinkedInOAuthError('LinkedIn returned no member id, so posts could not be attributed.', 'IdentityFailed', 502);
  }
  return { sub: body.sub, name: body.name ?? 'LinkedIn member', picture: body.picture ?? null };
}

/** Which of the scopes we asked for were not granted. Surfaced to the operator, not swallowed. */
export function missingScopes(granted: string[]): string[] {
  const have = new Set(granted);
  return LINKEDIN_MEMBER_SCOPES.filter((s) => !have.has(s));
}
