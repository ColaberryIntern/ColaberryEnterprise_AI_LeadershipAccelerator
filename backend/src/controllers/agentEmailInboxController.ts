import { Request, Response } from 'express';
import { AiAgent } from '../models';
import {
  getAgentEmailInbox, approveAgentDraft, discardAgentDraft,
} from '../services/agents/tools/agentEmailInboxService';

/**
 * The agent's own email, for her dashboard (Ali, 2026-10-26: "Maya's inbox should go in her Agent
 * dashboard that also has her decision making and tickets").
 *
 * ── TWO SMALL DELIBERATE DEPARTURES FROM THE NEIGHBOURING CONTROLLER ────────
 *
 * 1. THE ROUTE IS KEYED ON THE AGENT ID; THE SERVICE IS KEYED ON THE NAME. The id is what every
 *    other `/api/admin/agents/:id/...` route uses and what the dashboard already has in hand, but
 *    drafts are stamped with `metadata.agent_name` because that is the only field identifying the
 *    author (sender addresses are per brand and shared). So this resolves one to the other and
 *    404s when the agent does not exist, rather than querying for a name nobody has.
 *
 * 2. A MISSING APPROVER IS A 403, NOT THE STRING 'unknown'. `managerInboxController` falls back to
 *    `'unknown'` for its actor, which is reasonable for a proposal. It is not reasonable here: an
 *    approval on this queue is the human act that authorises mail to a real person outside the
 *    platform, and "who said yes" is the single fact it exists to record. An approval attributed
 *    to nobody is worse than no approval, because it looks like oversight.
 */

async function resolveAgentName(id: string): Promise<string | null> {
  try {
    const agent = await AiAgent.findByPk(id, { attributes: ['agent_name'] }) as unknown as
      { agent_name?: unknown } | null;
    const name = agent && typeof agent.agent_name === 'string' ? agent.agent_name : null;
    return name;
  } catch {
    return null;
  }
}

/** The acting admin's email, or null. Never a placeholder. */
function actorEmail(req: Request): string | null {
  const email = (req as unknown as { admin?: { email?: unknown } }).admin?.email;
  return typeof email === 'string' && email.includes('@') ? email : null;
}

export async function handleGetAgentEmailInbox(req: Request, res: Response) {
  try {
    const agentName = await resolveAgentName(req.params.id as string);
    if (!agentName) return res.status(404).json({ error: 'Agent not found' });

    const inbox = await getAgentEmailInbox(agentName);
    return res.json(inbox);
  } catch (err: unknown) {
    console.error('[AgentEmailInbox] read error:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to load agent email' });
  }
}

export async function handleApproveAgentEmailDraft(req: Request, res: Response) {
  try {
    const approver = actorEmail(req);
    if (!approver) {
      return res.status(403).json({
        error: 'An identified approver is required',
        error_class: 'ApproverUnidentified',
      });
    }
    const agentName = await resolveAgentName(req.params.id as string);
    if (!agentName) return res.status(404).json({ error: 'Agent not found' });

    const result = await approveAgentDraft(req.params.draftId as string, approver);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    // Said plainly in the response, because the word "approve" invites the assumption.
    return res.json({ success: true, sent: false, note: 'Approved. Approval does not send.' });
  } catch (err: unknown) {
    console.error('[AgentEmailInbox] approve error:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to approve draft' });
  }
}

export async function handleDiscardAgentEmailDraft(req: Request, res: Response) {
  try {
    const actor = actorEmail(req);
    if (!actor) {
      return res.status(403).json({
        error: 'An identified actor is required',
        error_class: 'ActorUnidentified',
      });
    }
    const agentName = await resolveAgentName(req.params.id as string);
    if (!agentName) return res.status(404).json({ error: 'Agent not found' });

    const result = await discardAgentDraft(req.params.draftId as string, actor);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    return res.json({ success: true });
  } catch (err: unknown) {
    console.error('[AgentEmailInbox] discard error:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to discard draft' });
  }
}
