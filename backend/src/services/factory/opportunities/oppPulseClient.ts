/**
 * oppPulseClient — fetch the ranked best-fit government opportunities from Opportunity Pulse (the external
 * Bonfire platform at op.colaberry.ai) when configured, and DEGRADE DARK to the curated in-app snapshot
 * otherwise. Failure-first: every outbound call has an explicit timeout, one retry, errors are classified,
 * and ANY missing-config/failure falls back to the snapshot. This function NEVER throws and NEVER logs the key.
 *
 * Configuration (all read from env at call time):
 *   OPPORTUNITY_PULSE_API_KEY   — a scoped read-only key (op_<64 hex>) OP mints for the accelerator. Sent as
 *                                 the `X-API-Key` header. It is NOT an admin account — writes stay 401 — but it
 *                                 has admin-level READ so `sourceUrl` is returned un-redacted.
 *   OPPORTUNITY_PULSE_BASE      — default https://op.colaberry.ai
 *   OPPORTUNITY_PULSE_LIST_PATH — default /api/v1/bonfire/best-fit?limit=10 (the digest-parity endpoint, which
 *                                 delegates to richDigest.topBonfire, so it matches the "Top 10 Bonfire
 *                                 Contracts to Bid" email; the generic /api/v1/bonfire/opportunities sorts
 *                                 NULL scores FIRST and is NOT the digest order).
 *
 * Each row is a BonfireOpportunity: { id(uuid), title, agency, priorityScore, fitScore (0-100 int, nullable),
 * estimatedValue (BIGINT CENTS returned as a JSON STRING), closeDate (ISO-8601 timestamptz), sourceUrl,
 * aiCategory, pursuitStatus ('none' | 'pursuing' | 'submitted' | 'declined'), ... } inside { data, pagination }.
 * NOTE: when BONFIRE_ENGINE_ENABLED is off, every /api/v1/bonfire/* route returns 404 — treated here as a
 * degrade, not a crash.
 */
import { GovOpportunity, GovOpportunityFeed, GOV_OPPORTUNITY_SNAPSHOT, SNAPSHOT_DATE } from './govOpportunity';

const DEFAULT_BASE = 'https://op.colaberry.ai';
const DEFAULT_LIST_PATH = '/api/v1/bonfire/best-fit?limit=10';
const TIMEOUT_MS = 8000;

function snapshotFeed(): GovOpportunityFeed {
  return { opportunities: [...GOV_OPPORTUNITY_SNAPSHOT], source: 'snapshot', snapshotDate: SNAPSHOT_DATE };
}

/**
 * A LIVE-path failure fell back to the snapshot. Structured, classified, and key-free, so a configured live
 * pull never fails silently (CLAUDE.md Observability). The unconfigured path does NOT log — that is a
 * deliberate dark state, not a failure.
 */
function logDegraded(event: string, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'opp-pulse',
    event, outcome: 'degraded', context,
  }));
}

const toNum = (v: unknown): number | null =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

/** ISO-8601 timestamptz (or date) -> YYYY-MM-DD for display; null/empty stays null. */
const toDateOnly = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v).slice(0, 10);

/**
 * Maps a raw BonfireOpportunity row to a GovOpportunity, grounded in the confirmed OP contract:
 *  - `estimatedValue` is BIGINT cents returned as a STRING; `toNum` coerces it, then we convert to dollars.
 *  - the badges are `priorityScore` / `fitScore` (0-100 ints, nullable until enriched).
 *  - `pursuitStatus` has FOUR values: only 'pursuing' and 'submitted' count as pursued ('none' and 'declined'
 *    do not).
 *  - `closeDate` is a full timestamptz, truncated to a date for display.
 * Returns null when the two required anchors (uuid + title) are absent, so junk rows drop out.
 */
export function mapOpportunity(raw: any): GovOpportunity | null {
  if (!raw || typeof raw !== 'object') return null;
  const uuid = raw.uuid ?? raw.id ?? raw.opportunityId ?? raw.opportunity_id ?? null;
  const title = raw.title ?? raw.name ?? raw.opportunityTitle ?? raw.opportunity_title ?? null;
  if (!uuid || !title) return null;
  const cents = toNum(raw.estimatedValue ?? raw.estimated_value ?? raw.value);
  const pursuitStatus = raw.pursuitStatus ?? raw.pursuit_status;
  return {
    uuid: String(uuid),
    title: String(title),
    agency: String(raw.agency ?? raw.agencyName ?? raw.agency_name ?? raw.buyer ?? ''),
    closeDate: toDateOnly(raw.closeDate ?? raw.close_date ?? raw.deadline ?? raw.dueDate ?? raw.due_date),
    fitScore: toNum(raw.fitScore ?? raw.fit_score ?? raw.fit ?? raw.score ?? raw.matchScore),
    priorityScore: toNum(raw.priorityScore ?? raw.priority_score ?? raw.priority),
    estimatedValue: cents === null ? null : Math.round(cents / 100),
    category: raw.aiCategory ?? raw.category ?? raw.categoryRaw ?? null,
    sourceUrl: raw.sourceUrl ?? raw.source_url ?? raw.bonfire ?? raw.url ?? null,
    pursued: pursuitStatus !== undefined && pursuitStatus !== null
      ? (pursuitStatus === 'pursuing' || pursuitStatus === 'submitted')
      : (raw.pursued === undefined ? undefined : !!raw.pursued),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The ranked best-fit gov opportunities: live from Opportunity Pulse when the API key is configured, else the
 * labeled snapshot. Never throws.
 */
export async function fetchBestFitOpportunities(): Promise<GovOpportunityFeed> {
  const base = process.env.OPPORTUNITY_PULSE_BASE || DEFAULT_BASE;
  const listPath = process.env.OPPORTUNITY_PULSE_LIST_PATH || DEFAULT_LIST_PATH;
  const apiKey = process.env.OPPORTUNITY_PULSE_API_KEY;

  // Not configured → degrade dark, no network call.
  if (!apiKey) return snapshotFeed();

  const url = `${base}${listPath}`;
  const headers = { 'X-API-Key': apiKey };

  // One retry on a network/timeout error (not on an HTTP error — a 4xx/5xx is authoritative).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const listR = await fetchWithTimeout(url, { headers }, TIMEOUT_MS);
      if (!listR.ok) {
        // BONFIRE_ENGINE_ENABLED off returns 404 for every /api/v1/bonfire/* route — a degrade, not a bug.
        logDegraded(listR.status === 404 ? 'opp_pulse_engine_off_or_path' : 'opp_pulse_list_http', { status: listR.status });
        return snapshotFeed();
      }
      const body: any = await listR.json().catch(() => null);
      // Confirmed envelope is { data: [...] }; trust `data`, not pagination.limit (which echoes the raw query).
      const rows = Array.isArray(body) ? body : (body?.data ?? body?.opportunities ?? body?.items ?? null);
      if (!Array.isArray(rows)) { logDegraded('opp_pulse_list_shape', {}); return snapshotFeed(); }

      const opportunities = rows
        .map(mapOpportunity)
        .filter((o): o is GovOpportunity => o !== null);
      return { opportunities, source: 'live', snapshotDate: null };
    } catch (err: any) {
      if (attempt === 0) continue; // retry once on network/timeout
      logDegraded('opp_pulse_error', { error_class: err?.constructor?.name ?? 'Error', message: err?.message });
      return snapshotFeed(); // any error → snapshot; never throw
    }
  }
  return snapshotFeed(); // unreachable; belt-and-suspenders
}
