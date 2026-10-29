import { Router, Request, Response } from 'express';
import { requireSection, adminAllowedSections } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import {
  loadProvisionedDomains, loadMyDomains, resolveOwnerIdentityIds,
  type ProvisionedDomainRow,
} from '../../services/agentDomain/agentDomainProvisionedReader';
import { AGENT_DOMAINS } from '../../services/agentDomain/agentDomainRegistry';
import { resolveProjectRepos } from '../../services/projectRepoResolver';
import { assembleAgentCards, type RegistryEntry } from '../../services/agentDomain/agentFactoryCards';

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

/** domain_key → display title + intended builder, the two facts the provisioned row does not carry. */
const REGISTRY_BY_KEY: ReadonlyMap<string, RegistryEntry> = new Map(
  AGENT_DOMAINS.map((d) => [d.domain_key, { title: d.title, intended_builder: d.intended_builder }]),
);

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
    const broad = adminAllowedSections((req as any).admin ?? {}).includes('program');
    const email = String((req as any).admin?.email ?? '');
    let rows: ProvisionedDomainRow[];
    if (broad) {
      rows = await loadProvisionedDomains(sequelize);
    } else {
      const identityIds = await resolveOwnerIdentityIds(sequelize, email);
      rows = await loadMyDomains(sequelize, email, identityIds);
    }
    const repos = await resolveProjectRepos(rows.map((r) => ({ id: r.student_project_id })));
    const agents = assembleAgentCards(rows, REGISTRY_BY_KEY, repos);
    res.json({ agents, scope: broad ? 'all' : 'mine' });
  } catch (err: unknown) {
    logFail('agent_factory_list_failed', err, {});
    res.status(500).json({ error: 'Could not list the agent factory.' });
  }
});

export default router;
