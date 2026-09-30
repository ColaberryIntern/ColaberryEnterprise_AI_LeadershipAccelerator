import type { ProviderKey } from '../../publishing/providerCapabilities';

/**
 * connectorTypes - the contract each network's sign-in module implements.
 *
 * A CONNECTOR is one sign-in flow; a PROVIDER is one kind of account it can produce. They are
 * not one-to-one, and the difference is why this contract exists: a single Facebook sign-in
 * yields every Facebook Page the operator ticked AND the Instagram account linked to each, so
 * `meta` is one connector producing two providers and possibly a dozen accounts. X, YouTube and
 * TikTok yield exactly one account each; LinkedIn Pages yields one per page the member runs.
 */

export type ConnectorKey = 'linkedin' | 'linkedin_org' | 'meta' | 'youtube' | 'tiktok' | 'x';

export interface OAuthHttpResponse {
  status: number;
  body: unknown;
}

/**
 * Every outbound call goes through this, so tests inject a fake and production gets one place
 * that owns the timeout. Deliberately no logging of `url`: Meta's token exchange carries the
 * client secret in the query string, per Meta's own spec, and a URL in a log is a secret to rotate.
 */
export type OAuthHttp = (input: {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<OAuthHttpResponse>;

export interface ConnectorConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** What a token exchange produced, normalised across networks. */
export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  /** Scopes actually GRANTED, which can be fewer than those requested. */
  scopes: string[];
}

/** One account a sign-in produced, ready to seal into the vault. */
export interface DiscoveredAccount {
  provider: ProviderKey;
  providerAccountId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  grantedScopes: string[];
  missingScopes: string[];
  metadata: Record<string, unknown>;
}

export interface Connector {
  key: ConnectorKey;
  /** What the operator reads on the Connect button. */
  label: string;
  /** The kinds of account this sign-in can produce. */
  providers: readonly ProviderKey[];
  /** Env var NAMES the server needs. Shown to admins so "not set up" says what is missing. */
  envVars: readonly string[];
  /** Scopes requested at sign-in. */
  scopes: readonly string[];
  /** Whether the authorize URL carries a PKCE challenge and the exchange a verifier. */
  usesPkce: boolean;
  /**
   * Provider `error` values that mean the operator backed out. Mapped to a calm "cancelled"
   * rather than an alarming "refused", because the remedy is to press Connect again.
   */
  cancelErrors: readonly string[];
  /**
   * What the platform itself requires before this works for real - review, audits, cost. Shown
   * on the Brands page next to the button, so nobody discovers a platform rule by being refused.
   */
  requirements: string;
  config(env: NodeJS.ProcessEnv): ConnectorConfig | null;
  authorizeUrl(cfg: ConnectorConfig, state: string, pkceChallenge: string | null): string;
  exchangeCode(input: {
    cfg: ConnectorConfig;
    code: string;
    verifier: string | null;
    http: OAuthHttp;
    now: Date;
  }): Promise<TokenSet>;
  discoverAccounts(input: { cfg: ConnectorConfig; token: TokenSet; http: OAuthHttp; now: Date }): Promise<DiscoveredAccount[]>;
}

/** `now + seconds`, or null when the provider did not say. Shared so every module rounds alike. */
export function expiryFrom(now: Date, seconds: unknown): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? new Date(now.getTime() + seconds * 1000)
    : null;
}

/** Scopes requested minus scopes granted. Surfaced to the operator, never swallowed. */
export function missingFrom(required: readonly string[], granted: readonly string[]): string[] {
  const have = new Set(granted);
  return required.filter((s) => !have.has(s));
}

/** A provider's own error text, if it sent one, trimmed so it cannot flood a redirect or log. */
export function providerMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const nested = (b.error && typeof b.error === 'object') ? b.error as Record<string, unknown> : null;
  const text = b.error_description ?? nested?.message ?? b.message ?? b.detail ?? (typeof b.error === 'string' ? b.error : null);
  return typeof text === 'string' && text.trim() ? text.trim().slice(0, 200) : null;
}
