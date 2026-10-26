/**
 * cloudflareStreamMinutes - delivered minutes, read from the Cloudflare account (C8.10 AC2).
 *
 * C8.10 asks that "Cloudflare Stream delivered minutes are read from the account rather
 * than assumed". This is that read. It is separate from `cloudflareStreamProvider` because
 * the two need different credentials and must fail independently: the provider refuses to
 * work without the signing key, and a signing key has nothing to do with a billing figure.
 * Coupling them would mean a missing playback credential silently took the cost number
 * down with it.
 *
 * KNOWN STATE OF THE CREDENTIAL, probed against production on 26 October 2026:
 *
 *   GET  /accounts/{id}/stream/live_inputs          -> 200, 2 inputs      (Stream scope works)
 *   POST /graphql  viewer.accounts { __typename }   -> 200                (account is visible)
 *   POST /graphql  streamMinutesViewedAdaptiveGroups-> "not authorized for that account"
 *   GET  /accounts/{id}/stream/analytics/views      -> 404                (legacy, removed)
 *
 * So the token we hold is scoped to Stream but NOT to Account Analytics, and there is no
 * second route to the figure. Criterion 2 is therefore blocked on a token scope and not on
 * code: this module is complete and correct, and begins returning real numbers the moment
 * "Account Analytics: Read" is added to the token. That is why the unauthorized case has
 * its own reason code rather than being folded into a generic failure - the distinction
 * between "we cannot read this" and "we read it and it was zero" is the entire point of
 * the ticket, and it has to survive into the operator's hands.
 *
 * NEVER RETURNS ZERO ON FAILURE. A fabricated zero is a defect under the metrics
 * dictionary, and a zero in a COST figure is the most expensive kind: it reads as "this is
 * free". `assertFailureNeverCarriesMinutes` makes that structural rather than careful.
 */

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const REQUEST_TIMEOUT_MS = 10_000;

/** The GraphQL Analytics dataset that carries delivered minutes. */
export const MINUTES_DATASET = 'streamMinutesViewedAdaptiveGroups';

export type MinutesUnavailable =
  /** No account id or API token in the environment. */
  | 'not_configured'
  /** The token is valid but lacks Account Analytics: Read. The current production state. */
  | 'not_authorized'
  /** Cloudflare answered, but not with data we can use. */
  | 'upstream_error'
  /** Cloudflare did not answer inside the timeout. */
  | 'upstream_timeout';

export type MinutesRead =
  | { ok: true; minutes: number; days: number; from: string; to: string }
  | { ok: false; reason: MinutesUnavailable; detail: string };

export interface MinutesConfig {
  accountId: string;
  apiToken: string;
}

/**
 * Only what an analytics read needs.
 *
 * Deliberately NOT `readCloudflareStreamConfig`, which returns null unless all five
 * playback credentials are present. Minutes need two.
 */
export function readMinutesConfig(
  env: NodeJS.ProcessEnv = process.env,
): MinutesConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_STREAM_TOKEN?.trim();
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

/** Exported so the test can assert the dataset and the date filter survive an edit. */
export function buildMinutesQuery(accountId: string, from: string, to: string): string {
  return `query {
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        ${MINUTES_DATASET}(
          filter: { date_geq: "${from}", date_leq: "${to}" }
          limit: 1000
          orderBy: [date_ASC]
        ) {
          sum { minutesViewed }
          dimensions { date }
        }
      }
    }
  }`;
}

/** Cloudflare says "not authorized" in prose; the code is in `extensions.code`. */
function isAuthzError(errors: Array<{ message?: string; extensions?: { code?: string } }>): boolean {
  return errors.some((e) => e.extensions?.code === 'authz'
    || /not authorized|unauthorized|forbidden/i.test(e.message ?? ''));
}

type Fetcher = typeof fetch;

/**
 * Delivered minutes for an inclusive day range, straight from the account.
 *
 * `to` is INCLUSIVE here, because Cloudflare's `date_leq` is. Callers working with the
 * closed-open windows used elsewhere in this subsystem must subtract a day; `lastDayOf`
 * in the report module does that in one place so the off-by-one lives somewhere a test
 * can see it.
 */
export async function readDeliveredMinutes(
  from: string, to: string,
  deps: { env?: NodeJS.ProcessEnv; fetchImpl?: Fetcher } = {},
): Promise<MinutesRead> {
  const config = readMinutesConfig(deps.env ?? process.env);
  if (!config) {
    return {
      ok: false,
      reason: 'not_configured',
      detail: 'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_TOKEN must both be set.',
    };
  }

  const doFetch = deps.fetchImpl ?? fetch;
  let payload: {
    data?: { viewer?: { accounts?: Array<Record<string, unknown>> } };
    errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  };

  try {
    const res = await doFetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: buildMinutesQuery(config.accountId, from, to) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: res.status === 401 || res.status === 403 ? 'not_authorized' : 'upstream_error',
        detail: `Cloudflare answered HTTP ${res.status}.`,
      };
    }
    payload = await res.json() as typeof payload;
  } catch (err) {
    const name = (err as Error)?.name ?? '';
    return {
      ok: false,
      reason: /timeout|abort/i.test(name) ? 'upstream_timeout' : 'upstream_error',
      // The token rides in a header, never in a message, so this cannot leak it.
      detail: `Cloudflare request failed (${name || 'UnexpectedError'}).`,
    };
  }

  // A GraphQL authz failure arrives as HTTP 200 with an errors array, which is exactly how
  // this one presents in production today. Checking only res.ok would read it as success.
  if (payload.errors?.length) {
    return {
      ok: false,
      reason: isAuthzError(payload.errors) ? 'not_authorized' : 'upstream_error',
      detail: isAuthzError(payload.errors)
        ? 'The Cloudflare token is not authorized for account analytics. Add the '
          + '"Account Analytics: Read" permission to it, or issue a second read-only token.'
        : `Cloudflare returned ${payload.errors.length} GraphQL error(s).`,
    };
  }

  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) {
    return {
      ok: false,
      reason: 'not_authorized',
      detail: 'Cloudflare returned no account for that account tag.',
    };
  }

  const groups = account[MINUTES_DATASET];
  if (!Array.isArray(groups)) {
    return {
      ok: false,
      reason: 'upstream_error',
      detail: `Cloudflare returned no ${MINUTES_DATASET} array.`,
    };
  }

  let minutes = 0;
  for (const g of groups as Array<{ sum?: { minutesViewed?: number } }>) {
    const v = g?.sum?.minutesViewed;
    if (typeof v === 'number' && Number.isFinite(v)) minutes += v;
  }

  return { ok: true, minutes, days: groups.length, from, to };
}

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/**
 * A failed read must never carry a number, in any shape.
 *
 * Checked structurally rather than trusted, because the mistake this prevents - adding
 * `minutes: 0` to the failure branch so a caller does not have to narrow the union - is
 * the kind of small convenience that looks harmless in review and publishes a zero cost.
 */
export function assertFailureNeverCarriesMinutes(read: MinutesRead): MinutesRead {
  if (!read.ok && 'minutes' in read) {
    throw new Error('cloudflare minutes: a failed read carried a minutes value');
  }
  if (read.ok && typeof read.minutes !== 'number') {
    throw new Error('cloudflare minutes: a successful read carried no number');
  }
  return read;
}
