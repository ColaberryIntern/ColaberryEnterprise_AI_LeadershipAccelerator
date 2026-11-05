import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Service-to-service Bearer auth for the `/api/v1/*` machine routes.
 *
 * ── WHY THIS IS PER CLIENT AND NOT ONE SHARED SECRET ────────────────────────
 *
 * Until 2026-11-05 there was exactly one token, `ENTERPRISE_CRM_TOKEN`, and every v1 route
 * accepted it. That meant any holder of it could call all five, and three of those are writes:
 * create a lead, register an Explorer account with a login link, and `request-callback`, which
 * asks Synthflow to DIAL A PERSON. The read-only nightly job that wanted the Explorer call
 * queue would therefore have been handed the ability to place phone calls.
 *
 * The second problem was rotation. One value is held by this backend, by Sai's Cloud Run for
 * training.colaberry.com, and by Repo2Reputation for the enrollment lookup. Rotating it means
 * changing three systems in the same minute or breaking lead capture, so in practice it never
 * gets rotated at all. A credential that cannot be rotated is a credential that is never
 * retired after someone leaves.
 *
 * So a route now declares WHICH CLIENTS it accepts, and each client has its own token in its
 * own environment variable. Scoping is a property of the route table, visible on the line that
 * registers the route, rather than something you have to go and read a middleware to discover.
 *
 * ── ADDING A CLIENT ─────────────────────────────────────────────────────────
 *
 * Add it to `ServiceClient`, give it an entry in `CLIENT_TOKENS` (TypeScript will not compile
 * until you do, which is the point), add the variable to `backend/.env.example` and to
 * `docker-compose.production.yml`, and put the value on the host. Never in the repo, never in a
 * log, never in an email.
 *
 * ── THE RENAME IS DELIBERATE ────────────────────────────────────────────────
 *
 * The old export was `requireServiceToken`, used directly as middleware. This one is a FACTORY,
 * and a factory passed to Express without being called is a request that hangs forever rather
 * than an error anyone sees: Express would call it with (req, res, next) as its client list and
 * use the returned function as the response. Renaming it means any un-migrated call site is a
 * compile error on a gate that already runs, instead of a route that silently stops answering.
 */

/** Every system allowed to hold a token for these routes. */
export type ServiceClient = 'enterprise_crm' | 'cora';

/**
 * Where each client's token comes from.
 *
 * Read through a function, not captured at module load, so a test can mock `env` and so a
 * value is never copied into a second place that could outlive a rotation.
 *
 * `enterprise_crm` is the original shared credential, provisioned 2026-06-10 and held by
 * training.colaberry.com (Sai's Cloud Run) and Repo2Reputation. `cora` is the Cora recap engine
 * on its own host, which reads the Explorer call queue and writes nothing here.
 */
const CLIENT_TOKENS: Record<ServiceClient, () => string> = {
  enterprise_crm: () => env.enterpriseCrmToken,
  cora: () => env.coraServiceToken,
};

function log(level: 'warn' | 'error', event: string, context: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-service-auth', event, outcome: 'failure', ...context }) + '\n',
  );
}

/**
 * Hash both sides to fixed-length SHA-256 buffers before comparing, so neither the token's
 * length nor any character position leaks through timing. `timingSafeEqual` throws on unequal
 * lengths, which is itself a length oracle; hashing first removes that.
 */
function timingSafeTokenEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Clients configured with the SAME token value, which silently defeats the scoping.
 *
 * This is the one way the whole change can be undone by a paste: set `CORA_SERVICE_TOKEN` to
 * the enterprise value and Cora holds the three write routes again, with nothing anywhere
 * saying so. Keyed on a SHA-256 digest rather than on the secret, so no secret is ever used as
 * a map key. Exported so it can be tested against real values a test controls.
 */
export function duplicateClientTokens(): ServiceClient[][] {
  const byDigest = new Map<string, ServiceClient[]>();
  for (const client of Object.keys(CLIENT_TOKENS) as ServiceClient[]) {
    const value = CLIENT_TOKENS[client]();
    if (!value) continue;
    const digest = crypto.createHash('sha256').update(value).digest('hex');
    byDigest.set(digest, [...(byDigest.get(digest) ?? []), client]);
  }
  return [...byDigest.values()].filter((clients) => clients.length > 1);
}

/** Logged once per process, not once per route, because routes register in a loop at import. */
let reportedDuplicates = false;

/**
 * It LOGS and does not throw. A misconfiguration here grants more access than intended, which
 * is serious, but throwing at import time would refuse to start the backend and turn a paste
 * mistake into an outage. The log is at error level and names the clients, and a test proves
 * the detection fires, so the failure is loud without being fatal.
 */
function reportDuplicateTokensOnce(): void {
  if (reportedDuplicates) return;
  reportedDuplicates = true;
  for (const clients of duplicateClientTokens()) {
    log('error', 'service_client_tokens_not_distinct', {
      error_class: 'ConfigurationError',
      clients: clients.join(','),
      detail: 'these clients share one token value, so route scoping between them has no effect',
    });
  }
}

/**
 * Guard a route so only the named clients can call it.
 *
 * Fails closed in every direction worth naming: no header, wrong scheme, a token belonging to a
 * client this route does not list, and a client whose token is UNSET all answer 401. An unset
 * token never authenticates, so a route scoped to a client that has not been provisioned is
 * inert rather than open.
 */
export function requireServiceClient(
  ...clients: ServiceClient[]
): (req: Request, res: Response, next: NextFunction) => void {
  if (clients.length === 0) {
    // A guard that accepts nobody is almost certainly a mistake, and it would present as every
    // caller getting 401 with a correct token. Fail at import, where it is one line to find.
    throw new Error('requireServiceClient needs at least one ServiceClient');
  }
  reportDuplicateTokensOnce();

  return function serviceClientGuard(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      log('warn', 'auth_missing_header', { error_class: 'AuthError', ip: req.ip, allowed: clients.join(',') });
      res.status(401).json({ error: 'Service token required' });
      return;
    }

    const presented = authHeader.slice(7);
    // Every allowed client is compared, with no early exit on a match, so the work done does
    // not depend on WHICH client matched or on how many were checked before it.
    let matched: ServiceClient | null = null;
    for (const client of clients) {
      const expected = CLIENT_TOKENS[client]();
      if (expected && timingSafeTokenEqual(presented, expected)) matched = client;
    }

    if (!matched) {
      // The response body is identical to the one the shared-token version sent, because the
      // caller must not learn whether the token was unknown, or known but wrong for this route.
      log('warn', 'auth_invalid_token', { error_class: 'AuthError', ip: req.ip, allowed: clients.join(',') });
      res.status(401).json({ error: 'Invalid service token' });
      return;
    }

    next();
  };
}
