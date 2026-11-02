import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { callGraph, graphUrl, type MetaHttp } from '../../publishing/metaGraph';
import { makeMetaHttp } from '../../publishing/metaHttp';
import { ProviderPublishError } from '../../publishing/socialProviderAdapter';
import { normalisePlacement, parseMoneyToCents, SpendInput, SpendInputSchema } from './spendInput';
import { upsertSpend } from './spendLedger';

/**
 * Pull daily campaign spend from the Meta Marketing API into marketing_spend_facts.
 *
 * WHAT IT NEEDS (and does not have until someone provides it):
 *   META_ADS_ACCESS_TOKEN  a System User token from Business Settings with `ads_read` on the ad
 *                          account. NOT the Page token the publishing connection holds: that one is
 *                          scoped to posting and cannot read spend.
 *   META_AD_ACCOUNT_ID     the ad account, with or without the `act_` prefix.
 * Without both, a sync is recorded as `skipped` with the reason, and manual / CSV entry still works.
 *
 * WHAT IT ASKS FOR. /act_{id}/insights at campaign level, one row per day (time_increment=1),
 * broken down by publisher_platform so Facebook and Instagram spend can be set against fb and ig
 * signups. Read-only: nothing here can change a campaign or a budget.
 *
 * IDEMPOTENT. It re-pulls the trailing 30 days every run, because Meta revises recent days as late
 * conversions and billing adjustments land; the ledger's upsert makes a re-pull overwrite, not add.
 *
 * FAILURE (CLAUDE.md, Failure-First):
 *   - every call has the 20 s timeout of the shared Meta transport;
 *   - a temporary failure (rate limit, 5xx, timeout) is retried up to 3 attempts, 2 s then 4 s;
 *     a permanent one (bad token, missing permission) is not retried;
 *   - after the last attempt the run is recorded `failure` with an error class, nothing is written
 *     (rows are written in one transaction only after every page has arrived), and the previous
 *     day's data stays as it was. Recovery is the next scheduled run or the "Sync now" button.
 *   - a non-USD ad account is refused outright rather than summed as dollars.
 */

export interface MetaAdsConfig {
  configured: boolean;
  accountId: string | null;
  reason: string | null;
}

export function readMetaAdsConfig(env: NodeJS.ProcessEnv = process.env): MetaAdsConfig & { token: string | null } {
  const token = env.META_ADS_ACCESS_TOKEN?.trim() || null;
  const rawAccount = env.META_AD_ACCOUNT_ID?.trim().replace(/^act_/, '') || null;
  const accountId = rawAccount && /^\d{5,25}$/.test(rawAccount) ? rawAccount : null;
  let reason: string | null = null;
  if (!token && !rawAccount) reason = 'META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID are not set.';
  else if (!token) reason = 'META_ADS_ACCESS_TOKEN is not set.';
  else if (!rawAccount) reason = 'META_AD_ACCOUNT_ID is not set.';
  else if (!accountId) reason = 'META_AD_ACCOUNT_ID is not a numeric ad account id.';
  return { configured: !!token && !!accountId, accountId, reason, token };
}

export type SyncOutcome = 'success' | 'failure' | 'skipped';

export interface SyncResult {
  outcome: SyncOutcome;
  rowsWritten: number;
  rangeStart: string;
  rangeEnd: string;
  errorClass: string | null;
  error: string | null;
}

export interface SyncDeps {
  http: MetaHttp;
  sleep: (ms: number) => Promise<void>;
  env: NodeJS.ProcessEnv;
  write: (rows: SpendInput[]) => Promise<number>;
}

const MAX_PAGES = 50;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2000, 4000];

/** Today's date in Central, where the ad account and every reader of the report live. */
export function centralToday(nowMs: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(nowMs));
}

export function shiftDay(day: string, deltaDays: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Ads Insights throttling: codes 80000-80014 (e.g. 80004 "too many calls to this ad account"),
 * sent with HTTP 400. The shared publishing classifier does not know them and calls a 4xx
 * permanent, so they are recognised here and retried.
 */
const isAdsThrottle = (err: ProviderPublishError) => {
  const code = Number(err.providerCode);
  return Number.isInteger(code) && code >= 80000 && code <= 80014;
};

function isTemporary(err: unknown): boolean {
  if (err instanceof ProviderPublishError) return isAdsThrottle(err) || !err.permanent;
  return true; // transport errors and timeouts
}

function errorClassOf(err: unknown): string {
  if (err instanceof ProviderPublishError) {
    if (isAdsThrottle(err)) return 'RateLimitError';
    if (err.providerCode === '190') return 'AuthError';
    if (err.providerCode && ['10', '200'].includes(err.providerCode)) return 'AuthError';
    if (err.httpStatus === 429 || (err.providerCode && ['4', '17', '32', '613'].includes(err.providerCode))) return 'RateLimitError';
    return err.permanent ? 'ValidationError' : 'UpstreamUnavailable';
  }
  if (err instanceof Error && err.name === 'MetaTransportError') return /did not respond/.test(err.message) ? 'TimeoutError' : 'UpstreamUnavailable';
  if (err instanceof Error && err.name === 'ContractViolation') return 'ContractViolation';
  return 'UpstreamUnavailable';
}

async function withRetry<T>(deps: SyncDeps, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTemporary(err) || attempt === MAX_ATTEMPTS) break;
      await deps.sleep(BACKOFF_MS[attempt - 1] ?? 4000);
    }
  }
  throw last;
}

class ContractViolation extends Error {
  constructor(message: string) { super(message); this.name = 'ContractViolation'; }
}

interface InsightRow {
  campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string;
  date_start?: string; date_stop?: string; publisher_platform?: string;
}

/** Map one API row to a spend input, or null when it is not usable (logged by the caller as skipped). */
export function insightToInput(row: InsightRow, accountId: string): SpendInput | null {
  const cents = parseMoneyToCents(row.spend ?? null);
  if (!row.campaign_id || !row.date_start || cents === null) return null;
  const parsed = SpendInputSchema.safeParse({
    platform: 'meta',
    accountId,
    campaignRef: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    placement: normalisePlacement(row.publisher_platform),
    periodStart: row.date_start,
    periodEnd: row.date_stop ?? row.date_start,
    amountCents: cents,
    impressions: row.impressions != null ? Number(row.impressions) || 0 : null,
    clicks: row.clicks != null ? Number(row.clicks) || 0 : null,
    note: null,
  });
  return parsed.success ? parsed.data : null;
}

/** Fetch and write. Pure of the database except through `deps.write`, so it is tested end to end with a fake Meta. */
export async function runMetaSpendSync(
  range: { since: string; until: string },
  deps: SyncDeps,
): Promise<SyncResult> {
  const base = { rangeStart: range.since, rangeEnd: range.until };
  const cfg = readMetaAdsConfig(deps.env);
  if (!cfg.configured || !cfg.token || !cfg.accountId) {
    return { ...base, outcome: 'skipped', rowsWritten: 0, errorClass: 'NotConfigured', error: cfg.reason };
  }
  const token = cfg.token;
  const accountId = cfg.accountId;

  try {
    const account = await withRetry(deps, () => callGraph(deps.http, {
      method: 'GET',
      url: `${graphUrl(`/act_${accountId}`, deps.env)}?${new URLSearchParams({ fields: 'currency,name', access_token: token })}`,
      what: 'the ad account lookup',
    }));
    if (account.currency && String(account.currency).toUpperCase() !== 'USD') {
      throw new ContractViolation(`Ad account currency is ${account.currency}; spend is recorded in USD only.`);
    }

    const params = new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_id,campaign_name,spend,impressions,clicks',
      breakdowns: 'publisher_platform',
      time_increment: '1',
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      limit: '500',
      access_token: token,
    });
    let url: string | null = `${graphUrl(`/act_${accountId}/insights`, deps.env)}?${params}`;
    const inputs: SpendInput[] = [];
    let pages = 0;
    while (url && pages < MAX_PAGES) {
      const pageUrl: string = url;
      const body = await withRetry(deps, () => callGraph(deps.http, { method: 'GET', url: pageUrl, what: 'the spend report' }));
      const data = Array.isArray(body.data) ? (body.data as InsightRow[]) : [];
      for (const row of data) {
        const input = insightToInput(row, accountId);
        if (input) inputs.push(input);
      }
      url = typeof body.paging?.next === 'string' ? body.paging.next : null;
      pages += 1;
    }
    if (url) throw new ContractViolation(`Spend report ran past ${MAX_PAGES} pages; narrow the range.`);

    const rowsWritten = await deps.write(inputs);
    return { ...base, outcome: 'success', rowsWritten, errorClass: null, error: null };
  } catch (err) {
    // The token is only ever in a URL, and these messages are built from Meta's error body, not the URL.
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, outcome: 'failure', rowsWritten: 0, errorClass: errorClassOf(err), error: message.slice(0, 500) };
  }
}

/** The production entry point: real transport, real sleep, the ledger as the writer, and a sync record. */
export async function syncMetaSpend(opts: { days?: number; triggeredBy: string; nowMs?: number }): Promise<SyncResult> {
  const until = centralToday(opts.nowMs);
  const since = shiftDay(until, -Math.min(Math.max(opts.days ?? 30, 1), 90) + 1);
  const [{ id }] = await sequelize.query<{ id: string }>(
    `INSERT INTO marketing_spend_syncs (platform, range_start, range_end, triggered_by) VALUES ('meta', :since, :until, :by) RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { since, until, by: opts.triggeredBy } },
  );
  const started = Date.now();
  const result = await runMetaSpendSync({ since, until }, {
    http: makeMetaHttp(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    env: process.env,
    write: (rows) => upsertSpend(rows, 'meta_api', 'meta-sync'),
  });
  await sequelize.query(
    `UPDATE marketing_spend_syncs SET finished_at = now(), outcome = :outcome, rows_written = :rows,
            error_class = :errorClass, error = :error WHERE id = :id`,
    { replacements: { id, outcome: result.outcome, rows: result.rowsWritten, errorClass: result.errorClass, error: result.error } },
  );
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: result.outcome === 'failure' ? 'error' : 'info', service: 'backend',
    event: 'meta_spend_sync', outcome: result.outcome, duration_ms: Date.now() - started,
    error_class: result.errorClass ?? undefined,
    context: { since, until, rows: result.rowsWritten, triggered_by: opts.triggeredBy },
  }));
  return result;
}

export interface SyncStatus {
  meta: MetaAdsConfig;
  lastSync: null | {
    startedAt: string; finishedAt: string | null; outcome: string; rowsWritten: number;
    errorClass: string | null; error: string | null; rangeStart: string | null; rangeEnd: string | null;
  };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const { token: _token, ...meta } = readMetaAdsConfig();
  void _token; // never returned to the browser
  const rows = await sequelize.query<{
    started_at: string; finished_at: string | null; outcome: string; rows_written: number;
    error_class: string | null; error: string | null; range_start: string | null; range_end: string | null;
  }>(
    `SELECT started_at, finished_at, outcome, rows_written, error_class, error,
            range_start::text AS range_start, range_end::text AS range_end
       FROM marketing_spend_syncs WHERE platform = 'meta' ORDER BY started_at DESC LIMIT 1`,
    { type: QueryTypes.SELECT },
  );
  const r = rows[0];
  return {
    meta,
    lastSync: r ? {
      startedAt: new Date(r.started_at).toISOString(),
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      outcome: r.outcome, rowsWritten: r.rows_written, errorClass: r.error_class, error: r.error,
      rangeStart: r.range_start ? String(r.range_start).slice(0, 10) : null,
      rangeEnd: r.range_end ? String(r.range_end).slice(0, 10) : null,
    } : null,
  };
}
