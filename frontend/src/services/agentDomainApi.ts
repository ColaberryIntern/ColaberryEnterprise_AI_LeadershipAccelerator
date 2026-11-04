import api from '../utils/api';

/**
 * The agent-domain read API (backend AF2.4, PR #3100).
 *
 * Two routes, answering two different questions, and conflating them is the mistake to avoid:
 *
 *   - `agent-domains-mine`        what the SIGNED-IN human owns. Scoped by the caller's own email
 *                                 from the verified token, never from a parameter.
 *   - `agent-domains-provisioned` all ten, read from the database.
 *
 * Section access decides whether you may ask; ownership decides what comes back. A full admin
 * reaches both routes and still gets only their own domains from `-mine`, which is the property
 * that makes the page meaningful rather than an admin-sees-everything dump.
 */

export interface AgentDomainRow {
  domain_key: string;
  student_project_id: string;
  anchor_id: string;
  /** Null means the lifecycle row is missing. A finding, not a default. */
  stage: string | null;
  entry_point: string | null;
  manager_identity_id: string | null;
  manager_email: string | null;
  manager_can_reach: boolean | null;
  manager_blocker: string | null;
  intended_builder_state: string | null;
  agent_id: string | null;
  /**
   * AF10.6: the name the intern gave this agent. Null until they name it, which is the normal
   * state — nothing backfills it, because the whole point is that the intern chooses.
   */
  agent_display_name: string | null;
  releases: number;
  stories: number;
  stories_verified: number;
  build_authorizations: number;
}

export interface AgentDomainSummary {
  domains: number;
  releases: number;
  stories: number;
  stories_verified: number;
  build_authorizations: number;
  missing_lifecycle_row: number;
  managers_blocked: number;
  /** The backend's own words about whether this is a plan or progress. Rendered, never rephrased. */
  disclosure: string;
}

export interface MyDomainsResponse {
  caller_email: string;
  resolved_identities: number;
  summary: AgentDomainSummary;
  domains: AgentDomainRow[];
  /** Why the list is empty, when it is. Shown so an empty list is not read as a load failure. */
  note: string;
}

export async function fetchMyDomains(): Promise<MyDomainsResponse> {
  const { data } = await api.get<MyDomainsResponse>('/api/admin/agent-domains-mine');
  return data;
}

export async function fetchProvisionedDomains(): Promise<{
  summary: AgentDomainSummary;
  domains: AgentDomainRow[];
}> {
  const { data } = await api.get('/api/admin/agent-domains-provisioned');
  return data;
}

export function errorMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: string } } };
  return r?.response?.data?.error || fallback;
}

/**
 * Mirrors `AGENT_DISPLAY_NAME_MAX` in `backend/src/schemas/agentDisplayNameSchema.ts`. Declared
 * here rather than in the page so the input's `maxLength` and the server's `.max()` cannot drift
 * into a control that accepts what the API will refuse.
 */
export const AGENT_DISPLAY_NAME_MAX = 60;

/**
 * AF10.6 — name your own agent.
 *
 * The backend answers 403 if the agent is not yours and 409 if the name is taken, and both carry
 * a sentence worth showing verbatim. `errorMessage` already surfaces `response.data.error`, so a
 * caller that uses it gets "Maya is already taken by another agent" rather than "request failed",
 * which is the difference between a usable refusal and a dead end.
 */
export async function setAgentDisplayName(
  agentId: string,
  displayName: string,
): Promise<{ agent_id: string; display_name: string; unchanged: boolean }> {
  const { data } = await api.patch(
    `/api/admin/agents/${agentId}/display-name`,
    { display_name: displayName },
  );
  return data;
}

/**
 * AF4.2 — change requests.
 *
 * Mirrors the limits in `backend/src/schemas/agentChangeRequestSchema.ts`, declared here rather
 * than in the page so an input's `maxLength` and the server's `.max()` cannot drift into a control
 * that accepts what the API will refuse.
 */
export const CHANGE_REQUEST_TITLE_MAX = 140;
export const CHANGE_REQUEST_DESCRIPTION_MAX = 4000;
export const DECLINED_REASON_MAX = 1000;

/**
 * AF11.1 — the six field groups a tool request carries: who, what, what for, when, where, how.
 *
 * Field-for-field the backend's `ToolRequestDetail`
 * (`backend/src/services/agentDomain/toolRequestContract.ts`), snake_case, no remapping. There is
 * no `domain_key` here because the domain lives on the request itself, where it has been
 * ownership-checked.
 *
 * `tool_name`, `reads` and `produces` are the CATALOG's own field names, so a request and a
 * registered tool can be compared without a translation layer. `purpose` has no catalog
 * counterpart: `ToolCapability` is `{ reads, produces }` and nothing else.
 */
export interface ToolRequestDetail {
  agent_id: string;
  domain_key: string;
  tool_name: string;
  purpose: string;
  reads: string[];
  produces: string[];
  capability_id: string;
  task_unblocked: string;
  manual_today: string;
  /** `YYYY-MM-DD`. */
  needed_by: string;
  run_frequency:
  | 'once' | 'on_demand' | 'per_event' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly';
  /** Every system the tool would touch. The blast-radius field, and the one being approved. */
  touches: string[];
  inputs: string[];
  writes: boolean;
  /** Required by the API when `writes` is true, and null when it is false. */
  side_effects: string | null;
  reversible: boolean | null;
  reversibility_note: string | null;
}

/** What an intern submits. Every field optional here; the API names the missing ones. */
export type ToolRequestSubmission = Partial<Omit<ToolRequestDetail, 'domain_key'>>;

/** Field-for-field the backend payload, snake_case, with no remapping layer. */
export interface ChangeRequest {
  id: string;
  /** AF7.1. A request asks either for a change or for a tool. */
  kind: 'change' | 'tool';
  domain_key: string;
  title: string;
  description: string | null;
  status: 'submitted' | 'approved' | 'declined' | 'withdrawn';
  requested_by_identity: string;
  requested_at: string | null;
  approved_by_identity: string | null;
  approved_at: string | null;
  declined_reason: string | null;
  /** AF11.1. Present on a tool request, null on a change request. */
  tool_request?: ToolRequestDetail | null;
  /**
   * AF11.2. The duplicate-tool check AS IT WAS COMPUTED when the request was filed.
   *
   * `null` means no check is stored, which is NOT "no duplicates found". A check that ran and
   * found nothing is an object with an empty `candidates` array. The review console has to render
   * those two differently, because "we compared this against 57 tools and found nothing" and "this
   * was never checked" are different things to tell an approver.
   */
  duplicate_check?: ToolDuplicateCheck | null;
}

/**
 * AF11.2. Why a candidate matched, in words rather than as a score.
 *
 * The field name is deliberately precise. `purpose_vs_behavior` is NOT `purpose`: the catalog has
 * no purpose field, so the request's purpose is compared against what the tool reads and produces.
 * Labelling it `purpose` would claim a comparison that did not happen.
 */
export interface ToolMatchedField {
  field: 'tool_name' | 'tool_name_tokens' | 'reads' | 'produces' | 'purpose_vs_behavior';
  /** A sentence to render as-is. Never show the score without it. */
  detail: string;
  /** The distinguishing words both sides used, for an approver to check by eye. */
  tokens: string[];
  /** This field's own 0..1 coverage, before weighting. */
  coverage: number;
}

export interface ToolDuplicateCandidate {
  tool_name: string;
  /** 0..1. Advice, never a verdict: nothing is refused or granted on this number. */
  score: number;
  matched_fields: ToolMatchedField[];
}

export interface ToolDuplicateCheck {
  checked_at: string;
  /** How many tools the answer was computed against. 57 in production on 2026-11-04. */
  catalog_size: number;
  /**
   * The detector could not see the catalog, so an empty `candidates` means nothing here. Render
   * this case as "could not check", never as "no duplicates".
   */
  catalog_absent: boolean;
  threshold: number;
  /** Ranked, highest first, at most three. */
  candidates: ToolDuplicateCandidate[];
  /**
   * Tools carrying no documented behavior, matchable by NAME only. Worth showing beside an empty
   * result, because these four were effectively unsearched.
   */
  behaviorless_tools: string[];
}

/**
 * File one against a domain you own. 403 if it is not yours, 400 if the body is unusable, and both
 * carry a sentence worth showing verbatim through `errorMessage`.
 */
export async function fileChangeRequest(input: {
  domain_key: string;
  title: string;
  description?: string;
  /** AF7.1. Omitted means a change request, which is what every existing caller sends. */
  kind?: 'change' | 'tool';
  /**
   * AF11.1. REQUIRED by the API when `kind` is `'tool'`, and refused on a change request.
   *
   * A 400 from this carries `issues: [{ rule, detail }]` — one named reason per field that is
   * missing or wrong, not a generic "invalid input". Render those sentences; they are written to
   * be read by the person filling the form.
   */
  tool_request?: ToolRequestSubmission;
}): Promise<ChangeRequest> {
  const { data } = await api.post('/api/admin/agent-domain-change-requests-mine', input);
  return data;
}

/** Your own requests, across every domain you own. */
export async function fetchMyChangeRequests(): Promise<ChangeRequest[]> {
  const { data } = await api.get<{ change_requests: ChangeRequest[] }>(
    '/api/admin/agent-domain-change-requests-mine',
  );
  return data.change_requests;
}

/** The whole queue. Admin-only at the API, so a non-admin caller gets a 403 here. */
export async function fetchAllChangeRequests(
  status?: ChangeRequest['status'],
): Promise<ChangeRequest[]> {
  const { data } = await api.get<{ change_requests: ChangeRequest[] }>(
    '/api/admin/agent-domain-change-requests',
    { params: status ? { status } : undefined },
  );
  return data.change_requests;
}

/**
 * Approve or decline. The backend answers **409** when the decision itself is refused — the
 * four-hour timer identity, self-approval, an already-decided request — and that is deliberately
 * not a 403: the caller is authorized, this particular decision is not allowed to stand. The
 * response carries the server's own sentence plus the rules, so `errorMessage` shows the person
 * why rather than "request failed".
 */
export async function decideChangeRequest(
  id: string,
  decision: 'approved' | 'declined',
  declinedReason?: string,
): Promise<ChangeRequest> {
  const { data } = await api.post(
    `/api/admin/agent-domain-change-requests/${id}/decide`,
    decision === 'declined' ? { decision, declined_reason: declinedReason } : { decision },
  );
  return data;
}
