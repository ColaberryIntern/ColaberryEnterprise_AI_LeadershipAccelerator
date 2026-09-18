import type { Connector, ConnectorKey } from './connectorTypes';
import { metaConnector } from './providers/meta';
import { youtubeConnector } from './providers/youtube';
import { tiktokConnector } from './providers/tiktok';
import { xConnector } from './providers/x';
import { linkedinOrgConnector } from './providers/linkedinOrg';
import { redirectUriFor } from './connectorConfig';
import { isLinkedInConfigured } from '../linkedInOAuth';
import type { ProviderKey } from '../../publishing/providerCapabilities';

/**
 * Every network an operator can connect, and whether this server is set up for each.
 *
 * Five run through the generic flow in this directory. LinkedIn personal profiles do NOT: that
 * flow (linkedInOAuth.ts + linkedInCallbackRoutes.ts) predates this one, is live in production,
 * and its callback URL is registered with LinkedIn on an app shared with a Bubble app. Moving it
 * would mean re-registering that URL on an app we must not disturb, for no gain the operator
 * would see. It appears here only so the Brands page can list every network in one place.
 */

export const GENERIC_CONNECTORS: readonly Connector[] = [
  linkedinOrgConnector,
  metaConnector,
  youtubeConnector,
  tiktokConnector,
  xConnector,
];

const BY_KEY = new Map<string, Connector>(GENERIC_CONNECTORS.map((c) => [c.key, c]));

/** A generic connector by key, or null. `linkedin` is not one - see the header. */
export function genericConnector(key: string): Connector | null {
  return BY_KEY.get(key) ?? null;
}

export interface ConnectorStatus {
  key: ConnectorKey;
  label: string;
  providers: readonly ProviderKey[];
  configured: boolean;
  /** Env var names still unset. Names only - never values. */
  missing_env: string[];
  /** The exact URL to register with the platform, or null when the base URL is unknown. */
  redirect_uri: string | null;
  requirements: string;
}

const LINKEDIN_ENV = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'];

function unset(names: readonly string[], env: NodeJS.ProcessEnv): string[] {
  return names.filter((n) => !env[n]?.trim());
}

/**
 * What the Brands page shows per network. The base URL counts as missing when nothing supplies
 * it, so "configured: false" always comes with something the admin can go and set.
 */
export function connectorStatuses(env: NodeJS.ProcessEnv = process.env): ConnectorStatus[] {
  const linkedIn: ConnectorStatus = {
    key: 'linkedin',
    label: 'LinkedIn (personal profile)',
    providers: ['linkedin_member'],
    configured: isLinkedInConfigured(env),
    missing_env: unset(LINKEDIN_ENV, env),
    redirect_uri: env.LINKEDIN_REDIRECT_URI?.trim() || null,
    requirements: 'Live. Tokens last 60 days and LinkedIn issues no refresh token to this app, so reconnect before the date shown on the account.',
  };

  const generic = GENERIC_CONNECTORS.map((c): ConnectorStatus => {
    const redirect = redirectUriFor(c.key, env);
    const missing = unset(c.envVars, env);
    if (!redirect) missing.push('MARKETING_OAUTH_BASE_URL');
    return {
      key: c.key,
      label: c.label,
      providers: c.providers,
      configured: c.config(env) !== null,
      missing_env: missing,
      redirect_uri: redirect,
      requirements: c.requirements,
    };
  });

  return [linkedIn, ...generic];
}
