import { Request, Response } from 'express';
import { getWorkLedgerHealth, getGovernanceShadowSummary } from '../services/workLedger/workLedgerHealthService';

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
