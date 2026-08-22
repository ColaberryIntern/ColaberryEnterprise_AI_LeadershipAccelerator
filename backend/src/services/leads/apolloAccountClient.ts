/**
 * apolloAccountClient — the ONLY outbound door for account-scoped Apollo reads.
 *
 * Everything here is deliberately narrow. Apollo has two very different classes
 * of endpoint:
 *
 *   Discovery (BILLABLE)  mixed_people search, people match, phone reveal.
 *                         These drained the credits that got the two scheduled
 *                         agents switched off on 2026-07-10. They live in
 *                         apolloService.ts behind the env.apolloEnabled kill
 *                         switch and are NOT reachable from here.
 *
 *   Account (FREE)        our own saved contacts and lists. Records we already
 *                         own and already paid for. That is all this client can
 *                         reach, enforced by ALLOWED_PATHS below rather than by
 *                         a comment asking nicely.
 *
 * Keeping the allowlist in its own module means the import service cannot widen
 * it by accident, and a reviewer has exactly one short file to check when
 * asking "can this spend money?".
 *
 * Failure handling per the repo's Failure-First rules: explicit timeout, capped
 * retries with exponential backoff on 429/5xx, no retry on auth failures (they
 * never get better), and a stable error_class on every throw. The credential is
 * read from the environment at call time and never logged, returned, or
 * included in an error message.
 */

const BASE = 'https://api.apollo.io';

/** Account-scoped reads only. Adding a discovery path here reintroduces the drain. */
const ALLOWED_PATHS: readonly string[] = ['/v1/contacts/search', '/v1/labels'];

const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 3;

export class ApolloImportError extends Error {
  readonly errorClass: string;
  constructor(message: string, errorClass: string) {
    super(message);
    this.name = 'ApolloImportError';
    this.errorClass = errorClass;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function authHeaders(): Record<string, string> {
  const credential = process.env.APOLLO_API_KEY;
  if (!credential) {
    throw new ApolloImportError('APOLLO_API_KEY not configured', 'ConfigError');
  }
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    accept: 'application/json',
    'x-api-key': credential,
  };
}

/**
 * Call an account-scoped Apollo endpoint.
 *
 * Pass `body` to POST (contacts search); omit it to GET (labels). Rejects any
 * path outside ALLOWED_PATHS before a request is ever made, so a mistake is a
 * thrown error rather than a charge.
 */
export async function apolloAccountFetch(
  path: string,
  body?: Record<string, unknown>
): Promise<any> {
  if (!ALLOWED_PATHS.includes(path)) {
    throw new ApolloImportError(
      `Refusing to call ${path}: not an account-scoped read. This client may not spend Apollo credits.`,
      'ForbiddenEndpoint'
    );
  }

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      // Auth failures never improve on retry — fail fast and loudly.
      if (res.status === 401 || res.status === 403) {
        throw new ApolloImportError(
          `Apollo rejected the credential (HTTP ${res.status})`,
          'AuthError'
        );
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw new ApolloImportError(
          `Apollo ${path} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
          res.status === 429 ? 'RateLimitError' : 'UpstreamUnavailable'
        );
      }

      if (!res.ok) {
        throw new ApolloImportError(`Apollo ${path} returned HTTP ${res.status}`, 'UpstreamError');
      }

      return await res.json();
    } catch (err: any) {
      if (err instanceof ApolloImportError) throw err;
      lastError =
        err?.name === 'AbortError' ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : err?.message;
      if (attempt >= MAX_ATTEMPTS) {
        throw new ApolloImportError(
          `Apollo ${path} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
          err?.name === 'AbortError' ? 'TimeoutError' : 'NetworkError'
        );
      }
      await sleep(1000 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ApolloImportError(`Apollo ${path} failed: ${lastError}`, 'UpstreamUnavailable');
}

/** Exported for the test that asserts the allowlist has not been widened. */
export function allowedApolloPaths(): readonly string[] {
  return ALLOWED_PATHS;
}
