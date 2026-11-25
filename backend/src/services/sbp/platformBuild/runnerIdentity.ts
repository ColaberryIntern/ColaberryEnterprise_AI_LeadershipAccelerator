/**
 * platformBuild/runnerIdentity - prove a request comes from OUR build workflow on OUR main branch.
 *
 * ## Why GitHub OIDC and not a shared secret
 *
 * The workflow runs in this repository, and this repository is PUBLIC: workflow inputs and logs
 * are readable by anyone. A run token passed as an input would be published with the run. GitHub
 * instead mints each job a short-lived JWT, signed with GitHub's key, stating which repository,
 * which workflow file, which ref and which event produced it. Nothing secret is stored anywhere,
 * and only a job running `.github/workflows/<workflow>@refs/heads/main` in this repository can
 * present a token that passes `checkRunnerClaims`:
 *
 *   - a fork's job carries the fork's `repository`, and is refused;
 *   - a workflow edited on a branch carries that branch in `workflow_ref`, and is refused;
 *   - a self-hosted runner carries `runner_environment: self-hosted`, and is refused (ESC-4:
 *     agent execution happens only on ephemeral GitHub-hosted machines).
 *
 * `checkRunnerClaims` is pure; `verifyRunnerToken` adds the signature check against GitHub's
 * published keys, cached for an hour and refetched once on an unknown key id (GitHub rotates).
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
export const PLATFORM_BUILD_AUDIENCE = 'colaberry-platform-build';

export interface RunnerExpectations {
  repository: string;
  workflowFile: string;
}

export interface RunnerClaims {
  repository?: unknown;
  workflow_ref?: unknown;
  ref?: unknown;
  event_name?: unknown;
  runner_environment?: unknown;
  run_id?: unknown;
}

export class RunnerIdentityError extends Error {
  readonly name = 'RunnerIdentityError';

  readonly error_class = 'AuthError';
}

/** Every reason the claims do not describe our workflow on main. Empty means they do. */
export function checkRunnerClaims(claims: RunnerClaims, exp: RunnerExpectations): string[] {
  const problems: string[] = [];
  const wantRef = `${exp.repository}/.github/workflows/${exp.workflowFile}@refs/heads/main`;
  if (claims.repository !== exp.repository) problems.push('repository');
  if (claims.workflow_ref !== wantRef) problems.push('workflow_ref');
  if (claims.ref !== 'refs/heads/main') problems.push('ref');
  if (claims.event_name !== 'workflow_dispatch') problems.push('event_name');
  if (claims.runner_environment !== 'github-hosted') problems.push('runner_environment');
  return problems;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface Jwk { kid?: string; kty?: string; n?: string; e?: string }

let cache: { at: number; keys: Jwk[] } | null = null;
const CACHE_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

/** For tests. */
export function resetRunnerKeyCache(): void { cache = null; }

async function fetchKeys(fetchImpl: FetchLike): Promise<Jwk[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(GITHUB_OIDC_JWKS_URL, { signal: ctrl.signal });
    if (!res.ok) throw new RunnerIdentityError(`GitHub OIDC keys returned ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    if (!Array.isArray(body.keys)) throw new RunnerIdentityError('GitHub OIDC keys response has no keys');
    cache = { at: Date.now(), keys: body.keys };
    return body.keys;
  } finally {
    clearTimeout(timer);
  }
}

async function keyFor(kid: string, fetchImpl: FetchLike): Promise<crypto.KeyObject> {
  let keys = cache && Date.now() - cache.at < CACHE_MS ? cache.keys : await fetchKeys(fetchImpl);
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    keys = await fetchKeys(fetchImpl);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk || jwk.kty !== 'RSA') throw new RunnerIdentityError('unknown signing key');
  return crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
}

/** The verified claims, or a RunnerIdentityError. Never returns unverified claims. */
export async function verifyRunnerToken(
  token: string,
  exp: RunnerExpectations,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<RunnerClaims> {
  if (!token || token.length > 8000) throw new RunnerIdentityError('missing token');
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded && typeof decoded === 'object' ? (decoded.header as { kid?: string }).kid : undefined;
  if (!kid) throw new RunnerIdentityError('token has no key id');
  const key = await keyFor(kid, fetchImpl);
  let claims: RunnerClaims;
  try {
    claims = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: GITHUB_OIDC_ISSUER,
      audience: PLATFORM_BUILD_AUDIENCE,
    }) as RunnerClaims;
  } catch (err) {
    throw new RunnerIdentityError(`token rejected: ${(err as Error).message}`);
  }
  const problems = checkRunnerClaims(claims, exp);
  if (problems.length) throw new RunnerIdentityError(`token is not from the platform build workflow on main (${problems.join(', ')})`);
  return claims;
}
