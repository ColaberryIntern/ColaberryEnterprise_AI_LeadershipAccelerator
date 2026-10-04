/**
 * opListClient — the TRUSTED discovery→canonical mapping path. The v1 best-fit/bonfire feed exposes NO canonical
 * id, and a canonical id must NEVER be derived from a title or an integer id. Opportunity Pulse's v2 LIST
 * (`GET {OPPORTUNITY_PULSE_V2_BASE}/api/v2/gov-opportunities`) is the only surface that carries a
 * `canonicalOpportunityId` per item, so "start a qualification from a discovery candidate" sources the canonical
 * id here. When v2 is not configured or unavailable this degrades dark and reports the gap — it never fabricates
 * an id. (OP PR #3 is UNDEPLOYED; verified against the contract with mocked fetch, not proven live.)
 */
import { CANONICAL_ID_RE } from './govOpportunityV1.zod';

const DEFAULT_V2_PATH = '/api/v2/gov-opportunities';
const TIMEOUT_MS = 8000;

export interface GovCandidate {
  canonicalOpportunityId: string;
  title: string | null;
  agency: string | null;
  noticeType: string | null;
}
export interface GovCandidatesResult {
  available: boolean;
  /** Why the trusted mapping is unavailable — surfaced to the UI instead of a fabricated id. */
  reason?: 'not_configured' | 'source_failed';
  candidates: GovCandidate[];
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

/** Map one v2 list item to a candidate, or null. A row WITHOUT a valid `op:gov:<32hex>` canonical id is DROPPED —
 *  never back-filled from a title or an integer id. */
function mapCandidate(raw: any): GovCandidate | null {
  const id = raw?.canonicalOpportunityId;
  if (typeof id !== 'string' || !CANONICAL_ID_RE.test(id)) return null;
  return {
    canonicalOpportunityId: id,
    title: raw?.notice?.title ?? raw?.title ?? null,
    agency: raw?.publisher?.leadBuyer?.name ?? raw?.agency ?? null,
    noticeType: raw?.notice?.noticeType?.value ?? null,
  };
}

export async function fetchGovOpportunityCandidatesV2(): Promise<GovCandidatesResult> {
  const base = process.env.OPPORTUNITY_PULSE_V2_BASE;
  // v2 uses its OWN dedicated read:gov_opportunities credential — never the v1 best-fit key, no silent fallback.
  const apiKey = process.env.OPPORTUNITY_PULSE_V2_API_KEY;
  if (!base || !apiKey) return { available: false, reason: 'not_configured', candidates: [] };
  const path = process.env.OPPORTUNITY_PULSE_V2_PATH || DEFAULT_V2_PATH;
  const url = `${base}${path}`;
  try {
    const r = await fetchWithTimeout(url, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } }, TIMEOUT_MS);
    if (!r.ok) return { available: false, reason: 'source_failed', candidates: [] };
    const body: any = await r.json().catch(() => null);
    const rows = Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : null);
    if (!Array.isArray(rows)) return { available: false, reason: 'source_failed', candidates: [] };
    const candidates = rows.map(mapCandidate).filter((c): c is GovCandidate => c !== null);
    return { available: true, candidates };
  } catch {
    return { available: false, reason: 'source_failed', candidates: [] };
  }
}
