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
  /**
   * AF12.1. The short key shared by every tool the SAME TASK needs.
   *
   * Ali, 17 Nov 2026: *"you have a task that uses multiple tools."* Chosen by the builder rather
   * than derived, because only they know that reading a table, reading another system and writing
   * the report are three grants serving one piece of work. The API requires it and refuses a
   * malformed one, so a form that cannot send it cannot file a request at all.
   */
  task_key: string;
  manual_today: string;
  /**
   * AF11.7. The email of the person who will act on the output, in the people record's own
   * spelling. Not a team and not a role: the API checks it against a roster and refuses anything
   * that is not on it.
   *
   * This is the field whose absence let a capability reach seven builders' boards with nobody
   * waiting on its output. `task_unblocked` names the WORK; this names the HUMAN.
   */
  acts_on_output: string;
  /** The number that decides whether the tool worked. The API refuses a value with no number. */
  judged_threshold: string;
  /** What the system already records that would produce that number. */
  judged_measured_from: string;
  /**
   * Always `not_built` on a stored request: the other two states are real answers that the API
   * routes elsewhere — a feature you have used is a GRANT, and one you have not tried sends you to
   * use it first. The union carries all three because the API's refusals name all three.
   */
  tried_in_product: 'used_by_hand' | 'exists_unused' | 'not_built';
  /** What the product cannot do today. The case for building anything at all. */
  missing_from_product: string;
  /** `YYYY-MM-DD`. */
  needed_by: string;
  run_frequency:
  | 'once' | 'on_demand' | 'per_event' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly';
  /** Every system the tool would touch. The blast-radius field, and the one being approved. */
  touches: string[];
  /**
   * Which environment the tool reads. Ali's rule: a sandbox read gets a wide grant, a production
   * one gets a narrow one.
   *
   * This field and `read_datasets` below were MISSING from this interface, which claims to be
   * "field-for-field the backend's `ToolRequestDetail`" and was not: the dataset-scope change
   * added both to the API and to the approver's record and never to this type. Nothing broke,
   * because no caller read them — which is why it went unnoticed, and why the approver's console
   * could not show two required fields.
   */
  environment: 'sandbox' | 'production';
  /** Dataset names from the catalog. Required on a production tool that reads anything. */
  read_datasets: string[];
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
  /** AF11.8. The ten-block case for deciding this, or null when nobody has written one. */
  decision_package?: ToolRequestPackage | null;
  /** AF11.8. Whether this is in front of you at all, and what is outstanding if not. */
  readiness?: PackageReadiness;
}

/** AF11.8. The ten blocks a request must carry before it reaches a human. */
export interface ToolRequestPackage {
  executive_summary: string;
  problem: string;
  key_findings: Array<{ finding: string; source: string }>;
  /**
   * Blocks 4 and 10 of the ten: the possible solutions ARE the answer.
   *
   * `nothing` is never in here. It is always available to the decider and is never offered by the
   * agent, because an option the agent has to remember to include is an option it can leave out.
   */
  options: Array<{
    key: 'A' | 'B' | 'C';
    summary: string;
    what_happens: string;
    /**
     * What choosing this option would do. Never `deny`: declining is already available to
     * the decider as Nothing, so an option that only declines is not a second solution.
     */
    verb: 'approve_to_build' | 'assign_existing_tool' | 'send_back';
  }>;
  /** One of the offered options, or `nothing` when the agent has disproved its own capability. */
  recommendation: 'A' | 'B' | 'C' | 'nothing';
  recommendation_reason: string;
  impact: string;
  risk_can_break: string[];
  /** The half that makes the other half believable, and the one an approver says yes on. */
  risk_cannot_break: string[];
  simulated_action: string;
  simulated_against: string;
  /** ISO 8601. A time rather than a sentence, so a stale simulation is visible as one. */
  simulated_at: string;
  steps_that_follow: string[];
}

/** AF11.8. The ten blocks, by the names the API bounces them under. */
export type PackageBlock =
  | 'executive_summary' | 'problem' | 'key_findings' | 'possible_solutions'
  | 'recommendation' | 'possible_impact' | 'risk_assessment' | 'simulated_action'
  | 'steps_that_follow' | 'the_answer';

/**
 * AF11.8. Whether a request has reached a human.
 *
 * COMPUTED by the API on every read and never stored, so it cannot drift out of agreement with
 * the package beside it. `has_package` and `ready_for_a_human` are two different facts: "nobody
 * has written one" is not "one was written and three blocks are thin".
 */
export interface PackageReadiness {
  has_package: boolean;
  ready_for_a_human: boolean;
  bounced_blocks: PackageBlock[];
  bounce_reasons: Array<{ rule: string; detail: string; block: PackageBlock }>;
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
  /** AF11.13. The case for deciding it, filed in the same call so the request arrives finished. */
  decision_package?: Record<string, unknown>;
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

/**
 * AF11.11 — the limits the tool-request form enforces client-side.
 *
 * Mirrors `backend/src/schemas/agentToolRequestSchema.ts`, declared here rather than in the form
 * for the reason `AGENT_DISPLAY_NAME_MAX` records above: an input whose `maxLength` disagrees with
 * the server's `.max()` is a control that accepts what the API will refuse.
 */
export const TOOL_NAME_MAX = 120;
export const TOOL_PURPOSE_MAX = 1000;
export const TOOL_NARRATIVE_MAX = 1000;
export const TOOL_SIDE_EFFECTS_MAX = 2000;
export const TOOL_LIST_ITEM_MAX = 300;
export const TOOL_LIST_MAX_ITEMS = 50;
export const TOOL_ACTOR_MAX = 254;

/** The enums, mirroring `ensureAgentDomainToolRequestSchema.ts`. */
export const TOOL_RUN_FREQUENCIES = [
  'once', 'on_demand', 'per_event', 'hourly', 'daily', 'weekly', 'monthly', 'quarterly',
] as const;
export const TOOL_ENVIRONMENTS = ['sandbox', 'production'] as const;
export const TOOL_PRODUCT_STATES = ['used_by_hand', 'exists_unused', 'not_built'] as const;

/** One named refusal: a stable rule code and a sentence written for the person filing the form. */
export interface ToolRequestIssue {
  rule: string;
  detail: string;
}

/**
 * Pull the NAMED issues off a refusal, or `[]` when the error carries none.
 *
 * The filing route answers 400 with `{ error, issues: [{ rule, detail }] }`, one entry per field
 * that is missing or wrong. `errorMessage` above returns only the top-level sentence, which on a
 * twenty-four-field form is the least useful part of the response: it says the request was
 * refused without saying which field to go and fix.
 *
 * Returning `[]` rather than throwing on a shapeless error is deliberate. A 500, a timeout and a
 * network failure all reach here, and in each case the form falls back to the single sentence from
 * `errorMessage`. A caller that had to distinguish them would end up showing nothing when it could
 * not.
 */
export function toolRequestIssues(e: unknown): ToolRequestIssue[] {
  const raw = (e as { response?: { data?: { issues?: unknown } } })?.response?.data?.issues;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => {
      const o = i as { rule?: unknown; detail?: unknown; message?: unknown; path?: unknown };
      // Zod issues carry `message` and `path` instead of `rule` and `detail`. The form renders
      // both shapes, because a body that fails Zod never reaches the contract and its issues are
      // the only thing the response carries.
      const rule = typeof o.rule === 'string' && o.rule
        ? o.rule
        : Array.isArray(o.path) ? o.path.map(String).join('.') : '';
      const detail = typeof o.detail === 'string' && o.detail
        ? o.detail
        : typeof o.message === 'string' ? o.message : '';
      return { rule, detail };
    })
    .filter((i) => i.rule !== '' || i.detail !== '');
}

/** One capability of a domain, as `/agent-domains-mine/:key` projects it. */
export interface ProjectedCapability {
  capability_id: string;
  name: string;
  classification: string;
  implementation_state: string;
  requirement_validation_state: string;
  starting_autonomy: string;
  max_permitted_autonomy: string;
  human_decision: boolean;
}

/**
 * The capabilities of one domain you own, for the `capability_id` picker.
 *
 * This calls the EXISTING `/api/admin/agent-domains-mine/:domainKey`, which AF12.5 taught to
 * return `capabilities` — the fix that unblocked Mihret Netsereab's first criterion. No new
 * endpoint: the route is already `requireSection('dashboard')` and already refuses a domain that
 * is not the caller's, which is exactly the scope this picker needs.
 *
 * `capability_total` is returned alongside because the route takes a `capability_limit`: a picker
 * showing 50 of 213 must say so rather than implying the domain has 50.
 */
export async function fetchMyDomainCapabilities(domainKey: string): Promise<{
  capabilities: ProjectedCapability[];
  capabilities_returned: number;
  capability_total: number;
}> {
  const { data } = await api.get<{
    capabilities: ProjectedCapability[];
    capabilities_returned: number;
    capability_total: number;
  }>(`/api/admin/agent-domains-mine/${encodeURIComponent(domainKey)}`);
  return {
    capabilities: data.capabilities ?? [],
    capabilities_returned: data.capabilities_returned ?? 0,
    capability_total: data.capability_total ?? 0,
  };
}

/**
 * The people an `acts_on_output` address may name. AF11.11.
 *
 * `roster_absent` is carried through rather than flattened into an empty list: the gate refuses an
 * address that is not on the roster, so a builder looking at an empty picker needs to know the
 * roster is missing and not that there is nobody to send output to.
 */
export async function fetchActorRoster(): Promise<{
  actors: string[];
  roster_absent: boolean;
  note: string;
}> {
  const { data } = await api.get<{ actors: string[]; roster_absent: boolean; note: string }>(
    '/api/admin/agent-domain-actors',
  );
  return { actors: data.actors ?? [], roster_absent: Boolean(data.roster_absent), note: data.note ?? '' };
}

/** What the drafter was able to write against, so the form can say why a field came back blank. */
export interface DraftGrounding {
  capabilities: number;
  datasets: number;
  actors: number;
  actor_roster_absent: boolean;
}

export interface DraftedToolRequest {
  tool_request: ToolRequestSubmission;
  /**
   * AF11.13 — the ten-block case, drafted with the request and filed with it.
   *
   * Deliberately NOT typed field by field here: it is passed through to the filing route
   * untouched, and a second description of its shape on the client would be a second definition
   * of a package to keep in agreement with the server's.
   */
  decision_package: Record<string, unknown>;
  title: string;
  grounded_in: DraftGrounding;
  note: string;
}

/**
 * AF11.12 — ask the AI to fill the request in. Returns a draft; files nothing.
 *
 * Two modes, as Ali described them on 17 Nov: pass the builder's own sentence as `intent`, or pass
 * nothing and let it propose one from the domain's own capabilities.
 *
 * The draft is loaded into the form as EDITABLE text and submitted by the ordinary filing route.
 * There is deliberately no draft-and-file: the step where somebody reads it and changes it is the
 * reason the feature exists.
 */
export async function draftToolRequest(
  domainKey: string,
  intent?: string | null,
): Promise<DraftedToolRequest> {
  const { data } = await api.post<DraftedToolRequest>(
    '/api/admin/agent-domain-tool-requests/draft',
    { domain_key: domainKey, intent: intent ?? null },
  );
  return data;
}

/** One dataset the catalog knows about. */
export interface CatalogDataset {
  table_name: string;
  schema_name: string;
  column_count: number;
  columns: string[];
  status: string;
  last_scanned: string | null;
}

/**
 * Search the dataset catalog for the `read_datasets` picker.
 *
 * `catalog_absent` matters for the same reason as `roster_absent`: an unreadable catalog returns
 * no datasets, and rendering that as "no matches" would send a builder to invent a table name that
 * the gate then refuses as not catalogued.
 */
export async function searchAgentDomainDatasets(q: string, limit?: number): Promise<{
  datasets: CatalogDataset[];
  total_matched: number;
  catalog_size: number;
  catalog_absent: boolean;
}> {
  const { data } = await api.get<{
    datasets: CatalogDataset[];
    total_matched: number;
    catalog_size: number;
    catalog_absent: boolean;
  }>('/api/admin/agent-domain-datasets', {
    params: { ...(q ? { q } : {}), ...(limit ? { limit } : {}) },
  });
  return {
    datasets: data.datasets ?? [],
    total_matched: data.total_matched ?? 0,
    catalog_size: data.catalog_size ?? 0,
    catalog_absent: Boolean(data.catalog_absent),
  };
}

/** One column of a dataset: a name and the KIND of thing it holds. Never a value. */
export interface DatasetColumn {
  name: string;
  semantic_type: string | null;
}

/** A join a dataset declares. Names only. */
export interface DatasetRelationship {
  to_table: string;
  from_column: string | null;
  to_column: string | null;
}

/**
 * One dataset's shape — what the drill-in shows when a builder clicks a table in the picker.
 *
 * `row_count` and `last_scanned` are nullable and must never be rendered as 0 or as today. "We do
 * not know how big this is" and "this table is empty" lead to opposite decisions about a read
 * grant, and a zero standing in for the first would quietly argue that reading it is harmless.
 */
export interface DatasetDetail {
  table_name: string;
  schema_name: string;
  status: string;
  last_scanned: string | null;
  column_count: number;
  columns: DatasetColumn[];
  row_count: number | null;
  relationships: DatasetRelationship[];
  /** How many joins the table declares in total. `enrollments` declares 133; the list is capped. */
  relationship_count: number;
  /** TRUE when the join list is shorter than `relationship_count`. */
  relationships_incomplete: boolean;
  /** TRUE when fewer column names came back than the table has. Say so rather than hide it. */
  columns_incomplete: boolean;
}

/**
 * Read one dataset's shape. AF12.2.
 *
 * A 404 means the name is not in the catalog, which is a real answer and the one worth showing:
 * it is also the reason `read_datasets_not_catalogued` would refuse the request later. The caller
 * distinguishes it from a failure, so `null` is returned for "not catalogued" and anything else
 * throws.
 */
export async function fetchDatasetDetail(tableName: string): Promise<DatasetDetail | null> {
  try {
    const { data } = await api.get<{ dataset: DatasetDetail }>(
      `/api/admin/agent-domain-datasets/${encodeURIComponent(tableName)}`,
    );
    return data.dataset ?? null;
  } catch (e) {
    if ((e as { response?: { status?: number } })?.response?.status === 404) return null;
    throw e;
  }
}

/** Where one tool of a task stands. Deliberately not the word "granted". */
export type ToolState = 'waiting_on_a_decision' | 'approved_to_build' | 'declined' | 'withdrawn';

export interface TaskTool {
  request_id: string;
  tool_name: string;
  title: string;
  state: ToolState;
  requested_at: string | null;
  ready_to_decide: boolean;
  not_ready_because: string[];
}

export interface GroupedTask {
  task_key: string;
  domain_key: string;
  task_label: string;
  other_labels: string[];
  tools: TaskTool[];
  waiting_on_a_decision: number;
  approved_to_build: number;
  every_tool_decided: boolean;
}

export interface AgentDomainTasks {
  tasks: GroupedTask[];
  ungrouped: ChangeRequest[];
  ungrouped_count: number;
  /** Present only when a `requestId` was asked for. */
  focus?: {
    request_id: string;
    task: GroupedTask | null;
    siblings: TaskTool[];
  };
}

/**
 * Read the queue grouped into tasks. AF12.1.
 *
 * Grouped on the server, in the one place the rule lives, rather than in a second copy here that
 * would agree with it until somebody changed one of them.
 */
export async function fetchAgentDomainTasks(requestId?: string): Promise<AgentDomainTasks> {
  const { data } = await api.get<AgentDomainTasks>('/api/admin/agent-domain-tasks', {
    params: requestId ? { request_id: requestId } : undefined,
  });
  return {
    tasks: data.tasks ?? [],
    ungrouped: data.ungrouped ?? [],
    ungrouped_count: data.ungrouped_count ?? 0,
    ...(data.focus ? { focus: data.focus } : {}),
  };
}

/**
 * AF11.14 — the standing instructions already in force on one capability.
 *
 * `state` is three values and never two. A cleared instruction and one that was never set look
 * identical in the text and are different facts about a production agent: one says somebody
 * decided there should be no rules, the other says nobody has thought about it.
 */
export interface CapabilityInstructions {
  agent_id: string;
  capability_id: string;
  instructions: string | null;
  state: 'never_set' | 'cleared' | 'in_force';
  set_by_identity: string | null;
  set_at: string | null;
  note: string;
  history: Array<{
    instructions: string;
    set_by_identity: string;
    set_at: string;
    cleared: boolean;
  }>;
}

/**
 * Read what is already in force before adding to it.
 *
 * The decision panel's instruction box writes a NEW record — the table is a log and nothing is
 * ever replaced — so a decider typing into it without seeing what is already there is appending
 * to rules they cannot read. This is the record's first screen; it has had an API since AF11.14
 * and nothing has ever displayed it.
 */
export async function fetchCapabilityInstructions(
  agentId: string,
  capabilityId: string,
): Promise<CapabilityInstructions> {
  const { data } = await api.get<CapabilityInstructions>(
    `/api/admin/agents/${encodeURIComponent(agentId)}/capabilities/${encodeURIComponent(capabilityId)}/instructions`,
  );
  return data;
}
