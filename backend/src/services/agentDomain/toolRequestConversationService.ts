/**
 * The tool-request pipeline as seen FROM ONE AGENT, plus the conversation on each request.
 *
 * Agent Tools Phase 2. Ali asked that a tool request be trackable "until it is built out and
 * handed over" with "everything associated so all parties can see what's going on". Two things
 * were missing for that, and this module supplies both:
 *
 *   1. **A read keyed by agent.** The existing reads are by status (the approver's queue) or by
 *      request id (the review console). Neither answers "what is in flight for Maya", which is
 *      the question her dashboard asks.
 *   2. **A conversation.** `agent_domain_tool_request_decisions` records the four VERBS, and a
 *      verb is not a conversation. A question and its answer are neither an approval nor a
 *      denial, and before this they happened in chat and were lost.
 *
 * ## It does not decide anything
 *
 * Nothing here writes a status, a verb, a grant or `tools_granted`. Posting a message cannot
 * move a request forward, which is deliberate: the AF11 design doc's instruction is "There is
 * already an approval spine. Do not build a second one." A conversation that could approve
 * something would be a second one.
 */
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestDetail from '../../models/AgentDomainToolRequestDetail';
import AgentDomainToolRequestDecision from '../../models/AgentDomainToolRequestDecision';
import AgentDomainToolRequestMessage from '../../models/AgentDomainToolRequestMessage';
import { listBuildEvents, describeDelivery, type BuildEventView } from './toolRequestBuildProgressService';

/** Mirrors the database's own limit intent. Long enough for a real answer, short enough to read. */
export const MESSAGE_BODY_MAX = 4000;

export interface ToolRequestMessageView {
  id: string;
  author_identity: string;
  posted_at: string;
  body: string;
}

export interface ToolRequestDecisionView {
  verb: string;
  decided_by_identity: string;
  decided_at: string;
  reason: string | null;
  missing_field: string | null;
  assigned_tool_name: string | null;
}

export interface AgentToolRequestView {
  change_request_id: string;
  title: string;
  /** submitted | approved | declined | withdrawn, owned by the parent request. */
  status: string;
  requested_by_identity: string | null;
  requested_at: string | null;
  tool_name: string | null;
  purpose: string | null;
  capability_id: string | null;
  needed_by: string | null;
  /** True when this request declares it will write, which is what makes it consequential. */
  writes: boolean | null;
  decisions: ToolRequestDecisionView[];
  messages: ToolRequestMessageView[];
  /** Phase 3 delivery milestones. Always empty unless the request is approved. */
  build_events: BuildEventView[];
  /**
   * Plain-English state for a reader who does not know the schema. Derived from status and the
   * decision log together, because "approved" alone does not say whether it was built.
   */
  where_it_stands: string;
}

export interface AgentToolRequestsReport {
  agentId: string;
  generatedAt: string;
  requests: AgentToolRequestView[];
  summary: {
    total: number;
    open: number;
    approved: number;
    declined: number;
  };
}

const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

/**
 * Where a request stands, in a sentence.
 *
 * Derived rather than stored, so it cannot drift from the status and decisions it describes.
 * Note what it refuses to claim: an approved request is "approved to build", NOT "done". Phase 3
 * adds the states past approval, and until it exists this sentence must not imply them.
 */
export function describeWhereItStands(
  status: string,
  decisions: ToolRequestDecisionView[],
  // Phase 3. Empty for an unapproved request, which cannot have build events at all.
  buildEvents: BuildEventView[] = [],
): string {
  const last = decisions.length > 0 ? decisions[decisions.length - 1] : null;

  if (status === 'approved') {
    if (last?.verb === 'assign_existing_tool') {
      return `Resolved by assigning the existing tool ${last.assigned_tool_name}. Nothing new to build.`;
    }
    // Phase 3 replaced the placeholder that used to sit here, which read "Not yet tracked
    // through to handover, which Phase 3 adds." Delivery is now tracked, so the sentence says
    // what actually happened instead of naming a phase that had not been built.
    return describeDelivery(buildEvents);
  }
  if (status === 'declined') {
    return last?.reason ? `Declined: ${last.reason}` : 'Declined.';
  }
  if (status === 'withdrawn') return 'Withdrawn by the requester.';

  // Still submitted.
  if (last?.verb === 'send_back') {
    return `Sent back for more detail on "${last.missing_field}". Waiting on the requester.`;
  }
  if (decisions.length === 0) return 'Waiting for a decision. Nobody has responded yet.';
  return 'Open, with decisions recorded. Waiting for the next one.';
}

/**
 * Every tool request filed for one agent, newest first, with its decisions and conversation.
 *
 * Keyed on `agent_domain_tool_request_details.agent_id`, which is the only place a tool request
 * names an agent. The parent change request is keyed by DOMAIN, and most domains have no agent
 * attached, so the parent cannot answer this question.
 */
export async function listToolRequestsForAgent(agentId: string): Promise<AgentToolRequestsReport> {
  const details = await AgentDomainToolRequestDetail.findAll({ where: { agent_id: agentId } });

  const requests: AgentToolRequestView[] = [];

  for (const d of details) {
    const detail = d as unknown as {
      change_request_id: string;
      tool_name?: string | null;
      purpose?: string | null;
      capability_id?: string | null;
      needed_by?: string | null;
      writes?: boolean | null;
    };

    const parent = await AgentDomainChangeRequest.findByPk(detail.change_request_id);
    // A detail row whose parent is gone is skipped rather than rendered half-built: the FK is
    // ON DELETE CASCADE, so this should be impossible, and inventing a title for it would be
    // worse than omitting it.
    if (!parent) continue;
    const p = parent as unknown as {
      title?: string | null;
      status?: string | null;
      requested_by_identity?: string | null;
      requested_at?: Date | null;
    };

    const decisionRows = await AgentDomainToolRequestDecision.findAll({
      where: { change_request_id: detail.change_request_id },
      order: [['decided_at', 'ASC']],
    });
    const decisions: ToolRequestDecisionView[] = decisionRows.map((r) => {
      const x = r as unknown as {
        verb: string; decided_by_identity: string; decided_at: Date;
        reason: string | null; missing_field: string | null; assigned_tool_name: string | null;
      };
      return {
        verb: x.verb,
        decided_by_identity: x.decided_by_identity,
        decided_at: iso(x.decided_at) as string,
        reason: x.reason ?? null,
        missing_field: x.missing_field ?? null,
        assigned_tool_name: x.assigned_tool_name ?? null,
      };
    });

    const messages = await listMessages(detail.change_request_id);
    const status = p.status ?? 'submitted';
    // Phase 3. Only an approved request can carry build events, so an unapproved one is not
    // queried for them: an empty array there would be indistinguishable from "approved and
    // nobody started", which is a different and meaningful state.
    const buildEvents: BuildEventView[] =
      status === 'approved' ? await listBuildEvents(detail.change_request_id) : [];

    requests.push({
      change_request_id: detail.change_request_id,
      title: p.title ?? '(untitled request)',
      status,
      requested_by_identity: p.requested_by_identity ?? null,
      requested_at: iso(p.requested_at),
      tool_name: detail.tool_name ?? null,
      purpose: detail.purpose ?? null,
      capability_id: detail.capability_id ?? null,
      needed_by: detail.needed_by ? String(detail.needed_by) : null,
      writes: typeof detail.writes === 'boolean' ? detail.writes : null,
      decisions,
      messages,
      build_events: buildEvents,
      where_it_stands: describeWhereItStands(status, decisions, buildEvents),
    });
  }

  requests.sort((a, b) => (b.requested_at ?? '').localeCompare(a.requested_at ?? ''));

  return {
    agentId,
    generatedAt: new Date().toISOString(),
    requests,
    summary: {
      total: requests.length,
      open: requests.filter((r) => r.status === 'submitted').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      declined: requests.filter((r) => r.status === 'declined').length,
    },
  };
}

/** The conversation on one request, oldest first. */
export async function listMessages(changeRequestId: string): Promise<ToolRequestMessageView[]> {
  const rows = await AgentDomainToolRequestMessage.findAll({
    where: { change_request_id: changeRequestId },
    order: [['posted_at', 'ASC']],
  });
  return rows.map((r) => {
    const x = r as unknown as { id: string; author_identity: string; posted_at: Date; body: string };
    return {
      id: x.id,
      author_identity: x.author_identity,
      posted_at: iso(x.posted_at) as string,
      body: x.body,
    };
  });
}

/** Refused by name, so the caller gets a sentence rather than a constraint violation. */
export class MessageRefusedError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = 'MessageRefusedError';
    this.rule = rule;
  }
}

export interface PostMessageArgs {
  changeRequestId: string;
  authorIdentity: string;
  body: string;
}

/**
 * Adds one message to a request's conversation.
 *
 * Every refusal is named, matching `agentToolGrantContract`'s convention, so a caller can show
 * the person which rule stopped them instead of a 500. The database carries the same two rules
 * as CHECK constraints, so a future caller that skips this function still cannot write a blank
 * or unattributed message.
 *
 * It writes NOTHING but the message: no status, no verb, no grant.
 */
export async function postMessage(args: PostMessageArgs): Promise<ToolRequestMessageView> {
  const body = (args.body ?? '').trim();
  const author = (args.authorIdentity ?? '').trim();

  if (!author) {
    throw new MessageRefusedError('author_missing', 'A message must say who wrote it.');
  }
  if (!body) {
    throw new MessageRefusedError('body_empty', 'A message cannot be blank.');
  }
  if (body.length > MESSAGE_BODY_MAX) {
    throw new MessageRefusedError(
      'body_too_long',
      `A message is at most ${MESSAGE_BODY_MAX} characters; this one is ${body.length}.`,
    );
  }

  const parent = await AgentDomainChangeRequest.findByPk(args.changeRequestId);
  if (!parent) {
    throw new MessageRefusedError(
      'request_not_found',
      'That request does not exist, so there is nothing to discuss.',
    );
  }

  const created = await AgentDomainToolRequestMessage.create({
    change_request_id: args.changeRequestId,
    author_identity: author,
    body,
    posted_at: new Date(),
  });

  const x = created as unknown as { id: string; author_identity: string; posted_at: Date; body: string };
  return {
    id: x.id,
    author_identity: x.author_identity,
    posted_at: iso(x.posted_at) as string,
    body: x.body,
  };
}
