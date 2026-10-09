import api from '../utils/api';

/**
 * growthJourneyApi — typed client for the Growth Journey OS workspace (Phase 6).
 *
 * One function per route, and the types mirror the backend BY HAND. There is no
 * shared-types package in this repo; `capeApi.ts` and `explorerGrowthApi.ts`
 * both record that as the standing convention, and this follows it.
 *
 * ── WHAT IS HERE, AND WHAT IS DELIBERATELY NOT ──────────────────────────────
 *
 * T613 builds two surfaces: the workspace shell with its Overview tab, and the
 * handoff detail page. This file exports EIGHT functions: seven that call a route -
 * the three `/status` reads, the handoff detail, and the three handoff moves - plus
 * `handoffConflict`, which is a pure predicate over an error shape and reaches no
 * network. There are no non-exported functions. The other EIGHT tabs the shell
 * declares - `classification`, `decisions`, `shadow`, `content`, `handoffs`,
 * `experiments`, `performance`, `controls` - are later tasks, and their routes are
 * absent on purpose rather than stubbed: a function that exists but is never called
 * reads as finished work.
 *
 * THIS COUNT IS NOW DERIVED, AND THE PREVIOUS THREE WERE NOT. It said "eight
 * functions" while naming seven tabs; then "six functions, which is every function
 * this file has", asserted to have been re-derived when it had been counted by eye -
 * the file had eight and the sentence's own enumeration gave seven, so no reading
 * produced six. The figure above comes from
 * `grep -cE "^export (const|function|async function)"` over this file (8) and
 * `grep -nE "^(function|const [a-zA-Z]+ = \()"` for private ones (none). A number
 * about a file should come from a command run against that file.
 *
 * ── THE MASTER FLAG MAKES A ROUTE 404, AND NOTHING HERE MEETS IT YET ────────
 *
 * `growthJourneyRoutes` gates the whole prefix on `GROWTH_JOURNEY_ENABLED` and
 * answers a bare `{ error: 'Not found' }` when it is off - the route genuinely does
 * not exist. But the three `/status` reads are exempt by design (T604) and they are
 * the only gated-prefix reads these surfaces make, so no screen here can currently
 * meet that 404: `GrowthJourneyPage` derives the off state from
 * `registry.flags.master`, which is readable either way.
 *
 * A switched-off predicate lived here and this paragraph claimed the page used it.
 * IT HAD NO CALL SITE - which breaks the standard set two paragraphs above, in the
 * same file. It is deleted rather than left looking wired; the task that builds a tab
 * reading a gated route is the task that needs it. The handoff QUEUE read went the
 * same way, because the handoffs tab is not built either.
 *
 * ── EVERY `id` IS AN ID ─────────────────────────────────────────────────────
 *
 * No type here carries an email. The backend's rule for this whole phase is that
 * ids are never addresses, and the actor on a handoff move is the admin's `sub`.
 * The one field that is NOT guaranteed clean is the handoff `packet`, which is a
 * free-form JSONB column - see `HandoffDetail` below.
 */

/*
 * `/api`, not `/admin`. This was `'/admin/growth-journey'` through T613 and every
 * call in this file therefore reached NOTHING in a deployed build:
 *
 *   - the backend serves `/api/admin/growth-journey` (growthJourneyRoutes.ts:75,
 *     growthJourneyStatusRoutes.ts:44, growthJourneyReadRoutes.ts:48);
 *   - `utils/api.ts` sets `baseURL: process.env.REACT_APP_API_URL || ''`, and
 *     `nginx/Dockerfile:8` hardcodes `ENV REACT_APP_API_URL=` (empty), so the path
 *     is sent verbatim;
 *   - there is no `proxy` field in package.json and no `setupProxy.js`;
 *   - `nginx/nginx.conf:95` proxies only `location /api/` to the backend.
 *
 * So `/admin/growth-journey/status/registry` fell through to `location /` - and
 * because `/admin/growth-journey` is ALSO a React route (adminRoutes.tsx:187), it
 * returned index.html with 200 OK rather than a 404. All 10 sibling admin services
 * carry the prefix; this file was the only one that did not, including the
 * `explorerGrowthApi.ts` this page was modelled on (its BASE is
 * `/api/admin/explorer-growth`).
 *
 * NO TEST COULD HAVE CAUGHT THIS. Every suite on this surface mocks this module
 * wholesale, so the one string none of them exercises is the base path. The
 * contract test added alongside this fix is what closes that loop.
 */
const BASE = '/api/admin/growth-journey';

// ─── status/registry (T604) ──────────────────────────────────────────────────

/** Mirrors `backend/src/services/growthJourney/journeyTerminology.ts`. */
export interface JourneyTerminology {
  subject: string;
  relationship: string;
  pipeline: string;
}

export interface StatusRegistryBrand {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  status: string;
  default_journey_program_id: string | null;
}

export interface StatusRegistryProgram {
  id: string;
  brand_id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  /** Null when the seed has not run on this row. */
  terminology: JourneyTerminology | null;
}

export interface StatusRegistryPath {
  program_id: string;
  offer_family: string;
  name: string;
  status: string;
}

export interface StatusRegistryAgent {
  agent_name: string;
  /** Null when the registry declares the agent but no row is seeded. */
  enabled: boolean | null;
  last_run_at: string | null;
}

/** The six switches as they are SET. Mirrors `growthJourneyFlagSummary`. */
export interface GrowthJourneyFlagSummary {
  master: boolean;
  signal_ingest: boolean;
  classification: boolean;
  decisions: boolean;
  handoffs: boolean;
  execution: boolean;
}

export interface StatusRegistry {
  brands: StatusRegistryBrand[];
  programs: StatusRegistryProgram[];
  paths: StatusRegistryPath[];
  flags: GrowthJourneyFlagSummary;
  /**
   * Every journey read scopes by the caller's memberships. With none, every
   * admin sees an empty system that looks identical to a working one with no
   * data - which is why the page has a state for this and not just a spinner.
   */
  memberships_populated: boolean;
  agents: StatusRegistryAgent[];
}

export const getStatusRegistry = (): Promise<StatusRegistry> =>
  api.get<StatusRegistry>(`${BASE}/status/registry`).then((r) => r.data);

// ─── status/readiness (T610) ─────────────────────────────────────────────────

export interface ReadinessItem {
  key: string;
  /** `null` is "not knowable from here" - never counted ready, never counted known. */
  ready: boolean | null;
  reason: string;
  next_move: string;
}

export interface Readiness {
  items: ReadinessItem[];
  score: { ready: number; known: number; unknown: number; pct: number | null };
  /** The first blocked item's key in list order, or null when nothing blocks. */
  next_move: string | null;
  as_of: string;
}

export const getReadiness = (): Promise<Readiness> =>
  api.get<Readiness>(`${BASE}/status/readiness`).then((r) => r.data);

// ─── status/health (T609) ────────────────────────────────────────────────────

/*
 * ── THESE THREE TYPES WERE WRONG UNTIL T614 ─────────────────────────────────
 *
 * Types in this repo are hand-mirrored (there is no shared-types package), and
 * three of them had drifted from what the backend actually serves. The field
 * names below are now copied from `backend/src/services/growthJourney/health/
 * journeyHealth.ts` L107-122, and `__tests__/healthContract.test.ts` reads that
 * file and fails if they drift again.
 *
 * What the drift cost: `StatusAge.oldest_hours` and `CronHealth.agent_name` do
 * not exist on the wire (they are `max_age_hours` and `agent`), and
 * `TruncatedRead` was declared an object when the backend sends a bare string
 * union - so the Overview health panel rendered `undefined` for the receipt age
 * and the cron name, and "undefined (cap undefined)" for a capped read. The
 * suite passed throughout, because its fixture was built from THESE types: a
 * closed loop in which the test and the code agreed with each other and both
 * disagreed with the server.
 */

export interface StatusAge {
  status: string;
  count: number;
  max_age_hours: number | null;
}

export type CronState = 'on_time' | 'late' | 'never' | 'disabled';

export interface CronHealth {
  agent: string;
  /** The cron expression, which is what makes a missing run readable as late vs dark. */
  schedule: string;
  state: CronState;
  last_run_at: string | null;
  minutes_since: number | null;
}

/**
 * A read whose row cap was reached, so a caller can tell a total from a floor.
 * A bare name, not an object: the backend sends `['receipts', 'held']`.
 */
export type TruncatedRead = 'receipts' | 'held' | 'refused' | 'controls';

export interface JourneyHealth {
  receipts: StatusAge[];
  stuck_pending_review: { count: number; over_hours: number };
  held: { total: number; by_reason: Record<string, number> };
  refused: { total: number; by_reason: Record<string, number>; capped: boolean };
  crons: CronHealth[];
  controls: Record<string, number>;
  journey_hold_rows: number;
  ledger_read: 'ok' | 'timed_out' | 'failed';
  window_hours: number;
  as_of: string;
  /** Empty is the normal answer and means every count above is complete. */
  truncated: TruncatedRead[];
}

export const getHealth = (): Promise<JourneyHealth> =>
  api.get<JourneyHealth>(`${BASE}/status/health`).then((r) => r.data);

// ─── handoffs (T404, T410) ───────────────────────────────────────────────────

/**
 * One handoff row as the queue serves it.
 *
 * Every field is optional-and-narrow rather than `unknown`: the backend builds
 * this view column by column from `HANDOFF_LIST_ATTRIBUTES`, so the names are
 * fixed, but the detail page reads only a few of them and a missing one must
 * render as absent rather than crash a page an operator is mid-task on.
 */
export interface HandoffRow {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  program_id: string | null;
  subject_ref: string;
  lead_id: number | null;
  enrollment_id: string | null;
  decision_id: string | null;
  owner_queue: string;
  assigned_to_type: string | null;
  assigned_to_id: string | null;
  ticket_id: string | null;
  assignment_blocked_reason: string | null;
  priority: string | null;
  expected_value: number | null;
  urgent: boolean;
  reason: string;
  best_channel: string | null;
  consent_basis: string | null;
  sla_due_at: string | null;
  status: string;
  disposition: string | null;
  disposition_reason: string | null;
  disposition_at: string | null;
  dispositioned_by: string | null;
  return_to_ai: unknown;
  integration_refused: unknown;
  accepted_at: string | null;
  expired_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  qualification_gaps: string[] | null;
  talking_points: string[] | null;
}

export interface HandoffDetail {
  handoff: HandoffRow;
  /**
   * The evidence column, free-form JSONB.
   *
   * NOT GUARANTEED ADDRESS-FREE. The plan for this task asserted "the packet
   * already carries no address"; T612's privacy sweep found the opposite -
   * `GET /handoffs/:id` serves `evidence` whole, and this repo's own fixtures
   * seed it with `{ contact: 'lead@example.com' }` because that is what the
   * column is for. Whether the route should scrub is Ali's call (it changes an
   * admin API payload); until it does, the detail page renders this through its
   * own redaction rather than trusting the claim.
   */
  packet: Record<string, unknown>;
}

export const getHandoff = (id: string): Promise<HandoffDetail> =>
  api.get<HandoffDetail>(`${BASE}/handoffs/${id}`).then((r) => r.data);

/** The body of an illegal transition: the machine decides, not the route. */
export interface HandoffConflict {
  error: string;
  error_class: string;
  /** The status the row was in, which is why the move was refused. */
  from: string;
}

/** The conflict body if this error is one, else null. A 409 is an answer, not a fault. */
export function handoffConflict(err: unknown): HandoffConflict | null {
  const e = err as { response?: { status?: number; data?: HandoffConflict } };
  if (e?.response?.status !== 409 || !e.response.data?.error) return null;
  return e.response.data;
}

export const acceptHandoff = (id: string): Promise<{ status: string }> =>
  api.post<{ status: string }>(`${BASE}/handoffs/${id}/accept`, {}).then((r) => r.data);

export const dispositionHandoff = (
  id: string,
  body: { disposition: string; reason: string },
): Promise<{ status: string }> =>
  api.post<{ status: string }>(`${BASE}/handoffs/${id}/disposition`, body).then((r) => r.data);

export const releaseHandoff = (id: string, body: { reason?: string } = {}): Promise<{ status: string }> =>
  api.post<{ status: string }>(`${BASE}/handoffs/${id}/release`, body).then((r) => r.data);
