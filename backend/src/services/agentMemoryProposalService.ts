import AiAgent from '../models/AiAgent';
import AgentMemoryProposal from '../models/AgentMemoryProposal';

// AI Workforce Management, Checkpoint E. Generic by construction — works
// off AiAgent.id, not hardcoded to any one agent.

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

export class MemoryProposalNotFoundError extends Error {
  readonly error_class = 'MemoryProposalNotFoundError' as const;
  readonly status = 404;

  constructor(id: string) {
    super(`Memory proposal "${id}" does not exist.`);
    this.name = 'MemoryProposalNotFoundError';
  }
}

export interface AgentMemoryProposalView {
  id: string;
  agentId: string;
  content: string;
  evidence: string | null;
  status: 'pending' | 'approved' | 'rejected';
  proposedByEmail: string;
  reviewedByEmail: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
}

function toView(row: AgentMemoryProposal): AgentMemoryProposalView {
  return {
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    evidence: row.evidence,
    status: row.status,
    proposedByEmail: row.proposed_by_email,
    reviewedByEmail: row.reviewed_by_email,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
  };
}

/** Authorization is the route layer's job (requireAgentManagerOrAdmin) —
 * same convention as every other service in this mission. Trusts it
 * already happened. Always created 'pending' — there is no create-and-
 * auto-approve path, so a memory can never reach the runtime without a
 * real, separate, explicit approval call. */
export async function proposeMemory(
  agentId: string,
  proposedByEmail: string,
  content: string,
  evidence?: string,
): Promise<AgentMemoryProposalView> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) throw new AgentNotFoundError(agentId);

  const row = await AgentMemoryProposal.create({
    agent_id: agentId,
    content,
    evidence: evidence ?? null,
    proposed_by_email: proposedByEmail,
    status: 'pending',
  });
  return toView(row);
}

/** `null` return means the agent itself doesn't exist. A real agent with
 * zero proposals returns an empty array — the honest "nothing proposed
 * yet" state, not an error. Returns every status (pending/approved/
 * rejected) so a manager reviewing can see the full queue and history in
 * one place. */
export async function listMemoryProposals(agentId: string): Promise<AgentMemoryProposalView[] | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;

  const rows = await AgentMemoryProposal.findAll({ where: { agent_id: agentId }, order: [['created_at', 'DESC']] });
  return rows.map(toView);
}

/** Idempotent: deciding an already-decided proposal again (approve or
 * reject) is a no-op that returns the existing decision rather than
 * re-stamping reviewed_at/reviewed_by_email — matches ManagerDirective's
 * own revoke semantics. Only a 'pending' proposal can transition. */
async function decide(
  id: string,
  targetStatus: 'approved' | 'rejected',
  reviewedByEmail: string,
  reviewNotes?: string,
): Promise<AgentMemoryProposalView> {
  const row = await AgentMemoryProposal.findByPk(id);
  if (!row) throw new MemoryProposalNotFoundError(id);

  if (row.status === 'pending') {
    await row.update({
      status: targetStatus,
      reviewed_by_email: reviewedByEmail,
      reviewed_at: new Date(),
      review_notes: reviewNotes ?? null,
    });
  }
  return toView(row);
}

export function approveMemoryProposal(id: string, reviewedByEmail: string, reviewNotes?: string): Promise<AgentMemoryProposalView> {
  return decide(id, 'approved', reviewedByEmail, reviewNotes);
}

export function rejectMemoryProposal(id: string, reviewedByEmail: string, reviewNotes?: string): Promise<AgentMemoryProposalView> {
  return decide(id, 'rejected', reviewedByEmail, reviewNotes);
}

/** The ONLY function the runtime prompt-assembly path (agentSystemPrompt.ts,
 * agentManagerConversationPrompt.ts) is allowed to call for memory content —
 * mirrors managerDirectiveService.ts's getActiveDirectiveTexts() exactly,
 * including its fail-safe posture: a query failure never blocks a reply, it
 * just means that turn runs without the memory block. This is the function
 * that makes approval state real rather than a dead flag like
 * OpenclawLearning.applied — it is provably called from both live
 * prompt-assembly points, with regression tests proving it. */
export async function getApprovedMemoryTexts(agentId: string): Promise<string[]> {
  try {
    const rows = await AgentMemoryProposal.findAll({
      where: { agent_id: agentId, status: 'approved' },
      order: [['reviewed_at', 'DESC']],
      attributes: ['content'],
    });
    return rows.map((r) => r.content);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'agentMemoryProposal', event: 'approved_memory_fetch_failed',
      agent_id: agentId, error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return [];
  }
}
