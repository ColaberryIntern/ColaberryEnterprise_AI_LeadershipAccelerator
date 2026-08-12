import { Request, Response } from 'express';
import { z } from 'zod';
import { getWorkLedgerHealth, getGovernanceShadowSummary } from '../services/workLedger/workLedgerHealthService';
import { computeAgentTrustByCapability } from '../services/outcomes/agentTrustService';
import { computeCostToProof } from '../services/outcomes/costToProofService';
import { computeRelatedWorkClusters } from '../services/outcomes/relatedWorkClusteringService';
import { generateExecutiveNarrative, NarrativeWindow } from '../services/outcomes/executiveNarrativeService';
import { getOutcomeMeasurementsSummary } from '../services/outcomes/outcomeMeasurementService';

// ProofDesk Work Ledger — Milestone 1 (Foundation). Read-only ingestion-health
// endpoint: proves the shadow-mode wrap points (createTicket, updateTicketStatus,
// addAgentOutput, dispatchTicketToAgent) are actually producing ledger rows on real
// traffic, not just in tests.
export async function getWorkLedgerHealthStats(req: Request, res: Response) {
  try {
    const windowHours = req.query.window_hours ? Number(req.query.window_hours) : 24;
    const health = await getWorkLedgerHealth(windowHours);
    res.json(health);
  } catch (err: any) {
    console.error('[WorkLedgerHealth] Error:', err.message);
    res.status(500).json({ error: 'Failed to load work ledger health' });
  }
}

// ProofDesk Governance — Milestone 4 (Governance Enforcement, SHADOW MODE ONLY).
// Read-only would-allow/would-require-approval/would-block breakdown — see
// workLedgerHealthService.getGovernanceShadowSummary()'s header for what this proves
// and does not do (it never gates anything; it is purely descriptive).
export async function getGovernanceShadowStats(req: Request, res: Response) {
  try {
    const windowHours = req.query.window_hours ? Number(req.query.window_hours) : 24;
    const summary = await getGovernanceShadowSummary(windowHours);
    res.json(summary);
  } catch (err: any) {
    console.error('[GovernanceShadow] Error:', err.message);
    res.status(500).json({ error: 'Failed to load governance shadow summary' });
  }
}

// ProofDesk Outcomes & Learning — Milestone 5. Four read-only additions to this same
// controller, matching the established pattern above: no request body, no mutation,
// requireAdmin-gated at the route layer, 500 on unexpected failure (never a raw stack
// trace to the client).

export async function getAgentTrustStats(_req: Request, res: Response) {
  try {
    const trust = await computeAgentTrustByCapability();
    res.json({ agents: trust });
  } catch (err: any) {
    console.error('[AgentTrust] Error:', err.message);
    res.status(500).json({ error: 'Failed to load agent trust stats' });
  }
}

export async function getCostToProofStats(_req: Request, res: Response) {
  try {
    const costs = await computeCostToProof();
    res.json({ capabilities: costs });
  } catch (err: any) {
    console.error('[CostToProof] Error:', err.message);
    res.status(500).json({ error: 'Failed to load cost-to-proof stats' });
  }
}

export async function getRelatedWorkClusterStats(_req: Request, res: Response) {
  try {
    const clusters = await computeRelatedWorkClusters();
    res.json(clusters);
  } catch (err: any) {
    console.error('[RelatedWorkClusters] Error:', err.message);
    res.status(500).json({ error: 'Failed to load related-work clusters' });
  }
}

export async function getOutcomeMeasurementsStats(_req: Request, res: Response) {
  try {
    const summary = await getOutcomeMeasurementsSummary();
    res.json(summary);
  } catch (err: any) {
    console.error('[OutcomeMeasurements] Error:', err.message);
    res.status(500).json({ error: 'Failed to load outcome measurements summary' });
  }
}

const narrativeQuerySchema = z.object({
  window: z.enum(['day', 'week']).default('day'),
});

// Contract Enforcement (root CLAUDE.md): malformed `window` rejected with 400, never
// silently defaulted and never allowed to reach the service layer.
export async function getExecutiveNarrative(req: Request, res: Response) {
  const parsed = narrativeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid window parameter', issues: parsed.error.issues });
    return;
  }
  try {
    const narrative = await generateExecutiveNarrative(parsed.data.window as NarrativeWindow);
    res.json(narrative);
  } catch (err: any) {
    console.error('[ExecutiveNarrative] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate executive narrative' });
  }
}
