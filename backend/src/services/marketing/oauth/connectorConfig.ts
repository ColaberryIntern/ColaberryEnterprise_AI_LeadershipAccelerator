import type { ConnectorConfig, ConnectorKey } from './connectorTypes';

/**
 * Where each network sends the browser back, and how a connector's credentials are read.
 *
 * Every network requires the redirect URI to be registered with it character for character, so
 * the URI is computed in exactly one place and shown to the admin verbatim on the Brands page -
 * the thing to paste into the platform's developer console - rather than reconstructed by hand
 * from a runbook, which is where a trailing slash goes wrong.
 *
 * The base URL is `MARKETING_OAUTH_BASE_URL` when set, otherwise the origin of the already-live
 * `LINKEDIN_REDIRECT_URI`. Deriving it is deliberate: the admin must land back on the host they
 * are signed in to (sessions are per host), and LinkedIn's working redirect already names that
 * host. One fact, not two to keep in step.
 */
export function oauthBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.MARKETING_OAUTH_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const linkedIn = env.LINKEDIN_REDIRECT_URI?.trim();
  if (!linkedIn) return null;
  try {
    return new URL(linkedIn).origin;
  } catch {
    return null;
  }
}

/** The callback path for a connector. Mounted publicly by marketingOAuthCallbackRoutes. */
export function callbackPath(key: ConnectorKey): string {
  return `/api/marketing/oauth/${key}/callback`;
}

export function redirectUriFor(key: ConnectorKey, env: NodeJS.ProcessEnv = process.env): string | null {
  const base = oauthBaseUrl(env);
  return base ? `${base}${callbackPath(key)}` : null;
}

/**
 * A connector's client id and secret, plus its redirect URI. Null when anything is missing:
 * read at call time, so setting the variables and restarting is the whole activation and a
 * server without them still boots and serves everything else.
 */
export function readConfig(
  key: ConnectorKey,
  idVar: string,
  secretVar: string,
  env: NodeJS.ProcessEnv = process.env,
): ConnectorConfig | null {
  const clientId = env[idVar]?.trim();
  const clientSecret = env[secretVar]?.trim();
  const redirectUri = redirectUriFor(key, env);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}
