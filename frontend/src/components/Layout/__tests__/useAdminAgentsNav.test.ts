import { adminAgentNavEntries } from '../useAdminAgentsNav';
import type { AgentFactoryCard } from '../../../services/agentFactoryApi';

function agent(partial: Partial<AgentFactoryCard>): AgentFactoryCard {
  return {
    domainKey: 'marketing', title: 'Marketing', managerEmail: null, intendedBuilder: null,
    intendedBuilderState: null, agentId: null, built: false, studentProjectId: '', repoUrl: null,
    repoConnected: false, stories: 0, storiesVerified: 0, releases: 0, ...partial,
  };
}

describe('adminAgentNavEntries — admin per-agent nav sub-items', () => {
  it('lists ALL agents (no filtering), unlike gov contracts', () => {
    const cards = [agent({ domainKey: 'a' }), agent({ domainKey: 'b' }), agent({ domainKey: 'c' })];
    expect(adminAgentNavEntries(cards).map((e) => e.key)).toEqual(['a', 'b', 'c']);
  });

  it('a built agent links to its immersive live dashboard and reports built', () => {
    const [e] = adminAgentNavEntries([agent({ domainKey: 'curriculum', title: 'Curriculum (Dara)', agentId: 'ag-9', built: true, intendedBuilder: 'Ruth Kumera' })]);
    expect(e).toEqual({ key: 'curriculum', label: 'Curriculum (Dara)', to: '/admin/agents/ag-9', owner: 'Ruth Kumera', built: true });
  });

  it('an unbuilt agent links to its per-agent page (child of /admin/internship)', () => {
    const [e] = adminAgentNavEntries([agent({ domainKey: 'marketing', title: 'Marketing', built: false, intendedBuilder: 'Sarbjit Kaur' })]);
    expect(e).toEqual({ key: 'marketing', label: 'Marketing', to: '/admin/internship/agent/marketing', owner: 'Sarbjit Kaur', built: false });
  });

  it('owner falls back to the manager when there is no builder, and is undefined when neither exists', () => {
    const [mgr] = adminAgentNavEntries([agent({ domainKey: 'website', intendedBuilder: null, managerEmail: 'ali@colaberry.com' })]);
    expect(mgr.owner).toBe('ali@colaberry.com');
    const [none] = adminAgentNavEntries([agent({ domainKey: 'executive', intendedBuilder: null, managerEmail: null })]);
    expect(none.owner).toBeUndefined();
  });
});
