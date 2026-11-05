import api from '../utils/api';

/**
 * AF11.3 — the review console's own client: the four verbs, and the decisions already made.
 *
 * Its own module rather than more lines on `agentDomainApi.ts`, which is already at the size
 * target. The console reads the queue through that file (`fetchAllChangeRequests`, which already
 * carries `tool_request` and `duplicate_check`) and writes decisions through this one.
 *
 * ## What is deliberately not here
 *
 * No function that writes `tools_granted`, `autonomy_level`, `enabled` or `abac_mode_override`.
 * `assign_existing_tool` records an INTENT and AF11.4 performs the grant, because a console that
 * grants a tool and lifts an autonomy level in one action means nobody separately decided the
 * agent may act more freely. A client with no call for it cannot be wired to one by accident.
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
