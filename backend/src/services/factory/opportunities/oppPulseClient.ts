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
 *   OPPORTUNITY_PULSE_LIST_PATH        — the ranked best-fit list endpoint. Set to the Bonfire list:
 *                                        /api/v1/bonfire/opportunities?order=priority_desc&limit=10
 *
 * The LIVE list is the Opportunity Pulse Bonfire endpoint `GET /api/v1/bonfire/opportunities` (Bearer admin
 * token). Each row is a BonfireOpportunity: { id(uuid), title, agency, priorityScore, fitScore,
 * estimatedValue (BIGINT CENTS), closeDate, sourceUrl, aiCategory, pursuitStatus, ... }. `sourceUrl` is
 * returned only for an ADMIN token (redacted otherwise), so OP_ADMIN_EMAIL must be an OP admin account.
 * `mapOpportunity` converts the cents value to dollars and reads the priority/category/pursuit fields.
 */
import { GovOpportunity, GovOpportunityFeed, GOV_OPPORTUNITY_SNAPSHOT, SNAPSHOT_DATE } from './govOpportunity';

const DEFAULT_BASE = 'https://op.colaberry.ai';
const LOGIN_PATH = '/api/v1/auth/login';
const TIMEOUT_MS = 8000;

function snapshotFeed(): GovOpportunityFeed {
  return { opportunities: [...GOV_OPPORTUNITY_SNAPSHOT], source: 'snapshot', snapshotDate: SNAPSHOT_DATE };
}

/**
 * A LIVE-path failure fell back to the snapshot. Structured, classified, and creds-free, so a configured
 * live pull never fails silently (CLAUDE.md Observability). The unconfigured path does NOT log — that is a
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

/**
 * Maps a raw BonfireOpportunity row from the live list to a GovOpportunity. Tolerant of field-name variants,
 * but grounded in the real shape: `estimatedValue` arrives in CENTS (converted to dollars here), the priority
 * and fit badges are `priorityScore`/`fitScore`, and pursuit is the `pursuitStatus` enum ('none' | 'pursuing'
 * | 'submitted'). Returns null when the two required anchors (uuid + title) are absent, so junk rows drop out.
 */
export function mapOpportunity(raw: any): GovOpportunity | null {
  if (!raw || typeof raw !== 'object') return null;
  const uuid = raw.uuid ?? raw.id ?? raw.opportunityId ?? raw.opportunity_id ?? null;
  const title = raw.title ?? raw.name ?? raw.opportunityTitle ?? raw.opportunity_title ?? null;
  if (!uuid || !title) return null;
  // The Bonfire feed stores value as BIGINT cents (ingest multiplies dollars x100); convert back to dollars.
  const cents = toNum(raw.estimatedValue ?? raw.estimated_value ?? raw.value);
  const pursuitStatus = raw.pursuitStatus ?? raw.pursuit_status;
  return {
    uuid: String(uuid),
    title: String(title),
    agency: String(raw.agency ?? raw.agencyName ?? raw.agency_name ?? raw.buyer ?? ''),
    closeDate: raw.closeDate ?? raw.close_date ?? raw.deadline ?? raw.dueDate ?? raw.due_date ?? null,
    fitScore: toNum(raw.fitScore ?? raw.fit_score ?? raw.fit ?? raw.score ?? raw.matchScore),
    priorityScore: toNum(raw.priorityScore ?? raw.priority_score ?? raw.priority),
    estimatedValue: cents === null ? null : Math.round(cents / 100),
    category: raw.aiCategory ?? raw.category ?? raw.categoryRaw ?? null,
    sourceUrl: raw.sourceUrl ?? raw.source_url ?? raw.bonfire ?? raw.url ?? null,
    pursued: pursuitStatus !== undefined && pursuitStatus !== null
      ? pursuitStatus !== 'none'
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
    if (!token) { logDegraded('opp_pulse_login_failed', { base }); return snapshotFeed(); }

    const listR = await fetchWithTimeout(`${base}${listPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, TIMEOUT_MS);
    if (!listR.ok) { logDegraded('opp_pulse_list_http', { status: listR.status }); return snapshotFeed(); }

    const body: any = await listR.json().catch(() => null);
    const rows = Array.isArray(body) ? body : (body?.data ?? body?.opportunities ?? body?.items ?? null);
    if (!Array.isArray(rows)) { logDegraded('opp_pulse_list_shape', {}); return snapshotFeed(); } // unexpected shape

    // A successful, well-shaped response IS the live truth — even if it maps to zero (the one-time mapping
    // verification when Ali configures the endpoint would catch a shape mismatch here).
    const opportunities = rows
      .map(mapOpportunity)
      .filter((o): o is GovOpportunity => o !== null);
    return { opportunities, source: 'live', snapshotDate: null };
  } catch (err: any) {
    logDegraded('opp_pulse_error', { error_class: err?.constructor?.name ?? 'Error', message: err?.message });
    return snapshotFeed(); // any error → snapshot; never throw
  }
}
