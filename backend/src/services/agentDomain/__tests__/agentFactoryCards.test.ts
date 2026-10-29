import { assembleAgentCards, type RegistryEntry, type RepoFact } from '../agentFactoryCards';
import type { ProvisionedDomainRow } from '../agentDomainProvisionedReader';

/**
 * M2 — the Agents tab cards merge the provisioned row, the registry (title/builder) and the repo
 * pointer (sync signal) correctly, and degrade honestly when a piece is missing.
 */
function row(partial: Partial<ProvisionedDomainRow> & { domain_key: string; student_project_id: string }): ProvisionedDomainRow {
  return {
    anchor_id: 'anchor',
    stage: 'build',
    entry_point: null,
    manager_identity_id: 'om-1',
    manager_email: 'mgr@colaberry.com',
    manager_can_reach: true,
    manager_blocker: null,
    intended_builder_state: 'verified_active',
    agent_id: null,
    agent_display_name: null,
    releases: 0,
    stories: 0,
    stories_verified: 0,
    build_authorizations: 0,
    ...partial,
  };
}

const registry = new Map<string, RegistryEntry>([
  ['curriculum', { title: 'Curriculum (Dara)', intended_builder: 'Dara' }],
  ['marketing', { title: 'Marketing', intended_builder: 'Sarbjit' }],
]);

describe('assembleAgentCards', () => {
  it('marks a domain with an agent_id as built and takes its title + builder from the registry', () => {
    const [card] = assembleAgentCards(
      [row({ domain_key: 'curriculum', student_project_id: 'p1', agent_id: 'agent-9', stories: 10, stories_verified: 4 })],
      registry,
      new Map<string, RepoFact>([['p1', { url: 'https://github.com/o/r' }]]),
    );
    expect(card.built).toBe(true);
    expect(card.agentId).toBe('agent-9');
    expect(card.title).toBe('Curriculum (Dara)');
    expect(card.intendedBuilder).toBe('Dara');
    expect(card.repoConnected).toBe(true);
    expect(card.repoUrl).toBe('https://github.com/o/r');
    expect(card.storiesVerified).toBe(4);
    expect(card.stories).toBe(10);
  });

  it('marks a domain with no agent_id as not built', () => {
    const [card] = assembleAgentCards(
      [row({ domain_key: 'marketing', student_project_id: 'p2', agent_id: null })],
      registry,
      new Map<string, RepoFact>(),
    );
    expect(card.built).toBe(false);
    expect(card.agentId).toBeNull();
  });

  it('falls back to the domain_key when the registry has no entry, and reports no builder', () => {
    const [card] = assembleAgentCards(
      [row({ domain_key: 'website', student_project_id: 'p3' })],
      registry,
      new Map<string, RepoFact>(),
    );
    expect(card.title).toBe('website');
    expect(card.intendedBuilder).toBeNull();
  });

  it('reports repoConnected false with a null url when no repo is linked (a real state, not an error)', () => {
    const [card] = assembleAgentCards(
      [row({ domain_key: 'curriculum', student_project_id: 'p4' })],
      registry,
      new Map<string, RepoFact>([['p4', { url: null }]]),
    );
    expect(card.repoConnected).toBe(false);
    expect(card.repoUrl).toBeNull();
  });

  it('treats an empty-string agent_id or repo url as not built / not connected', () => {
    const [card] = assembleAgentCards(
      [row({ domain_key: 'curriculum', student_project_id: 'p5', agent_id: '' })],
      registry,
      new Map<string, RepoFact>([['p5', { url: '' }]]),
    );
    expect(card.built).toBe(false);
    expect(card.repoConnected).toBe(false);
  });

  it('preserves input order and length (one card per row)', () => {
    const cards = assembleAgentCards(
      [row({ domain_key: 'curriculum', student_project_id: 'p1' }), row({ domain_key: 'marketing', student_project_id: 'p2' })],
      registry,
      new Map<string, RepoFact>(),
    );
    expect(cards.map((c) => c.domainKey)).toEqual(['curriculum', 'marketing']);
  });
});
