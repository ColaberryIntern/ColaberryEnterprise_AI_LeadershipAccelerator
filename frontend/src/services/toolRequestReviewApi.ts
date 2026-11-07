import api from '../utils/api';

/**
 * AF11.3 — the review console's own client: the four verbs, and the decisions already made.
 *
 * Its own module rather than more lines on `agentDomainApi.ts`, which is already at the size
 * target. The console reads the queue through that file (`fetchAllChangeRequests`, which already
 * carries `tool_request` and `duplicate_check`) and writes decisions through this one.
 *
 * ## What is deliberately not here, as of AF11.4
 *
 * There is now a call that asks for a grant — `assignExistingTool` — and the shape of it is the
 * part worth reading. **It takes an id and nothing else.** It cannot name a tool, an agent, a
 * capability or an approver, because every one of those is read on the server off records that
 * already exist: the decision Ali made, the request the intern filed, and the verified token. The
 * server's own body schema is a strict empty object, so a field added here would be refused by
 * name rather than quietly dropped.
 *
 * Still absent, and absent on purpose: any way to express `autonomy_level`, `enabled` or
 * `abac_mode_override`. A console that granted a tool and lifted an autonomy level in one action
 * would mean nobody separately decided the agent may act more freely. The grant is one decision;
 * what the agent is allowed to do with it is another, with another author.
 */

/** The four verbs. Mirrors `TOOL_REQUEST_VERBS` in the backend contract. */
export const TOOL_REQUEST_VERBS = [
  'approve_to_build',
  'deny',
  'assign_existing_tool',
  'send_back',
] as const;

export type ToolRequestVerb = typeof TOOL_REQUEST_VERBS[number];

/**
 * The fields a send-back may name. Mirrors `SEND_BACK_FIELDS` in
 * `backend/src/services/agentDomain/toolRequestDecisionContract.ts`, declared here rather than in
 * the page so the select's options and the server's allowlist cannot drift into a control that
 * offers what the API will refuse. Same convention as `CHANGE_REQUEST_TITLE_MAX`.
 */
export const SEND_BACK_FIELDS = [
  'tool_name', 'purpose', 'reads', 'produces',
  'capability_id', 'task_unblocked', 'manual_today',
  'needed_by', 'run_frequency',
  'touches', 'inputs',
  'writes', 'side_effects', 'reversible', 'reversibility_note',
] as const;

export type SendBackField = typeof SEND_BACK_FIELDS[number];

/** Mirrors `DECISION_REASON_MAX` in `backend/src/schemas/toolRequestDecisionSchema.ts`. */
export const DECISION_REASON_MAX = 1000;

/** What the console sends. The server's own schema is `.strict()`, so no extra field survives. */
export interface ProposedToolRequestDecision {
  verb: ToolRequestVerb;
  /** Required on `deny`. */
  reason?: string;
  /** Required on `send_back`, and one of `SEND_BACK_FIELDS`. */
  missing_field?: SendBackField;
  /** Required on `assign_existing_tool`. An intent, not a grant. */
  assigned_tool_name?: string;
}

/**
 * One recorded decision. Append-only: a send-back can happen more than once, and each row is
 * something somebody decided and may be asked about later.
 *
 * `request_status` is what the parent request became. It is empty string on a row read back from
 * the history, because the log carries no status of its own — the governance status lives on the
 * request, and a second copy here is a second thing to disagree with it.
 */
export interface ToolRequestDecision {
  change_request_id: string;
  verb: ToolRequestVerb;
  decided_by_identity: string;
  decided_at: string;
  reason: string | null;
  missing_field: string | null;
  assigned_tool_name: string | null;
  request_status: string;
}

/** One named refusal. `rule` is stable; `detail` is a sentence written to be shown as-is. */
export interface DecisionIssue {
  rule: string;
  detail: string;
}

/**
 * Settle one tool request.
 *
 * The backend answers **409** when the decision itself is refused — not a configured approver,
 * the person who filed it, an already-decided request, a machine identity, an absent human roster
 * — and that is deliberately not a 403: the caller is authorized, this particular decision is not
 * allowed to stand. Use `decisionRefusals` to show every reason rather than only the first.
 */
export async function decideToolRequest(
  id: string,
  proposed: ProposedToolRequestDecision,
): Promise<ToolRequestDecision> {
  const { data } = await api.post(
    `/api/admin/agent-domain-tool-requests/${id}/decide`,
    proposed,
  );
  return data;
}

/**
 * AF11.4 — what the grant did, and what the agent can actually do with it.
 *
 * `access` is `null` when the effective-access resolver could not be read. That is "not
 * measured", which is a different fact from "measured, and not usable", and the console must not
 * render the first as the second.
 */
export interface AssignedToolAccess {
  toolName: string;
  /** A real handler exists FOR THIS AGENT. Not the same question as "is it a registered tool". */
  registered: boolean;
  grantedVia: string[];
  mismatches: string[];
  usable: boolean;
  agentEnabled: boolean;
  autonomyLevel: string | null;
  abacMode: string;
}

export interface AssignedToolGrant {
  agentName: string;
  toolName: string;
  capabilityId: string;
  approvedBy: string;
  toolsGranted: string[];
  changeRequestId: string | null;
  /** True when the agent already held the tool, so nothing changed. Safe to click twice. */
  unchanged: boolean;
}

export interface AssignExistingToolResult {
  changeRequestId: string;
  grant: AssignedToolGrant;
  access: AssignedToolAccess | null;
}

/**
 * Carry out a recorded `assign_existing_tool` decision.
 *
 * NO BODY. The tool comes from the decision, the agent and capability from the request, and the
 * approver from the token — so this cannot grant a different tool from the one that was decided.
 *
 * Two different **409**s, told apart by `code` on the response, because they are fixed on
 * different screens: `assignment_refused` means there is nothing to carry out — nobody decided,
 * or you are not the person who did — while `grant_refused` means the decision stands and the
 * grant it asks for does not, most often because the capability has not been confirmed. Use
 * `decisionRefusals` on either; both answer with the same `issues` shape.
 */
export async function assignExistingTool(id: string): Promise<AssignExistingToolResult> {
  const { data } = await api.post(
    `/api/admin/agent-domain-tool-requests/${id}/assign-tool`,
  );
  return data;
}

/** Which of the two 409s came back, so the console can say the right sentence. */
export function refusalCode(e: unknown): string {
  const r = e as { response?: { data?: { code?: unknown } } };
  const code = r?.response?.data?.code;
  return typeof code === 'string' ? code : '';
}

/** Every decision on one request, oldest first. */
export async function fetchToolRequestDecisions(id: string): Promise<ToolRequestDecision[]> {
  const { data } = await api.get<{ decisions: ToolRequestDecision[] }>(
    `/api/admin/agent-domain-tool-requests/${id}/decisions`,
  );
  return data.decisions;
}

/**
 * Every sentence the server refused with, not just the first.
 *
 * A console that shows one reason per round trip teaches the reader to click again instead of to
 * read, and these refusals are exactly the ones worth reading: "you filed this request" and "you
 * are not a configured approver" are different problems with different fixes. Returns `[]` when
 * the failure carried no `issues` — a 500 or a dropped connection — so the caller falls back to
 * its own sentence rather than rendering an empty list as "no problem".
 */
export function decisionRefusals(e: unknown): DecisionIssue[] {
  const r = e as { response?: { data?: { issues?: unknown } } };
  const issues = r?.response?.data?.issues;
  if (!Array.isArray(issues)) return [];
  return issues
    .filter((i): i is DecisionIssue => !!i && typeof (i as any).detail === 'string')
    .map((i) => ({ rule: String((i as any).rule ?? ''), detail: i.detail }));
}
