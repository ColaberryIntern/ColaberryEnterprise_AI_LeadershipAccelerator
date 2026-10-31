import { Router, Request, Response } from 'express';
import { requireSection, adminAllowedSections } from '../../middlewares/authMiddleware';
import { listAgentFactoryFor } from '../../services/agentDomain/agentFactoryList';

/**
 * Admin — Agent Factory tab (mgmt-portal M2).
 *
 * The admin Interns hub's "Agents" tab needs ONE list endpoint: the factory's agent domains this
 * caller may see. It is its OWN route gated `requireSection('agents')` — NOT the existing
 * `/api/admin/agent-domains-provisioned` (gated `program`), which would recreate the
 * nav-renders-but-API-403s trap for a future `agents`-only builder. Two layers, like Gov Contracts:
 *   1. SECTION gate (`requireSection('agents')`) — may you open the tab. owner/admin hold it today.
 *   2. SCOPE — broad (also holds `program`) ⇒ all ten domains (`loadProvisionedDomains`); scoped ⇒
 *      the caller's own, managed ∪ built (`loadMyDomains`), which is already how `-mine` scopes.
 *
 * Each card carries the built flag + agent id (the dashboard link target), the repo-connected sync
 * signal, and the verified-story build progress — the honest "is this agent's work syncing" view
 * without reaching into webhook-delivery internals. Read-only.
 */
const router = Router();


function logFail(event: string, err: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event,
    outcome: 'failure',
    error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    context: { ...context, message: (err as { message?: string })?.message },
  }));
}

/**
 * GET /api/admin/agent-factory — the agent-factory domains this caller may see. `scope` echoes
 * 'all' (management/operator) vs 'mine' (the caller's own domains).
 */
router.get('/api/admin/agent-factory', requireSection('agents'), async (req: Request, res: Response) => {
  try {
    // C92: the list body lives in services/agentDomain/agentFactoryList.ts, shared with the Campus HQ building
    const admin = (req as any).admin ?? {};
    res.json(await listAgentFactoryFor({ email: String(admin.email ?? ''), sections: adminAllowedSections(admin) }));
  } catch (err: unknown) {
    logFail('agent_factory_list_failed', err, {});
    res.status(500).json({ error: 'Could not list the agent factory.' });
  }
});

export default router;
