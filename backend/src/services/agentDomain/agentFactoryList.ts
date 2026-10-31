import { sequelize } from '../../config/database';
import { loadProvisionedDomains, loadMyDomains, resolveOwnerIdentityIds, type ProvisionedDomainRow } from './agentDomainProvisionedReader';
import { AGENT_DOMAINS } from './agentDomainRegistry';
import { resolveProjectRepos } from '../projectRepoResolver';
import { assembleAgentCards, type RegistryEntry } from './agentFactoryCards';

/**
 * The agent-factory domains one viewer may see: the body of GET /api/admin/agent-factory, moved here (C92) so the Campus HQ
 * building lists EXACTLY what the admin sidebar's "Agents" node lists, for the same person, from the same code. Broad (also
 * holds `program`) = all domains; otherwise the viewer's own (managed or built), as before.
 */
const REGISTRY_BY_KEY: ReadonlyMap<string, RegistryEntry> = new Map(
  AGENT_DOMAINS.map((d) => [d.domain_key, { title: d.title, intended_builder: d.intended_builder }]),
);

export async function listAgentFactoryFor(viewer: { email: string; sections: readonly string[] }): Promise<{ agents: unknown[]; scope: 'all' | 'mine' }> {
  const broad = viewer.sections.includes('program');
  let rows: ProvisionedDomainRow[];
  if (broad) {
    rows = await loadProvisionedDomains(sequelize);
  } else {
    const identityIds = await resolveOwnerIdentityIds(sequelize, viewer.email);
    rows = await loadMyDomains(sequelize, viewer.email, identityIds);
  }
  const repos = await resolveProjectRepos(rows.map((r) => ({ id: r.student_project_id })));
  return { agents: assembleAgentCards(rows, REGISTRY_BY_KEY, repos), scope: broad ? 'all' : 'mine' };
}
