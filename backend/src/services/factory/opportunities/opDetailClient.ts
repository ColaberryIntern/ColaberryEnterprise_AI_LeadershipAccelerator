/**
 * opDetailClient — resolve a single gov-opportunity.v1 DETAIL by canonical id for the Enterprise server-side
 * approval binding. Two paths:
 *   - LIVE: Opportunity Pulse `GET {OPPORTUNITY_PULSE_V2_BASE}/api/v2/gov-opportunities/:id` — authenticated with
 *     the DEDICATED `OPPORTUNITY_PULSE_V2_API_KEY` (scope read:gov_opportunities), sent as `X-API-Key`; this is a
 *     SEPARATE credential from the v1 best-fit key and is never a fallback to it. Response is
 *     `{ status, message, code, data, diagnostics[], meta }`; the
 *     gov-opportunity.v1 object is at `.data` and the HONEST snapshot version is `meta.sourceSnapshotVersion`
 *     (null == unrecorded — `data.sourceSnapshotVersion` defaults to 1 and is NOT authoritative). Validated at the
 *     boundary against the pinned Zod schema. (OP PR #3 is UNDEPLOYED — this path is verified against the pinned
 *     contract with mocked fetch, NOT proven against a live service.)
 *   - FIXTURES: labeled samples, used ONLY when `NODE_ENV !== 'production'` AND no live base is configured.
 *
 * PRODUCTION FAIL-CLOSED: in production the fixture path is NEVER taken. With no live config in production the
 * resolver returns `unavailable`, so a production approval can never bind to fixture data — even if a caller
 * bypasses the UI and hits the service directly.
 *
 * `OPPORTUNITY_PULSE_V2_BASE` being set is NOT proof the source is live/authenticated/compatible/approval-ready;
 * the resolver reports the ACTUAL resolved state (available / degraded / snapshot_unrecorded / unavailable /
 * auth_failed / malformed) so callers surface the truth rather than an optimistic "configured".
 */
import { GOV_OPPORTUNITY_FIXTURES, GovOpportunityV1 } from './govOpportunityFixtures';
import { govOpportunityV1Schema, CANONICAL_ID_RE } from './govOpportunityV1.zod';

const DEFAULT_V2_PATH = '/api/v2/gov-opportunities';
const TIMEOUT_MS = 8000;

export type SourceState =
  | 'available' | 'degraded' | 'snapshot_unrecorded' | 'unavailable' | 'auth_failed' | 'malformed';

export interface GovOpportunityDetailResult {
  state: SourceState;
  /** Present for available | degraded | snapshot_unrecorded; null otherwise. */
  detail: GovOpportunityV1 | any | null;
  /** The HONEST snapshot version (fixture: metaSnapshotVersion ?? sourceSnapshotVersion; live: meta.sourceSnapshotVersion). */
  sourceSnapshotVersion: number | null;
  snapshotRecorded: boolean;
  availability: 'available' | 'degraded' | 'unknown';
  isFixture: boolean;
  reason?: string;
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

export function isLiveOpDetailConfigured(): boolean {
  // v2 uses its OWN dedicated read:gov_opportunities credential (OPPORTUNITY_PULSE_V2_API_KEY), never the v1
  // best-fit key (OPPORTUNITY_PULSE_API_KEY). No silent fallback: if the v2 key is absent, v2 is not configured
  // even when the v1 key is present.
  return !!(process.env.OPPORTUNITY_PULSE_V2_BASE && process.env.OPPORTUNITY_PULSE_V2_API_KEY);
}

function unresolved(state: SourceState, reason?: string): GovOpportunityDetailResult {
  return { state, detail: null, sourceSnapshotVersion: null, snapshotRecorded: false, availability: 'unknown', isFixture: false, reason };
}

/** Classify a present detail into available | degraded | snapshot_unrecorded (degraded takes precedence). */
function classifyPresent(detail: any, honestVersion: number | null, isFixture: boolean): GovOpportunityDetailResult {
  const degraded = detail?.sourceAvailability && detail.sourceAvailability.status === 'degraded';
  const snapshotRecorded = honestVersion !== null && honestVersion !== undefined;
  if (degraded) return { state: 'degraded', detail, sourceSnapshotVersion: honestVersion ?? null, snapshotRecorded, availability: 'degraded', isFixture, reason: 'serving_last_known_snapshot' };
  if (!snapshotRecorded) return { state: 'snapshot_unrecorded', detail, sourceSnapshotVersion: null, snapshotRecorded: false, availability: 'available', isFixture, reason: 'meta_snapshot_version_null' };
  return { state: 'available', detail, sourceSnapshotVersion: honestVersion ?? null, snapshotRecorded: true, availability: 'available', isFixture };
}

function resolveFixture(canonicalOpportunityId: string): GovOpportunityDetailResult {
  const fixture = GOV_OPPORTUNITY_FIXTURES[canonicalOpportunityId];
  if (!fixture) return unresolved('unavailable', 'unknown_canonical');
  if (fixture.sourceAvailability && fixture.sourceAvailability.status === 'unavailable') return unresolved('unavailable', 'source_outage');
  const honest = fixture.metaSnapshotVersion === undefined ? fixture.sourceSnapshotVersion : fixture.metaSnapshotVersion;
  return classifyPresent(fixture, honest, true);
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

/** LIVE v2 detail fetch + boundary validation. Never throws; classifies every failure. Never returns a fixture. */
async function resolveLive(canonicalOpportunityId: string): Promise<GovOpportunityDetailResult> {
  const base = process.env.OPPORTUNITY_PULSE_V2_BASE as string;
  const apiKey = process.env.OPPORTUNITY_PULSE_V2_API_KEY as string; // dedicated v2 credential; never the v1 key
  const path = process.env.OPPORTUNITY_PULSE_V2_PATH || DEFAULT_V2_PATH;
  // The id is already validated to `op:gov:<32hex>` (no path-breaking chars); the producer's route matches the
  // LITERAL colon form, so send it raw rather than percent-encoding the colons.
  const url = `${base}${path}/${canonicalOpportunityId}`;
  const headers = { 'X-API-Key': apiKey, Accept: 'application/json' };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchWithTimeout(url, { headers }, TIMEOUT_MS);
      if (r.status === 401 || r.status === 403) return unresolved('auth_failed', `http_${r.status}`);
      if (r.status === 404) return unresolved('unavailable', 'not_found');
      if (!r.ok) return unresolved('unavailable', `http_${r.status}`); // 400/429/5xx etc.
      const body: any = await r.json().catch(() => null);
      const data = body?.data;
      if (!data || typeof data !== 'object') return unresolved('malformed', 'no_data');
      const parsed = govOpportunityV1Schema.safeParse(data);
      if (!parsed.success) return unresolved('malformed', 'schema_validation_failed');
      if (!CANONICAL_ID_RE.test(String(data.canonicalOpportunityId)) || data.canonicalOpportunityId !== canonicalOpportunityId) {
        return unresolved('malformed', 'canonical_mismatch');
      }
      // meta.sourceSnapshotVersion is the HONEST value (null == unrecorded); data's is defaulted, not authoritative.
      const honest = body?.meta && Object.prototype.hasOwnProperty.call(body.meta, 'sourceSnapshotVersion')
        ? body.meta.sourceSnapshotVersion
        : null;
      // Bind the RAW data (nothing dropped); stamp the honest version for downstream binding.
      return classifyPresent({ ...data, metaSnapshotVersion: honest }, honest, false);
    } catch (err: any) {
      if (attempt === 0) continue; // one retry on network/timeout
      return unresolved('unavailable', err?.name === 'AbortError' ? 'timeout' : 'network_error');
    }
  }
  return unresolved('unavailable', 'exhausted');
}

/**
 * Resolve the normalized source-state for a canonical id. LIVE when configured; otherwise FIXTURES only outside
 * production; in production without live config → unavailable (fail closed). This is the authority the approval
 * path consumes.
 */
export async function resolveGovOpportunityDetail(canonicalOpportunityId: string): Promise<GovOpportunityDetailResult> {
  if (isLiveOpDetailConfigured()) return resolveLive(canonicalOpportunityId);
  if (isProduction()) return unresolved('unavailable', 'not_configured_in_production');
  return resolveFixture(canonicalOpportunityId);
}

/**
 * Back-compat helper: the detail object when the source is present (available | degraded | snapshot_unrecorded),
 * else null. Callers that need to distinguish the non-approvable states use resolveGovOpportunityDetail.
 */
export async function fetchGovOpportunityDetail(canonicalOpportunityId: string): Promise<GovOpportunityV1 | any | null> {
  const r = await resolveGovOpportunityDetail(canonicalOpportunityId);
  return r.detail;
}

/** A short, honest label of a resolved source-state for the workspace UI. */
export function describeSourceState(r: GovOpportunityDetailResult): string {
  switch (r.state) {
    case 'available': return 'available';
    case 'degraded': return 'degraded (serving last-known snapshot)';
    case 'snapshot_unrecorded': return 'snapshot not recorded';
    case 'auth_failed': return 'source authentication failed';
    case 'malformed': return 'source payload failed schema validation';
    default: return 'source unavailable';
  }
}
