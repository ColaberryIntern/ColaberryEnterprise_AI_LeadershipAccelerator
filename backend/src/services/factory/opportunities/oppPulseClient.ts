/**
 * oppPulseClient — fetch the ranked best-fit government opportunities from Opportunity Pulse (the external
 * Bonfire platform at op.colaberry.ai) when configured, and DEGRADE DARK to the curated in-app snapshot
 * otherwise. Failure-first: every outbound call has an explicit timeout, login retries once, errors are
 * classified, and ANY missing-config/failure falls back to the snapshot. This function NEVER throws and
 * NEVER logs the credentials.
 *
 * Configuration (all read from env at call time):
 *   OP_ADMIN_EMAIL, OP_ADMIN_PASSWORD  — Opportunity Pulse admin login (secrets; env only)
 *   OPPORTUNITY_PULSE_BASE             — default https://op.colaberry.ai
 *   OPPORTUNITY_PULSE_LIST_PATH        — the ranked best-fit list endpoint (unknown in-repo; set to light up)
 *
 * NOTE (evidence discipline): the LIVE list response shape is NOT known in this repo — our code only ever
 * fetched a single opportunity by uuid. `mapOpportunity` is a best-effort tolerant mapper to be VERIFIED
 * once the real endpoint is configured; until then the snapshot is what ships.
 */
import { GovOpportunity, GovOpportunityFeed, GOV_OPPORTUNITY_SNAPSHOT, SNAPSHOT_DATE } from './govOpportunity';

const DEFAULT_BASE = 'https://op.colaberry.ai';
const LOGIN_PATH = '/api/v1/auth/login';
const TIMEOUT_MS = 8000;

function snapshotFeed(): GovOpportunityFeed {
  return { opportunities: [...GOV_OPPORTUNITY_SNAPSHOT], source: 'snapshot', snapshotDate: SNAPSHOT_DATE };
}

const toNum = (v: unknown): number | null =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

/**
 * Tolerant mapper for a single raw opportunity from the (unknown-shape) live list. Reads common field-name
 * variants; returns null when the two required anchors (uuid + title) are absent, so junk rows are dropped
 * rather than rendered.
 */
export function mapOpportunity(raw: any): GovOpportunity | null {
  if (!raw || typeof raw !== 'object') return null;
  const uuid = raw.uuid ?? raw.id ?? raw.opportunityId ?? raw.opportunity_id ?? null;
  const title = raw.title ?? raw.name ?? raw.opportunityTitle ?? raw.opportunity_title ?? null;
  if (!uuid || !title) return null;
  return {
    uuid: String(uuid),
    title: String(title),
    agency: String(raw.agency ?? raw.agencyName ?? raw.agency_name ?? raw.buyer ?? ''),
    closeDate: raw.closeDate ?? raw.close_date ?? raw.deadline ?? raw.dueDate ?? raw.due_date ?? null,
    fitScore: toNum(raw.fit ?? raw.fitScore ?? raw.fit_score ?? raw.score ?? raw.matchScore),
    estimatedValue: toNum(raw.value ?? raw.estimatedValue ?? raw.estimated_value),
    sourceUrl: raw.sourceUrl ?? raw.source_url ?? raw.bonfire ?? raw.url ?? null,
    pursued: raw.pursued === undefined ? undefined : !!raw.pursued,
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

async function login(base: string, email: string, password: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchWithTimeout(`${base}${LOGIN_PATH}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }, TIMEOUT_MS);
      if (r.ok) {
        const d: any = await r.json().catch(() => null);
        const token = d?.data?.accessToken ?? null;
        if (token) return token;
      }
    } catch {
      // timeout / network — retry once, then give up (caller falls back to the snapshot)
    }
  }
  return null;
}

/**
 * The ranked best-fit gov opportunities: live from Opportunity Pulse when configured, else the labeled
 * snapshot. Never throws.
 */
export async function fetchBestFitOpportunities(): Promise<GovOpportunityFeed> {
  const base = process.env.OPPORTUNITY_PULSE_BASE || DEFAULT_BASE;
  const listPath = process.env.OPPORTUNITY_PULSE_LIST_PATH;
  const email = process.env.OP_ADMIN_EMAIL;
  const password = process.env.OP_ADMIN_PASSWORD;

  // Not configured → degrade dark, no network call.
  if (!listPath || !email || !password) return snapshotFeed();

  try {
    const token = await login(base, email, password);
    if (!token) return snapshotFeed();

    const listR = await fetchWithTimeout(`${base}${listPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, TIMEOUT_MS);
    if (!listR.ok) return snapshotFeed();

    const body: any = await listR.json().catch(() => null);
    const rows = Array.isArray(body) ? body : (body?.data ?? body?.opportunities ?? body?.items ?? null);
    if (!Array.isArray(rows)) return snapshotFeed(); // unexpected shape → fall back

    // A successful, well-shaped response IS the live truth — even if it maps to zero (the one-time mapping
    // verification when Ali configures the endpoint would catch a shape mismatch here).
    const opportunities = rows
      .map(mapOpportunity)
      .filter((o): o is GovOpportunity => o !== null);
    return { opportunities, source: 'live', snapshotDate: null };
  } catch {
    return snapshotFeed(); // any error → snapshot; never throw
  }
}
