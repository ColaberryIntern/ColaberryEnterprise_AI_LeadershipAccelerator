import { Request, Response } from 'express';
import { z } from 'zod';
import { createMemoryProposalInputSchema, reviewMemoryProposalInputSchema } from '../schemas/agentMemoryProposalSchema';
import {
  proposeMemory,
  listMemoryProposals,
  approveMemoryProposal,
  rejectMemoryProposal,
  AgentNotFoundError,
  MemoryProposalNotFoundError,
} from '../services/agentMemoryProposalService';

// AI Workforce Management, Checkpoint E — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentGoalController.ts / agentDetailController.ts.

function agentIdParam(req: Request): string | null {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return id || null;
}

function proposalIdParam(req: Request): string | null {
  const idParam = req.params.proposalId;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  return id || null;
}

export async function handleListMemoryProposals(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const proposals = await listMemoryProposals(id);
    if (!proposals) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agentId: id, proposals });
  } catch (err: any) {
    console.error('[AgentMemoryProposal] Error:', err.message);
    res.status(500).json({ error: 'Failed to load memory proposals' });
  }
}

export async function handleProposeMemory(req: Request, res: Response) {
  try {
    const id = agentIdParam(req);
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const input = createMemoryProposalInputSchema.parse(req.body || {});
    const proposal = await proposeMemory(id, req.admin!.email, input.content, input.evidence);
    res.status(201).json(proposal);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof AgentNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentMemoryProposal] Error:', err.message);
    res.status(500).json({ error: 'Failed to propose memory' });
  }
}

export async function handleApproveMemoryProposal(req: Request, res: Response) {
  try {
    const proposalId = proposalIdParam(req);
    if (!proposalId) {
      res.status(400).json({ error: 'Memory proposal id is required' });
      return;
    }
    const input = reviewMemoryProposalInputSchema.parse(req.body || {});
    const proposal = await approveMemoryProposal(proposalId, req.admin!.email, input.reviewNotes);
    res.json(proposal);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof MemoryProposalNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentMemoryProposal] Error:', err.message);
    res.status(500).json({ error: 'Failed to approve memory proposal' });
  }
}

export async function handleRejectMemoryProposal(req: Request, res: Response) {
  try {
    const proposalId = proposalIdParam(req);
    if (!proposalId) {
      res.status(400).json({ error: 'Memory proposal id is required' });
      return;
    }
    const input = reviewMemoryProposalInputSchema.parse(req.body || {});
    const proposal = await rejectMemoryProposal(proposalId, req.admin!.email, input.reviewNotes);
    res.json(proposal);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof MemoryProposalNotFoundError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[AgentMemoryProposal] Error:', err.message);
    res.status(500).json({ error: 'Failed to reject memory proposal' });
  }
}
