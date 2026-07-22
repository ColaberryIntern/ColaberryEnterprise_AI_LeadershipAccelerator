/**
 * marketIntelligenceSource — the "Market Intelligence" intel source adapter.
 *
 * COLLECT-only adapter over an internal Opportunity Pulse REST API. It self-
 * registers with the generic intel engine at module load (slug `market_intelligence`),
 * so importing this file wires the pipeline; the engine (intelPipeline) owns
 * ingest / score / materialize / publish. This module owns exactly one thing:
 * turning an Opportunity Pulse response into NormalizedIntelItem[].
 *
 * DEGRADE-DARK (the non-negotiable requirement): the base URL MAY NOT be present
 * in prod. If OPPORTUNITY_PULSE_URL is missing/empty, collect() logs a single skip
 * line and returns [] WITHOUT making a request and WITHOUT throwing — the generator
 * ships dark and produces nothing until the endpoint is provided.
 *
 * SCHEMA-UNCERTAIN: the exact Opportunity Pulse payload is not a contract we own,
 * so the response is read defensively — either `{items:[...]}` or a bare array is
 * tolerated, and each record's fields are probed under several common names
 * (id/title/name, url/link, summary/description/excerpt, date/published_at/
 * created_at). Records without a usable identity or title are skipped.
 *
 * FAIL-FIRST: collect() NEVER throws. Network failure (shared fetchWithTimeout:
 * hard timeout + capped retries), a non-2xx status, or malformed JSON are each
 * caught, logged, and degraded to []. The optional bearer token is never logged.
 */
import { NormalizedIntelItem, registerIntelSource } from '../intelRegistry';
import { fetchWithTimeout } from '../intelHttp';

export const SLUG = 'market_intelligence';

/** Minimal, permissive shape of one Opportunity Pulse record. Every field is
 *  optional and multiply-named because the upstream schema is uncertain; the
 *  adapter probes these in priority order and skips records it can't identify. */
interface OpportunityRecord {
  id?: string | number;
  title?: string;
  name?: string;
  url?: string;
  link?: string;
  summary?: string;
  description?: string;
  excerpt?: string;
  date?: string;
  published_at?: string;
  created_at?: string;
}
interface OpportunityListResponse {
  items?: OpportunityRecord[];
}

/** First non-empty string among the candidates (numbers are coerced), else null. */
function firstString(...vals: Array<string | number | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Parse an upstream date string to a Date, or null when absent/invalid. */
function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Resolve the list endpoint: use the base as-is if it already targets the
 *  opportunities collection, else append `/opportunities` (trailing slash safe). */
function resolveEndpoint(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return /\/opportunities$/i.test(trimmed) ? trimmed : `${trimmed}/opportunities`;
}

/** Normalize one record, or null if it lacks a stable identity or a title. */
function toItem(rec: OpportunityRecord): NormalizedIntelItem | null {
  if (!rec || typeof rec !== 'object') return null;
  const url = firstString(rec.url, rec.link);
  const idPart = rec.id != null ? String(rec.id) : url;
  const title = firstString(rec.title, rec.name);
  if (!idPart || !title) return null; // malformed — no guid source or no title
  return {
    guid: `op:${idPart}`,
    source: 'Opportunity Pulse',
    title,
    url: url || null,
    excerpt: firstString(rec.summary, rec.description, rec.excerpt),
    publishedAt: parseDate(firstString(rec.date, rec.published_at, rec.created_at)),
  };
}

/**
 * Fetch Opportunity Pulse records and normalize them. Degrades to [] (never
 * throws) when the base URL is absent, the request fails, or the payload is
 * malformed. An optional Bearer token authenticates the request when present.
 */
export async function collect(): Promise<NormalizedIntelItem[]> {
  const base = (process.env.OPPORTUNITY_PULSE_URL || '').trim();
  if (!base) {
    console.warn(`[intel] ${SLUG}: OPPORTUNITY_PULSE_URL not set — skipping`);
    return [];
  }
  const token = (process.env.OPPORTUNITY_PULSE_TOKEN || '').trim();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`; // token is never logged

  const url = resolveEndpoint(base);
  let body: string;
  try {
    body = await fetchWithTimeout(url, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn(`[intel] ${SLUG}: fetch failed — ${msg}`);
    return [];
  }

  // any: the parsed JSON is genuinely of unknown shape (uncertain upstream schema);
  // it is immediately narrowed to a bare array or {items:[]} before use.
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    console.warn(`[intel] ${SLUG}: malformed JSON response — skipping`);
    return [];
  }

  const list: OpportunityRecord[] = Array.isArray(raw)
    ? (raw as OpportunityRecord[])
    : Array.isArray((raw as OpportunityListResponse)?.items)
      ? ((raw as OpportunityListResponse).items as OpportunityRecord[])
      : [];

  const items: NormalizedIntelItem[] = [];
  for (const rec of list) {
    const item = toItem(rec);
    if (item) items.push(item);
  }
  return items;
}

// Self-register at module load (last-write-wins; idempotent under re-import).
registerIntelSource({
  slug: SLUG,
  label: 'Market Intelligence',
  enableEnv: 'MARKET_INTELLIGENCE_INGEST_ENABLED',
  maxPerRunEnv: 'MARKET_INTELLIGENCE_MAX_PER_RUN',
  collect,
});
