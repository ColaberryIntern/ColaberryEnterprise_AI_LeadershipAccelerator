import RoomMessage from '../../models/RoomMessage';
import { getRoleCharter } from '../agentRoleCharterService';

/**
 * The only part of the resolved reports-to chain this module reads, declared
 * structurally rather than imported from `AgentDetailResult`.
 *
 * Deliberate: importing that type would put a cycle in the import graph, since
 * `agentDetailEmployeeFacts.ts` imports the builder below. A type-only import
 * would erase at runtime, but CLAUDE.md forbids circular dependencies and "it
 * disappears at compile time" is a poor reason to draw one. The real caller
 * passes the full object and satisfies this structurally.
 */
export type AgentManagerChainView = {
  resolved_human: { name: string } | null;
  immediate_agent: { name: string } | null;
} | null;

/**
 * The agent-agnostic half of EmployeeFacts.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Two reasons, and they are the same change.
 *
 * 1. `employee_facts` was gated to one agent by name. `agentDetailService.ts`
 *    read `agent.agent_name === 'Reese' ? await getReeseEmployeeFacts(...) : null`,
 *    so every other agent got null — which does not render an empty state, it
 *    removes the Hero sentence and makes the whole Employee facts card
 *    `return null`. Maya's Overview looked broken while being, strictly,
 *    correct. Ali asked for her Overview to be populated; this is the real
 *    cause.
 *
 * 2. `agentDetailEmployeeFacts.ts` was 516 lines against this repo's 500-line
 *    hard ceiling, and `getReeseEmployeeFacts` 122 lines against the 100-line
 *    function ceiling. CLAUDE.md requires the next change to an oversize file
 *    to split it BEFORE adding code. The seam that rule wants is exactly the
 *    generic/Reese-specific one, so the refactor and the feature are one edit
 *    rather than two.
 *
 * ── WHAT IS HERE AND WHAT IS DELIBERATELY NOT ───────────────────────────────
 *
 * Seven of EmployeeFacts' eight fields are computed from things EVERY agent
 * has: its own `enabled` flag, its open ticket count, the charter table and the
 * resolved reports-to chain. Those seven live here.
 *
 * The eighth, `behaviours`, stays in `agentDetailEmployeeFacts.ts` and stays
 * Reese-specific. It is a catalogue of his seven NAMED scheduled behaviours,
 * keyed by the closed union `ReeseBehaviourKey`, each with its own kill switch
 * and sibling cron registry row. Maya is `trigger_type: 'event_driven'` and has
 * no named scheduled behaviours at all, so filling that array for her would
 * mean inventing processes she does not run. An empty array plus a sentence
 * saying why is the honest answer; a fabricated one would be worse than the
 * blank page it replaced.
 *
 * ── THE ONE EDGE CASE THAT IS A REAL BUG, NOT A REFACTOR ─────────────────────
 *
 * Availability was `agent.enabled && behaviours.some((b) => b.enabled)`.
 * `[].some()` is ALWAYS false, so an agent with no behaviour catalogue would
 * read "unavailable" forever no matter what its own row said — the flag would
 * have become decorative the moment this stopped being Reese-only. For an agent
 * with no behaviours, availability is the row's own flag and nothing else. See
 * `hasBehaviourCatalogue` below.
 *
 * ── WHY THIS SITS UNDER services/reese/ ─────────────────────────────────────
 *
 * Because `agentDetailService.ts`, which serves EVERY agent, already does. The
 * folder name has been a misnomer since that file started serving the whole
 * fleet; moving the tree is a rename across nine importing files and is not
 * this change's job. Noted rather than silently inherited.
 */
export interface AgentEmployeeFactsCore {
  availability: 'available' | 'unavailable';
  work_state: 'idle' | 'working_on_ticket' | 'blocked' | 'waiting_on_person';
  work_state_detail: string | null;
  last_meaningful_action: { at: Date; description: string } | null;
  charter_version: number | null;
  charter_effective_at: Date | null;
  manager_chain_note: string;
}

export interface AgentEmployeeFactsCoreCtx {
  lastTicketActivityAt: Date | null;
  openTicketCount: number;
  reportsTo: AgentManagerChainView;
  /**
   * The agent's own enrollment id, already resolved by the caller while
   * computing live_status — reused rather than looked up a second time. `null`
   * for an agent with no linked enrollment, which simply means no room-message
   * history to read.
   */
  enrollmentId: string | null;
  /**
   * Whether this agent has a behaviour catalogue AT ALL, which is a different
   * question from whether any behaviour is switched on. Reese has seven; every
   * other agent today has none. Only Reese passes `true`.
   */
  hasBehaviourCatalogue: boolean;
  /** Whether any catalogued behaviour is enabled. Meaningless, and ignored, when `hasBehaviourCatalogue` is false. */
  anyBehaviourEnabled: boolean;
}

/**
 * Truthful availability, work state, last meaningful action, charter version
 * and manager chain for any agent. Every value is measured or null; nothing
 * here guesses, and nothing here is agent-specific.
 */
export async function buildAgentEmployeeFactsCore(
  agent: { id: string; agent_name: string; enabled: boolean },
  ctx: AgentEmployeeFactsCoreCtx,
): Promise<AgentEmployeeFactsCore> {
  // Availability is truthful, not a presence heartbeat. With a behaviour
  // catalogue it means "the row is on AND at least one real behaviour is on".
  // Without one there is nothing to AND against, so it is the row's own flag —
  // see the header: the old `.some()` form made this permanently false.
  const availability: AgentEmployeeFactsCore['availability'] = ctx.hasBehaviourCatalogue
    ? agent.enabled && ctx.anyBehaviourEnabled
      ? 'available'
      : 'unavailable'
    : agent.enabled
      ? 'available'
      : 'unavailable';

  // Latest real room message, compared against latest ticket activity, more
  // recent wins. Fails safe to null and never throws: a lookup failure here
  // must not take down the whole Agent Detail response.
  let lastMessage: { at: Date; description: string } | null = null;
  try {
    if (ctx.enrollmentId) {
      const latest = await RoomMessage.findOne({
        where: { enrollment_id: ctx.enrollmentId, deleted_at: null },
        order: [['created_at', 'DESC']],
      });
      if (latest) {
        // "Sent a DM" is kept verbatim from the Reese-only version. It was
        // briefly reworded to "Posted a message" during this extraction on the
        // theory that it was Reese-specific; the Reese suite caught it and was
        // right to. The source is `room_messages`, which ARE direct messages in
        // this product, and an agent with no room history never reaches this
        // branch at all -- so the rewording changed reviewed copy to serve a
        // case that cannot occur. Generalizing a function is not a licence to
        // restyle its output.
        lastMessage = { at: latest.created_at, description: `Sent a DM: "${String(latest.content).slice(0, 140)}"` };
      }
    }
  } catch {
    lastMessage = null;
  }

  const lastTicket = ctx.lastTicketActivityAt
    ? { at: ctx.lastTicketActivityAt, description: 'Ticket activity (see linked tickets)' }
    : null;

  const lastMeaningfulAction =
    lastMessage && lastTicket ? (lastMessage.at > lastTicket.at ? lastMessage : lastTicket) : lastMessage || lastTicket;

  const charterView = await getRoleCharter(agent.id);

  let managerChainNote: string;
  if (ctx.reportsTo?.resolved_human) {
    managerChainNote = `Reports to: ${ctx.reportsTo.resolved_human.name}`;
  } else if (ctx.reportsTo?.immediate_agent) {
    managerChainNote = `Reports to: ${ctx.reportsTo.immediate_agent.name} (does not resolve to a human)`;
  } else {
    managerChainNote = 'No manager chain configured';
  }

  return {
    availability,
    work_state: ctx.openTicketCount > 0 ? 'working_on_ticket' : 'idle',
    work_state_detail: ctx.openTicketCount > 0 ? `${ctx.openTicketCount} open ticket(s)` : null,
    last_meaningful_action: lastMeaningfulAction,
    charter_version: charterView?.charter?.version ?? null,
    charter_effective_at: charterView?.charter?.effectiveAt ?? null,
    manager_chain_note: managerChainNote,
  };
}

/**
 * Employee facts for an agent that has NO behaviour catalogue, which today is
 * every agent except Reese.
 *
 * `behaviours: []` is load-bearing and honest, not a stub. Behaviours are named
 * scheduled processes with their own kill switch; an event-driven agent like
 * Maya runs none, so the array is empty because the thing it describes does not
 * exist. The UI says that in words rather than rendering "0 healthy across 0
 * behaviours", which reads as breakage.
 *
 * Before this existed, `agentDetailService.ts` handed non-Reese agents `null`,
 * which did not render an empty state -- it removed the Hero sentence and the
 * Employee facts card altogether. That is why Maya's Overview was blank.
 *
 * The return type is structural rather than the named `EmployeeFacts`, for the
 * same no-cycle reason as `AgentManagerChainView` above; `never[]` is assignable
 * to that type's behaviour array, so the call site still typechecks against it.
 */
export async function getAgentEmployeeFacts(
  agent: { id: string; agent_name: string; enabled: boolean },
  ctx: {
    lastTicketActivityAt: Date | null;
    openTicketCount: number;
    reportsTo: AgentManagerChainView;
    enrollmentId: string | null;
  },
): Promise<AgentEmployeeFactsCore & { behaviours: never[] }> {
  const core = await buildAgentEmployeeFactsCore(agent, {
    ...ctx,
    hasBehaviourCatalogue: false,
    anyBehaviourEnabled: false,
  });
  return { ...core, behaviours: [] };
}
